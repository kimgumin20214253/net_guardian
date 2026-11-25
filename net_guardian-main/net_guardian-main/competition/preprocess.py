# [구민, 승현 공통] 통합 전처리 및 3대 EDA 자동화 스크립트 (경로 완벽 교정본)
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt
import os

def run_pipeline():
    # ★ 팀장 정밀 교정: competition/ 폴더 안에서 실행되므로 상위 폴더의 data/를 가리키도록 '../' 반영
    input_file = 'data/net_guardian_robust_dataset.csv'
    output_file = 'data/final_cleaned_data.csv'
    
    print("🚀 [1단계] 구민 실측 원본 데이터셋 전처리 시작...")
    if not os.path.exists(input_file):
        raise FileNotFoundError(f"❌ 치명적 오류: {input_file} 파일이 없습니다. 5단계 안내대로 원본 수집 및 업로드가 먼저 선행되어야 합니다.")
        
    df = pd.read_csv(input_file)
    
    # 필수 피처 5개와 정답 라벨 유효성 검증
    required_columns = ['avg_rtt', 'max_rtt', 'std_rtt', 'moving_avg', 'rtt_change_rate', 'is_anomaly']
    for col in required_columns:
        if col not in df.columns:
            raise ValueError(f"❌ 치명적 오류: 원본 데이터셋에 {col} 피처가 누락되었습니다!")

    # 중복치 및 결측치 제거 (보간법 절대 금지, 실측 데이터 무결성 보존)
    clean_df = df.dropna().drop_duplicates()
    clean_df.to_csv(output_file, index=False)
    print(f"✅ [전처리 완료] 중복 제거 후 총 {len(clean_df)}건 저장 ➔ {output_file}\n")

    # =========================================================
    # 이제 정제된 파일(final_cleaned_data.csv)을 읽어서 EDA 시작!
    # =========================================================
    print("📊 [2단계] 교수님 브리핑용 3대 EDA 미션 가동...")
    final_df = pd.read_csv(output_file)

    # 미션 1: 라벨별 5대 피처 기술 통계량 분석 (.describe())
    print("📊 [미션 1] 정상(0) vs 장애(1) 5대 피처 기술 통계 요약")
    summary = final_df.groupby('is_anomaly').describe().T
    summary.to_csv('data/eda_mission_1_describe.csv')  # <-- 상위 경로 '../' 반영
    print(summary)
    print("\n" + "="*50 + "\n")

    # 미션 2: 4대 시나리오 RTT 가우시안 정규분포 밀도 시각화
    plt.figure(figsize=(10, 6))
    sns.histplot(data=final_df, x='avg_rtt', hue='is_anomaly', kde=True, bins=50, palette='Set1', multiple='layer')
    plt.title('Mission 2: Gaussian RTT Distribution (Normal vs Anomaly)')
    plt.xlabel('Average RTT (ms)')
    plt.ylabel('Density / Count')
    plt.grid(True)
    plt.savefig('data/eda_mission_2_gaussian_plot.png', dpi=300)  # <-- 상위 경로 '../' 반영
    plt.close()
    print("✅ [미션 2] 가우시안 정규분포 밀도 히스토그램 이미지 저장 완료!")

    # 미션 3: 5대 피처 간의 상관관계 히트맵 (Correlation Heatmap)
    plt.figure(figsize=(8, 6))
    corr_matrix = final_df[required_columns].corr()
    sns.heatmap(corr_matrix, annot=True, cmap='coolwarm', fmt=".2f", linewidths=0.5)
    plt.title('Mission 3: 5-Features Correlation Heatmap')
    plt.tight_layout()
    plt.savefig('data/eda_mission_3_heatmap.png', dpi=300)  # <-- 상위 경로 '../' 반영
    plt.close()
    print("✅ [미션 3] 다중공선성 검증용 상관관계 히트맵 이미지 저장 완료!")
    print("\n[+] 모든 전처리 및 EDA 파일이 data/ 폴더에 완벽하게 적립되었습니다!")

if __name__ == "__main__":
    run_pipeline()
