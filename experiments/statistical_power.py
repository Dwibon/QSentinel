import numpy as np
from scipy.stats import binom

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

SENTINEL_FRACTIONS = [
    0.05,
    0.10,
    0.20,
]

NOISE_P = 0.03
N_QUBITS = 5000
TRIALS = 100
ALPHA = 0.01


def calibrate_baseline(
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
    sentinel_fraction,
    baseline,
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
            alpha=ALPHA,
        )

    decision = make_decision(
        axis_results
    )

    return {
        "fingerprint": fingerprint,
        "errors": errors,
        "totals": totals,
        "axis_results": axis_results,
        "decision": decision,
    }


def empirical_detection_probability(
    attack,
    strength,
    sentinel_fraction,
    baseline,
):
    detections = 0

    for trial in range(TRIALS):
        result = run_session(
            attack=attack,
            strength=strength,
            sentinel_fraction=sentinel_fraction,
            baseline=baseline,
            seed=50000 + trial,
        )

        if result["decision"] == "REJECT":
            detections += 1

    return detections / TRIALS


def estimate_attack_error_rate(
    attack,
    strength,
    sentinel_fraction,
    baseline,
):
    """
    Estimate the post-attack error probability on each axis.

    This is obtained empirically from independent sessions and
    is then used in the binomial power calculation.
    """

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

    calibration_sessions = 20

    for trial in range(calibration_sessions):
        result = run_session(
            attack=attack,
            strength=strength,
            sentinel_fraction=sentinel_fraction,
            baseline=baseline,
            seed=80000 + trial,
        )

        for axis in ["X", "Y", "Z"]:
            total_errors[axis] += result["errors"][axis]
            total_samples[axis] += result["totals"][axis]

    return {
        axis: total_errors[axis] / total_samples[axis]
        for axis in ["X", "Y", "Z"]
    }


def binomial_power(
    total,
    baseline_rate,
    attack_rate,
    alpha=ALPHA,
):
    """
    Approximate probability that the one-sided binomial
    detector rejects H0 when the true error rate is attack_rate.
    """

    if attack_rate <= baseline_rate:
        return 0.0

    # Find smallest k such that:
    # P(X >= k | H0) <= alpha
    threshold = None

    for k in range(total + 1):
        p_value = binom.sf(
            k - 1,
            total,
            baseline_rate,
        )

        if p_value <= alpha:
            threshold = k
            break

    if threshold is None:
        return 0.0

    return binom.sf(
        threshold - 1,
        total,
        attack_rate,
    )


def predicted_detection_probability(
    attack,
    strength,
    sentinel_fraction,
    baseline,
):
    attack_rates = estimate_attack_error_rate(
        attack,
        strength,
        sentinel_fraction,
        baseline,
    )

    axis_powers = {}

    # Use the expected number of samples per axis.
    samples_per_axis = int(
        N_QUBITS
        * sentinel_fraction
        / 3
    )

    for axis in ["X", "Y", "Z"]:
        axis_powers[axis] = binomial_power(
            total=samples_per_axis,
            baseline_rate=baseline[axis],
            attack_rate=attack_rates[axis],
        )

    # Approximate probability that at least two axes reject.
    p_x = axis_powers["X"]
    p_y = axis_powers["Y"]
    p_z = axis_powers["Z"]

    probability_two_or_more = (
        p_x * p_y * (1 - p_z)
        + p_x * p_z * (1 - p_y)
        + p_y * p_z * (1 - p_x)
        + p_x * p_y * p_z
    )

    return probability_two_or_more, attack_rates


def main():
    print("\nQSentinel Statistical Detection Power")
    print("=" * 100)

    print(
        f"N = {N_QUBITS}, "
        f"noise = {NOISE_P}, "
        f"alpha = {ALPHA}, "
        f"trials = {TRIALS}"
    )

    for sentinel_fraction in SENTINEL_FRACTIONS:

        print(
            f"\n\nSentinel fraction: "
            f"{sentinel_fraction:.0%}"
        )

        print("-" * 100)

        for attack in ATTACKS:

            print(
                f"\nAttack: {attack}"
            )

            print(
                f"{'Strength':>12}"
                f"{'Empirical':>18}"
                f"{'Predicted':>18}"
                f"{'Difference':>18}"
            )

            print("-" * 70)

            baseline = calibrate_baseline(
                sentinel_fraction
            )

            for strength in STRENGTHS:

                empirical = (
                    empirical_detection_probability(
                        attack,
                        strength,
                        sentinel_fraction,
                        baseline,
                    )
                )

                predicted, attack_rates = (
                    predicted_detection_probability(
                        attack,
                        strength,
                        sentinel_fraction,
                        baseline,
                    )
                )

                difference = (
                    empirical - predicted
                )

                print(
                    f"{strength:>12.2%}"
                    f"{empirical:>18.3f}"
                    f"{predicted:>18.3f}"
                    f"{difference:>18.3f}"
                )

    print("\n\nEvaluation complete.")


if __name__ == "__main__":
    main()