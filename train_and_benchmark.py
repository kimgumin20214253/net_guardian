import os
import glob
import time
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

# 한글 폰트 설정 (Windows / Mac 대응)
if os.name == 'nt':
    plt.rc('font', family='Malgun Gothic')
else:
    plt.rc('font', family='AppleGothic')
plt.rcParams['axes.unicode_minus'] = False

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import RobustScaler
from sklearn.pipeline import make_pipeline
from sklearn.metrics import accuracy_score, f1_score

from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from lightgbm import LGBMClassifier

# ----------------------------------------------------
# 1. 데이터 로드 및 라벨링
# ----------------------------------------------------
data_dir = "raw_dataset_20260904"
scenario_map = {
    "scenario_A": 0,  # 정상 (Normal)
    "scenario_B": 1,  # 지연 (Delay)
    "scenario_C": 2,  # 유실 (Loss)
    "scenario_D": 3   # 복합 (Combined)
}

df_list = []
search_paths = [os.path.join(data_dir, "*.csv"), "*.csv"]
found_files = []
for p in search_paths:
    found_files.extend(glob.glob(p))

raw_columns = ["timestamp", "rtt", "loss_flag", "jitter"]

for file in set(found_files):
    fname = os.path.basename(file)
    for sc_key, label_val in scenario_map.items():
        if sc_key.lower() in fname.lower():
            temp_df = pd.read_csv(file, header=None, names=raw_columns)
            temp_df["label"] = label_val
            df_list.append(temp_df)
            print(f"[+] 로드 성공: {fname} -> Label {label_val}")
            break

if not df_list:
    print(f"\n[!] CSV 파일을 찾지 못했습니다. '{data_dir}' 폴더가 현재 작업 경로에 있는지 확인하세요.")
    exit()

df = pd.concat(df_list, ignore_index=True)
print(f"\n[*] 총 데이터 수: {len(df)}행 | 클래스 분포: {df['label'].value_counts().to_dict()}")

# ----------------------------------------------------
# 2. 전처리 및 피처 추출 (수치형 강제 변환)
# ----------------------------------------------------
# 문자열/공백으로 오인식된 결측값을 수치형으로 강제 변환
for col in ["rtt", "loss_flag", "jitter"]:
    df[col] = pd.to_numeric(df[col], errors='coerce')

feature_candidates = [
    "rtt", "loss_flag", "jitter",
    "경로RTT", "거래RTT", "지터", "링크손실", "앱손실"
]
selected_features = [c for c in df.columns if c in feature_candidates]

print(f"[*] 학습 사용 피처: {selected_features}")

# 결측치 0으로 보정 및 피처/라벨 분리
X = df[selected_features].replace([np.inf, -np.inf], np.nan).fillna(0)
y = df["label"]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# ----------------------------------------------------
# 3. 4대 모델 정의
# ----------------------------------------------------
models = {
    "Logistic Regression": make_pipeline(RobustScaler(), LogisticRegression(max_iter=2000, class_weight='balanced')),
    "Decision Tree": DecisionTreeClassifier(max_depth=10, random_state=42, class_weight='balanced'),
    "Random Forest": RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42, class_weight='balanced', n_jobs=-1),
    "LightGBM": LGBMClassifier(n_estimators=100, max_depth=6, random_state=42, class_weight='balanced', verbose=-1, n_jobs=-1)
}

# ----------------------------------------------------
# 4. 모델 평가 및 단건 추론 지연 측정
# ----------------------------------------------------
results = []
trained_models = {}

print("\n[*] 4대 모델 벤치마크 학습 시작...")
for name, model in models.items():
    t_start = time.perf_counter()
    model.fit(X_train, y_train)
    train_time = (time.perf_counter() - t_start) * 1000  # ms

    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred, average="macro")

    # 100개 단건 순회 추론 지연시간 (마이크로초)
    sample_latencies = []
    bench_samples = X_test.iloc[:100]
    for idx in range(len(bench_samples)):
        single_pkt = bench_samples.iloc[[idx]]
        inf_start = time.perf_counter()
        _ = model.predict(single_pkt)
        inf_end = time.perf_counter()
        sample_latencies.append((inf_end - inf_start) * 1_000_000)

    results.append({
        "Model": name,
        "Accuracy (%)": round(acc * 100, 2),
        "Macro F1": round(f1, 4),
        "Train Time (ms)": round(train_time, 2),
        "Single Latency (µs)": round(np.mean(sample_latencies), 2)
    })
    trained_models[name] = model

# ----------------------------------------------------
# 5. 결과 산출 및 저장
# ----------------------------------------------------
res_df = pd.DataFrame(results)
print("\n" + "=" * 70)
print("            [학술대회 논문용 모델 4종 최종 벤치마크 결과]")
print("=" * 70)
print(res_df.to_string(index=False))
res_df.to_csv("benchmark_results.csv", index=False)
print("\n[*] 'benchmark_results.csv' 저장 완료.")

# 피처 중요도 시각화 및 저장 (Seaborn warning 수정 반영)
rf_model = trained_models["Random Forest"]
feat_df = pd.DataFrame({
    "Feature": selected_features,
    "Importance": rf_model.feature_importances_
}).sort_values(by="Importance", ascending=False)

plt.figure(figsize=(8, 4))
sns.barplot(x="Importance", y="Feature", data=feat_df, hue="Feature", palette="viridis", legend=False)
plt.title("Feature Importance (Random Forest)")
plt.tight_layout()
plt.savefig("rf_feature_importance.png", dpi=300)
print("[*] 'rf_feature_importance.png' 시각화 완료.\n")