"""10,000-trial detector-level honest-channel false-positive evaluation.

This deliberately evaluates the statistical decision layer independently of the
quantum simulator. Honest sentinel errors are sampled from the calibrated
baseline rate (default 0.02), matching the detector's binomial null model.
It reports REJECT (>=2 rejected axes) separately from INCONCLUSIVE (exactly 1).
"""

import argparse
import csv
from pathlib import Path

import numpy as np
from scipy.stats import binomtest


def run(trials=10_000, sentinels_per_axis=333, baseline=0.02, alpha=0.01, seed=42):
    rng = np.random.default_rng(seed)
    reject = 0
    inconclusive = 0
    accept = 0

    for _ in range(trials):
        rejected = 0
        for _axis in range(3):
            errors = int(rng.binomial(sentinels_per_axis, baseline))
            p_value = binomtest(
                errors,
                sentinels_per_axis,
                baseline,
                alternative="greater",
            ).pvalue
            rejected += int(p_value < alpha)

        if rejected >= 2:
            reject += 1
        elif rejected == 1:
            inconclusive += 1
        else:
            accept += 1

    return {
        "trials": trials,
        "sentinels_per_axis": sentinels_per_axis,
        "baseline": baseline,
        "alpha": alpha,
        "accept": accept,
        "inconclusive": inconclusive,
        "reject": reject,
        "accept_rate": accept / trials,
        "inconclusive_rate": inconclusive / trials,
        "false_positive_rate": reject / trials,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--trials", type=int, default=10_000)
    parser.add_argument("--sentinels-per-axis", type=int, default=333)
    parser.add_argument("--baseline", type=float, default=0.02)
    parser.add_argument("--alpha", type=float, default=0.01)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", type=Path, default=Path("results/final_evaluation/false_positive_10000.csv"))
    args = parser.parse_args()

    result = run(
        trials=args.trials,
        sentinels_per_axis=args.sentinels_per_axis,
        baseline=args.baseline,
        alpha=args.alpha,
        seed=args.seed,
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=result.keys())
        writer.writeheader()
        writer.writerow(result)

    for key, value in result.items():
        print(f"{key}: {value}")
