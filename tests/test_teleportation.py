import numpy as np

from src.states import STATES
from src.teleportation import teleport


def fidelity(state_a, state_b):
    return abs(np.vdot(state_a, state_b)) ** 2


def test_teleport_z_plus():
    rng = np.random.default_rng(1)
    original = STATES[("Z", 1)]

    teleported, _, _ = teleport(original, rng)

    assert np.isclose(
        fidelity(original, teleported),
        1.0,
        atol=1e-10,
    )


def test_teleport_z_minus():
    rng = np.random.default_rng(2)
    original = STATES[("Z", -1)]

    teleported, _, _ = teleport(original, rng)

    assert np.isclose(
        fidelity(original, teleported),
        1.0,
        atol=1e-10,
    )


def test_teleport_x_plus():
    rng = np.random.default_rng(3)
    original = STATES[("X", 1)]

    teleported, _, _ = teleport(original, rng)

    assert np.isclose(
        fidelity(original, teleported),
        1.0,
        atol=1e-10,
    )


def test_teleport_x_minus():
    rng = np.random.default_rng(4)
    original = STATES[("X", -1)]

    teleported, _, _ = teleport(original, rng)

    assert np.isclose(
        fidelity(original, teleported),
        1.0,
        atol=1e-10,
    )


def test_teleport_y_plus():
    rng = np.random.default_rng(5)
    original = STATES[("Y", 1)]

    teleported, _, _ = teleport(original, rng)

    assert np.isclose(
        fidelity(original, teleported),
        1.0,
        atol=1e-10,
    )


def test_teleport_y_minus():
    rng = np.random.default_rng(6)
    original = STATES[("Y", -1)]

    teleported, _, _ = teleport(original, rng)

    assert np.isclose(
        fidelity(original, teleported),
        1.0,
        atol=1e-10,
    )


def test_teleport_arbitrary_states():
    rng = np.random.default_rng(123)

    for _ in range(20):
        state = (
            rng.normal(size=2)
            + 1j * rng.normal(size=2)
        )

        state /= np.linalg.norm(state)

        teleported, _, _ = teleport(
            state,
            rng,
        )

        assert np.isclose(
            fidelity(state, teleported),
            1.0,
            atol=1e-10,
        )