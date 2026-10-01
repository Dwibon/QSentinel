import numpy as np

from src.noise import depolarizing_channel
from src.states import get_state, projective_measure


def test_noiseless_channel():

    rng = np.random.default_rng(42)

    state = get_state("Z", 1)

    output = depolarizing_channel(
        state,
        p=0.0,
        rng=rng
    )

    assert np.allclose(output, state)


def test_full_depolarizing_channel():

    rng = np.random.default_rng(42)

    state = get_state("Z", 1)

    errors = 0
    samples = 10000

    for _ in range(samples):

        output = depolarizing_channel(
            state,
            p=1.0,
            rng=rng
        )

        result = projective_measure(
            output,
            "Z",
            rng
        )

        if result != 1:
            errors += 1

    error_rate = errors / samples

    assert 0.63 < error_rate < 0.70