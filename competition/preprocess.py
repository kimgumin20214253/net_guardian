import pandas as pd
import glob
import os

def preprocess_data(data_dir='data/', output_file='data/final_cleaned_data.csv'):
    all_files = glob.glob(os.path.join(data_dir, "raw_*.csv"))
    
    df_list = []
    
    for filename in all_files:
        df = pd.read_csv(filename, header=None)
        
        # 1. 컬럼 정리 (RTT값만 추출)
        df = df.iloc[:, [1]]
        df.columns = ['rtt']
        
        # 2. 파일명에서 시나리오명 추출
        filename_only = os.path.basename(filename)
        scenario = filename_only.replace('raw_', '').replace('.csv', '')
        
        # 3. [요청 반영] is_anomaly 컬럼 추가 (normal은 0, 나머지는 1)
        # 만약 파일명에 'normal'이 포함되어 있으면 0, 아니면 1
        df['is_anomaly'] = 0 if 'normal' in scenario else 1
        df['scenario'] = scenario
        
        # 4. 정제 (숫자 변환 및 결측치 처리)
        df['rtt'] = pd.to_numeric(df['rtt'], errors='coerce')
        df['rtt'] = df['rtt'].interpolate(method='linear')
        
        df_list.append(df.dropna())

    combined_df = pd.concat(df_list, ignore_index=True)
    combined_df.to_csv(output_file, index=False)
    
    print(f"✅ 정제 완료: {len(combined_df)}건 저장")
    print(combined_df.groupby(['scenario', 'is_anomaly']).size())

if __name__ == "__main__":
    preprocess_data()
