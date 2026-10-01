import numpy as np

from src.states import I, X, Y, Z


PAULIS = {
    "I": I,
    "X": X,
    "Y": Y,
    "Z": Z,
}


def apply_pauli(state, pauli):
    if pauli not in PAULIS:
        raise ValueError(
            f"Unknown Pauli: {pauli}"
        )

    return PAULIS[pauli] @ state


def random_pauli(rng=None):
    if rng is None:
        rng = np.random.default_rng()

    return rng.choice(
        ["I", "X", "Y", "Z"]
    )


def apply_random_pauli(
    state,
    rng=None,
):
    pauli = random_pauli(rng)

    return apply_pauli(
        state,
        pauli,
    ), pauli


def derive_pauli_schedule(
    n,
    key,
):
    """
    Derive a deterministic Pauli schedule from
    a secret integer key.

    This is a prototype stand-in for a QKD-derived
    secret key.
    """

    if n <= 0:
        raise ValueError(
            "n must be positive."
        )

    rng = np.random.default_rng(key)

    return [
        rng.choice(
            ["I", "X", "Y", "Z"]
        )
        for _ in range(n)
    ]


def apply_pauli_schedule(
    states,
    schedule,
):
    if len(states) != len(schedule):
        raise ValueError(
            "states and schedule must have "
            "the same length."
        )

    return [
        apply_pauli(state, pauli)
        for state, pauli
        in zip(states, schedule)
    ]

def decode_pauli(state, pauli):
    """
    Undo a Pauli layer.

    Pauli operators are Hermitian and self-inverse,
    so P† = P and P² = I.
    """
    return apply_pauli(state, pauli)