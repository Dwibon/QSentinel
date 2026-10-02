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

export function health() {
  return request("/health");
}

export function createSignature(payload) {
  return request("/signature/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function verifySignature(payload) {
  return request("/signature/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function replaySignature(payload) {
  return request("/signature/replay", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function simulate(payload) {
  return request("/simulate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function simulateReplay(payload) {
  return request("/simulate/replay", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function simulateUnauthorized(payload) {
  return request("/simulate/unauthorized", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getEvents(limit = 1000) {
  return request(`/events?limit=${limit}`);
}

export function simulateForgery(payload) {
  return request("/simulate/forgery", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function simulateImpersonation(payload) {
  return request("/simulate/impersonation", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}