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
    classify_fingerprint,
)


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

        noisy_states = [
            depolarizing_channel(state, noise_p, rng)
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

    return estimate_baseline(calibration_results)


def run_attack(
    attack,
    baseline,
    n_qubits=10000,
    sentinel_fraction=0.2,
    noise_p=0.03,
    seed=42,
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
            alpha=0.01,
        )

    decision = make_decision(axis_results)

    classification = classify_fingerprint(
        fingerprint,
        tolerance=0.10,
    )

    return {
        "fingerprint": fingerprint,
        "errors": errors,
        "totals": totals,
        "axis_results": axis_results,
        "decision": decision,
        "classification": classification,
    }


def main():
    print("\nQSentinel End-to-End Detection Experiment")
    print("=" * 100)

    print("\n[1] Calibrating honest channel...")

    baseline = calibrate_baseline()

    print("\nCalibrated baseline:")
    for axis in ["X", "Y", "Z"]:
        print(
            f"  {axis}: {baseline[axis]:.5f}"
        )

    attacks = [
        "none",
        "X",
        "Y",
        "Z",
        "intercept_resend",
        "z_measure_resend",
    ]

    print("\n[2] Running attack experiments...")
    print()

    print(
        f"{'Attack':<22}"
        f"{'eX':>10}"
        f"{'eY':>10}"
        f"{'eZ':>10}"
        f"{'Decision':>16}"
        f"{'Classification':>28}"
    )

    print("-" * 100)

    for attack in attacks:
        result = run_attack(
            attack=attack,
            baseline=baseline,
        )

        fingerprint = result["fingerprint"]

        print(
            f"{attack:<22}"
            f"{fingerprint['X']:>10.4f}"
            f"{fingerprint['Y']:>10.4f}"
            f"{fingerprint['Z']:>10.4f}"
            f"{result['decision']:>16}"
            f"{result['classification']:>28}"
        )

    print("\nExperiment complete.")


if __name__ == "__main__":
    main()