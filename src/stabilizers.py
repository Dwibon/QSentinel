import numpy as np

from src.states import I, X, Y, Z


STABILIZERS = {
    "XX": np.kron(X, X),
    "YY": np.kron(Y, Y),
    "ZZ": np.kron(Z, Z),
}


def expectation_value(state, operator):
    """
    Calculate <psi|O|psi> for a normalized state.
    """
    return float(
        np.real(
            np.vdot(state, operator @ state)
        )
    )


def bell_stabilizers(state):
    """
    Return the XX, YY and ZZ expectation values
    for a two-qubit state.
    """
    if len(state) != 4:
        raise ValueError(
            "Bell-state input must contain two qubits."
        )

    return {
        name: expectation_value(
            state,
            operator,
        )
        for name, operator in STABILIZERS.items()
    }


def stabilizer_error_rates(state):
    """
    Convert stabilizer expectation values into
    disagreement probabilities.

    For eigenvalue +1:
        error = (1 - <S>) / 2
    """
    values = bell_stabilizers(state)

    return {
        name: (1.0 - value) / 2.0
        for name, value in values.items()
    }


def measure_stabilizer(
    state,
    stabilizer,
    rng=None,
):
    """
    Sample a single measurement of a stabilizer.

    Returns +1 or -1.
    """
    if stabilizer not in STABILIZERS:
        raise ValueError(
            f"Unknown stabilizer: {stabilizer}"
        )

    if rng is None:
        rng = np.random.default_rng()

    expectation = expectation_value(
        state,
        STABILIZERS[stabilizer],
    )

    probability_plus = (
        1.0 + expectation
    ) / 2.0

    return (
        1
        if rng.random() < probability_plus
        else -1
    )


def sample_stabilizers(
    state,
    shots=1000,
    rng=None,
):
    """
    Estimate stabilizer expectation values
    from repeated measurements.
    """
    if shots <= 0:
        raise ValueError(
            "shots must be positive."
        )

    if rng is None:
        rng = np.random.default_rng()

    results = {}

    for name in STABILIZERS:
        outcomes = [
            measure_stabilizer(
                state,
                name,
                rng,
            )
            for _ in range(shots)
        ]

        results[name] = {
            "expectation": float(
                np.mean(outcomes)
            ),
            "error_rate": float(
                np.mean(
                    np.array(outcomes) == -1
                )
            ),
        }

    return results