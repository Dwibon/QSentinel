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
    "none",
    "X",
    "Y",
    "Z",
    "intercept_resend",
    "z_measure_resend",
]


def calibrate_baseline(
    sessions=20,
    n_qubits=10000,
    sentinel_fraction=0.2,
    noise_p=0.03,
):
    total_errors = {"X": 0, "Y": 0, "Z": 0}
    total_samples = {"X": 0, "Y": 0, "Z": 0}

    for session in range(sessions):
        rng = np.random.default_rng(session)

        schedule = generate_sentinel_schedule(
            n_qubits,
            sentinel_fraction,
            rng,
        )

        states = generate_payload(
            n_qubits,
            schedule,
            rng,
        )

        noisy_states = []

        for state in states:
            noisy_states.append(
                depolarizing_channel(
                    state,
                    noise_p,
                    rng,
                )
            )

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

    return estimate_baseline(calibration_results)


def run_session(
    attack,
    baseline,
    seed,
    n_qubits=10000,
    sentinel_fraction=0.2,
    noise_p=0.03,
    alpha=0.01,
):
    rng = np.random.default_rng(seed)

    schedule = generate_sentinel_schedule(
        n_qubits,
        sentinel_fraction,
        rng,
    )

    states = generate_payload(
        n_qubits,
        schedule,
        rng,
    )

    attacked_states = []

    for state in states:
        attacked_state = apply_attack(
            state,
            attack,
            rng,
        )

        noisy_state = depolarizing_channel(
            attacked_state,
            noise_p,
            rng,
        )

        attacked_states.append(noisy_state)

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
            alpha=alpha,
        )

    decision = make_decision(axis_results)

    return {
        "fingerprint": fingerprint,
        "axis_results": axis_results,
        "decision": decision,
    }


def evaluate_attack(
    attack,
    baseline,
    trials=50,
    n_qubits=10000,
    sentinel_fraction=0.2,
    noise_p=0.03,
    alpha=0.01,
):
    results = []

    for trial in range(trials):
        result = run_session(
            attack=attack,
            baseline=baseline,
            seed=1000 + trial,
            n_qubits=n_qubits,
            sentinel_fraction=sentinel_fraction,
            noise_p=noise_p,
            alpha=alpha,
        )

        results.append(result)

    if attack == "none":
        false_positives = sum(
            result["decision"] != "ACCEPT"
            for result in results
        )

        false_positive_rate = false_positives / trials

        return {
            "attack": attack,
            "trials": trials,
            "false_positives": false_positives,
            "false_positive_rate": false_positive_rate,
        }

    detections = sum(
        result["decision"] == "REJECT"
        for result in results
    )

    false_negatives = trials - detections

    detection_rate = detections / trials
    false_negative_rate = false_negatives / trials

    return {
        "attack": attack,
        "trials": trials,
        "detections": detections,
        "false_negatives": false_negatives,
        "detection_rate": detection_rate,
        "false_negative_rate": false_negative_rate,
    }


def main():
    print("\nQSentinel Statistical Evaluation")
    print("=" * 90)

    print("\n[1] Calibrating honest channel...")

    baseline = calibrate_baseline()

    print("\nBaseline:")
    for axis in ["X", "Y", "Z"]:
        print(
            f"  {axis}: {baseline[axis]:.5f}"
        )

    print("\n[2] Running Monte Carlo evaluation...")
    print()

    trials = 50

    print(
        f"Trials per attack: {trials}"
    )

    print(
        f"\n{'Attack':<22}"
        f"{'Trials':>8}"
        f"{'Detection Rate':>18}"
        f"{'False Positive':>18}"
        f"{'False Negative':>18}"
    )

    print("-" * 90)

    for attack in ATTACKS:
        result = evaluate_attack(
            attack=attack,
            baseline=baseline,
            trials=trials,
        )

        if attack == "none":
            print(
                f"{attack:<22}"
                f"{result['trials']:>8}"
                f"{'N/A':>18}"
                f"{result['false_positive_rate']:>18.4f}"
                f"{'N/A':>18}"
            )
        else:
            print(
                f"{attack:<22}"
                f"{result['trials']:>8}"
                f"{result['detection_rate']:>18.4f}"
                f"{'N/A':>18}"
                f"{result['false_negative_rate']:>18.4f}"
            )

    print("\nEvaluation complete.")


if __name__ == "__main__":
    main()