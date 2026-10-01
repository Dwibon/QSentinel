import hashlib
import hmac
import secrets


class SessionManager:
    def __init__(self):
        self.used_nonces = set()

    def generate_nonce(self):
        return secrets.token_hex(16)

    def validate_nonce(self, nonce):
        if nonce in self.used_nonces:
            return False

        self.used_nonces.add(nonce)
        return True


def create_session_id(
    nonce,
    message_id,
):
    data = f"{nonce}:{message_id}".encode()

    return hashlib.sha256(data).hexdigest()


def authenticate_verifier(
    verifier_id,
    registered_id,
):
    return hmac.compare_digest(
        str(verifier_id),
        str(registered_id),
    )


def validate_bell_outcomes(
    outcomes,
    expected_length,
):
    if len(outcomes) != expected_length:
        return False

    for outcome in outcomes:
        if not isinstance(outcome, tuple):
            return False

        if len(outcome) != 2:
            return False

        m1, m2 = outcome

        if m1 not in (0, 1):
            return False

        if m2 not in (0, 1):
            return False

    return True


def protocol_check(
    nonce_valid,
    verifier_authenticated,
    bell_valid,
):
    if not verifier_authenticated:
        return "UNAUTHORIZED"

    if not nonce_valid:
        return "REPLAY"

    if not bell_valid:
        return "PROTOCOL_ANOMALY"

    return "VALID"