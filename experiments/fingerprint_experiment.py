import numpy as np

from src.states import get_state, projective_measure
from src.attacks import apply_attack


AXES = ["X", "Y", "Z"]
ATTACKS = [
    "none",
    "X",
    "Y",
    "Z",
    "intercept_resend",
    "z_measure_resend",
]


def measure_fingerprint(attack, samples=10000):
    rng = np.random.default_rng(42)

    errors = {
        "X": 0,
        "Y": 0,
        "Z": 0
    }

    totals = {
        "X": 0,
        "Y": 0,
        "Z": 0
    }

    for _ in range(samples):

        axis = rng.choice(AXES)
        sign = rng.choice([1, -1])

        state = get_state(axis, sign)

        attacked_state = apply_attack(state, attack)

        measured_sign = projective_measure(
            attacked_state,
            axis,
            rng
        )

        totals[axis] += 1

        if measured_sign != sign:
            errors[axis] += 1

    return {
        axis: errors[axis] / totals[axis]
        for axis in AXES
    }


def main():

    print("\nQSentinel Pauli Attack Fingerprints")
    print("=" * 50)

    print(
        f"{'Attack':<10}"
        f"{'e_X':>10}"
        f"{'e_Y':>10}"
        f"{'e_Z':>10}"
    )

    print("-" * 50)

    for attack in ATTACKS:

        fingerprint = measure_fingerprint(attack)

        print(
            f"{attack:<10}"
            f"{fingerprint['X']:>10.4f}"
            f"{fingerprint['Y']:>10.4f}"
            f"{fingerprint['Z']:>10.4f}"
        )


if __name__ == "__main__":
    main()