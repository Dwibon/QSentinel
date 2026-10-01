import hashlib

import numpy as np

from src.attacks import apply_partial_attack
from src.detector import (
    evaluate_axis,
    make_decision,
)
from src.noise import depolarizing_channel
from src.protocol import (
    SessionManager,
    authenticate_verifier,
    create_session_id,
    validate_bell_outcomes,
)
from src.sentinel_measurement import measure_sentinels
from src.sentinels import derive_sentinel_schedule
from src.states import get_state
from src.teleportation import teleport
from src.twirl import (
    apply_pauli,
    decode_pauli,
    derive_pauli_schedule,
)


def message_digest(message):
    return hashlib.sha256(
        message.encode("utf-8")
    ).hexdigest()


def digest_bits(message):
    digest = hashlib.sha256(
        message.encode("utf-8")
    ).digest()

    bits = []

    for byte in digest:
        for i in range(8):
            bits.append(
                (byte >> (7 - i)) & 1
            )

    return bits


def message_states(
    message,
    n_qubits,
):
    if n_qubits <= 0:
        raise ValueError(
            "n_qubits must be positive."
        )

    bits = digest_bits(message)

    states = []

    for i in range(n_qubits):
        bit = bits[i % len(bits)]

        sign = 1 if bit == 0 else -1

        states.append(
            get_state(
                "Z",
                sign,
            )
        )

    return states


def generate_signature(
    message,
    n_qubits,
    sentinel_fraction,
    key,
    nonce,
    message_id,
    rng=None,
):
    if rng is None:
        rng = np.random.default_rng()

    # Create the session identifier first so that the
    # sentinel schedule is bound to this session.
    session_id = create_session_id(
        nonce,
        message_id,
    )

    states = message_states(
        message,
        n_qubits,
    )

    # Secret, deterministic, session-specific sentinel schedule.
    sentinel_schedule = (
        derive_sentinel_schedule(
            n_qubits=n_qubits,
            sentinel_fraction=sentinel_fraction,
            key=key,
            session_id=session_id,
        )
    )

    for position, sentinel in (
        sentinel_schedule.items()
    ):
        states[position] = get_state(
            sentinel["axis"],
            sentinel["sign"],
        )

    pauli_schedule = derive_pauli_schedule(
        n_qubits,
        key,
    )

    protected_states = [
        apply_pauli(
            state,
            pauli,
        )
        for state, pauli in zip(
            states,
            pauli_schedule,
        )
    ]

    return {
        "version": "QSentinel-QDS-1.0",
        "digest": message_digest(message),
        "message_id": message_id,
        "session_id": session_id,
        "nonce": nonce,
        "n_qubits": n_qubits,
        "sentinel_fraction": sentinel_fraction,
        "protected_states": protected_states,
    }


def verify_signature(
    signature,
    message,
    key,
    baseline,
    attack="none",
    attack_strength=1.0,
    noise_p=0.0,
    alpha=0.01,
    verifier_id="verifier",
    registered_verifier_id="verifier",
    session_manager=None,
    rng=None,
):
    if rng is None:
        rng = np.random.default_rng()

    if session_manager is None:
        session_manager = SessionManager()

    expected_digest = message_digest(
        message
    )

    if signature.get("digest") != expected_digest:
        return {
            "final_decision": "MESSAGE_MISMATCH",
            "quantum_decision": "NOT_EVALUATED",
            "protocol_decision": "MESSAGE_MISMATCH",
        }

    nonce = signature.get("nonce")

    nonce_valid = session_manager.validate_nonce(
        nonce
    )

    if not nonce_valid:
        return {
            "final_decision": "REPLAY",
            "quantum_decision": "NOT_EVALUATED",
            "protocol_decision": "REPLAY",
        }

    verifier_authenticated = (
        authenticate_verifier(
            verifier_id,
            registered_verifier_id,
        )
    )

    if not verifier_authenticated:
        return {
            "final_decision": "UNAUTHORIZED",
            "quantum_decision": "NOT_EVALUATED",
            "protocol_decision": "UNAUTHORIZED",
        }

    n_qubits = signature["n_qubits"]

    sentinel_fraction = (
        signature["sentinel_fraction"]
    )

    # Reconstruct the exact sentinel schedule using
    # both the shared secret key and the session identifier.
    sentinel_schedule = (
        derive_sentinel_schedule(
            n_qubits=n_qubits,
            sentinel_fraction=sentinel_fraction,
            key=key,
            session_id=signature["session_id"],
        )
    )

    pauli_schedule = derive_pauli_schedule(
        n_qubits,
        key,
    )

    received_states = []
    bell_outcomes = []

    for i, protected_state in enumerate(
        signature["protected_states"]
    ):
        teleported_state, m1, m2 = teleport(
            protected_state,
            rng,
        )

        attacked_state = apply_partial_attack(
            teleported_state,
            attack,
            attack_strength,
            rng,
        )

        received_state = depolarizing_channel(
            attacked_state,
            noise_p,
            rng,
        )

        decoded_state = decode_pauli(
            received_state,
            pauli_schedule[i],
        )

        received_states.append(
            decoded_state
        )

        bell_outcomes.append(
            (m1, m2)
        )

    bell_valid = validate_bell_outcomes(
        bell_outcomes,
        n_qubits,
    )

    if not bell_valid:
        return {
            "final_decision": "PROTOCOL_ANOMALY",
            "quantum_decision": "NOT_EVALUATED",
            "protocol_decision": "PROTOCOL_ANOMALY",
            "bell_valid": False,
        }

    fingerprint, errors, totals = (
        measure_sentinels(
            received_states,
            sentinel_schedule,
            rng,
        )
    )

    axis_results = {}

    for axis in ["X", "Y", "Z"]:
        axis_results[axis] = evaluate_axis(
            errors[axis],
            totals[axis],
            baseline[axis],
            alpha,
        )

    quantum_decision = make_decision(
        axis_results
    )

    if quantum_decision == "REJECT":
        final_decision = "REJECT"

    elif quantum_decision == "INCONCLUSIVE":
        final_decision = "INCONCLUSIVE"

    else:
        final_decision = "VALID"

    return {
        "final_decision": final_decision,
        "quantum_decision": quantum_decision,
        "protocol_decision": "VALID",
        "fingerprint": fingerprint,
        "errors": errors,
        "totals": totals,
        "axis_results": axis_results,
        "bell_valid": bell_valid,
        "rejected_axes": [
            axis
            for axis, result in axis_results.items()
            if result["reject"]
        ],
        "sentinel_schedule": sentinel_schedule,
        "n_qubits": n_qubits,
        "sentinel_fraction": sentinel_fraction,
        "attack": attack,
        "attack_strength": attack_strength,
        "noise_p": noise_p,
    }