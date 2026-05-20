import pandas as pd
import numpy as np
import os
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, accuracy_score
import joblib

def load_and_label_data():
    data_list = []
    
    # 1. 경로 설정 (Net_Guardian/data 폴더를 정확히 가리킴)
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(base_dir, 'data')
    
    scenarios = {
        'raw_normal.csv': 0,
        'raw_delay.csv': 1,
        'raw_loss.csv': 2,
        'raw_delay_loss.csv': 3
    }
    
    for file_name, label in scenarios.items():
        file_path = os.path.join(data_dir, file_name)
        
        if os.path.exists(file_path):
            try:
                df = pd.read_csv(file_path, header=None, names=['time', 'rtt', 'loss', 'status'])
                # 2. 컬럼명 정제: 소문자화 + 공백 제거
                df.columns = df.columns.str.strip().str.lower()
                
                # 3. [강제 매핑] 헤더에 다른 이름이 있어도 rtt와 loss로 고정
                # CSV 파일이 실제로는 다른 이름을 가졌더라도 아래에서 지정한 이름으로 변경
                rename_dict = {}
                # 대소문자나 특수문자가 섞여있을 경우를 대비해 첫 번째 열이 time 등일 경우
                # 컬럼 이름이 ['time', 'rtt', 'loss', 'status']라고 가정하고 강제 설정
                if len(df.columns) >= 3:
                    df.columns = ['time', 'rtt', 'loss', 'status']
                
                print(f"✅ 파일 로드: {file_name} | 인식된 컬럼: {list(df.columns)}")
                
                # 필수 컬럼만 추출
                sub_df = df[['rtt', 'loss']].copy()
                sub_df['rtt'] = pd.to_numeric(sub_df['rtt'], errors='coerce')
                sub_df['loss'] = pd.to_numeric(sub_df['loss'], errors='coerce')
                sub_df = sub_df.dropna()
                
                if not sub_df.empty:
                    sub_df['target'] = label
                    data_list.append(sub_df)
            except Exception as e:
                print(f"❌ 읽기 오류 ({file_name}): {e}")
        else:
            print(f"🔍 파일 없음: {file_path}")
            
    return pd.concat(data_list, ignore_index=True) if data_list else None

def train_random_forest():
    print("🚀 AI 모델 학습 시작!")
    df = load_and_label_data()
    
    if df is None or df.empty:
        print("❌ 학습 데이터가 없습니다. CSV 파일들을 확인해주세요.")
        return

    X = df[['rtt', 'loss']]
    y = df['target']

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.1, random_state=42, stratify=y)
    
    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)
    
    # 모델 저장
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    model_path = os.path.join(base_dir, 'models', 'network_rf_model.joblib')
    os.makedirs(os.path.dirname(model_path), exist_ok=True)
    joblib.dump(model, model_path)
    
    print(f"💾 학습 완료! 모델 저장 위치: {model_path}")
    print(classification_report(y_test, model.predict(X_test)))

if __name__ == "__main__":
    train_random_forest()
