import numpy as np

from src.states import STATES
from src.twirl import (
    apply_pauli,
    random_pauli,
    apply_random_pauli,
    derive_pauli_schedule,
    apply_pauli_schedule,
)


def fidelity(state_a, state_b):
    return abs(
        np.vdot(state_a, state_b)
    ) ** 2


def test_identity_pauli():
    state = STATES[("Z", 1)]

    result = apply_pauli(
        state,
        "I",
    )

    assert np.isclose(
        fidelity(state, result),
        1.0,
    )


def test_x_pauli():
    state = STATES[("Z", 1)]

    result = apply_pauli(
        state,
        "X",
    )

    expected = STATES[("Z", -1)]

    assert np.isclose(
        fidelity(result, expected),
        1.0,
    )


def test_y_pauli():
    state = STATES[("Z", 1)]

    result = apply_pauli(
        state,
        "Y",
    )

    expected = STATES[("Z", -1)]

    assert np.isclose(
        fidelity(result, expected),
        1.0,
    )


def test_z_pauli():
    state = STATES[("X", 1)]

    result = apply_pauli(
        state,
        "Z",
    )

    expected = STATES[("X", -1)]

    assert np.isclose(
        fidelity(result, expected),
        1.0,
    )


def test_random_pauli_is_valid():
    rng = np.random.default_rng(42)

    for _ in range(100):
        pauli = random_pauli(rng)

        assert pauli in {
            "I",
            "X",
            "Y",
            "Z",
        }


def test_random_pauli_application():
    rng = np.random.default_rng(42)

    state = STATES[("Z", 1)]

    result, pauli = apply_random_pauli(
        state,
        rng,
    )

    assert pauli in {
        "I",
        "X",
        "Y",
        "Z",
    }

    assert np.isclose(
        np.linalg.norm(result),
        1.0,
    )


def test_schedule_reproducibility():
    schedule_a = derive_pauli_schedule(
        n=100,
        key=12345,
    )

    schedule_b = derive_pauli_schedule(
        n=100,
        key=12345,
    )

    assert schedule_a == schedule_b


def test_different_keys_produce_different_schedule():
    schedule_a = derive_pauli_schedule(
        n=100,
        key=12345,
    )

    schedule_b = derive_pauli_schedule(
        n=100,
        key=54321,
    )

    assert schedule_a != schedule_b


def test_apply_schedule():
    states = [
        STATES[("Z", 1)],
        STATES[("X", 1)],
        STATES[("Y", 1)],
    ]

    schedule = [
        "I",
        "Z",
        "X",
    ]

    results = apply_pauli_schedule(
        states,
        schedule,
    )

    assert len(results) == 3

    for state in results:
        assert np.isclose(
            np.linalg.norm(state),
            1.0,
        )

def test_pauli_round_trip():
    state = STATES[("Y", 1)]

    for pauli in ["I", "X", "Y", "Z"]:
        protected = apply_pauli(
            state,
            pauli,
        )

        recovered = apply_pauli(
            protected,
            pauli,
        )

        assert np.isclose(
            fidelity(state, recovered),
            1.0,
        )