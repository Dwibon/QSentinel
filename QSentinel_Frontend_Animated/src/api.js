const API_BASE = "https://qsentinel-api-oryt.onrender.com";

function getClientId() {
  const storageKey = "qsentinel_client_id";
  let clientId = localStorage.getItem(storageKey);

  if (!clientId) {
    clientId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    localStorage.setItem(storageKey, clientId);
  }

  return clientId;
}

export const defaults = {
  message: "QSentinel demo message",
  key: 12345,
  n_qubits: 500,
  sentinel_fraction: 0.2,
  noise_p: 0.03,
  attack_strength: 1,
  baseline: { X: 0.02, Y: 0.02, Z: 0.02 },
  alpha: 0.01,
};

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;

  let response;

  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-QSentinel-Client-ID": getClientId(),
        ...(options.headers || {}),
      },
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(`API connection failed: ${error.message}`);
  }

  const text = await response.text();

  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text };
    }
  }

  if (!response.ok) {
    const detail =
      data?.detail ||
      data?.message ||
      `HTTP ${response.status} ${response.statusText}`;

    throw new Error(`${detail} [${response.status} ${path}]`);
  }

  return data;
}

export const health = () => request("/health");

export function simulate(attack = "none", overrides = {}) {
  return request("/simulate", {
    method: "POST",
    body: JSON.stringify({
      ...defaults,
      ...overrides,
      attack,
    }),
  });
}

export function replay() {
  return request("/simulate/replay", {
    method: "POST",
    body: JSON.stringify(defaults),
  });
}

export function unauthorized() {
  return request("/simulate/unauthorized", {
    method: "POST",
    body: JSON.stringify(defaults),
  });
}

export function createSignature(values = {}) {
  const nonce = values.nonce || `ui-${Date.now()}`;
  const messageId =
    values.message_id ||
    `ui-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return request("/signature/create", {
    method: "POST",
    body: JSON.stringify({
      message: values.message ?? defaults.message,
      key: Number(values.key ?? defaults.key),
      n_qubits: Number(values.n_qubits ?? defaults.n_qubits),
      sentinel_fraction: Number(
        values.sentinel_fraction ?? defaults.sentinel_fraction
      ),
      nonce,
      message_id: messageId,
    }),
  });
}

export function verifySignature(values = {}) {
  return request("/signature/verify", {
    method: "POST",
    body: JSON.stringify({
      signature: values.signature,
      message: values.message ?? defaults.message,
      key: Number(values.key ?? defaults.key),
      baseline: values.baseline ?? defaults.baseline,
      attack: values.attack ?? "none",
      attack_strength: Number(
        values.attack_strength ?? defaults.attack_strength
      ),
      noise_p: Number(values.noise_p ?? defaults.noise_p),
      alpha: Number(values.alpha ?? defaults.alpha),
      verifier_id: values.verifier_id ?? "verifier",
      registered_verifier_id:
        values.registered_verifier_id ?? "verifier",
    }),
  });
}

export function replaySignature(values = {}) {
  return request("/signature/replay", {
    method: "POST",
    body: JSON.stringify({
      signature: values.signature,
      message: values.message ?? defaults.message,
      key: Number(values.key ?? defaults.key),
      baseline: values.baseline ?? defaults.baseline,
      attack: values.attack ?? "none",
      attack_strength: Number(
        values.attack_strength ?? defaults.attack_strength
      ),
      noise_p: Number(values.noise_p ?? defaults.noise_p),
      alpha: Number(values.alpha ?? defaults.alpha),
      verifier_id: values.verifier_id ?? "verifier",
      registered_verifier_id:
        values.registered_verifier_id ?? "verifier",
    }),
  });
}

export function forgery() {
  return request("/simulate/forgery", {
    method: "POST",
    body: JSON.stringify(defaults),
  });
}

export function impersonation() {
  return request("/simulate/impersonation", {
    method: "POST",
    body: JSON.stringify(defaults),
  });
}

export function getEvents(limit = 1000) {
  return request(`/events?limit=${limit}`);
}