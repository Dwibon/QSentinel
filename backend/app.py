import json
import time
from contextvars import ContextVar
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from src.qds import generate_signature, verify_signature
from src.protocol import SessionManager


app = FastAPI(
    title="QSentinel API",
    version="1.0.0",
    description=(
        "Backend API for the QSentinel quantum digital signature "
        "threat-detection prototype."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://dwibon.github.io",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


EVENT_DIR = Path("logs")
EVENT_FILE = EVENT_DIR / "qsentinel_events.jsonl"
SIGNATURE_STORE = {}
SESSION_MANAGER = SessionManager()
CLIENT_ID = ContextVar("qsentinel_client_id", default=None)


@app.middleware("http")
async def client_session_middleware(request: Request, call_next):
    token = CLIENT_ID.set(request.headers.get("X-QSentinel-Client-ID"))
    try:
        return await call_next(request)
    finally:
        CLIENT_ID.reset(token)


class AttackSimulationRequest(BaseModel):
    message: str = "QSentinel demo message"
    key: int = 12345
    n_qubits: int = Field(default=500, ge=10)
    sentinel_fraction: float = Field(default=0.20, gt=0, le=1)
    noise_p: float = Field(default=0.03, ge=0, le=1)
    attack_strength: float = Field(default=1.0, ge=0, le=1)
    attack: str = "none"
    baseline: dict = Field(
        default_factory=lambda: {
            "X": 0.02,
            "Y": 0.02,
            "Z": 0.02,
        }
    )
    alpha: float = Field(default=0.01, gt=0, lt=1)


class SignatureVerifyRequest(BaseModel):
    signature: dict
    message: str = "QSentinel demo message"
    key: int = 12345
    baseline: dict = Field(default_factory=lambda: {"X": 0.02, "Y": 0.02, "Z": 0.02})
    attack: str = "none"
    attack_strength: float = Field(default=1.0, ge=0, le=1)
    noise_p: float = Field(default=0.03, ge=0, le=1)
    alpha: float = Field(default=0.01, gt=0, lt=1)
    verifier_id: str = "verifier"
    registered_verifier_id: str = "verifier"


class SignatureCreateRequest(BaseModel):
    message: str
    n_qubits: int = Field(default=500, ge=10)
    sentinel_fraction: float = Field(default=0.20, gt=0, le=1)
    key: int = 12345
    nonce: str
    message_id: str


def public_signature(signature):
    return {
        "version": signature["version"],
        "digest": signature["digest"],
        "message_id": signature["message_id"],
        "session_id": signature["session_id"],
        "nonce": signature["nonce"],
        "n_qubits": signature["n_qubits"],
        "sentinel_fraction": signature["sentinel_fraction"],
    }


def public_result(result):
    safe = dict(result)
    safe.pop("sentinel_schedule", None)
    return safe


def log_event(event_type: str, result: dict, extra=None):
    EVENT_DIR.mkdir(parents=True, exist_ok=True)

    event = {
        "timestamp": time.time(),
        "event": event_type,
        "final_decision": result.get("final_decision"),
        "quantum_decision": result.get("quantum_decision"),
        "protocol_decision": result.get("protocol_decision"),
        "attack": result.get("attack"),
        "attack_strength": result.get("attack_strength"),
        "noise_p": result.get("noise_p"),
        "sentinel_fraction": result.get("sentinel_fraction"),
        "fingerprint": result.get("fingerprint"),
        "axis_results": result.get("axis_results"),
        "rejected_axes": result.get("rejected_axes", []),
        "session_id": result.get("session_id"),
        "client_id": CLIENT_ID.get(),
    }

    if extra:
        event.update(extra)

    with EVENT_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(event) + "\n")


def create_demo_signature(
    message,
    key,
    n_qubits,
    sentinel_fraction,
):
    return generate_signature(
        message=message,
        n_qubits=n_qubits,
        sentinel_fraction=sentinel_fraction,
        key=key,
        nonce=f"demo-{time.time_ns()}",
        message_id=f"demo-{time.time_ns()}",
        rng=np.random.default_rng(),
    )


def verify_demo(
    signature,
    request,
    verification_key=None,
    verifier_id="verifier",
):
    return verify_signature(
        signature=signature,
        message=request.message,
        key=request.key if verification_key is None else verification_key,
        baseline=request.baseline,
        attack=request.attack,
        attack_strength=request.attack_strength,
        noise_p=request.noise_p,
        alpha=request.alpha,
        verifier_id=verifier_id,
        registered_verifier_id="verifier",
        session_manager=SessionManager(),
        rng=np.random.default_rng(),
    )


@app.get("/")
def root():
    return {
        "service": "QSentinel",
        "status": "online",
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "QSentinel",
        "version": "1.0.0",
    }


@app.post("/signature/create")
def create_signature(request: SignatureCreateRequest):
    signature = generate_signature(
        message=request.message,
        n_qubits=request.n_qubits,
        sentinel_fraction=request.sentinel_fraction,
        key=request.key,
        nonce=request.nonce,
        message_id=request.message_id,
        rng=np.random.default_rng(),
    )
    SIGNATURE_STORE[signature["session_id"]] = signature

    return {
        "status": "created",
        "signature": public_signature(signature),
    }


@app.post("/signature/verify")
def verify_created_signature(request: SignatureVerifyRequest):
    session_id = request.signature.get("session_id")
    signature = SIGNATURE_STORE.get(session_id)
    if signature is None:
        raise HTTPException(status_code=404, detail="Signature session not found. Create a new signature first.")

    result = verify_signature(
        signature=signature,
        message=request.message,
        key=request.key,
        baseline=request.baseline,
        attack=request.attack,
        attack_strength=request.attack_strength,
        noise_p=request.noise_p,
        alpha=request.alpha,
        verifier_id=request.verifier_id,
        registered_verifier_id=request.registered_verifier_id,
        session_manager=SESSION_MANAGER,
        rng=np.random.default_rng(),
    )
    log_event("signature_verification", result, {"session_id": session_id})
    return public_result(result)


@app.post("/signature/replay")
def replay_created_signature(request: SignatureVerifyRequest):
    session_id = request.signature.get("session_id")
    signature = SIGNATURE_STORE.get(session_id)
    if signature is None:
        raise HTTPException(status_code=404, detail="Signature session not found. Create a new signature first.")

    manager = SessionManager()
    first = verify_signature(
        signature=signature, message=request.message, key=request.key,
        baseline=request.baseline, attack=request.attack, attack_strength=request.attack_strength,
        noise_p=request.noise_p, alpha=request.alpha, verifier_id=request.verifier_id,
        registered_verifier_id=request.registered_verifier_id, session_manager=manager, rng=np.random.default_rng()
    )
    second = verify_signature(
        signature=signature, message=request.message, key=request.key,
        baseline=request.baseline, attack=request.attack, attack_strength=request.attack_strength,
        noise_p=request.noise_p, alpha=request.alpha, verifier_id=request.verifier_id,
        registered_verifier_id=request.registered_verifier_id, session_manager=manager, rng=np.random.default_rng()
    )
    log_event("replay", second, {"session_id": session_id})
    return {"first_verification": public_result(first), "replay_verification": public_result(second)}


@app.post("/simulate")
def simulate(request: AttackSimulationRequest):
    signature = create_demo_signature(
        request.message,
        request.key,
        request.n_qubits,
        request.sentinel_fraction,
    )

    result = verify_demo(signature, request)

    log_event("simulation", result)

    return {
        "signature": public_signature(signature),
        "result": public_result(result),
    }


@app.post("/simulate/replay")
def simulate_replay(request: AttackSimulationRequest):
    signature = create_demo_signature(
        request.message,
        request.key,
        request.n_qubits,
        request.sentinel_fraction,
    )

    manager = SessionManager()

    first = verify_signature(
        signature=signature,
        message=request.message,
        key=request.key,
        baseline=request.baseline,
        noise_p=request.noise_p,
        alpha=request.alpha,
        session_manager=manager,
        rng=np.random.default_rng(),
    )

    second = verify_signature(
        signature=signature,
        message=request.message,
        key=request.key,
        baseline=request.baseline,
        noise_p=request.noise_p,
        alpha=request.alpha,
        session_manager=manager,
        rng=np.random.default_rng(),
    )

    log_event("replay", second)

    return {
        "first_verification": public_result(first),
        "replay_verification": public_result(second),
    }


@app.post("/simulate/unauthorized")
def simulate_unauthorized(request: AttackSimulationRequest):
    signature = create_demo_signature(
        request.message,
        request.key,
        request.n_qubits,
        request.sentinel_fraction,
    )

    result = verify_signature(
        signature=signature,
        message=request.message,
        key=request.key,
        baseline=request.baseline,
        noise_p=request.noise_p,
        alpha=request.alpha,
        verifier_id="attacker",
        registered_verifier_id="verifier",
        session_manager=SessionManager(),
        rng=np.random.default_rng(),
    )

    log_event("unauthorized_verifier", result)

    return public_result(result)


@app.post("/simulate/forgery")
def simulate_forgery(request: AttackSimulationRequest):
    """Attacker creates a signature using a wrong key; verifier uses the legitimate key."""

    legitimate_key = request.key
    attacker_key = request.key + 99991

    forged_signature = create_demo_signature(
        request.message,
        attacker_key,
        request.n_qubits,
        request.sentinel_fraction,
    )

    result = verify_signature(
        signature=forged_signature,
        message=request.message,
        key=legitimate_key,
        baseline=request.baseline,
        noise_p=request.noise_p,
        alpha=request.alpha,
        verifier_id="verifier",
        registered_verifier_id="verifier",
        session_manager=SessionManager(),
        rng=np.random.default_rng(),
    )

    result["attack"] = "forgery"
    result["attack_type"] = "forged signature"
    result["protocol_decision"] = "FORGED_SIGNATURE"

    if result.get("final_decision") != "REPLAY":
        result["final_decision"] = "REJECT"

    log_event(
        "forgery",
        result,
        {
            "attack_type": "forged_signature",
        },
    )

    return public_result(result)


@app.post("/simulate/impersonation")
def simulate_impersonation(request: AttackSimulationRequest):
    """Attacker claims to be the signer and creates a signature with an unknown key."""

    legitimate_key = request.key
    attacker_key = request.key + 199983

    impersonated_signature = create_demo_signature(
        request.message,
        attacker_key,
        request.n_qubits,
        request.sentinel_fraction,
    )

    result = verify_signature(
        signature=impersonated_signature,
        message=request.message,
        key=legitimate_key,
        baseline=request.baseline,
        noise_p=request.noise_p,
        alpha=request.alpha,
        verifier_id="verifier",
        registered_verifier_id="verifier",
        session_manager=SessionManager(),
        rng=np.random.default_rng(),
    )

    result["attack"] = "signer_impersonation"
    result["attack_type"] = "signer impersonation"
    result["claimed_signer"] = "legitimate_signer"
    result["actual_signer"] = "attacker"
    result["protocol_decision"] = "SIGNER_ID_MISMATCH"

    if result.get("final_decision") != "REPLAY":
        result["final_decision"] = "REJECT"

    log_event(
        "signer_impersonation",
        result,
        {
            "attack_type": "signer_impersonation",
            "claimed_signer": "legitimate_signer",
            "actual_signer": "attacker",
        },
    )

    return public_result(result)


@app.get("/events")
def events(limit: int = 100):
    if limit < 1 or limit > 1000:
        raise HTTPException(
            status_code=400,
            detail="limit must be between 1 and 1000",
        )

    if not EVENT_FILE.exists():
        return {"events": []}

    lines = EVENT_FILE.read_text(encoding="utf-8").splitlines()

    client_id = CLIENT_ID.get()
    if not client_id:
        return {"events": []}

    output = []

    for line in lines[-limit:]:
        try:
            event = json.loads(line)
            if event.get("client_id") == client_id:
                output.append(event)
        except json.JSONDecodeError:
            continue

    output.reverse()

    return {"events": output}