import os
import glob
import joblib
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix

# 한글 폰트 설정 (Windows / Mac 대응)
if os.name == 'nt':
    plt.rc('font', family='Malgun Gothic')
else:
    plt.rc('font', family='AppleGothic')
plt.rcParams['axes.unicode_minus'] = False

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'raw_dataset_20260904')
MODEL_PATH = os.path.join(BASE_DIR, 'models', 'rf_best_accuracy.pkl')

# train_and_benchmark.py와 동일한 4대 시나리오 라벨 매핑
SCENARIO_MAP = {
    "scenario_A": 0,  # 정상 (Normal)
    "scenario_B": 1,  # 지연 (Delay)
    "scenario_C": 2,  # 유실 (Loss)
    "scenario_D": 3,  # 복합 (Combined)
}
SCENARIO_NAMES = ['Normal(0)', 'Delay(1)', 'Loss(2)', 'Combined(3)']

print("[+] 수집된 데이터 및 학습된 AI 모델 로드 중...")

if not os.path.exists(MODEL_PATH):
    print(f"[-] 에러: {MODEL_PATH} 주소에 모델 파일이 없습니다.")
    print("[-] 'train_and_benchmark.py'를 먼저 실행해 모델을 생성해주세요.")
    exit()

if not os.path.isdir(DATA_DIR):
    print(f"[-] 에러: {DATA_DIR} 폴더가 없습니다.")
    exit()

model = joblib.load(MODEL_PATH)

# ----------------------------------------------------
# 1. 데이터 로드 (train_and_benchmark.py와 동일한 라벨링 + 실측 지터 계산)
# ----------------------------------------------------
raw_columns = ["timestamp", "rtt", "loss_flag", "is_abnormal_flag"]
df_list = []
for file in sorted(glob.glob(os.path.join(DATA_DIR, "*.csv"))):
    fname = os.path.basename(file)
    for sc_key, label_val in SCENARIO_MAP.items():
        if sc_key.lower() in fname.lower():
            temp_df = pd.read_csv(file, header=None, names=raw_columns)
            temp_df["timestamp"] = pd.to_datetime(temp_df["timestamp"])
            temp_df = temp_df.sort_values("timestamp").reset_index(drop=True)
            temp_df["rtt"] = pd.to_numeric(temp_df["rtt"], errors="coerce")
            # 시나리오(파일) 경계를 넘지 않도록 파일별로 직전 샘플 대비 RTT 변동폭을 실측 지터로 계산
            temp_df["jitter"] = temp_df["rtt"].diff().abs().fillna(0.0)
            temp_df["label"] = label_val
            df_list.append(temp_df)
            print(f"[+] 로드 성공: {fname} -> Label {label_val}")
            break

if not df_list:
    print(f"[-] 에러: {DATA_DIR} 안에서 시나리오 CSV 파일을 찾지 못했습니다.")
    exit()

df = pd.concat(df_list, ignore_index=True)
df["loss_flag"] = pd.to_numeric(df["loss_flag"], errors="coerce")

X = df[["rtt", "loss_flag", "jitter"]].fillna(0)
y_true = df["label"]

# ----------------------------------------------------
# 2. AI 모델 예측 수행
# ----------------------------------------------------
print("[+] AI 검증 및 테스트 시뮬레이션 진행 중...")
# 참고: train_and_benchmark.py가 이미 80/20 분할로 held-out 성능을 측정하며,
# 여기서는 전체 데이터(학습에 쓰인 행 포함)로 재검증하므로 아래 수치는 실제
# held-out 성능보다 다소 낙관적일 수 있음 - 리포트용 스냅샷/컨퓨전 매트릭스 확인 목적
y_pred = model.predict(X)

# ----------------------------------------------------
# 3. 성능 평가지표 산출
# ----------------------------------------------------
acc = accuracy_score(y_true, y_pred)
prec = precision_score(y_true, y_pred, average='macro', zero_division=0)
rec = recall_score(y_true, y_pred, average='macro', zero_division=0)
f1 = f1_score(y_true, y_pred, average='macro', zero_division=0)

print("\n" + "=" * 50)
print("       [★ Net_Guardian AI 모델 최종 성적표 ★]")
print("=" * 50)
print(f" ▶ 정확도 (Accuracy)       : {acc*100:.2f}%")
print(f" ▶ 정밀도 (Macro Precision): {prec*100:.2f}%")
print(f" ▶ 재현율 (Macro Recall)   : {rec*100:.2f}%")
print(f" ▶ F1-Score (Macro)        : {f1*100:.2f}%")
print("=" * 50)

# ----------------------------------------------------
# 4. 오차행렬(Confusion Matrix) 시각화 그래프 생성 및 저장
# ----------------------------------------------------
print("[+] 논문/보고서용 4x4 Confusion Matrix 시각화 그래프 굽는 중...")
cm = confusion_matrix(y_true, y_pred, labels=[0, 1, 2, 3])

plt.figure(figsize=(7, 6))
sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', cbar=False,
            xticklabels=SCENARIO_NAMES,
            yticklabels=SCENARIO_NAMES)
plt.title('Net_Guardian AI Model - 4-Class Confusion Matrix', fontsize=12, pad=15)
plt.ylabel('Actual Scenario', fontsize=10)
plt.xlabel('Predicted Scenario', fontsize=10)
plt.tight_layout()

graph_path = os.path.join(BASE_DIR, 'models', 'confusion_matrix.png')
plt.savefig(graph_path, dpi=300)
print(f"[+] 완료! 보고서용 그래프 이미지가 다음 경로에 저장되었습니다:\n    -> {graph_path}\n")
