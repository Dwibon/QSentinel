import numpy as np

from src.sentinels import generate_sentinel_schedule
from src.payload import generate_payload
from src.attacks import apply_attack
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

NOISE_LEVELS = [0.01, 0.03, 0.05, 0.10]
SENTINEL_FRACTIONS = [0.05, 0.10, 0.20]

TRIALS = 30
N_QUBITS = 5000


def calibrate_baseline(
    noise_p,
    sentinel_fraction,
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
            sentinel_fraction,
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
                noise_p,
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
    baseline,
    noise_p,
    sentinel_fraction,
    seed,
):
    rng = np.random.default_rng(seed)

    schedule = generate_sentinel_schedule(
        N_QUBITS,
        sentinel_fraction,
        rng,
    )

    states = generate_payload(
        N_QUBITS,
        schedule,
        rng,
    )

    attacked_states = []

    for state in states:
        attacked = apply_attack(
            state,
            attack,
            rng,
        )

        noisy = depolarizing_channel(
            attacked,
            noise_p,
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

    decision = make_decision(axis_results)

    return {
        "fingerprint": fingerprint,
        "decision": decision,
    }


def evaluate_condition(
    attack,
    noise_p,
    sentinel_fraction,
):
    baseline = calibrate_baseline(
        noise_p=noise_p,
        sentinel_fraction=sentinel_fraction,
    )

    detections = 0

    for trial in range(TRIALS):
        result = run_session(
            attack=attack,
            baseline=baseline,
            noise_p=noise_p,
            sentinel_fraction=sentinel_fraction,
            seed=50000 + trial,
        )

        if result["decision"] == "REJECT":
            detections += 1

    return detections / TRIALS


def main():
    print("\nQSentinel Robustness Sweep")
    print("=" * 90)

    print(
        f"Trials per condition: {TRIALS}"
    )

    print(
        f"Qubits per session: {N_QUBITS}"
    )

    print()

    for sentinel_fraction in SENTINEL_FRACTIONS:

        print(
            f"\nSentinel fraction: "
            f"{sentinel_fraction:.0%}"
        )

        print("-" * 90)

        header = (
            f"{'Noise':>8}"
            + "".join(
                f"{attack:>22}"
                for attack in ATTACKS
            )
        )

        print(header)
        print("-" * 90)

        for noise_p in NOISE_LEVELS:

            rates = []

            for attack in ATTACKS:
                rate = evaluate_condition(
                    attack=attack,
                    noise_p=noise_p,
                    sentinel_fraction=sentinel_fraction,
                )

                rates.append(rate)

            print(
                f"{noise_p:>8.2f}"
                + "".join(
                    f"{rate:>22.3f}"
                    for rate in rates
                )
            )

    print("\nSweep complete.")


if __name__ == "__main__":
    main()