import numpy as np

from src.states import get_state
from src.teleportation_pipeline import (
    teleport_with_channel,
)
from src.sentinel_measurement import (
    measure_sentinels,
)
from src.sentinels import (
    generate_sentinel_schedule,
)
from src.twirl import (
    derive_pauli_schedule,
    apply_pauli,
)
from src.detector import (
    evaluate_axis,
    make_decision,
    classify_fingerprint,
)
from src.protocol import (
    SessionManager,
    create_session_id,
    authenticate_verifier,
    validate_bell_outcomes,
    protocol_check,
)


def generate_sentinel_states(
    n_qubits,
    schedule,
):
    states = []

    for position in range(n_qubits):
        if position in schedule:
            sentinel = schedule[position]

            state = get_state(
                sentinel["axis"],
                sentinel["sign"],
            )
        else:
            state = get_state(
                "Z",
                1,
            )

        states.append(state)

    return states


def apply_secret_pauli_layer(
    states,
    key,
):
    schedule = derive_pauli_schedule(
        len(states),
        key,
    )

    protected_states = [
        apply_pauli(
            state,
            pauli,
        )
        for state, pauli in zip(
            states,
            schedule,
        )
    ]

    return protected_states, schedule


def run_qsentinel(
    n_qubits,
    sentinel_fraction,
    key,
    attack="none",
    attack_strength=1.0,
    noise_p=0.0,
    baseline=None,
    alpha=0.01,
    nonce=None,
    message_id="message-1",
    verifier_id="verifier-A",
    registered_verifier_id="verifier-A",
    session_manager=None,
    rng=None,
):
    if rng is None:
        rng = np.random.default_rng()

    if session_manager is None:
        session_manager = SessionManager()

    # -------------------------------------------------
    # 1. Session / protocol setup
    # -------------------------------------------------

    if nonce is None:
        nonce = session_manager.generate_nonce()

    nonce_valid = session_manager.validate_nonce(
        nonce
    )

    session_id = create_session_id(
        nonce,
        message_id,
    )

    verifier_authenticated = (
        authenticate_verifier(
            verifier_id,
            registered_verifier_id,
        )
    )

    # -------------------------------------------------
    # 2. Secret sentinel schedule
    # -------------------------------------------------

    sentinel_schedule = (
        generate_sentinel_schedule(
            n_qubits,
            sentinel_fraction,
            rng,
        )
    )

    states = generate_sentinel_states(
        n_qubits,
        sentinel_schedule,
    )

    # -------------------------------------------------
    # 3. Secret Pauli layer
    # -------------------------------------------------

    protected_states, pauli_schedule = (
        apply_secret_pauli_layer(
            states,
            key,
        )
    )

    # -------------------------------------------------
    # 4. Teleportation + attack + noise
    # -------------------------------------------------

    received_states = []
    bell_outcomes = []

    for state, pauli in zip(
        protected_states,
        pauli_schedule,
    ):
        received, m1, m2 = (
            teleport_with_channel(
                state,
                attack=attack,
                attack_strength=attack_strength,
                noise_p=noise_p,
                rng=rng,
            )
        )

        # Authorized verifier removes
        # the secret Pauli layer.
        decoded = apply_pauli(
            received,
            pauli,
        )

        received_states.append(
            decoded
        )

        bell_outcomes.append(
            (m1, m2)
        )

    # -------------------------------------------------
    # 5. Sentinel fingerprint
    # -------------------------------------------------

    fingerprint, errors, totals = (
        measure_sentinels(
            received_states,
            sentinel_schedule,
            rng,
        )
    )

    # -------------------------------------------------
    # 6. Statistical detector
    # -------------------------------------------------

    axis_results = {}

    if baseline is not None:
        for axis in ["X", "Y", "Z"]:
            axis_results[axis] = (
                evaluate_axis(
                    errors[axis],
                    totals[axis],
                    baseline[axis],
                    alpha,
                )
            )

        quantum_decision = make_decision(
            axis_results
        )
    else:
        quantum_decision = None

    classification = classify_fingerprint(
        fingerprint
    )

    # -------------------------------------------------
    # 7. Protocol checks
    # -------------------------------------------------

    bell_valid = validate_bell_outcomes(
        bell_outcomes,
        n_qubits,
    )

    protocol_decision = protocol_check(
        nonce_valid=nonce_valid,
        verifier_authenticated=(
            verifier_authenticated
        ),
        bell_valid=bell_valid,
    )

    # -------------------------------------------------
    # 8. Unified decision
    # -------------------------------------------------

    if protocol_decision != "VALID":
        final_decision = protocol_decision

    elif quantum_decision == "REJECT":
        final_decision = "QUANTUM_REJECT"

    elif quantum_decision == "INCONCLUSIVE":
        final_decision = "INCONCLUSIVE"

    elif quantum_decision == "ACCEPT":
        final_decision = "ACCEPT"

    else:
        final_decision = "INCONCLUSIVE"

    return {
        "session_id": session_id,
        "fingerprint": fingerprint,
        "errors": errors,
        "totals": totals,
        "axis_results": axis_results,
        "quantum_decision": quantum_decision,
        "classification": classification,
        "protocol_decision": protocol_decision,
        "final_decision": final_decision,
        "nonce_valid": nonce_valid,
        "verifier_authenticated": (
            verifier_authenticated
        ),
        "bell_valid": bell_valid,
        "bell_outcomes": bell_outcomes,
        "sentinel_schedule": sentinel_schedule,
        "pauli_schedule": pauli_schedule,
        "attack": attack,
        "attack_strength": attack_strength,
        "noise_p": noise_p,
    }