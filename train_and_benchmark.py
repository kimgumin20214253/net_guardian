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

# 1. 데이터 로드 및 라벨링
data_dir = "raw_dataset_20260904"
scenario_map = {
    "scenario_A": 0,  # 정상 (Normal)
    "scenario_B": 1,  # 지연 (Delay)
    "scenario_C": 2,  # 유실 (Loss)
    "scenario_D": 3   # 복합 (Combined)
}

df_list = []
# 하위 폴더 및 현재 폴더 모두 탐색
search_paths = [os.path.join(data_dir, "*.csv"), "*.csv"]
found_files = []
for p in search_paths:
    found_files.extend(glob.glob(p))

for file in set(found_files):
    fname = os.path.basename(file)
    for sc_key, label_val in scenario_map.items():
        if sc_key.lower() in fname.lower():
            temp_df = pd.read_csv(file)
            temp_df["label"] = label_val
            df_list.append(temp_df)
            print(f"[+] 로드 성공: {fname} -> Label {label_val}")
            break

if not df_list:
    print(f"\n[!] CSV 파일을 찾지 못했습니다. '{data_dir}' 폴더가 현재 작업 경로에 있는지 확인하세요.")
    exit()

df = pd.concat(df_list, ignore_index=True)
print(f"\n[*] 총 데이터 수: {len(df)}행 | 클래스 분포: {df['label'].value_counts().to_dict()}")

# 2. 피처 추출 및 메모리 전처리
feature_candidates = [
    "경로RTT", "거래RTT", "지터", "링크손실", "앱손실", "rtt_change_rate",
    "path_rtt", "trans_rtt", "jitter", "link_loss", "app_loss"
]
selected_features = [c for c in df.columns if c in feature_candidates]
if not selected_features:
    selected_features = [c for c in df.select_dtypes(include=[np.number]).columns if c != "label"]

print(f"[*] 학습 사용 피처: {selected_features}")

X = df[selected_features].replace([np.inf, -np.inf], np.nan).fillna(0)
y = df["label"]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# 3. 4대 모델 정의
models = {
    "Logistic Regression": make_pipeline(RobustScaler(), LogisticRegression(max_iter=2000)),
    "Decision Tree": DecisionTreeClassifier(max_depth=10, random_state=42),
    "Random Forest": RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42, n_jobs=-1),
    "LightGBM": LGBMClassifier(n_estimators=100, max_depth=6, random_state=42, verbose=-1, n_jobs=-1)
}

# 4. 모델 평가 및 단건 추론 지연 측정
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

    # 100개 패킷 단건 순회 추론 시간 (마이크로초)
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

# 5. 결과 산출 및 저장
res_df = pd.DataFrame(results)
print("\n" + "=" * 70)
print("            [학술대회 논문용 모델 4종 최종 벤치마크 결과]")
print("=" * 70)
print(res_df.to_string(index=False))
res_df.to_csv("benchmark_results.csv", index=False)
print("\n[*] 'benchmark_results.csv' 저장 완료.")

# 피처 중요도 차트 저장
rf_model = trained_models["Random Forest"]
feat_df = pd.DataFrame({
    "Feature": selected_features,
    "Importance": rf_model.feature_importances_
}).sort_values(by="Importance", ascending=False)

plt.figure(figsize=(8, 4))
sns.barplot(x="Importance", y="Feature", data=feat_df, palette="viridis")
plt.title("Feature Importance (Random Forest)")
plt.tight_layout()
plt.savefig("rf_feature_importance.png", dpi=300)
print("[*] 'rf_feature_importance.png' 시각화 완료.\n")