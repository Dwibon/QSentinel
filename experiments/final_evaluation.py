import numpy as np

from src.qsentinel_pipeline import run_qsentinel
from src.detector import estimate_baseline


def calibrate(
    sessions=20,
    n_qubits=5000,
    sentinel_fraction=0.2,
    noise_p=0.03,
):
    totals = {
        "X": 0,
        "Y": 0,
        "Z": 0,
    }

    errors = {
        "X": 0,
        "Y": 0,
        "Z": 0,
    }

    for seed in range(sessions):
        result = run_qsentinel(
            n_qubits=n_qubits,
            sentinel_fraction=sentinel_fraction,
            key=1000 + seed,
            attack="none",
            noise_p=noise_p,
            rng=np.random.default_rng(seed),
        )

        for axis in ["X", "Y", "Z"]:
            errors[axis] += result["errors"][axis]
            totals[axis] += result["totals"][axis]

    return estimate_baseline({
        axis: (
            errors[axis],
            totals[axis],
        )
        for axis in ["X", "Y", "Z"]
    })


def main():
    n_qubits = 5000
    sentinel_fraction = 0.2
    noise_p = 0.03

    baseline = calibrate(
        sessions=20,
        n_qubits=n_qubits,
        sentinel_fraction=sentinel_fraction,
        noise_p=noise_p,
    )

    print("\nCalibrated baseline")
    print("-------------------")

    for axis in ["X", "Y", "Z"]:
        print(
            f"{axis}: "
            f"{baseline[axis]:.4f}"
        )

    attacks = [
        "none",
        "X",
        "Y",
        "Z",
        "intercept_resend",
        "z_measure_resend",
    ]

    print("\nFinal QSentinel evaluation")
    print("--------------------------")

    print(
        f"{'Attack':22}"
        f"{'eX':>8}"
        f"{'eY':>8}"
        f"{'eZ':>8}"
        f"{'Quantum':>16}"
        f"{'Class':>25}"
        f"{'Final':>18}"
    )

    for index, attack in enumerate(attacks):
        result = run_qsentinel(
            n_qubits=n_qubits,
            sentinel_fraction=sentinel_fraction,
            key=5000 + index,
            attack=attack,
            noise_p=noise_p,
            baseline=baseline,
            alpha=0.01,
            rng=np.random.default_rng(
                100 + index
            ),
        )

        f = result["fingerprint"]

        print(
            f"{attack:22}"
            f"{f['X']:8.3f}"
            f"{f['Y']:8.3f}"
            f"{f['Z']:8.3f}"
            f"{str(result['quantum_decision']):>16}"
            f"{result['classification']:>25}"
            f"{result['final_decision']:>18}"
        )


if __name__ == "__main__":
    main()