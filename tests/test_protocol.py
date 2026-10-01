from src.protocol import (
    SessionManager,
    create_session_id,
    authenticate_verifier,
    validate_bell_outcomes,
    protocol_check,
)


def test_nonce_is_fresh_once():
    manager = SessionManager()

    nonce = manager.generate_nonce()

    assert manager.validate_nonce(nonce)
    assert not manager.validate_nonce(nonce)


def test_different_nonces_are_fresh():
    manager = SessionManager()

    nonce_a = manager.generate_nonce()
    nonce_b = manager.generate_nonce()

    assert nonce_a != nonce_b

    assert manager.validate_nonce(nonce_a)
    assert manager.validate_nonce(nonce_b)


def test_session_id_is_deterministic():
    nonce = "abc123"

    a = create_session_id(
        nonce,
        "message-1",
    )

    b = create_session_id(
        nonce,
        "message-1",
    )

    assert a == b


def test_different_messages_have_different_ids():
    nonce = "abc123"

    a = create_session_id(
        nonce,
        "message-1",
    )

    b = create_session_id(
        nonce,
        "message-2",
    )

    assert a != b


def test_verifier_authentication():
    assert authenticate_verifier(
        "verifier-A",
        "verifier-A",
    )

    assert not authenticate_verifier(
        "verifier-A",
        "verifier-B",
    )


def test_valid_bell_outcomes():
    outcomes = [
        (0, 0),
        (0, 1),
        (1, 0),
        (1, 1),
    ]

    assert validate_bell_outcomes(
        outcomes,
        4,
    )


def test_invalid_bell_outcomes():
    outcomes = [
        (0, 0),
        (0, 1),
        (2, 0),
    ]

    assert not validate_bell_outcomes(
        outcomes,
        3,
    )


def test_protocol_valid():
    result = protocol_check(
        nonce_valid=True,
        verifier_authenticated=True,
        bell_valid=True,
    )

    assert result == "VALID"


def test_protocol_replay():
    result = protocol_check(
        nonce_valid=False,
        verifier_authenticated=True,
        bell_valid=True,
    )

    assert result == "REPLAY"


def test_protocol_unauthorized():
    result = protocol_check(
        nonce_valid=True,
        verifier_authenticated=False,
        bell_valid=True,
    )

    assert result == "UNAUTHORIZED"


def test_protocol_anomaly():
    result = protocol_check(
        nonce_valid=True,
        verifier_authenticated=True,
        bell_valid=False,
    )

    assert result == "PROTOCOL_ANOMALY"