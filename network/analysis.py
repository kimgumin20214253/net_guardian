import pandas as pd
import numpy as np
import os
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report
import joblib

def load_and_label_data():
    """
    logs/realtime.csv를 읽어 국제 표준(RTT 450ms 초과 OR Loss 1% 이상)에 따라
    라벨링(target)을 수행하는 함수
    """
    # 현재 파일(analysis.py) 위치에서 logs/realtime.csv 경로 설정
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    file_path = os.path.join(base_dir, 'logs', 'realtime.csv')
    
    if not os.path.exists(file_path):
        print(f"❌ 데이터 파일 없음: {file_path}")
        return None

    try:
        # 데이터 로드
        df = pd.read_csv(file_path)
        print(f"✅ 데이터 로드 성공: {len(df)} 행")
        
        # 1. 수치형 변환
        df['rtt'] = pd.to_numeric(df['response_time_ms'], errors='coerce')
        df['loss'] = (df['success'] == 0).astype(int) # success=0 이면 손실(1)
        
        # 2. 국제 표준에 따른 자동 라벨링 (target)
        # RTT 450ms 초과 OR Loss 1% 이상인 경우 Anomaly(1), 아니면 Normal(0)
        # modbus_loader에서 5% 확률로 success=0을 주므로, 
        # 단순히 success=0을 기준으로 Loss=1로 간주합니다.
        
        df['target'] = np.where(
            (df['rtt'] > 450) | (df['loss'] == 1), 1, 0
        )
        
        # 데이터 정제
        df = df.dropna(subset=['rtt', 'loss'])
        return df[['rtt', 'loss', 'target']]

    except Exception as e:
        print(f"❌ 데이터 전처리 오류: {e}")
        return None

def train_random_forest():
    print("🚀 AI 모델 학습 시작 (국제 표준 적용)!")
    df = load_and_label_data()
    
    if df is None or df.empty:
        print("❌ 학습할 데이터가 없습니다.")
        return

    # 학습 및 테스트 데이터 분리
    from sklearn.model_selection import train_test_split
    X = df[['rtt', 'loss']]
    y = df['target']
    
    # 데이터가 충분할 때만 분할 학습 진행
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    
    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)
    
    # 모델 저장
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    model_dir = os.path.join(base_dir, 'models')
    os.makedirs(model_dir, exist_ok=True)
    model_path = os.path.join(model_dir, 'network_rf_model.joblib')
    
    joblib.dump(model, model_path)
    
    print(f"💾 학습 완료! 모델 저장 위치: {model_path}")
    print(classification_report(y_test, model.predict(X_test)))

if __name__ == "__main__":
    train_random_forest()
