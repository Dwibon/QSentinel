import numpy as np

from src.sentinels import generate_sentinel_schedule
from src.payload import generate_payload
from src.attacks import apply_partial_attack
from src.noise import depolarizing_channel
from src.sentinel_measurement import measure_sentinels
from src.detector import (
    estimate_baseline,
    evaluate_axis,
    make_decision,
)


ATTACKS = [
    "X",
    "Y",
    "Z",
    "intercept_resend",
    "z_measure_resend",
]

STRENGTHS = [
    0.01,
    0.02,
    0.05,
    0.10,
    0.20,
    0.50,
    1.00,
]

TRIALS = 30
N_QUBITS = 5000
SENTINEL_FRACTION = 0.20
NOISE_P = 0.03


def calibrate_baseline(
    sessions=20,
):
    total_errors = {
        "X": 0,
        "Y": 0,
        "Z": 0,
    }

    total_samples = {
        "X": 0,
        "Y": 0,
        "Z": 0,
    }

    for session in range(sessions):
        rng = np.random.default_rng(
            10000 + session
        )

        schedule = generate_sentinel_schedule(
            N_QUBITS,
            SENTINEL_FRACTION,
            rng,
        )

        states = generate_payload(
            N_QUBITS,
            schedule,
            rng,
        )

        noisy_states = [
            depolarizing_channel(
                state,
                NOISE_P,
                rng,
            )
            for state in states
        ]

        _, errors, totals = measure_sentinels(
            noisy_states,
            schedule,
            rng,
        )

        for axis in ["X", "Y", "Z"]:
            total_errors[axis] += errors[axis]
            total_samples[axis] += totals[axis]

    calibration_results = {
        axis: (
            total_errors[axis],
            total_samples[axis],
        )
        for axis in ["X", "Y", "Z"]
    }

    return estimate_baseline(
        calibration_results
    )


def run_session(
    attack,
    strength,
    baseline,
    seed,
):
    rng = np.random.default_rng(seed)

    schedule = generate_sentinel_schedule(
        N_QUBITS,
        SENTINEL_FRACTION,
        rng,
    )

    states = generate_payload(
        N_QUBITS,
        schedule,
        rng,
    )

    attacked_states = []

    for state in states:
        attacked = apply_partial_attack(
            state,
            attack,
            strength,
            rng,
        )

        noisy = depolarizing_channel(
            attacked,
            NOISE_P,
            rng,
        )

        attacked_states.append(noisy)

    fingerprint, errors, totals = measure_sentinels(
        attacked_states,
        schedule,
        rng,
    )

    axis_results = {}

    for axis in ["X", "Y", "Z"]:
        axis_results[axis] = evaluate_axis(
            errors=errors[axis],
            total=totals[axis],
            baseline_rate=baseline[axis],
            alpha=0.01,
        )

    decision = make_decision(
        axis_results
    )

    return {
        "fingerprint": fingerprint,
        "decision": decision,
    }


def detection_rate(
    attack,
    strength,
    baseline,
):
    detections = 0

    for trial in range(TRIALS):
        result = run_session(
            attack=attack,
            strength=strength,
            baseline=baseline,
            seed=50000 + trial,
        )

        if result["decision"] == "REJECT":
            detections += 1

    return detections / TRIALS


def theoretical_escape_bound(
    strength,
    sentinel_fraction,
):
    """
    Proposed bound under the simplified model:

        P_escape <= (1 - 2*rho/3)^w

    where:
        rho = sentinel fraction
        w   = number of attacked qubits

    Here w is approximated as:
        w = strength * N_QUBITS
    """

    w = strength * N_QUBITS
    rho = sentinel_fraction

    return (
        1 - (2 * rho / 3)
    ) ** w


def main():
    print("\nQSentinel Partial-Attack Evaluation")
    print("=" * 100)

    print(
        f"Qubits: {N_QUBITS}"
    )

    print(
        f"Sentinel fraction: "
        f"{SENTINEL_FRACTION:.0%}"
    )

    print(
        f"Noise: {NOISE_P}"
    )

    print(
        f"Trials per condition: {TRIALS}"
    )

    print("\n[1] Calibrating honest channel...")

    baseline = calibrate_baseline()

    print("\nBaseline:")

    for axis in ["X", "Y", "Z"]:
        print(
            f"  {axis}: "
            f"{baseline[axis]:.5f}"
        )

    for attack in ATTACKS:

        print(
            f"\n\nAttack: {attack}"
        )

        print("-" * 100)

        print(
            f"{'Strength':>12}"
            f"{'Detection Rate':>20}"
            f"{'Escape Rate':>20}"
            f"{'Theoretical Bound':>24}"
        )

        print("-" * 100)

        for strength in STRENGTHS:

            rate = detection_rate(
                attack,
                strength,
                baseline,
            )

            escape_rate = 1 - rate

            bound = theoretical_escape_bound(
                strength,
                SENTINEL_FRACTION,
            )

            print(
                f"{strength:>12.2%}"
                f"{rate:>20.3f}"
                f"{escape_rate:>20.3f}"
                f"{bound:>24.6e}"
            )

    print("\nEvaluation complete.")


if __name__ == "__main__":
    main()