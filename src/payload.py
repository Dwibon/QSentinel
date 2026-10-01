import numpy as np

from src.sentinels import create_sentinel_state


def generate_payload(
    n_qubits,
    schedule,
    rng=None
):
    if rng is None:
        rng = np.random.default_rng()

    states = []

    for position in range(n_qubits):

        if position in schedule:

            sentinel = schedule[position]

            state = create_sentinel_state(
                sentinel["axis"],
                sentinel["sign"]
            )

        else:

            # Placeholder payload state.
            # The actual teleportation payload
            # will replace this later.
            state = np.array(
                [1, 0],
                dtype=complex
            )

        states.append(state)

    return states