import marimo

__generated_with = "0.23.6"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo
    import pandas as pd
    import numpy as np
    import os

    # 데이터 파일 경로 설정 (data/ 폴더가 같은 위치에 있다고 가정)
    data_dir = "data"
    file_path = os.path.join(data_dir, "raw_normal.csv")

    # 데이터 로드 (헤더가 없으므로 직접 컬럼명 지정)
    df = pd.read_csv(file_path, header=None, names=['time', 'rtt', 'loss', 'status'])

    # 데이터 타입 변환 (숫자로 강제 변환)
    df['rtt'] = pd.to_numeric(df['rtt'], errors='coerce')
    df['loss'] = pd.to_numeric(df['loss'], errors='coerce')

    # 확인용 테이블 출력
    mo.ui.table(df.head())
    return df, mo, pd


@app.cell
def _(df, mo, pd):
    # 이동 평균 및 통계량 계산
    df['moving_avg_rtt'] = df['rtt'].rolling(window=5).mean()
    df['rtt_change_rate'] = df['rtt'].pct_change()

    stats = {
        "Avg RTT": df['rtt'].mean(),
        "Max RTT": df['rtt'].max(),
        "Min RTT": df['rtt'].min(),
        "Std RTT": df['rtt'].std(),
        "Loss Rate": df['loss'].mean()
    }

    # 통계값 출력
    mo.md(f"### 📊 네트워크 통계 요약")
    mo.ui.table(pd.DataFrame([stats]))
    return


@app.cell
def _(df):
    import altair as alt

    # RTT 변화 그래프
    chart = alt.Chart(df.tail(50)).mark_line().encode(
        x='time',
        y='rtt',
        tooltip=['time', 'rtt', 'loss']
    ).properties(title="최근 50개 패킷 RTT 변화")

    chart
    return


if __name__ == "__main__":
    app.run()
