import numpy as np

from src.teleportation import teleport
from src.attacks import apply_partial_attack
from src.noise import depolarizing_channel
from src.states import projective_measure, get_state


def teleport_with_channel(
    message_state,
    attack="none",
    attack_strength=1.0,
    noise_p=0.0,
    rng=None,
):
    if rng is None:
        rng = np.random.default_rng()

    if not 0.0 <= attack_strength <= 1.0:
        raise ValueError(
            "attack_strength must be between 0 and 1."
        )

    teleported_state, m1, m2 = teleport(
        message_state,
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

    return received_state, m1, m2


def measure_received_state(
    received_state,
    axis,
    rng=None,
):
    return projective_measure(
        received_state,
        axis,
        rng,
    )


def sentinel_trial(
    axis,
    sign,
    attack="none",
    attack_strength=1.0,
    noise_p=0.0,
    rng=None,
):
    if rng is None:
        rng = np.random.default_rng()

    sentinel_state = get_state(
        axis,
        sign,
    )

    received_state, m1, m2 = (
        teleport_with_channel(
            sentinel_state,
            attack=attack,
            attack_strength=attack_strength,
            noise_p=noise_p,
            rng=rng,
        )
    )

    measured_sign = measure_received_state(
        received_state,
        axis,
        rng,
    )

    error = measured_sign != sign

    return {
        "expected_sign": sign,
        "measured_sign": measured_sign,
        "error": error,
        "m1": m1,
        "m2": m2,
        "received_state": received_state,
    }