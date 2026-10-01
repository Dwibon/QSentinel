import math


Z_VALUES = {
    0.90: 1.645,
    0.95: 1.960,
    0.99: 2.576,
    0.999: 3.291,
}


def wilson_upper_bound(errors, total, confidence=0.99):
    if total <= 0:
        raise ValueError("total must be positive.")

    if errors < 0 or errors > total:
        raise ValueError("errors must be between 0 and total.")

    if confidence not in Z_VALUES:
        raise ValueError("Unsupported confidence level.")

    z = Z_VALUES[confidence]
    phat = errors / total

    denominator = 1 + z**2 / total

    center = phat + z**2 / (2 * total)

    margin = z * math.sqrt(
        phat * (1 - phat) / total
        + z**2 / (4 * total**2)
    )

    return (center + margin) / denominator


def estimate_baseline(calibration_results):
    baseline = {}

    for axis in ["X", "Y", "Z"]:
        errors, total = calibration_results[axis]

        if total <= 0:
            raise ValueError(f"No calibration samples for {axis}.")

        baseline[axis] = errors / total

    return baseline


def binomial_upper_pvalue(errors, total, baseline_rate):
    """
    Exact one-sided binomial p-value.

    H0: p = baseline_rate
    H1: p > baseline_rate
    """

    if total <= 0:
        raise ValueError("total must be positive.")

    if errors < 0 or errors > total:
        raise ValueError("errors must be between 0 and total.")

    if not 0 <= baseline_rate <= 1:
        raise ValueError("baseline_rate must be in [0,1].")

    if baseline_rate == 0:
        return 0.0 if errors > 0 else 1.0

    if baseline_rate == 1:
        return 1.0

    p_value = 0.0

    for k in range(errors, total + 1):
        probability = (
            math.comb(total, k)
            * baseline_rate**k
            * (1 - baseline_rate)**(total - k)
        )

        p_value += probability

    return min(1.0, p_value)


def evaluate_axis(
    errors,
    total,
    baseline_rate,
    alpha=0.01
):
    if total <= 0:
        raise ValueError("total must be positive.")

    if errors < 0 or errors > total:
        raise ValueError("errors must be between 0 and total.")

    if not 0 <= baseline_rate <= 1:
        raise ValueError("baseline_rate must be in [0,1].")

    if not 0 < alpha < 1:
        raise ValueError("alpha must be between 0 and 1.")

    observed_rate = errors / total

    p_value = binomial_upper_pvalue(
        errors,
        total,
        baseline_rate
    )

    return {
        "observed_rate": observed_rate,
        "baseline_rate": baseline_rate,
        "p_value": p_value,
        "reject": p_value < alpha,
    }


def classify_fingerprint(
    fingerprint,
    tolerance=0.10
):
    x = fingerprint["X"]
    y = fingerprint["Y"]
    z = fingerprint["Z"]

    if (
        x < tolerance
        and y > 1 - tolerance
        and z > 1 - tolerance
    ):
        return "X-Pauli attack"

    if (
        x > 1 - tolerance
        and y < tolerance
        and z > 1 - tolerance
    ):
        return "Y-Pauli attack"

    if (
        x > 1 - tolerance
        and y > 1 - tolerance
        and z < tolerance
    ):
        return "Z-Pauli attack"

    if (
        abs(x - 1 / 3) < tolerance
        and abs(y - 1 / 3) < tolerance
        and abs(z - 1 / 3) < tolerance
    ):
        return "Intercept-resend attack"

    if (
        abs(x - 0.5) < tolerance
        and abs(y - 0.5) < tolerance
        and z < tolerance
    ):
        return "Z-measure/resend attack"

    return "Unknown / mixed attack"


def make_decision(axis_results):
    rejected_axes = [
        axis
        for axis, result in axis_results.items()
        if result["reject"]
    ]

    if len(rejected_axes) == 0:
        return "ACCEPT"

    if len(rejected_axes) == 1:
        return "INCONCLUSIVE"

    return "REJECT"