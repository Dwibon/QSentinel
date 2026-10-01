import numpy as np

from src.qds import (
    digest_bits,
    generate_signature,
    message_digest,
    message_states,
    verify_signature,
)
from src.protocol import SessionManager
from src.sentinels import derive_sentinel_schedule


def test_message_digest_is_deterministic():
    message = "Hello Quantum World"

    assert (
        message_digest(message)
        == message_digest(message)
    )


def test_digest_bits_length():
    bits = digest_bits("Hello")

    assert len(bits) == 256

    assert all(
        bit in (0, 1)
        for bit in bits
    )


def test_message_states_have_correct_length():
    states = message_states(
        "Hello",
        100,
    )

    assert len(states) == 100

    for state in states:
        assert state.shape == (2,)


def test_generate_signature():
    signature = generate_signature(
        message="Hello",
        n_qubits=100,
        sentinel_fraction=0.2,
        key=12345,
        nonce="nonce-1",
        message_id="message-1",
        rng=np.random.default_rng(1),
    )

    assert signature["version"] == (
        "QSentinel-QDS-1.0"
    )

    assert signature["n_qubits"] == 100

    assert signature["sentinel_fraction"] == 0.2

    assert len(
        signature["protected_states"]
    ) == 100

    assert signature["digest"] == (
        message_digest("Hello")
    )


def test_signer_and_verifier_share_sentinel_schedule():
    key = 12345

    signer_schedule = (
        derive_sentinel_schedule(
            n_qubits=1000,
            sentinel_fraction=0.2,
            key=key,
        )
    )

    verifier_schedule = (
        derive_sentinel_schedule(
            n_qubits=1000,
            sentinel_fraction=0.2,
            key=key,
        )
    )

    assert (
        signer_schedule
        == verifier_schedule
    )


def test_different_keys_produce_different_schedules():
    schedule_a = (
        derive_sentinel_schedule(
            n_qubits=1000,
            sentinel_fraction=0.2,
            key=12345,
        )
    )

    schedule_b = (
        derive_sentinel_schedule(
            n_qubits=1000,
            sentinel_fraction=0.2,
            key=54321,
        )
    )

    assert schedule_a != schedule_b


def test_honest_signature_verification():
    signature = generate_signature(
        message="Hello",
        n_qubits=300,
        sentinel_fraction=0.2,
        key=12345,
        nonce="nonce-honest",
        message_id="message-honest",
        rng=np.random.default_rng(42),
    )

    baseline = {
        "X": 0.0,
        "Y": 0.0,
        "Z": 0.0,
    }

    result = verify_signature(
        signature=signature,
        message="Hello",
        key=12345,
        baseline=baseline,
        attack="none",
        attack_strength=1.0,
        noise_p=0.0,
        alpha=0.01,
        verifier_id="verifier",
        registered_verifier_id="verifier",
        session_manager=SessionManager(),
        rng=np.random.default_rng(43),
    )

    assert result["final_decision"] == "VALID"

    assert result["quantum_decision"] == "ACCEPT"

    assert result["protocol_decision"] == "VALID"


def test_message_mismatch_is_rejected():
    signature = generate_signature(
        message="Hello",
        n_qubits=100,
        sentinel_fraction=0.2,
        key=12345,
        nonce="nonce-mismatch",
        message_id="message-mismatch",
        rng=np.random.default_rng(1),
    )

    result = verify_signature(
        signature=signature,
        message="Different message",
        key=12345,
        baseline={
            "X": 0.0,
            "Y": 0.0,
            "Z": 0.0,
        },
        session_manager=SessionManager(),
        rng=np.random.default_rng(2),
    )

    assert (
        result["final_decision"]
        == "MESSAGE_MISMATCH"
    )


def test_replay_is_rejected():
    signature = generate_signature(
        message="Hello",
        n_qubits=100,
        sentinel_fraction=0.2,
        key=12345,
        nonce="nonce-replay",
        message_id="message-replay",
        rng=np.random.default_rng(1),
    )

    session_manager = SessionManager()

    baseline = {
        "X": 0.0,
        "Y": 0.0,
        "Z": 0.0,
    }

    first = verify_signature(
        signature=signature,
        message="Hello",
        key=12345,
        baseline=baseline,
        session_manager=session_manager,
        rng=np.random.default_rng(2),
    )

    second = verify_signature(
        signature=signature,
        message="Hello",
        key=12345,
        baseline=baseline,
        session_manager=session_manager,
        rng=np.random.default_rng(3),
    )

    assert first["final_decision"] == "VALID"

    assert second["final_decision"] == "REPLAY"


def test_unauthorized_verifier_is_rejected():
    signature = generate_signature(
        message="Hello",
        n_qubits=100,
        sentinel_fraction=0.2,
        key=12345,
        nonce="nonce-auth",
        message_id="message-auth",
        rng=np.random.default_rng(1),
    )

    result = verify_signature(
        signature=signature,
        message="Hello",
        key=12345,
        baseline={
            "X": 0.0,
            "Y": 0.0,
            "Z": 0.0,
        },
        verifier_id="attacker",
        registered_verifier_id="verifier",
        session_manager=SessionManager(),
        rng=np.random.default_rng(2),
    )

    assert (
        result["final_decision"]
        == "UNAUTHORIZED"
    )


def test_wrong_key_does_not_share_sentinel_schedule():
    signature = generate_signature(
        message="Hello",
        n_qubits=300,
        sentinel_fraction=0.2,
        key=12345,
        nonce="nonce-wrong-key",
        message_id="message-wrong-key",
        rng=np.random.default_rng(1),
    )

    correct_schedule = (
        derive_sentinel_schedule(
            n_qubits=300,
            sentinel_fraction=0.2,
            key=12345,
        )
    )

    wrong_schedule = (
        derive_sentinel_schedule(
            n_qubits=300,
            sentinel_fraction=0.2,
            key=54321,
        )
    )

    assert (
        correct_schedule
        != wrong_schedule
    )

    assert len(
        signature["protected_states"]
    ) == 300