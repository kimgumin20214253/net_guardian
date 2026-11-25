# [net_guardian] 경진대회 GridSearchCV 기반 F1-Score 최적화 앙상블 튜닝 엔진
import pandas as pd
import numpy as np
import joblib
import os
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import f1_score, classification_report
from lightgbm import LGBMClassifier

def run_hyperparameter_tuning(data_path='data/final_cleaned_data.csv', model_dir='models/'):
    print("🚀 [하이퍼파라미터 튜닝 엔진] 최적화 데이터셋 로드 중...")
    if not os.path.exists(data_path):
        raise FileNotFoundError(f"❌ 오류: 전처리된 데이터셋({data_path})이 없습니다. 구민이 전처리가 먼저 선행되어야 합니다.")
        
    df = pd.read_csv(data_path)
    
    # 1. 팀장 정의 5대 피처와 라벨 분리
    features = ['avg_rtt', 'max_rtt', 'std_rtt', 'moving_avg', 'rtt_change_rate']
    X = df[features]
    y = df['is_anomaly']
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    # =========================================================
    # [⚙️ 튜닝 1] Random Forest 최적의 파라미터 그리드 탐색
    # =========================================================
    print("\n🔍 [1/2] Random Forest GridSearchCV 가동 (F1-Score 기준)...")
    rf_base = RandomForestClassifier(random_state=42, n_jobs=-1)
    
    # 대회 성능 격차를 벌릴 핵심 파라미터 후보군 조합
    rf_param_grid = {
        'n_estimators': [50, 100, 200],
        'max_depth': [5, 10, 15],
        'min_samples_split': [2, 5]
    }
    
    # 3-Fold 교차검증(CV)을 돌려 F1 지표가 가장 높은 조합 산출
    rf_grid = GridSearchCV(estimator=rf_base, param_grid=rf_param_grid, scoring='f1', cv=3, n_jobs=-1, verbose=1)
    rf_grid.fit(X_train, y_train)
    
    print(f"✅ Random Forest 최적 파라미터: {rf_grid.best_params_}")
    print(f"🏆 RF 최고 교차검증 F1-Score: {round(rf_grid.best_score_, 4)}")

    # =========================================================
    # [⚙️ 튜닝 2] LightGBM 최적의 파라미터 그리드 탐색
    # =========================================================
    print("\n🔍 [2/2] LightGBM GridSearchCV 가동 (F1-Score 기준)...")
    lgbm_base = LGBMClassifier(random_state=42, verbose=-1, n_jobs=-1)
    
    # 고속 부스팅의 과적합을 막는 정밀 제어 후보군 조합
    lgbm_param_grid = {
        'n_estimators': [50, 100, 200],
        'learning_rate': [0.01, 0.05, 0.1],
        'max_depth': [5, 7, 10]
    }
    
    lgbm_grid = GridSearchCV(estimator=lgbm_base, param_grid=lgbm_param_grid, scoring='f1', cv=3, n_jobs=-1, verbose=1)
    lgbm_grid.fit(X_train, y_train)
    
    print(f"✅ LightGBM 최적 파라미터: {lgbm_grid.best_params_}")
    print(f"🏆 LightGBM 최고 교차검증 F1-Score: {round(lgbm_grid.best_score_, 4)}")

    # =========================================================
    # [🏁 최종 조율] 두 최적화 모델 중 진짜 왕중왕(앙상블 승리자) 선별
    # =========================================================
    print("\n" + "="*60)
    best_rf = rf_grid.best_estimator_
    best_lgbm = lgbm_grid.best_estimator_
    
    rf_final_f1 = f1_score(y_test, best_rf.predict(X_test), zero_division=0)
    lgbm_final_f1 = f1_score(y_test, best_lgbm.predict(X_test), zero_division=0)
    
    os.makedirs(model_dir, exist_ok=True)
    
    if rf_final_f1 >= lgbm_final_f1:
        tuned_winner = "Tuned_RandomForest"
        final_model = best_rf
    else:
        tuned_winner = "Tuned_LightGBM"
        final_model = best_lgbm
        
    print(f"🔥 [GridSecarchCV 앙상블 종착지] 최종 최적화 튜닝 모델 확정: ★{tuned_winner}★")
    print(f"🎯 최종 검증셋 F1-Score 스펙 수치: {round(max(rf_final_f1, lgbm_final_f1), 4)}")
    
    # 성능을 소수점 끝까지 쥐어짜 구워낸 최적화 모델을 영구 보존 수납
    tuned_save_path = os.path.join(model_dir, 'best_anomaly_detector.pkl')
    joblib.dump(final_model, tuned_save_path)
    print(f"💾 튜닝 완료된 최적 모델 교체 보존 완료: '{tuned_save_path}'")
    print("="*60)

if __name__ == "__main__":
    run_hyperparameter_tuning()
