import os
import glob
import time
import joblib
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
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
data_dir = os.path.join(BASE_DIR, "raw_dataset_20260904")
scenario_map = {
    "scenario_A": 0,  # 정상 (Normal)
    "scenario_B": 1,  # 지연 (Delay)
    "scenario_C": 2,  # 유실 (Loss)
    "scenario_D": 3   # 복합 (Combined)
}

df_list = []
found_files = glob.glob(os.path.join(data_dir, "*.csv"))

# 4번째 컬럼은 실측 지터가 아니라 수집 스크립트가 넣은 '이상 여부' 하드코딩 플래그(정상=0, 장애=1)였음이
# 확인되어 is_abnormal_flag로 명명하고 학습 피처에서 제외한다. 대신 rtt 시계열의 연속 차이로 진짜 지터를 계산한다.
raw_columns = ["timestamp", "rtt", "loss_flag", "is_abnormal_flag"]

for file in found_files:
    fname = os.path.basename(file)
    for sc_key, label_val in scenario_map.items():
        if sc_key.lower() in fname.lower():
            temp_df = pd.read_csv(file, header=None, names=raw_columns)
            temp_df["timestamp"] = pd.to_datetime(temp_df["timestamp"])
            # timestamp가 초 단위라 같은 초에 여러 행이 있음 -> stable 정렬로 파일의 실제 수집 순서를 유지해야
            # 아래 jitter(연속 RTT 차이)가 진짜 연속 샘플 간 차이가 됨 (기본 정렬은 같은 초 내 순서를 섞음)
            temp_df = temp_df.sort_values("timestamp", kind="stable").reset_index(drop=True)
            temp_df["rtt"] = pd.to_numeric(temp_df["rtt"], errors="coerce")
            # 시나리오(파일) 경계를 넘지 않도록 파일별로 직전 샘플 대비 RTT 변동폭을 실측 지터로 계산
            temp_df["jitter"] = temp_df["rtt"].diff().abs().fillna(0.0)
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
# 문자열/공백으로 오인식된 결측값을 수치형으로 강제 변환 (rtt/jitter는 파일별 로드 단계에서 이미 처리됨)
df["loss_flag"] = pd.to_numeric(df["loss_flag"], errors='coerce')

feature_candidates = [
    "rtt", "loss_flag", "jitter",
    "경로RTT", "거래RTT", "지터", "링크손실", "앱손실"
]
selected_features = [c for c in df.columns if c in feature_candidates]

print(f"[*] 학습 사용 피처: {selected_features}")

# 결측치 0으로 보정 및 피처/라벨 분리
X = df[selected_features].replace([np.inf, -np.inf], np.nan).fillna(0)
y = df["label"]

# (피처+라벨) 완전 중복 행 제거 - 초 단위 타임스탬프 해상도와 빠른 폴링 주기 때문에
# 안정된 구간에서 동일한 값이 반복 기록되는 경우가 있음. 분할 전에 제거하지 않으면
# 같은 행이 학습셋과 검증셋에 동시에 들어가 검증 점수가 부풀려지는 누수가 발생함.
combo = pd.concat([X, y], axis=1)
before_dedup = len(combo)
combo = combo.drop_duplicates().reset_index(drop=True)
removed = before_dedup - len(combo)
print(f"[*] (피처+라벨) 완전 중복 {removed}행 제거 ({removed/before_dedup*100:.1f}%) -> 최종 {len(combo)}행")
X = combo[selected_features]
y = combo["label"]

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

    # 단건 순회 추론 지연시간 (마이크로초)
    # - n_jobs=-1 그대로 재면 predict 호출마다 스레드 풀 기동 비용이 붙어 RF가 약 10배 부풀려지므로 1로 고정
    # - 워밍업 100회 후 2000회 측정, 튀는 값에 강한 중앙값과 꼬리 지연(p99)을 함께 보고
    if hasattr(model, "n_jobs"):
        model.set_params(n_jobs=1)
    bench_rows = [X_test.iloc[[i]] for i in range(500)]
    for i in range(100):
        model.predict(bench_rows[i % len(bench_rows)])
    sample_latencies = []
    for i in range(2000):
        single_pkt = bench_rows[i % len(bench_rows)]
        inf_start = time.perf_counter()
        _ = model.predict(single_pkt)
        inf_end = time.perf_counter()
        sample_latencies.append((inf_end - inf_start) * 1_000_000)

    results.append({
        "Model": name,
        "Accuracy (%)": round(acc * 100, 2),
        "Macro F1": round(f1, 4),
        "Train Time (ms)": round(train_time, 2),
        "Single Latency Median (us)": round(np.median(sample_latencies), 2),
        "Single Latency p99 (us)": round(np.percentile(sample_latencies, 99), 2)
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
benchmark_csv_path = os.path.join(BASE_DIR, "benchmark_results.csv")
res_df.to_csv(benchmark_csv_path, index=False)
print(f"\n[*] '{benchmark_csv_path}' 저장 완료.")

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
feat_png_path = os.path.join(BASE_DIR, "rf_feature_importance.png")
plt.savefig(feat_png_path, dpi=300)
print(f"[*] '{feat_png_path}' 시각화 완료.\n")

# 논문용 컨퓨전 매트릭스: 학습에 쓰지 않은 테스트셋(20%) 기준 (evaluate.py는 전체 데이터 기준이라 인용 불가)
from sklearn.metrics import confusion_matrix, classification_report
scenario_names = ['Normal(0)', 'Delay(1)', 'Loss(2)', 'Combined(3)']
rf_test_pred = rf_model.predict(X_test)
cm = confusion_matrix(y_test, rf_test_pred, labels=[0, 1, 2, 3])
print("[*] Random Forest 테스트셋 컨퓨전 매트릭스 (행=실제, 열=예측)")
print(pd.DataFrame(cm, index=scenario_names, columns=scenario_names).to_string())
print(classification_report(y_test, rf_test_pred, labels=[0, 1, 2, 3], target_names=scenario_names, digits=4, zero_division=0))
pd.DataFrame(cm, index=scenario_names, columns=scenario_names).to_csv(os.path.join(BASE_DIR, "rf_confusion_matrix_test.csv"))

plt.figure(figsize=(7, 6))
sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', cbar=False, xticklabels=scenario_names, yticklabels=scenario_names)
plt.title('Random Forest - 4-Class Confusion Matrix (Test Set)', fontsize=12, pad=15)
plt.ylabel('Actual Scenario', fontsize=10)
plt.xlabel('Predicted Scenario', fontsize=10)
plt.tight_layout()
cm_png_path = os.path.join(BASE_DIR, "rf_confusion_matrix_test.png")
plt.savefig(cm_png_path, dpi=300)
print(f"[*] '{cm_png_path}' 저장 완료.\n")

# ----------------------------------------------------
# 6. 최적 모델 저장 (성능 최우수 RF + 초저지연 DT)
# ----------------------------------------------------
models_dir = os.path.join(BASE_DIR, "models")
os.makedirs(models_dir, exist_ok=True)

rf_path = os.path.join(models_dir, "rf_best_accuracy.pkl")
joblib.dump(trained_models["Random Forest"], rf_path)
print(f"[*] '{rf_path}' 저장 완료 (4-class 시나리오 분류, 최고 정확도).")

dt_path = os.path.join(models_dir, "dt_low_latency.pkl")
joblib.dump(trained_models["Decision Tree"], dt_path)
print(f"[*] '{dt_path}' 저장 완료 (4-class 시나리오 분류, 초저지연).")