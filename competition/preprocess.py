import pandas as pd
import glob
import os

def preprocess_data(data_dir='data/', output_file='data/final_cleaned_data.csv'):
    # 지정된 디렉토리 내의 raw_*.csv 파일 리스트 확보
    all_files = glob.glob(os.path.join(data_dir, "raw_*.csv"))
    
    raw_count = 0 
    df_list = []
    dropped_rows_list = [] # 제거된 행을 담을 리스트

    print("--- 데이터 전처리 및 무결성 검증 시작 ---")

    for filename in all_files:
        # 1. 원본 파일 로드
        df = pd.read_csv(filename, header=None)
        raw_count += len(df)
        
        # 2. 데이터 구조 강제 고정 및 메타데이터 추가
        df['source_file'] = os.path.basename(filename)
        df['original_index'] = df.index
        
        # RTT(2번째 열)만 복사본 생성
        df_rtt = df.iloc[:, [1]].copy()
        df_rtt.columns = ['rtt']
        
        # 3. 숫자형 변환 (에러 발생 시 NaN으로 변환)
        df_rtt['rtt'] = pd.to_numeric(df_rtt['rtt'], errors='coerce')
        
        # 4. 결측치/에러 데이터(NaN)가 발생한 행 별도 추출
        dropped_rows = df[df_rtt['rtt'].isna()]
        if not dropped_rows.empty:
            dropped_rows_list.append(dropped_rows)
            
        # 5. 선형 보간 적용 (데이터 손실 최소화)
        df_rtt['rtt'] = df_rtt['rtt'].interpolate(method='linear')
        
        # 최종 삭제 (보간 후에도 남은 결측치 제거)
        final_df = df_rtt.dropna().copy()
        
        # 시나리오 정보 추가 및 리스트 저장
        final_df['scenario'] = os.path.basename(filename).replace('raw_', '').replace('.csv', '')
        df_list.append(final_df)

    # 모든 데이터 병합
    combined_df = pd.concat(df_list, ignore_index=True)
    
    # 6. [학술적 근거] 장애 임계치 라벨링 (200ms 기준) [cite: 156, 157, 159, 160]
    combined_df['label'] = combined_df['rtt'].apply(lambda x: 1 if x > 200 else 0)
    
    # 7. 상세 결과 보고 출력
    if dropped_rows_list:
        print("\n--- 제거/정제된 데이터 상세 내역 ---")
        print(pd.concat(dropped_rows_list))
    else:
        print("\n제거된 결측치/에러 데이터가 없습니다.")

    print("\n--- 최종 데이터 정제 리포트 ---")
    print(f"전체 수집된 데이터 건수: {raw_count}건")
    print(f"정제 후 데이터 건수: {len(combined_df)}건")
    print(f"제거된 결측치/에러 데이터: {raw_count - len(combined_df)}건")
    print("-" * 35)
    print("시나리오별 라벨 분포:")
    print(combined_df.groupby(['scenario', 'label']).size())
    
    # 8. 파일 저장
    combined_df.to_csv(output_file, index=False)
    print(f"\n 최종 학습 데이터셋 저장 완료: {output_file}")

if __name__ == "__main__":
    preprocess_data()
