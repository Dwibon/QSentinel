import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import csv
import numpy as np

from src.qds import generate_signature, verify_signature
from src.protocol import SessionManager


TRIALS = 100
SIGNING_KEY = 12345
N_QUBITS = 5000
SENTINEL_FRACTION = 0.20

# Detector assumes this calibrated honest baseline.
BASELINE = {
    "X": 0.02,
    "Y": 0.02,
    "Z": 0.02,
}

# Actual honest-channel noise values to test.
ACTUAL_NOISE_LEVELS = [0.020, 0.022, 0.025, 0.030, 0.035, 0.040]

ALPHA = 0.01

RESULTS_DIR = Path("results/noise_drift")
RESULTS_FILE = RESULTS_DIR / "noise_drift_results.csv"


def run_trial(actual_noise, trial):
    message = "QSentinel honest noise drift experiment"

    signature = generate_signature(
        message=message,
        n_qubits=N_QUBITS,
        sentinel_fraction=SENTINEL_FRACTION,
        key=SIGNING_KEY,
        nonce=f"drift-nonce-{actual_noise}-{trial}",
        message_id=f"drift-message-{actual_noise}-{trial}",
        rng=np.random.default_rng(trial),
    )

    result = verify_signature(
        signature=signature,
        message=message,
        key=SIGNING_KEY,
        baseline=BASELINE,
        attack="none",
        attack_strength=1.0,
        noise_p=actual_noise,
        alpha=ALPHA,
        verifier_id="verifier",
        registered_verifier_id="verifier",
        session_manager=SessionManager(),
        rng=np.random.default_rng(10000 + trial),
    )

    fingerprint = result.get(
        "fingerprint",
        {"X": None, "Y": None, "Z": None},
    )

    return {
        "noise_p": actual_noise,
        "trial": trial,
        "eX": fingerprint["X"],
        "eY": fingerprint["Y"],
        "eZ": fingerprint["Z"],
        "decision": result["final_decision"],
        "quantum_decision": result["quantum_decision"],
    }


def main():
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    rows = []

    for noise in ACTUAL_NOISE_LEVELS:
        for trial in range(1, TRIALS + 1):
            rows.append(run_trial(noise, trial))

    with RESULTS_FILE.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "noise_p",
                "trial",
                "eX",
                "eY",
                "eZ",
                "decision",
                "quantum_decision",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)

    print("Noise-drift robustness experiment")
    print("---------------------------------")
    print(f"trials per noise level: {TRIALS}")
    print(f"n_qubits: {N_QUBITS}")
    print(f"sentinel_fraction: {SENTINEL_FRACTION}")
    print(f"calibrated baseline: {BASELINE}")
    print(f"alpha: {ALPHA}")
    print()

    for noise in ACTUAL_NOISE_LEVELS:
        subset = [r for r in rows if r["noise_p"] == noise]

        accepted = sum(r["decision"] == "VALID" for r in subset)
        inconclusive = sum(
            r["decision"] == "INCONCLUSIVE" for r in subset
        )
        rejected = sum(r["decision"] == "REJECT" for r in subset)

        ex = np.mean([r["eX"] for r in subset])
        ey = np.mean([r["eY"] for r in subset])
        ez = np.mean([r["eZ"] for r in subset])

        print(f"actual noise: {noise:.3f}")
        print(f"  mean eX: {ex:.4f}")
        print(f"  mean eY: {ey:.4f}")
        print(f"  mean eZ: {ez:.4f}")
        print(f"  accepted: {accepted}")
        print(f"  inconclusive: {inconclusive}")
        print(f"  rejected: {rejected}")
        print(f"  rejection rate: {rejected / TRIALS:.4f}")
        print()

    print(f"saved: {RESULTS_FILE}")


if __name__ == "__main__":
    main()
