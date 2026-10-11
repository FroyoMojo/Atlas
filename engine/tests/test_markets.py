from app import markets


def test_grades_follow_the_stated_thresholds():
    assert markets.grade_market(19, 2)[0] == "A"      # Brays-like: 10.5% over 19 years
    assert markets.grade_market(16, 3)[0] == "A"
    assert markets.grade_market(12, 2)[0] == "B"      # viable rate but a short record
    assert markets.grade_market(10, 3)[0] == "B"
    assert markets.grade_market(18, 12)[0] == "C"     # 67% of years: premium would approach the payout
    assert markets.grade_market(18, 0)[0] == "C"      # never reached: nothing to price
    assert markets.grade_market(8, 1)[0] == "C"       # too little record
    assert markets.grade_market(0, 0)[0] == "C"
    assert markets.grade_market(17, 1)[0] == "B"      # one event is not enough for an A


def test_a_c_grade_always_says_why():
    grade, reasons = markets.grade_market(18, 8)
    assert grade == "C" and "44%" in reasons[0]



def test_freeze_blocking_alert():
    from app.freeze import blocking_alert
    ev = lambda e: {"properties": {"event": e}}  # noqa: E731
    assert blocking_alert([ev("Flood Watch")]) == "Flood Watch"
    assert blocking_alert([ev("Heat Advisory"), ev("Hurricane Warning")]) == "Hurricane Warning"
    assert blocking_alert([ev("Flash Flood Warning")]) == "Flash Flood Warning"
    assert blocking_alert([ev("Flood Advisory"), ev("Wind Advisory"), ev("Heat Warning")]) is None
    assert blocking_alert([]) is None
