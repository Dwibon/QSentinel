const API_BASE = "http://127.0.0.1:8000";

const defaults = {
  message: "QSentinel demo message",
  key: 12345,
  n_qubits: 500,
  sentinel_fraction: 0.2,
  noise_p: 0.03,
  attack_strength: 1,
  baseline: { X: 0.02, Y: 0.02, Z: 0.02 },
  alpha: 0.01
};

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`);
  return data;
}

export function health() { return request("/health"); }

export function simulate(attack = "none", overrides = {}) {
  return request("/simulate", {
    method: "POST",
    body: JSON.stringify({ ...defaults, attack, ...overrides })
  });
}

export function replay() {
  return request("/simulate/replay", { method: "POST", body: JSON.stringify(defaults) });
}

export function unauthorized() {
  return request("/simulate/unauthorized", { method: "POST", body: JSON.stringify(defaults) });
}

export function forgery() {
  return request("/simulate/forgery", { method: "POST", body: JSON.stringify(defaults) });
}

export function impersonation() {
  return request("/simulate/impersonation", { method: "POST", body: JSON.stringify(defaults) });
}

export function getEvents() { return request("/events?limit=30"); }
