<<<<<<< HEAD
=======
import joblib
>>>>>>> 04277f0 (Feat: Complete robust dataset and final AI model sync)
import os
import pandas as pd
import pickle
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix

# 1. 경로 설정 (최상위 폴더 기준)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, 'data', 'net_guardian_robust_dataset.csv')
<<<<<<< HEAD
MODEL_PATH = os.path.join(BASE_DIR, 'models', 'final_model.pkl')
=======
MODEL_PATH = os.path.join(BASE_DIR, 'models', 'best_anomaly_detector.pkl')
>>>>>>> 04277f0 (Feat: Complete robust dataset and final AI model sync)

print("[+] 수집된 데이터 및 학습된 AI 모델 로드 중...")

# 안전장치: 모델 파일이 없는 경우 예외 처리
if not os.path.exists(MODEL_PATH):
    print(f"[-] 에러: {MODEL_PATH} 주소에 모델 파일이 없습니다.")
    print("[-] 구민님이 1단계 'train.py' 학습을 정상적으로 끝냈는지 먼저 확인해주세요.")
    exit()

if not os.path.exists(DATA_PATH):
    print(f"[-] 에러: {DATA_PATH} 주소에 수집된 CSV 데이터셋 파일이 없습니다.")
    exit()

# 데이터 및 모델 불러오기
df = pd.read_csv(DATA_PATH)
<<<<<<< HEAD
with open(MODEL_PATH, 'rb') as f:
    model = pickle.load(f)
=======
model = joblib.load(MODEL_PATH)
>>>>>>> 04277f0 (Feat: Complete robust dataset and final AI model sync)

# 2. 전처리 (결측치 제거 및 Feature/Label 분리)
df = df.dropna()

# 팀장님이 설계하신 시스템의 정답 라벨 컬럼명 ('label' 또는 'status_label' 자동 검색)
target_label = None
for col in ['label', 'status_label', 'Status', 'Label']:
    if col in df.columns:
        target_label = col
        break

if target_label is None:
    # 매칭되는 이름이 없으면 가장 마지막 컬럼을 정답 라벨로 인식
    target_label = df.columns[-1]

print(f"[+] 감지된 정답 라벨 컬럼명: '{target_label}'")

# 모델 학습에 사용되지 않는 문자열 컬럼이나 불필요한 컬럼이 있다면 제외 (예: 타임스탬프 등)
# 기본적으로 수집 엔진(packet_analyzer)이 쌓은 피처들만 남김
X = df.drop(columns=[target_label])
y_true = df[target_label]

# 혹시 모를 문자열 데이터 타입 에러 방지를 위해 숫자형 원성이 아닌 피처는 제거 (예: 수집 시간 등)
X = X.select_dtypes(include=['number'])

# 3. AI 모델 예측 수행
print("[+] AI 검증 및 테스트 시뮬레이션 진행 중...")
y_pred = model.predict(X)

# 4. 성능 평가지표 산출 (A+ 보고서용 수치 데이터)
acc = accuracy_score(y_true, y_pred)
prec = precision_score(y_true, y_pred, average='macro', zero_division=0)
rec = recall_score(y_true, y_pred, average='macro', zero_division=0)
f1 = f1_score(y_true, y_pred, average='macro', zero_division=0)

print("\n" + "="*50)
print("       [★ Net_Guardian AI 모델 최종 성적표 ★]")
print("="*50)
print(f" ▶ 정확도 (Accuracy) : {acc*100:.2f}%")
print(f" ▶ 정밀도 (Precision): {prec*100:.2f}%")
print(f" ▶ 재현율 (Recall)   : {rec*100:.2f}%")
print(f" ▶ F1-Score          : {f1*100:.2f}%")
print("="*50)

# 5. 오차행렬(Confusion Matrix) 시각화 그래프 생성 및 저장
print("[+] 논문/보고서용 Confusion Matrix 시각화 그래프 굽는 중...")
cm = confusion_matrix(y_true, y_pred)

plt.figure(figsize=(6, 5))
sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', cbar=False,
            xticklabels=['Normal(0)', 'Fault/Attack(1)'],
            yticklabels=['Normal(0)', 'Fault/Attack(1)'])
plt.title('Net_Guardian AI Model - Confusion Matrix', fontsize=12, pad=15)
plt.ylabel('Actual Label (True)', fontsize=10)
plt.xlabel('Predicted Label (AI)', fontsize=10)
plt.tight_layout()

# 보고서 및 PPT 슬라이드에 바로 복사 붙여넣기 할 수 있도록 이미지 파일 저장
graph_path = os.path.join(BASE_DIR, 'models', 'confusion_matrix.png')
plt.savefig(graph_path, dpi=300)
print(f"[+] 완료! 보고서용 그래프 이미지가 다음 경로에 저장되었습니다:\n    -> {graph_path}\n")
