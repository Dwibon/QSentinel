import numpy as np

from src.states import get_state, projective_measure


def test_state_normalization():
    for state in [
        get_state("X", 1),
        get_state("X", -1),
        get_state("Y", 1),
        get_state("Y", -1),
        get_state("Z", 1),
        get_state("Z", -1),
    ]:
        assert np.isclose(np.linalg.norm(state), 1.0)


def test_eigenstate_measurement():
    rng = np.random.default_rng(42)

    for axis in ["X", "Y", "Z"]:
        for sign in [1, -1]:
            state = get_state(axis, sign)

            results = [
                projective_measure(state, axis, rng)
                for _ in range(1000)
            ]

            assert np.mean(np.array(results) == sign) > 0.99