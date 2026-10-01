import numpy as np

from src.qsentinel_pipeline import (
    run_qsentinel,
)
from src.protocol import SessionManager

def test_pipeline_runs():
    result = run_qsentinel(
        n_qubits=100,
        sentinel_fraction=0.2,
        key=12345,
        attack="none",
        noise_p=0.03,
        rng=np.random.default_rng(42),
    )

    assert "fingerprint" in result
    assert "errors" in result
    assert "totals" in result
    assert "sentinel_schedule" in result
    assert "pauli_schedule" in result
    assert "bell_outcomes" in result


def test_pipeline_sentinel_count():
    result = run_qsentinel(
        n_qubits=100,
        sentinel_fraction=0.2,
        key=12345,
        attack="none",
        noise_p=0.03,
        rng=np.random.default_rng(42),
    )

    total_sentinels = sum(
        result["totals"].values()
    )

    assert total_sentinels == 20


def test_pipeline_fingerprint_axes():
    result = run_qsentinel(
        n_qubits=100,
        sentinel_fraction=0.2,
        key=12345,
        attack="X",
        noise_p=0.0,
        rng=np.random.default_rng(42),
    )

    fingerprint = result["fingerprint"]

    assert set(fingerprint.keys()) == {
        "X",
        "Y",
        "Z",
    }


def test_pipeline_attack_detects_x_pattern():
    result = run_qsentinel(
        n_qubits=3000,
        sentinel_fraction=1.0,
        key=12345,
        attack="X",
        noise_p=0.0,
        rng=np.random.default_rng(42),
    )

    fingerprint = result["fingerprint"]

    assert fingerprint["X"] < 0.1
    assert fingerprint["Y"] > 0.9
    assert fingerprint["Z"] > 0.9


def test_pipeline_is_reproducible():
    result_a = run_qsentinel(
        n_qubits=100,
        sentinel_fraction=0.2,
        key=12345,
        attack="none",
        noise_p=0.03,
        rng=np.random.default_rng(42),
    )

    result_b = run_qsentinel(
        n_qubits=100,
        sentinel_fraction=0.2,
        key=12345,
        attack="none",
        noise_p=0.03,
        rng=np.random.default_rng(42),
    )

    assert result_a["fingerprint"] == result_b["fingerprint"]
    assert result_a["errors"] == result_b["errors"]
    assert result_a["totals"] == result_b["totals"]

def test_integrated_accept():
    result = run_qsentinel(
        n_qubits=3000,
        sentinel_fraction=0.2,
        key=12345,
        attack="none",
        noise_p=0.03,
        baseline={
            "X": 0.02,
            "Y": 0.02,
            "Z": 0.02,
        },
        rng=np.random.default_rng(42),
    )

    assert result["protocol_decision"] == "VALID"
    assert result["final_decision"] in {
        "ACCEPT",
        "INCONCLUSIVE",
    }


def test_integrated_x_attack():
    result = run_qsentinel(
        n_qubits=3000,
        sentinel_fraction=0.2,
        key=12345,
        attack="X",
        noise_p=0.03,
        baseline={
            "X": 0.02,
            "Y": 0.02,
            "Z": 0.02,
        },
        rng=np.random.default_rng(42),
    )

    assert result["protocol_decision"] == "VALID"
    assert result["quantum_decision"] == "REJECT"
    assert result["final_decision"] == "QUANTUM_REJECT"


def test_replay_is_rejected():
    manager = SessionManager()

    nonce = manager.generate_nonce()

    first = run_qsentinel(
        n_qubits=100,
        sentinel_fraction=0.2,
        key=12345,
        nonce=nonce,
        session_manager=manager,
        rng=np.random.default_rng(42),
    )

    second = run_qsentinel(
        n_qubits=100,
        sentinel_fraction=0.2,
        key=12345,
        nonce=nonce,
        session_manager=manager,
        rng=np.random.default_rng(42),
    )

    assert first["final_decision"] != "REPLAY"
    assert second["final_decision"] == "REPLAY"


def test_unauthorized_verifier():
    result = run_qsentinel(
        n_qubits=100,
        sentinel_fraction=0.2,
        key=12345,
        verifier_id="attacker",
        registered_verifier_id="verifier-A",
        rng=np.random.default_rng(42),
    )

    assert result["protocol_decision"] == "UNAUTHORIZED"
    assert result["final_decision"] == "UNAUTHORIZED"