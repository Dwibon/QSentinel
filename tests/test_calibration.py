from experiments.calibration import calibrate


def test_calibration():

    baseline = calibrate(
        sessions=3,
        n_qubits=1000,
        sentinel_fraction=0.2,
        noise_p=0.03
    )

    for axis in ["X", "Y", "Z"]:

        assert 0.0 < baseline[axis] < 0.06