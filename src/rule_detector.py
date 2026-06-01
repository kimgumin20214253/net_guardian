def detect_rule_issue(
    avg_rtt,
    loss_rate
):

    RTT_THRESHOLD = 300
    LOSS_THRESHOLD = 1

    delay = avg_rtt >= RTT_THRESHOLD
    loss = loss_rate >= LOSS_THRESHOLD

    if delay and loss:
        return "DELAY_LOSS"

    if delay:
        return "DELAY"

    if loss:
        return "LOSS"

    return "NORMAL"