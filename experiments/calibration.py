import numpy as np

from src.sentinels import generate_sentinel_schedule
from src.payload import generate_payload
from src.attacks import apply_attack
from src.noise import depolarizing_channel
from src.sentinel_measurement import measure_sentinels
from src.detector import estimate_baseline


def calibrate(
    sessions=20,
    n_qubits=10000,
    sentinel_fraction=0.2,
    noise_p=0.03
):
    total_errors = {
        "X": 0,
        "Y": 0,
        "Z": 0
    }

    total_samples = {
        "X": 0,
        "Y": 0,
        "Z": 0
    }

    for session in range(sessions):

        rng = np.random.default_rng(session)

        schedule = generate_sentinel_schedule(
            n_qubits,
            sentinel_fraction,
            rng
        )

        states = generate_payload(
            n_qubits,
            schedule,
            rng
        )

        noisy_states = []

        for state in states:

            noisy_state = depolarizing_channel(
                state,
                noise_p,
                rng
            )

            noisy_states.append(noisy_state)

        _, errors, totals = measure_sentinels(
            noisy_states,
            schedule,
            rng
        )

        for axis in ["X", "Y", "Z"]:

            total_errors[axis] += errors[axis]
            total_samples[axis] += totals[axis]

    calibration_results = {
        axis: (
            total_errors[axis],
            total_samples[axis]
        )
        for axis in ["X", "Y", "Z"]
    }

    return estimate_baseline(calibration_results)


def main():

    baseline = calibrate()

    print("\nQSentinel Honest-Channel Calibration")
    print("=" * 45)

    for axis in ["X", "Y", "Z"]:

        print(
            f"{axis}-axis baseline: "
            f"{baseline[axis]:.5f}"
        )


if __name__ == "__main__":
    main()