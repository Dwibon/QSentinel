import numpy as np

from src.states import I, X, Y, Z, get_state, AXIS_OPERATORS


PAULI_ATTACKS = {
    "none": I,
    "X": X,
    "Y": Y,
    "Z": Z,
}


def intercept_resend(state, rng=None):
    if rng is None:
        rng = np.random.default_rng()

    basis = rng.choice(["X", "Y", "Z"])
    operator = AXIS_OPERATORS[basis]

    expectation = np.real(
        np.vdot(state, operator @ state)
    )

    probability_plus = (1 + expectation) / 2

    sign = (
        1
        if rng.random() < probability_plus
        else -1
    )

    return get_state(basis, sign)


def z_measure_resend(state, rng=None):
    if rng is None:
        rng = np.random.default_rng()

    operator = AXIS_OPERATORS["Z"]

    expectation = np.real(
        np.vdot(state, operator @ state)
    )

    probability_plus = (1 + expectation) / 2

    sign = (
        1
        if rng.random() < probability_plus
        else -1
    )

    return get_state("Z", sign)


def apply_attack(state, attack, rng=None):
    if rng is None:
        rng = np.random.default_rng()

    if attack in PAULI_ATTACKS:
        return PAULI_ATTACKS[attack] @ state

    if attack == "intercept_resend":
        return intercept_resend(state, rng)

    if attack == "z_measure_resend":
        return z_measure_resend(state, rng)

    raise ValueError(
        f"Unknown attack: {attack}"
    )


def apply_partial_attack(
    state,
    attack,
    strength,
    rng=None,
):
    if rng is None:
        rng = np.random.default_rng()

    if not 0 <= strength <= 1:
        raise ValueError(
            "strength must be between 0 and 1."
        )

    if attack == "none":
        return state

    if rng.random() < strength:
        return apply_attack(
            state,
            attack,
            rng,
        )

    return state