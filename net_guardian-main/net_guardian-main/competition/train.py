# [net_guardian] 경진대회 제출용 RF + LightGBM 성능 비교 및 학습 엔진
import pandas as pd
import numpy as np
import joblib
import os
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, classification_report
from lightgbm import LGBMClassifier

def train_and_compare_models(data_path='data/final_cleaned_data.csv', model_dir='models/'):
    print("🚀 [AI 학습 엔진] 경진대회용 데이터셋 로드 중...")
    if not os.path.exists(data_path):
        raise FileNotFoundError(f"❌ 오류: 전처리된 데이터셋({data_path})이 없습니다. 구민이 전처리가 먼저 완료되어야 합니다.")
        
    df = pd.read_csv(data_path)
    
    # 1. 팀장 정의 5대 피처(X)와 정답 라벨(y) 분리
    features = ['avg_rtt', 'max_rtt', 'std_rtt', 'moving_avg', 'rtt_change_rate']
    target = 'is_anomaly'
    
    X = df[features]
    y = df[target]
    
    # 2. 대회의 정석: 학습 데이터(80%)와 검증 데이터(20%) 분리 (Stratify로 라벨 비율 유지)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    print(f"📊 데이터 분할 완료 - 학습용: {len(X_train)}건, 검증용: {len(X_test)}건")
    print("-" * 60)

    # 3. 모델 A: 전통의 강자 Random ForestClassifier 선언 및 학습
    print("[1/2] Random Forest 모델 학습 시작...")
    rf_model = RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42, n_jobs=-1)
    rf_model.fit(X_train, y_train)
    rf_pred = rf_model.predict(X_test)
    
    # 4. 모델 B: 고속 대용량의 최강자 LightGBM 선언 및 학습
    print("[2/2] LightGBM 모델 학습 시작...")
    # 경진대회 노이즈 대응 및 과적합 방지 하이퍼파라미터 세팅
    lgbm_model = LGBMClassifier(n_estimators=100, learning_rate=0.05, max_depth=7, random_state=42, verbose=-1)
    lgbm_model.fit(X_train, y_train)
    lgbm_pred = lgbm_model.predict(X_test)
    print("-" * 60)

    # 5. 경진대회 평가 지표 4대장 연산 (Accuracy, Precision, Recall, F1-Score)
    metrics = {}
    for name, pred in [('Random Forest', rf_pred), ('LightGBM', lgbm_pred)]:
        metrics[name] = {
            'Accuracy': accuracy_score(y_test, pred),
            'Precision': precision_score(y_test, pred, zero_division=0),
            'Recall': recall_score(y_test, pred, zero_division=0),
            'F1-Score': f1_score(y_test, pred, zero_division=0)
        }

    # 6. 대시보드 성능 비교 테이블 출력 (대회 보고서용)
    print("🏆 [알고리즘 최종 성능 비교 스펙 리포트]")
    metrics_df = pd.DataFrame(metrics).T
    print(metrics_df.round(4))
    print("-" * 60)

    # 7. 승리한 최적의 모델 판정 및 자동 서납 (F1-Score 기준 최고점 모델 선택)
    rf_f1 = metrics['Random Forest']['F1-Score']
    lgbm_f1 = metrics['LightGBM']['F1-Score']
    
    os.makedirs(model_dir, exist_ok=True)
    
    if rf_f1 >= lgbm_f1:
        best_model_name = "Random Forest"
        best_model = rf_model
    else:
        best_model_name = "LightGBM"
        best_model = lgbm_model
        
    print(f"🔥 [최종 승리 모델 판정] F1-Score 기준 최적 알고리즘: ★{best_model_name}★")
    
    # 승리한 모델 파일을 models/ 폴더 안에 저장 (승현이가 마리모 대시보드에서 로드할 파일)
    model_save_path = os.path.join(model_dir, 'best_anomaly_detector.pkl')
    joblib.dump(best_model, model_save_path)
    print(f"💾 최적 모델 파일 영구 저장 완료: '{model_save_path}'")
    print("-" * 60)

if __name__ == "__main__":
    train_and_compare_models()
