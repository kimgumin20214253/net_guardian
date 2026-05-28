import pandas as pd
import glob
import os

def preprocess_data(data_dir='data/', output_file='data/final_cleaned_data.csv'):
    all_files = glob.glob(os.path.join(data_dir, "raw_*.csv"))
    
    df_list = []
    for filename in all_files:
        # 파일마다 컬럼 개수가 다를 수 있으니 상황에 맞게 처리
        df = pd.read_csv(filename, header=None)
        
        # [데이터 구조 강제 고정] 
        # 어떤 파일이든 RTT는 2번째(인덱스 1), 시나리오는 파일명에서 추출
        # 컬럼이 밀려있더라도 RTT 숫자만 제대로 추출하면 됩니다.
        df = df.iloc[:, [1]]  # 2번째 열(RTT)만 추출
        df.columns = ['rtt']
        
        # 시나리오 이름 추출
        scenario = os.path.basename(filename).replace('raw_', '').replace('.csv', '')
        df['scenario'] = scenario
        
        # 숫자형 변환
        df['rtt'] = pd.to_numeric(df['rtt'], errors='coerce')
        df_list.append(df.dropna())

    combined_df = pd.concat(df_list, ignore_index=True)
    
    # [핵심] RTT 임계치 라벨링 (이게 제일 정확합니다!)
    # normal 시나리오는 50ms 미만, 그 외는 50ms 이상일 확률이 높음
    # RTT가 50ms를 넘으면 1(장애), 아니면 0(정상)
    combined_df['label'] = combined_df['rtt'].apply(lambda x: 1 if x > 50 else 0)
    
    combined_df.to_csv(output_file, index=False)
    print(f"✅ 정제 완료! 총 {len(combined_df)}건 저장.")
    print(combined_df.groupby(['scenario', 'label']).size())

if __name__ == "__main__":
    preprocess_data()
