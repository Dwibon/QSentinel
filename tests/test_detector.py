from src.detector import evaluate_axis, make_decision


def test_evaluate_axis_no_attack():
    result = evaluate_axis(
        errors=2,
        total=100,
        baseline_rate=0.02,
        alpha=0.01
    )

    assert result["observed_rate"] == 0.02
    assert result["baseline_rate"] == 0.02
    assert "p_value" in result
    assert result["reject"] is False


def test_evaluate_axis_detects_high_error_rate():
    result = evaluate_axis(
        errors=50,
        total=100,
        baseline_rate=0.02,
        alpha=0.01
    )

    assert result["observed_rate"] == 0.50
    assert result["p_value"] < 0.01
    assert result["reject"] is True


def test_evaluate_axis_rejects_invalid_total():
    try:
        evaluate_axis(
            errors=1,
            total=0,
            baseline_rate=0.02
        )
        assert False
    except ValueError:
        assert True


def test_evaluate_axis_rejects_invalid_errors():
    try:
        evaluate_axis(
            errors=101,
            total=100,
            baseline_rate=0.02
        )
        assert False
    except ValueError:
        assert True


def test_make_decision_accept():
    axis_results = {
        "X": {"reject": False},
        "Y": {"reject": False},
        "Z": {"reject": False},
    }

    assert make_decision(axis_results) == "ACCEPT"


def test_make_decision_inconclusive():
    axis_results = {
        "X": {"reject": True},
        "Y": {"reject": False},
        "Z": {"reject": False},
    }

    assert make_decision(axis_results) == "INCONCLUSIVE"


def test_make_decision_reject():
    axis_results = {
        "X": {"reject": True},
        "Y": {"reject": True},
        "Z": {"reject": False},
    }

    assert make_decision(axis_results) == "REJECT"