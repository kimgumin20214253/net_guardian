# src/streamlit_app.py

import streamlit as st

import pandas as pd

import time

from detector import detect_anomaly


st.set_page_config(

    page_title="Industrial Network Monitoring",

    layout="wide"
)

st.title(
    "Industrial Network Threshold Monitoring"
)

placeholder = st.empty()


while True:

    df = pd.read_csv("logs/realtime.csv")

    result_df = detect_anomaly(df)

    latest = result_df.iloc[-1]

    with placeholder.container():

        st.subheader(
            f"Current Status: {latest['status']}"
        )

        st.write("### Response Time")

        st.metric(
            "RTT (ms)",
            latest["response_time_ms"]
        )

        st.write("### Cause Analysis")

        st.write(latest["cause"])

        st.write("### Recommended Action")

        st.write(latest["action"])

        st.write("### Realtime RTT")

        st.line_chart(
            df["response_time_ms"]
        )

    time.sleep(2)