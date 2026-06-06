# [구민, 승현 공통] 주말 3대 EDA 미션 자동화 스크립트
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

# 데이터 로드 (팀장이 정제 명령 내린 파일)
data_path = 'data/final_cleaned_data.csv'
df = pd.read_csv(data_path)

# =========================================================
# 미션 1: 라벨별 5대 피처 기술 통계량 분석 (.describe())
# =========================================================
print("📊 [미션 1] 정상(0) vs 장애(1) 5대 피처 기술 통계 요약")
summary = df.groupby('is_anomaly').describe().T
summary.to_csv('data/eda_mission_1_describe.csv')
print(summary)
print("\n" + "="*50 + "\n")

# =========================================================
# 미션 2: 4대 시나리오 RTT 가우시안 정규분포 밀도 시각화
# =========================================================
plt.figure(figsize=(10, 6))
# 수집 엔진이 찍어준 RTT 값을 기준으로 정상/장애 분포를 분리 시각화
sns.histplot(data=df, x='avg_rtt', hue='is_anomaly', kde=True, bins=50, palette='Set1', multiple='layer')
plt.title('Mission 2: Gaussian RTT Distribution (Normal vs Anomaly)')
plt.xlabel('Average RTT (ms)')
plt.ylabel('Density / Count')
plt.grid(True)
plt.savefig('data/eda_mission_2_gaussian_plot.png', dpi=300)
plt.close()
print("✅ [미션 2] 가우시안 정규분포 밀도 히스토그램 이미지 저장 완료!")

# =========================================================
# 미션 3: 5대 피처 간의 상관관계 히트맵 (Correlation Heatmap)
# =========================================================
plt.figure(figsize=(8, 6))
# 5대 피처와 라벨 간의 피어슨 상관계수 연산
features_list = ['avg_rtt', 'max_rtt', 'std_rtt', 'moving_avg', 'rtt_change_rate', 'is_anomaly']
corr_matrix = df[features_list].corr()

sns.heatmap(corr_matrix, annot=True, cmap='coolwarm', fmt=".2f", linewidths=0.5)
plt.title('Mission 3: 5-Features Correlation Heatmap')
plt.tight_layout()
plt.savefig('data/eda_mission_3_heatmap.png', dpi=300)
plt.close()
print("✅ [미션 3] 다중공선성 검증용 상관관계 히트맵 이미지 저장 완료!")
