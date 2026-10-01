import numpy as np

from src.states import I, X, Z


H = (1 / np.sqrt(2)) * np.array([
    [1, 1],
    [1, -1],
], dtype=complex)


def kron(*matrices):
    result = matrices[0]

    for matrix in matrices[1:]:
        result = np.kron(result, matrix)

    return result


def bell_pair():
    """
    Create |Phi+> = (|00> + |11>) / sqrt(2).
    """

    zero = np.array([1, 0], dtype=complex)

    state = kron(zero, zero)

    state = kron(H, I) @ state

    state = apply_cnot(
        state,
        control=0,
        target=1,
        n_qubits=2,
    )

    return state


def prepare_teleportation_state(message_state):
    """
    Prepare:

        |psi> tensor |Phi+>
    """

    return kron(
        message_state,
        bell_pair(),
    )


def apply_cnot(
    state,
    control,
    target,
    n_qubits,
):
    """
    Apply CNOT to an n-qubit state.
    """

    output = np.zeros_like(state)

    for index, amplitude in enumerate(state):

        bits = list(
            format(index, f"0{n_qubits}b")
        )

        if bits[control] == "1":
            bits[target] = (
                "1"
                if bits[target] == "0"
                else "0"
            )

        new_index = int(
            "".join(bits),
            2,
        )

        output[new_index] += amplitude

    return output


def apply_single_qubit_gate(
    state,
    gate,
    qubit,
    n_qubits,
):
    """
    Apply a single-qubit gate to an n-qubit state.
    """

    operators = []

    for q in range(n_qubits):
        operators.append(
            gate if q == qubit else I
        )

    return kron(*operators) @ state


def measure_qubit(
    state,
    qubit,
    n_qubits,
    rng=None,
):
    """
    Projectively measure one qubit.
    """

    if rng is None:
        rng = np.random.default_rng()

    probabilities = np.zeros(2)

    for index, amplitude in enumerate(state):

        bits = format(
            index,
            f"0{n_qubits}b",
        )

        bit = int(bits[qubit])

        probabilities[bit] += abs(amplitude) ** 2

    outcome = (
        0
        if rng.random() < probabilities[0]
        else 1
    )

    projected = state.copy()

    for index in range(len(projected)):

        bits = format(
            index,
            f"0{n_qubits}b",
        )

        if int(bits[qubit]) != outcome:
            projected[index] = 0

    probability = probabilities[outcome]

    if probability > 0:
        projected /= np.sqrt(probability)

    return outcome, projected


def bell_measurement(
    state,
    rng=None,
):
    """
    Bell measurement on Alice's two qubits.

    Qubit ordering:

        0 = message
        1 = Alice's Bell qubit
        2 = Bob's Bell qubit

    Returns:

        m1, m2, post-measurement state
    """

    if rng is None:
        rng = np.random.default_rng()

    state = apply_cnot(
        state,
        control=0,
        target=1,
        n_qubits=3,
    )

    state = apply_single_qubit_gate(
        state,
        H,
        qubit=0,
        n_qubits=3,
    )

    m1, state = measure_qubit(
        state,
        qubit=0,
        n_qubits=3,
        rng=rng,
    )

    m2, state = measure_qubit(
        state,
        qubit=1,
        n_qubits=3,
        rng=rng,
    )

    return m1, m2, state


def extract_bob_state(
    state,
    m1,
    m2,
):
    """
    Extract Bob's qubit conditioned on Alice's
    actual Bell-measurement outcomes.
    """

    amplitudes = np.zeros(
        2,
        dtype=complex,
    )

    for index, amplitude in enumerate(state):

        bits = format(index, "03b")

        if (
            int(bits[0]) == m1
            and int(bits[1]) == m2
        ):
            bob_bit = int(bits[2])

            amplitudes[bob_bit] += amplitude

    norm = np.linalg.norm(amplitudes)

    if norm == 0:
        raise ValueError(
            "Unable to extract Bob's state."
        )

    return amplitudes / norm


def apply_correction(
    bob_state,
    m1,
    m2,
):
    """
    Bob applies:

        X^m2 Z^m1
    """

    corrected = bob_state

    if m2 == 1:
        corrected = X @ corrected

    if m1 == 1:
        corrected = Z @ corrected

    return corrected


def teleport(
    message_state,
    rng=None,
):
    """
    Complete quantum teleportation.

    Returns:

        teleported_state, m1, m2
    """

    if rng is None:
        rng = np.random.default_rng()

    state = prepare_teleportation_state(
        message_state
    )

    m1, m2, state = bell_measurement(
        state,
        rng,
    )

    bob_state = extract_bob_state(
        state,
        m1,
        m2,
    )

    bob_state = apply_correction(
        bob_state,
        m1,
        m2,
    )

    return bob_state, m1, m2