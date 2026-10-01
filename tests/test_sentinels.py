from src.sentinels import generate_sentinel_schedule
from src.sentinels import (
    derive_sentinel_schedule,
)


def test_derived_schedule_is_reproducible():
    schedule_a = derive_sentinel_schedule(
        n_qubits=1000,
        sentinel_fraction=0.2,
        key=12345,
    )

    schedule_b = derive_sentinel_schedule(
        n_qubits=1000,
        sentinel_fraction=0.2,
        key=12345,
    )

    assert schedule_a == schedule_b


def test_different_keys_produce_different_schedule():
    schedule_a = derive_sentinel_schedule(
        n_qubits=1000,
        sentinel_fraction=0.2,
        key=12345,
    )

    schedule_b = derive_sentinel_schedule(
        n_qubits=1000,
        sentinel_fraction=0.2,
        key=54321,
    )

    assert schedule_a != schedule_b


def test_derived_schedule_has_correct_size():
    schedule = derive_sentinel_schedule(
        n_qubits=1000,
        sentinel_fraction=0.2,
        key=12345,
    )

    assert len(schedule) == 200


def test_derived_schedule_contains_valid_sentinels():
    schedule = derive_sentinel_schedule(
        n_qubits=1000,
        sentinel_fraction=0.2,
        key=12345,
    )

    for position, sentinel in schedule.items():
        assert 0 <= position < 1000
        assert sentinel["axis"] in {
            "X",
            "Y",
            "Z",
        }
        assert sentinel["sign"] in {
            1,
            -1,
        }


def test_schedule():

    schedule = generate_sentinel_schedule(
        n_qubits=100,
        sentinel_fraction=0.2
    )

    assert len(schedule) == 20

    assert len(set(schedule.keys())) == 20

    for position, sentinel in schedule.items():

        assert 0 <= position < 100

        assert sentinel["axis"] in ["X", "Y", "Z"]

        assert sentinel["sign"] in [1, -1]