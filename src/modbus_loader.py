# src/modbus_client.py

from pymodbus.client import ModbusTcpClient

import time

import pandas as pd

from datetime import datetime

import random

import os


client = ModbusTcpClient(
    '127.0.0.1',
    port=5020
)

LOG_FILE = "logs/realtime.csv"

os.makedirs("logs", exist_ok=True)


# 로그 파일 생성
if not os.path.exists(LOG_FILE):

    pd.DataFrame(columns=[

        "timestamp",

        "response_time_ms",

        "success"

    ]).to_csv(
        LOG_FILE,
        index=False
    )


while True:

    start = time.time()

    success = 1

    response_time_ms = 0

    try:

        rr = client.read_holding_registers(0, 1)

        end = time.time()

        response_time_ms = (
            end - start
        ) * 1000

        if rr.isError():

            success = 0

    except Exception:

        success = 0

    # 랜덤 장애 삽입
    if random.random() < 0.05:

        success = 0

    log = {

        "timestamp":
        datetime.now(),

        "response_time_ms":
        round(response_time_ms, 2),

        "success":
        success
    }

    df = pd.DataFrame([log])

    df.to_csv(

        LOG_FILE,

        mode='a',

        header=False,

        index=False
    )

    print(log)

    time.sleep(1)
