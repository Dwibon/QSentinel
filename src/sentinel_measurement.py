import numpy as np

from src.states import projective_measure


def measure_sentinels(
    states,
    schedule,
    rng=None
):
    if rng is None:
        rng = np.random.default_rng()

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

    for position, sentinel in schedule.items():

        axis = sentinel["axis"]
        expected_sign = sentinel["sign"]

        state = states[position]

        measured_sign = projective_measure(
            state,
            axis,
            rng
        )

        totals[axis] += 1

        if measured_sign != expected_sign:
            errors[axis] += 1

    fingerprint = {}

    for axis in ["X", "Y", "Z"]:

        if totals[axis] == 0:
            fingerprint[axis] = 0.0
        else:
            fingerprint[axis] = (
                errors[axis] / totals[axis]
            )

    return fingerprint, errors, totals