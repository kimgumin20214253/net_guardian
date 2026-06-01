# 로그 데이터에서 feature 추출

def extract_features(row):

    # RTT 값 가져오기
    response_time_ms = row["response_time_ms"]

    # 통신 성공 여부
    success = row["success"]

    # timeout 여부
    timeout = 1 if success == 0 else 0

    # feature 반환
    return {

        "response_time_ms":
        round(response_time_ms, 2),

        "success":
        int(success),

        "timeout":
        timeout
    }