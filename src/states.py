import numpy as np

I = np.array([
    [1, 0],
    [0, 1]
], dtype=complex)

X = np.array([
    [0, 1],
    [1, 0]
], dtype=complex)

Y = np.array([
    [0, -1j],
    [1j, 0]
], dtype=complex)

Z = np.array([
    [1, 0],
    [0, -1]
], dtype=complex)


def normalize(state):
    return state / np.linalg.norm(state)


STATES = {
    ("Z", 1): np.array([1, 0], dtype=complex),
    ("Z", -1): np.array([0, 1], dtype=complex),

    ("X", 1): normalize(np.array([1, 1], dtype=complex)),
    ("X", -1): normalize(np.array([1, -1], dtype=complex)),

    ("Y", 1): normalize(np.array([1, 1j], dtype=complex)),
    ("Y", -1): normalize(np.array([1, -1j], dtype=complex)),
}


AXIS_OPERATORS = {
    "X": X,
    "Y": Y,
    "Z": Z
}


def get_state(axis, sign):
    return STATES[(axis, sign)]


def projective_measure(state, axis, rng=None):
    if rng is None:
        rng = np.random.default_rng()

    operator = AXIS_OPERATORS[axis]

    expectation = np.real(
        np.vdot(state, operator @ state)
    )

    probability_plus = (1 + expectation) / 2

    result = 1 if rng.random() < probability_plus else -1

    return result