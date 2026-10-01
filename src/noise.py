import numpy as np

from src.states import I, X, Y, Z


def depolarizing_channel(state, p, rng=None):

    if rng is None:
        rng = np.random.default_rng()

    if not 0 <= p <= 1:
        raise ValueError("p must be between 0 and 1.")

    r = rng.random()

    if r >= p:
        return state

    pauli = rng.choice(["X", "Y", "Z"])

    if pauli == "X":
        return X @ state

    if pauli == "Y":
        return Y @ state

    return Z @ state