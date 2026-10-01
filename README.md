# QSentinel — Quantum-Inspired Cyber Threat Detection for Digital Signature Security

<div align="center">



A non-ML statistical threat-detection framework for teleportation-based Quantum Digital Signatures (QDS).

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue?logo=python)](https://www.python.org/) [![FastAPI](https://img.shields.io/badge/API-FastAPI-009688?logo=fastapi)](https://fastapi.tiangolo.com/) [![React](https://img.shields.io/badge/Frontend-React-61DAFB?logo=react)](https://react.dev/) [![Tests](https://img.shields.io/badge/tests-78%20passed-success)](https://github.com/Dwibon/QSentinel)

**Theme:** Blockchain and Cybersecurity  
**Problem Statement ID:** 26141  
**Team ID:** 135012  
**Team:** OK Computer

</div>

---

## Overview

**QSentinel** is a simulation-based, non-machine-learning security layer for teleportation-based Quantum Digital Signature (QDS).

Instead of relying on a single aggregate error rate, QSentinel uses secret **Pauli-eigenstate sentinel states** to obtain an axis-resolved error fingerprint:

\[
(e_X,e_Y,e_Z)
\]

The fingerprint is calibrated against the expected honest-channel noise floor and evaluated using statistical hypothesis testing. QSentinel then combines this quantum evidence with protocol-level checks such as session freshness, replay protection, and verifier authorization.

> **Scope:** QSentinel is a simulation and prototype system. Its statistical detection results are conditional on the stated channel, attack, calibration, and experimental assumptions. It is **not a formal quantum-security proof**.

## Why QSentinel?

A conventional single-QBER measurement can indicate that something changed in a quantum channel, but it does not directly describe how the error is distributed across the Pauli axes.

QSentinel measures three axis-specific error rates:

- **eX** — error observed using X-basis sentinels
- **eY** — error observed using Y-basis sentinels
- **eZ** — error observed using Z-basis sentinels

Different attack mechanisms produce different fingerprints:

| Condition | Typical fingerprint |
|---|---|
| Honest channel | Low, approximately balanced noise |
| X-Pauli | eY and eZ increase strongly |
| Y-Pauli | eX and eZ increase strongly |
| Z-Pauli | eX and eY increase strongly |
| Intercept-resend | Errors distributed across axes |
| Z-measure-resend | Strong X/Y disturbance with relatively lower Z disturbance |

The detector therefore uses the shape of the error fingerprint rather than only asking whether the total error is large.

# System Architecture

```text
Teleportation-based QDS
          |
          v
QKD-derived Pauli twirl + secret sentinel schedule
          |
          v
X / Y / Z projective sentinel measurements
          |
          v
(eX, eY, eZ) + Bell-stabilizer statistics
          |
          +-------------------------+
          |                         |
          v                         v
Honest-channel calibration    Protocol-level checks
          |                   nonce / session / auth
          +------------+------------+
                       |
                       v
              Statistical detector
                       |
              ACCEPT / INCONCLUSIVE / REJECT
```

# Core Detection Method

## 1. Secret sentinel schedule

QSentinel derives a session-bound sentinel schedule using HMAC-SHA256. The schedule depends on both the secret key and session identifier, so the same key produces different sentinel schedules across sessions.

## 2. Pauli-eigenstate sentinels

The detector uses eigenstates of X, Y and Z. For an axis a:

\[
e_a = \frac{\text{incorrect measurements on axis }a}{\text{sentinels measured on axis }a}
\]

The resulting vector is the **axis-resolved error fingerprint**.

## 3. Honest-channel calibration

The detector estimates an honest-channel baseline:

\[
\theta_X,\theta_Y,\theta_Z
\]

These baselines represent the expected error floor of the simulated channel.

## 4. Statistical decision

The implementation uses an exact one-sided binomial test, a configurable significance level \(\alpha\), and Wilson confidence bounds.

| Decision | Meaning |
|---|---|
| **ACCEPT** | No statistically significant evidence of an attack |
| **INCONCLUSIVE** | Evidence is insufficient for a confident decision |
| **REJECT** | Sufficient evidence of anomalous quantum/protocol behavior |

# Threat Model

### Quantum/channel attacks

- X-Pauli attack
- Y-Pauli attack
- Z-Pauli attack
- Intercept-resend
- Z-measure-resend
- Partial-strength attacks
- Depolarizing/noisy channels

### Protocol-level threats

- Replay
- Unauthorized verification
- Wrong-key verification / forgery simulation
- Session-freshness violations
- Verifier authorization failures

The system separates quantum evidence from protocol evidence rather than attempting to classify every threat using the quantum fingerprint alone.

# Teleportation-based QDS

The prototype includes an explicit teleportation pipeline:

1. State preparation
2. Bell-state generation
3. Bell measurement
4. Classical Bell outcomes
5. Pauli correction
6. Sentinel insertion and measurement
7. Signature generation
8. Signature verification
9. Statistical threat detection

Bell-stabilizer statistics are also available as supporting quantum evidence.

# Experimental Results

## Basic fingerprint experiment

Without channel noise, the expected qualitative fingerprints were:

| Attack | eX | eY | eZ |
|---|---:|---:|---:|
| None | 0 | 0 | 0 |
| X-Pauli | 0 | 1 | 1 |
| Y-Pauli | 1 | 0 | 1 |
| Z-Pauli | 1 | 1 | 0 |
| Intercept-resend | ≈ 1/3 | ≈ 1/3 | ≈ 1/3 |
| Z-measure-resend | ≈ 1/2 | ≈ 1/2 | ≈ 0 |

With simulated depolarizing noise p=0.03, the same structure remained visible while the honest-channel baseline moved away from zero.

## Full attack detection

Final quantitative evaluation: 100 trials per condition, 5,000 qubits per trial, 20% sentinel fraction, α=0.01, simulated noise p=0.03.

| Condition | Observed detection |
|---|---:|
| X-Pauli | 100/100 |
| Y-Pauli | 100/100 |
| Z-Pauli | 100/100 |
| Intercept-resend | 100/100 |
| Z-measure-resend | 100/100 |

A 100/100 observed detection rate is not a mathematical guarantee; the two-sided 95% Clopper–Pearson lower bound for 100/100 is approximately 96.38%.

## Honest-channel validation

A separate 10,000-trial honest-channel experiment produced:

```text
Trials:             10,000
ACCEPT:              9,728
INCONCLUSIVE:          271
REJECT:                  1

Observed ACCEPT rate:       97.28%
Observed INCONCLUSIVE rate:  2.71%
Observed REJECT rate:         0.01%
```

The observed false rejection rate was 1/10,000. This is an observed experimental rate, not a theoretical false-positive guarantee.

## Partial attack power

| Attack strength | X | Y | Z | Intercept | Z-measure |
|---:|---:|---:|---:|---:|---:|
| 0.01 | 2% | 0% | 0% | 0% | 0% |
| 0.02 | 19% | 14% | 19% | 0% | 0% |
| 0.05 | 91% | 90% | 93% | 15% | 43% |
| 0.10 | 100% | 100% | 100% | 93% | 95% |
| 0.20 | 100% | 100% | 100% | 100% | 100% |

These are empirical results from 100 trials per condition.

## Noise drift

With a baseline calibrated around 0.02, the detector remained operational as simulated channel noise increased, although inconclusive decisions increased. At p=0.04:

```text
ACCEPT:       79/100
INCONCLUSIVE: 20/100
REJECT:        1/100
```

## Wrong-key forgery simulation

Across 100 trials:

```text
Mean eX ≈ 0.4985
Mean eY ≈ 0.5069
Mean eZ ≈ 0.5020

Accepted:     0/100
Inconclusive: 0/100
Rejected:   100/100
```

This represents wrong-key verification / forged-signature simulation. It is not a complete proof of signer-impersonation security.

# Why the Detector Is Non-ML

QSentinel intentionally avoids machine-learning classification. The detector is based on:

- quantum-state preparation,
- projective measurements,
- empirical error rates,
- channel calibration,
- exact binomial hypothesis testing,
- confidence bounds,
- deterministic protocol rules.

# Repository Structure

```text
QSentinel/
├── src/
│   ├── states.py
│   ├── attacks.py
│   ├── sentinels.py
│   ├── sentinel_measurement.py
│   ├── payload.py
│   ├── noise.py
│   ├── detector.py
│   ├── teleportation.py
│   ├── teleportation_pipeline.py
│   ├── twirl.py
│   ├── stabilizers.py
│   ├── protocol.py
│   ├── qsentinel_pipeline.py
│   └── qds.py
├── experiments/
├── backend/
├── QSentinel_Frontend_Animated/
├── tests/
├── requirements.txt
└── README.md
```

# Quick Start

## Backend

```bash
git clone https://github.com/Dwibon/QSentinel.git
cd QSentinel
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.app:app --reload
```

Local API: `http://127.0.0.1:8000`

## Frontend

```bash
cd QSentinel_Frontend_Animated
npm install
npm run dev
```

Local frontend: `http://localhost:5173`

# Running Tests

```bash
source .venv/bin/activate
python -m pytest tests/
```

Current test status:

```text
78 passed
```

# Live Prototype

- Frontend: https://dwibon.github.io/QSentinel/
- Verification interface: https://dwibon.github.io/QSentinel/verify
- Backend API: https://qsentinel-api-oryt.onrender.com
- Repository: https://github.com/Dwibon/QSentinel

# API

| Endpoint | Method | Purpose |
|---|---|---|
| `/` | GET | Service information |
| `/health` | GET | Health check |
| `/signature/create` | POST | Create a QDS signature |
| `/signature/verify` | POST | Verify a signature |
| `/signature/replay` | POST | Test replay handling |
| `/simulate` | POST | Run attack/channel simulation |
| `/simulate/replay` | POST | Simulate replay |
| `/simulate/unauthorized` | POST | Simulate unauthorized verification |
| `/simulate/forgery` | POST | Run forgery simulation |
| `/simulate/impersonation` | POST | Run impersonation simulation |
| `/events` | POST | Record security events |

# Security and Protocol Design

QSentinel uses multiple layers:

### Quantum layer
Measures the axis-resolved sentinel fingerprint \((e_X,e_Y,e_Z)\).

### Statistical layer
Tests whether observed errors are consistent with the calibrated honest-channel baseline.

### Protocol layer
Checks session freshness, replay state, verifier identity/authorization, and signature/session consistency.

# Limitations

### Simulation scope
Current results come from simulated quantum channels and attacks, not physical quantum hardware.

### Statistical rather than formal security guarantees
The detector provides statistical evidence under specified assumptions. It is not a composable security proof for a complete QDS protocol.

### Attack coverage
The current implementation evaluates a defined set of attack models. An attacker outside these models may produce a different or ambiguous fingerprint.

### Identifiability limits
For a general Bloch-map transformation T, sentinel measurements provide axis information related to the diagonal terms:

\[
e_a = \frac{1-T_{aa}}{2}
\]

Different channels can therefore have the same diagonal behavior and be indistinguishable using only these three sentinel error rates.

### Calibration dependence
A detector calibrated to an honest noise floor can become less decisive if the physical channel drifts significantly. This is why QSentinel supports an **INCONCLUSIVE** outcome instead of forcing every observation into ACCEPT or REJECT.

### Forgery interpretation
Wrong-key experiments demonstrate detection of the tested forged-signature condition; they do not establish a complete security bound against all forms of impersonation or forgery.

# Design Positioning

QSentinel does not claim that individual ingredients such as decoy/trap states, Pauli twirling, hypothesis testing, or teleportation are individually new.

The intended contribution is the integrated system-level methodology:

1. Session-bound secret Pauli-eigenstate sentinels
2. Axis-resolved error fingerprints
3. Honest-channel statistical calibration
4. Exact statistical decision rules
5. Teleportation-aware verification
6. Quantum evidence combined with protocol-level evidence
7. Evaluation across multiple attack classes
8. A working end-to-end software prototype and verification interface

# Team — OK Computer

| Member |
|---|
| **Tanisha Deka** |
| **Dwibon Bhargab Deka** |
| **Barnil Mahanta** |
| **Nayan Nirban Dewri** |
| **Arpan Goswami** |
| **Swornima Dey** |

## Competition Details

| Field | Details |
|---|---|
| Team Name | **OK Computer** |
| Team ID | **135012** |
| Problem Statement ID | **26141** |
| Problem Statement | **Quantum-Inspired Cyber Threat Detection for Digital Signature Security** |
| Theme | **Blockchain and Cybersecurity** |
| Project | **QSentinel** |

# Documentation and References

The repository is accompanied by detailed technical documentation and SIH presentation materials covering the system architecture, mathematical model, threat model, implementation, experiments, and limitations.

Key research areas include:

- Quantum digital signatures
- Teleportation-based quantum communication
- Quantum authentication and trap/decoy-state techniques
- Pauli operations and Pauli twirling
- Quantum channel characterization
- Statistical hypothesis testing
- Exact binomial tests
- Wilson confidence intervals
- Quantum adversarial/channel attack models

# Future Work

- Validation on actual quantum hardware
- Broader quantum-channel models
- More sophisticated correlated/adaptive attacks
- Formal security analysis
- Adaptive calibration and drift handling
- Larger-scale statistical power studies
- Integration with a complete QDS protocol implementation
- Hardware-backed verifier authentication
- Additional quantum observables beyond the three Pauli axes

# Acknowledgements

QSentinel was developed as a prototype for **Smart India Hackathon 2026**, under the **Blockchain and Cybersecurity** theme.

# Project Status

**Prototype status: Functional**

The current implementation includes:

- Teleportation simulation
- QDS signature generation and verification
- Session-bound secret sentinel schedules
- X/Y/Z sentinel measurements
- Statistical threat detection
- Multiple attack simulations
- Replay and authorization checks
- Forgery and impersonation simulations
- FastAPI backend
- React verification interface
- Threat Lab
- Automated test suite
- Public deployment

---

<div align="center">

**QSentinel · Team OK Computer · SIH 2026**

*Statistical evidence for quantum threats — without machine learning.*

</div>
