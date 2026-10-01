import hashlib
import hmac

import numpy as np

from src.states import get_state


AXES = ["X", "Y", "Z"]


def _key_bytes(key):
    if isinstance(key, bytes):
        return key

    if isinstance(key, int):
        return str(key).encode("utf-8")

    return str(key).encode("utf-8")


def _derive_seed(key, session_id):
    """
    Derive a deterministic, session-specific seed from
    secret key material and the session identifier.

    HMAC-SHA256 is used for key-dependent derivation.
    The resulting digest seeds the prototype's local RNG.
    """

    if session_id is None:
        session_id = "default-session"

    message = (
        "QSentinel-Sentinel-Schedule-v2:"
        + str(session_id)
    ).encode("utf-8")

    digest = hmac.new(
        _key_bytes(key),
        message,
        hashlib.sha256,
    ).digest()

    return int.from_bytes(
        digest[:8],
        byteorder="big",
    )


def generate_sentinel_schedule(
    n_qubits,
    sentinel_fraction,
    rng=None,
):
    if rng is None:
        rng = np.random.default_rng()

    if not 0 < sentinel_fraction <= 1:
        raise ValueError(
            "sentinel_fraction must be between 0 and 1."
        )

    m = int(round(
        n_qubits * sentinel_fraction
    ))

    if m <= 0:
        raise ValueError(
            "Sentinel count must be positive."
        )

    positions = rng.choice(
        n_qubits,
        size=m,
        replace=False,
    )

    schedule = {}

    for position in positions:
        axis = rng.choice(AXES)
        sign = rng.choice([1, -1])

        schedule[int(position)] = {
            "axis": axis,
            "sign": int(sign),
        }

    return schedule


def derive_sentinel_schedule(
    n_qubits,
    sentinel_fraction,
    key,
    session_id=None,
):
    """
    Deterministically derive a session-specific sentinel
    schedule from secret key material.

    The schedule is derived using:

        HMAC-SHA256(key, session_id || context)

    This is a prototype stand-in for QKD-derived secret
    key material and ensures that different session IDs
    produce different sentinel schedules.
    """

    if n_qubits <= 0:
        raise ValueError(
            "n_qubits must be positive."
        )

    if not 0 < sentinel_fraction <= 1:
        raise ValueError(
            "sentinel_fraction must be between 0 and 1."
        )

    seed = _derive_seed(
        key,
        session_id,
    )

    rng = np.random.default_rng(seed)

    m = int(round(
        n_qubits * sentinel_fraction
    ))

    if m <= 0:
        raise ValueError(
            "Sentinel count must be positive."
        )

    positions = rng.choice(
        n_qubits,
        size=m,
        replace=False,
    )

    schedule = {}

    for position in positions:
        axis = rng.choice(AXES)
        sign = rng.choice([1, -1])

        schedule[int(position)] = {
            "axis": axis,
            "sign": int(sign),
        }

    return schedule


def create_sentinel_state(
    axis,
    sign,
):
    return get_state(
        axis,
        sign,
    )