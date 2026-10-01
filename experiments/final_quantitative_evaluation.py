import csv
import os

import numpy as np
import matplotlib.pyplot as plt

from src.qsentinel_pipeline import (
    run_qsentinel,
)
from src.detector import (
    estimate_baseline,
)


RESULTS_DIR = "results/final_evaluation"

os.makedirs(
    RESULTS_DIR,
    exist_ok=True,
)


def save_csv(
    filename,
    rows,
    fieldnames,
):
    path = os.path.join(
        RESULTS_DIR,
        filename,
    )

    with open(
        path,
        "w",
        newline="",
    ) as f:
        writer = csv.DictWriter(
            f,
            fieldnames=fieldnames,
        )

        writer.writeheader()
        writer.writerows(rows)

    return path


def calibrate(
    sessions=30,
    n_qubits=5000,
    sentinel_fraction=0.20,
    noise_p=0.03,
):
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

    for seed in range(sessions):
        result = run_qsentinel(
            n_qubits=n_qubits,
            sentinel_fraction=(
                sentinel_fraction
            ),
            key=10000 + seed,
            attack="none",
            attack_strength=1.0,
            noise_p=noise_p,
            rng=np.random.default_rng(
                seed
            ),
        )

        for axis in ["X", "Y", "Z"]:
            errors[axis] += (
                result["errors"][axis]
            )

            totals[axis] += (
                result["totals"][axis]
            )

    return estimate_baseline({
        axis: (
            errors[axis],
            totals[axis],
        )
        for axis in ["X", "Y", "Z"]
    })


# =====================================================
# 1. FALSE POSITIVE RATE
# =====================================================

def honest_false_positive_experiment():
    rows = []

    for noise_p in [
        0.01,
        0.03,
        0.05,
        0.10,
    ]:
        baseline = calibrate(
            sessions=30,
            n_qubits=5000,
            sentinel_fraction=0.20,
            noise_p=noise_p,
        )

        false_positives = 0
        trials = 100

        for trial in range(trials):
            result = run_qsentinel(
                n_qubits=5000,
                sentinel_fraction=0.20,
                key=20000 + trial,
                attack="none",
                attack_strength=1.0,
                noise_p=noise_p,
                baseline=baseline,
                alpha=0.01,
                rng=np.random.default_rng(
                    1000 + trial
                ),
            )

            if (
                result["quantum_decision"]
                == "REJECT"
            ):
                false_positives += 1

        rate = (
            false_positives / trials
        )

        rows.append({
            "noise_p": noise_p,
            "trials": trials,
            "false_positives": (
                false_positives
            ),
            "false_positive_rate": rate,
        })

        print(
            f"Noise={noise_p:.2f} | "
            f"FPR={rate:.3f}"
        )

    save_csv(
        "false_positive_rate.csv",
        rows,
        [
            "noise_p",
            "trials",
            "false_positives",
            "false_positive_rate",
        ],
    )


# =====================================================
# 2. FULL ATTACK DETECTION
# =====================================================

def attack_detection_experiment():
    attacks = [
        "X",
        "Y",
        "Z",
        "intercept_resend",
        "z_measure_resend",
    ]

    rows = []

    baseline = calibrate(
        sessions=30,
        n_qubits=5000,
        sentinel_fraction=0.20,
        noise_p=0.03,
    )

    for attack in attacks:
        detected = 0
        trials = 100

        for trial in range(trials):
            result = run_qsentinel(
                n_qubits=5000,
                sentinel_fraction=0.20,
                key=30000 + trial,
                attack=attack,
                attack_strength=1.0,
                noise_p=0.03,
                baseline=baseline,
                alpha=0.01,
                rng=np.random.default_rng(
                    2000 + trial
                ),
            )

            if (
                result["quantum_decision"]
                == "REJECT"
            ):
                detected += 1

        rate = detected / trials

        rows.append({
            "attack": attack,
            "trials": trials,
            "detected": detected,
            "detection_rate": rate,
        })

        print(
            f"{attack:22} | "
            f"Detection={rate:.3f}"
        )

    save_csv(
        "attack_detection.csv",
        rows,
        [
            "attack",
            "trials",
            "detected",
            "detection_rate",
        ],
    )


# =====================================================
# 3. PARTIAL ATTACK POWER
# =====================================================

def partial_attack_experiment():
    attacks = [
        "X",
        "Y",
        "Z",
        "intercept_resend",
        "z_measure_resend",
    ]

    strengths = [
        0.01,
        0.02,
        0.05,
        0.10,
        0.20,
        0.50,
        1.00,
    ]

    rows = []

    baseline = calibrate(
        sessions=30,
        n_qubits=5000,
        sentinel_fraction=0.20,
        noise_p=0.03,
    )

    for attack in attacks:

        for strength in strengths:

            detected = 0
            trials = 100

            for trial in range(trials):

                result = run_qsentinel(
                    n_qubits=5000,
                    sentinel_fraction=0.20,
                    key=40000 + trial,
                    attack=attack,
                    attack_strength=strength,
                    noise_p=0.03,
                    baseline=baseline,
                    alpha=0.01,
                    rng=np.random.default_rng(
                        3000 + trial
                    ),
                )

                if (
                    result["quantum_decision"]
                    == "REJECT"
                ):
                    detected += 1

            rate = detected / trials

            rows.append({
                "attack": attack,
                "strength": strength,
                "trials": trials,
                "detected": detected,
                "detection_rate": rate,
            })

            print(
                f"{attack:22} | "
                f"Strength={strength:5.2f} | "
                f"Detection={rate:.3f}"
            )

    save_csv(
        "partial_attack_power.csv",
        rows,
        [
            "attack",
            "strength",
            "trials",
            "detected",
            "detection_rate",
        ],
    )


# =====================================================
# 4. SENTINEL FRACTION
# =====================================================

def sentinel_fraction_experiment():
    fractions = [
        0.05,
        0.10,
        0.20,
        0.30,
    ]

    attacks = [
        "X",
        "intercept_resend",
    ]

    rows = []

    for fraction in fractions:

        baseline = calibrate(
            sessions=30,
            n_qubits=5000,
            sentinel_fraction=fraction,
            noise_p=0.03,
        )

        for attack in attacks:

            detected = 0
            trials = 100

            for trial in range(trials):

                result = run_qsentinel(
                    n_qubits=5000,
                    sentinel_fraction=fraction,
                    key=60000 + trial,
                    attack=attack,
                    attack_strength=1.0,
                    noise_p=0.03,
                    baseline=baseline,
                    alpha=0.01,
                    rng=np.random.default_rng(
                        6000 + trial
                    ),
                )

                if (
                    result["quantum_decision"]
                    == "REJECT"
                ):
                    detected += 1

            rate = detected / trials

            rows.append({
                "sentinel_fraction": fraction,
                "attack": attack,
                "trials": trials,
                "detected": detected,
                "detection_rate": rate,
            })

            print(
                f"Fraction={fraction:.2f} | "
                f"{attack:18} | "
                f"Detection={rate:.3f}"
            )

    save_csv(
        "sentinel_fraction.csv",
        rows,
        [
            "sentinel_fraction",
            "attack",
            "trials",
            "detected",
            "detection_rate",
        ],
    )


# =====================================================
# PLOTS
# =====================================================

def make_plots():

    # ---------------------------------------------
    # False positive rate
    # ---------------------------------------------

    data = np.genfromtxt(
        os.path.join(
            RESULTS_DIR,
            "false_positive_rate.csv",
        ),
        delimiter=",",
        names=True,
    )

    plt.figure()

    plt.plot(
        data["noise_p"],
        data["false_positive_rate"],
        marker="o",
    )

    plt.xlabel(
        "Channel noise p"
    )

    plt.ylabel(
        "False-positive rate"
    )

    plt.title(
        "False-positive rate vs honest-channel noise"
    )

    plt.grid(True)

    plt.savefig(
        os.path.join(
            RESULTS_DIR,
            "false_positive_rate.png",
        ),
        dpi=300,
        bbox_inches="tight",
    )

    plt.close()

    # ---------------------------------------------
    # Attack detection
    # ---------------------------------------------

    data = np.genfromtxt(
        os.path.join(
            RESULTS_DIR,
            "attack_detection.csv",
        ),
        delimiter=",",
        names=True,
        dtype=None,
        encoding="utf-8",
    )

    plt.figure()

    plt.bar(
        data["attack"],
        data["detection_rate"],
    )

    plt.ylabel(
        "Detection rate"
    )

    plt.title(
        "Attack detection rate"
    )

    plt.xticks(
        rotation=30,
        ha="right",
    )

    plt.ylim(
        0,
        1.05,
    )

    plt.grid(
        axis="y"
    )

    plt.savefig(
        os.path.join(
            RESULTS_DIR,
            "attack_detection.png",
        ),
        dpi=300,
        bbox_inches="tight",
    )

    plt.close()

    # ---------------------------------------------
    # Partial attack power
    # ---------------------------------------------

    data = np.genfromtxt(
        os.path.join(
            RESULTS_DIR,
            "partial_attack_power.csv",
        ),
        delimiter=",",
        names=True,
        dtype=None,
        encoding="utf-8",
    )

    plt.figure()

    attacks = np.unique(
        data["attack"]
    )

    for attack in attacks:

        mask = (
            data["attack"] == attack
        )

        plt.plot(
            data["strength"][mask],
            data["detection_rate"][mask],
            marker="o",
            label=attack,
        )

    plt.xlabel(
        "Attack strength"
    )

    plt.ylabel(
        "Detection probability"
    )

    plt.title(
        "Detection power vs attack strength"
    )

    plt.legend()

    plt.grid(True)

    plt.savefig(
        os.path.join(
            RESULTS_DIR,
            "partial_attack_power.png",
        ),
        dpi=300,
        bbox_inches="tight",
    )

    plt.close()

    # ---------------------------------------------
    # Sentinel fraction
    # ---------------------------------------------

    data = np.genfromtxt(
        os.path.join(
            RESULTS_DIR,
            "sentinel_fraction.csv",
        ),
        delimiter=",",
        names=True,
        dtype=None,
        encoding="utf-8",
    )

    plt.figure()

    attacks = np.unique(
        data["attack"]
    )

    for attack in attacks:

        mask = (
            data["attack"] == attack
        )

        plt.plot(
            data["sentinel_fraction"][mask],
            data["detection_rate"][mask],
            marker="o",
            label=attack,
        )

    plt.xlabel(
        "Sentinel fraction"
    )

    plt.ylabel(
        "Detection rate"
    )

    plt.title(
        "Detection rate vs sentinel fraction"
    )

    plt.legend()

    plt.grid(True)

    plt.savefig(
        os.path.join(
            RESULTS_DIR,
            "sentinel_fraction.png",
        ),
        dpi=300,
        bbox_inches="tight",
    )

    plt.close()


# =====================================================
# MAIN
# =====================================================

def main():

    print(
        "\n========================================"
    )
    print(
        "1. FALSE-POSITIVE EXPERIMENT"
    )
    print(
        "========================================"
    )

    honest_false_positive_experiment()

    print(
        "\n========================================"
    )
    print(
        "2. ATTACK DETECTION EXPERIMENT"
    )
    print(
        "========================================"
    )

    attack_detection_experiment()

    print(
        "\n========================================"
    )
    print(
        "3. PARTIAL ATTACK POWER"
    )
    print(
        "========================================"
    )

    partial_attack_experiment()

    print(
        "\n========================================"
    )
    print(
        "4. SENTINEL FRACTION"
    )
    print(
        "========================================"
    )

    sentinel_fraction_experiment()

    print(
        "\n========================================"
    )
    print(
        "5. GENERATING PLOTS"
    )
    print(
        "========================================"
    )

    make_plots()

    print(
        "\nAll results saved to:"
    )

    print(
        RESULTS_DIR
    )


if __name__ == "__main__":
    main()