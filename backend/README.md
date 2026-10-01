# QSentinel Backend

FastAPI backend for the QSentinel quantum digital signature prototype.

## Install

From the QSentinel project root:

```bash
pip install -r backend/requirements.txt
```

## Run

From the QSentinel project root:

```bash
uvicorn backend.app:app --reload
```

API:
- http://127.0.0.1:8000/health
- http://127.0.0.1:8000/docs

## Main endpoints

### Health
```http
GET /health
```

### Create signature
```http
POST /signature/create
```

Example body:
```json
{
  "message": "Hello Quantum World",
  "n_qubits": 500,
  "sentinel_fraction": 0.2,
  "key": 12345,
  "nonce": "nonce-001",
  "message_id": "message-001"
}
```

### Verify signature
```http
POST /signature/verify
```

### Run attack simulation
```http
POST /simulate
```

Example:
```json
{
  "attack": "X",
  "attack_strength": 1.0,
  "noise_p": 0.03,
  "n_qubits": 500,
  "sentinel_fraction": 0.2,
  "key": 12345
}
```

Supported attack values:
- none
- X
- Y
- Z
- intercept_resend
- z_measure_resend

### Replay demo
```http
POST /simulate/replay
```

### Unauthorized verifier demo
```http
POST /simulate/unauthorized
```

### Security events
```http
GET /events
GET /events?limit=50
```

## Important prototype note

The `key` is currently an integer prototype stand-in for QKD-derived secret key material. This backend does not implement a QKD protocol.
