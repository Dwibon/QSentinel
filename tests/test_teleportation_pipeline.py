import numpy as np

from src.teleportation_pipeline import (
    sentinel_trial,
)


def test_honest_z_sentinel():
    rng = np.random.default_rng(10)

    result = sentinel_trial(
        axis="Z",
        sign=1,
        attack="none",
        noise_p=0.0,
        rng=rng,
    )

    assert result["error"] is False


def test_honest_x_sentinel():
    rng = np.random.default_rng(11)

    result = sentinel_trial(
        axis="X",
        sign=1,
        attack="none",
        noise_p=0.0,
        rng=rng,
    )

    assert result["error"] is False


def test_honest_y_sentinel():
    rng = np.random.default_rng(12)

    result = sentinel_trial(
        axis="Y",
        sign=1,
        attack="none",
        noise_p=0.0,
        rng=rng,
    )

    assert result["error"] is False


def test_x_attack_on_z_sentinel():
    rng = np.random.default_rng(20)

    result = sentinel_trial(
        axis="Z",
        sign=1,
        attack="X",
        noise_p=0.0,
        rng=rng,
    )

    assert result["error"] is True


def test_y_attack_on_z_sentinel():
    rng = np.random.default_rng(21)

    result = sentinel_trial(
        axis="Z",
        sign=1,
        attack="Y",
        noise_p=0.0,
        rng=rng,
    )

    assert result["error"] is True


def test_z_attack_preserves_z_sentinel():
    rng = np.random.default_rng(22)

    result = sentinel_trial(
        axis="Z",
        sign=1,
        attack="Z",
        noise_p=0.0,
        rng=rng,
    )

    assert result["error"] is False