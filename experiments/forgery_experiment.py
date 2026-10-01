import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import csv
import numpy as np

from src.qds import generate_signature, verify_signature
from src.protocol import SessionManager


TRIALS = 100

SIGNING_KEY = 12345
WRONG_KEY = 98765

N_QUBITS = 5000
SENTINEL_FRACTION = 0.20

NOISE_P = 0.03
ALPHA = 0.01

BASELINE = {
    "X": 0.02,
    "Y": 0.02,
    "Z": 0.02,
}

RESULTS_DIR = Path("results/forgery")
RESULTS_FILE = RESULTS_DIR / "forgery_results.csv"


def run_trial(trial):
    message = "QSentinel forgery experiment"

    signature = generate_signature(
        message=message,
        n_qubits=N_QUBITS,
        sentinel_fraction=SENTINEL_FRACTION,
        key=SIGNING_KEY,
        nonce=f"forgery-nonce-{trial}",
        message_id=f"forgery-message-{trial}",
        rng=np.random.default_rng(trial),
    )

    # The signature was generated with the legitimate key,
    # but verification is attempted with a different key.
    result = verify_signature(
        signature=signature,
        message=message,
        key=WRONG_KEY,
        baseline=BASELINE,
        attack="none",
        attack_strength=1.0,
        noise_p=NOISE_P,
        alpha=ALPHA,
        verifier_id="verifier",
        registered_verifier_id="verifier",
        session_manager=SessionManager(),
        rng=np.random.default_rng(10000 + trial),
    )

    fingerprint = result.get(
        "fingerprint",
        {
            "X": None,
            "Y": None,
            "Z": None,
        },
    )

    return {
        "trial": trial,
        "eX": fingerprint["X"],
        "eY": fingerprint["Y"],
        "eZ": fingerprint["Z"],
        "decision": result["final_decision"],
        "quantum_decision": result["quantum_decision"],
    }


def main():
    RESULTS_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    rows = []

    for trial in range(1, TRIALS + 1):
        row = run_trial(trial)
        rows.append(row)

    detected = sum(
        row["decision"] == "REJECT"
        for row in rows
    )

    inconclusive = sum(
        row["decision"] == "INCONCLUSIVE"
        for row in rows
    )

    accepted = sum(
        row["decision"] == "VALID"
        for row in rows
    )

    fingerprint_rows = [
        row
        for row in rows
        if row["eX"] is not None
    ]

    mean_ex = np.mean(
        [row["eX"] for row in fingerprint_rows]
    )

    mean_ey = np.mean(
        [row["eY"] for row in fingerprint_rows]
    )

    mean_ez = np.mean(
        [row["eZ"] for row in fingerprint_rows]
    )

    with RESULTS_FILE.open(
        "w",
        newline="",
        encoding="utf-8",
    ) as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
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

    print("Forgery / wrong-key experiment")
    print("--------------------------------")
    print(f"trials: {TRIALS}")
    print(f"n_qubits: {N_QUBITS}")
    print(
        f"sentinel_fraction: "
        f"{SENTINEL_FRACTION}"
    )
    print(f"noise_p: {NOISE_P}")
    print(f"baseline: {BASELINE}")
    print(f"alpha: {ALPHA}")
    print()
    print(f"mean_eX: {mean_ex:.4f}")
    print(f"mean_eY: {mean_ey:.4f}")
    print(f"mean_eZ: {mean_ez:.4f}")
    print()
    print(f"accepted: {accepted}")
    print(f"inconclusive: {inconclusive}")
    print(f"rejected: {detected}")
    print()
    print(
        "detection_rate: "
        f"{detected / TRIALS:.4f}"
    )
    print(
        "inconclusive_rate: "
        f"{inconclusive / TRIALS:.4f}"
    )
    print(
        "acceptance_rate: "
        f"{accepted / TRIALS:.4f}"
    )
    print()
    print(f"saved: {RESULTS_FILE}")


if __name__ == "__main__":
    main()
