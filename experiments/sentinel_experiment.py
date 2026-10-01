import numpy as np

from src.sentinels import generate_sentinel_schedule
from src.payload import generate_payload
from src.attacks import apply_attack
from src.sentinel_measurement import measure_sentinels
from src.noise import depolarizing_channel


def run_experiment(
    attack,
    n_qubits=10000,
    sentinel_fraction=0.2,
    noise_p=0.03
):
    rng = np.random.default_rng(42)

    schedule = generate_sentinel_schedule(
        n_qubits=n_qubits,
        sentinel_fraction=sentinel_fraction,
        rng=rng
    )

    states = generate_payload(
        n_qubits=n_qubits,
        schedule=schedule,
        rng=rng
    )

    if len(states) != n_qubits:
        raise RuntimeError(
            f"Payload contains {len(states)} states, "
            f"but expected {n_qubits}."
        )

    attacked_states = []

    for state in states:

        attacked_state = apply_attack(
            state,
            attack,
            rng
        )

        noisy_state = depolarizing_channel(
            attacked_state,
            noise_p,
            rng
        )

        attacked_states.append(noisy_state)

    fingerprint, errors, totals = measure_sentinels(
        attacked_states,
        schedule,
        rng
    )

    return fingerprint, errors, totals


def main():

    attacks = [
        "none",
        "X",
        "Y",
        "Z",
        "intercept_resend",
        "z_measure_resend"
    ]

    print("\nQSentinel Sentinel Experiment")
    print("=" * 85)

    print(
        f"{'Attack':<20}"
        f"{'e_X':>12}"
        f"{'e_Y':>12}"
        f"{'e_Z':>12}"
        f"{'n_X':>8}"
        f"{'n_Y':>8}"
        f"{'n_Z':>8}"
    )

    print("-" * 85)

    for attack in attacks:

        fingerprint, errors, totals = run_experiment(
            attack
        )

        print(
            f"{attack:<20}"
            f"{fingerprint['X']:>12.4f}"
            f"{fingerprint['Y']:>12.4f}"
            f"{fingerprint['Z']:>12.4f}"
            f"{totals['X']:>8}"
            f"{totals['Y']:>8}"
            f"{totals['Z']:>8}"
        )


if __name__ == "__main__":
    main()