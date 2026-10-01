import numpy as np

from src.sentinels import generate_sentinel_schedule
from src.teleportation_pipeline import sentinel_trial


def run_experiment(
    attack,
    n_sentinels=3000,
    noise_p=0.03,
):
    rng = np.random.default_rng(42)

    schedule = generate_sentinel_schedule(
        n_sentinels,
        1.0,
        rng,
    )

    errors = {
        "X": 0,
        "Y": 0,
        "Z": 0,
    }

    totals = {
        "X": 0,
        "Y": 0,
        "Z": 0,
    }

    for sentinel in schedule.values():

        axis = sentinel["axis"]
        sign = sentinel["sign"]

        result = sentinel_trial(
            axis=axis,
            sign=sign,
            attack=attack,
            noise_p=noise_p,
            rng=rng,
        )

        totals[axis] += 1

        if result["error"]:
            errors[axis] += 1

    fingerprint = {
        axis: (
            errors[axis] / totals[axis]
            if totals[axis] > 0
            else 0.0
        )
        for axis in ["X", "Y", "Z"]
    }

    return fingerprint, errors, totals


def main():

    attacks = [
        "none",
        "X",
        "Y",
        "Z",
        "intercept_resend",
        "z_measure_resend",
    ]

    print("\nQSentinel Teleportation-Backed Experiment")
    print("=" * 90)

    print(
        f"{'Attack':<22}"
        f"{'eX':>12}"
        f"{'eY':>12}"
        f"{'eZ':>12}"
        f"{'nX':>8}"
        f"{'nY':>8}"
        f"{'nZ':>8}"
    )

    print("-" * 90)

    for attack in attacks:

        fingerprint, errors, totals = run_experiment(
            attack=attack,
            n_sentinels=3000,
            noise_p=0.03,
        )

        print(
            f"{attack:<22}"
            f"{fingerprint['X']:>12.4f}"
            f"{fingerprint['Y']:>12.4f}"
            f"{fingerprint['Z']:>12.4f}"
            f"{totals['X']:>8}"
            f"{totals['Y']:>8}"
            f"{totals['Z']:>8}"
        )

    print("\nExperiment complete.")


if __name__ == "__main__":
    main()