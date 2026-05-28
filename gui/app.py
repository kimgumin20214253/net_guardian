import streamlit as st
import pandas as pd
import joblib
import os
import time

# 1. 페이지 설정
st.set_page_config(page_title="산업 네트워크 장애 진단 대시보드", layout="wide")

st.title("🏭 산업 네트워크 장애 대응 시스템")
st.markdown("실시간 RTT 및 패킷 손실 데이터를 기반으로 AI가 장애 여부를 진단합니다.")

# 2. 모델 로드 (루트 폴더의 models 폴더)
model_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'models', 'network_rf_model.joblib')

@st.cache_resource
def load_model():
    if os.path.exists(model_path):
        return joblib.load(model_path)
    else:
        return None

model = load_model()

# 3. 데이터 로드 함수 수정 (KeyError 방지)
def get_latest_data():
    file_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'raw_normal.csv')
    if os.path.exists(file_path):
        try:
            df = pd.read_csv(file_path, header=None, names=['time', 'rtt', 'loss', 'status'])
            # 1. 컬럼명 정제: 공백 제거 및 소문자 변환
            df.columns = df.columns.str.strip().str.lower()
            
            # 2. 필수 컬럼 확인 (없으면 빈 데이터프레임 반환)
            if 'rtt' not in df.columns or 'loss' not in df.columns:
                st.warning(f"데이터 파일에 rtt 또는 loss 컬럼이 없습니다. 현재 컬럼: {list(df.columns)}")
                return pd.DataFrame()
            
            return df.tail(10000)
        except Exception as e:
            st.error(f"데이터 읽기 오류: {e}")
            return pd.DataFrame()
    return pd.DataFrame()

# 4. GUI 레이아웃
col1, col2 = st.columns(2)

with col1:
    st.subheader("📊 실시간 네트워크 지표")
    placeholder = st.empty()

with col2:
    st.subheader("🤖 AI 장애 진단 결과")
    diagnosis_placeholder = st.empty()

# 1. 데이터 가져오기
df = get_latest_data()

# 2. 화면 출력 로직 (루프 없이 그냥 실행)
if not df.empty:
    placeholder.line_chart(df[['rtt']])
    
    if model:
        latest = df.iloc[[-1]][['rtt', 'loss']]
        prediction = model.predict(latest)[0]
        status_map = {0: "정상", 1: "지연 장애", 2: "패킷 손실", 3: "복합 장애"}
        result = status_map.get(prediction, "알 수 없음")
        diagnosis_placeholder.metric("현재 진단 상태", result)
    else:
        diagnosis_placeholder.error("모델 파일을 찾을 수 없습니다.")

# 3. 1초 뒤에 스크립트를 다시 처음부터 실행 (이게 실시간 갱신의 핵심!)
time.sleep(1)
st.rerun()
