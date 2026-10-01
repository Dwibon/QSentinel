import numpy as np

from src.states import (
    normalize,
)
from src.stabilizers import (
    bell_stabilizers,
    stabilizer_error_rates,
    measure_stabilizer,
    sample_stabilizers,
)


def bell_phi_plus():
    return normalize(
        np.array(
            [1, 0, 0, 1],
            dtype=complex,
        )
    )


def bell_phi_minus():
    return normalize(
        np.array(
            [1, 0, 0, -1],
            dtype=complex,
        )
    )


def bell_psi_plus():
    return normalize(
        np.array(
            [0, 1, 1, 0],
            dtype=complex,
        )
    )


def bell_psi_minus():
    return normalize(
        np.array(
            [0, 1, -1, 0],
            dtype=complex,
        )
    )


def test_phi_plus_stabilizers():
    result = bell_stabilizers(
        bell_phi_plus()
    )

    assert np.isclose(
        result["XX"],
        1.0,
    )

    assert np.isclose(
        result["YY"],
        -1.0,
    )

    assert np.isclose(
        result["ZZ"],
        1.0,
    )


def test_phi_minus_stabilizers():
    result = bell_stabilizers(
        bell_phi_minus()
    )

    assert np.isclose(
        result["XX"],
        -1.0,
    )

    assert np.isclose(
        result["YY"],
        1.0,
    )

    assert np.isclose(
        result["ZZ"],
        1.0,
    )


def test_psi_plus_stabilizers():
    result = bell_stabilizers(
        bell_psi_plus()
    )

    assert np.isclose(
        result["XX"],
        1.0,
    )

    assert np.isclose(
        result["YY"],
        1.0,
    )

    assert np.isclose(
        result["ZZ"],
        -1.0,
    )


def test_psi_minus_stabilizers():
    result = bell_stabilizers(
        bell_psi_minus()
    )

    assert np.isclose(
        result["XX"],
        -1.0,
    )

    assert np.isclose(
        result["YY"],
        -1.0,
    )

    assert np.isclose(
        result["ZZ"],
        -1.0,
    )


def test_phi_plus_error_rates():
    result = stabilizer_error_rates(
        bell_phi_plus()
    )

    assert np.isclose(
        result["XX"],
        0.0,
    )

    assert np.isclose(
        result["YY"],
        1.0,
    )

    assert np.isclose(
        result["ZZ"],
        0.0,
    )


def test_measure_stabilizer():
    rng = np.random.default_rng(42)

    state = bell_phi_plus()

    outcomes = [
        measure_stabilizer(
            state,
            "XX",
            rng,
        )
        for _ in range(100)
    ]

    assert all(
        outcome == 1
        for outcome in outcomes
    )


def test_sample_stabilizers():
    rng = np.random.default_rng(42)

    result = sample_stabilizers(
        bell_phi_plus(),
        shots=1000,
        rng=rng,
    )

    assert set(result.keys()) == {
        "XX",
        "YY",
        "ZZ",
    }

    assert result["XX"]["expectation"] > 0.9
    assert result["ZZ"]["expectation"] > 0.9
    assert result["YY"]["expectation"] < -0.9