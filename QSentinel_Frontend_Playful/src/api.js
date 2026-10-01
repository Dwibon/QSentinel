const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!response.ok) {
    const detail = data?.detail || data?.message || text || `HTTP ${response.status}`;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return data;
}

export const api = {
  health: () => request('/health'),
  events: () => request('/events'),
  simulate: (payload) => request('/simulate', { method: 'POST', body: JSON.stringify(payload) }),
  replay: (payload = {}) => request('/simulate/replay', { method: 'POST', body: JSON.stringify(payload) }),
  unauthorized: (payload = {}) => request('/simulate/unauthorized', { method: 'POST', body: JSON.stringify(payload) }),
  createSignature: (payload) => request('/signature/create', { method: 'POST', body: JSON.stringify(payload) }),
  verifySignature: (payload) => request('/signature/verify', { method: 'POST', body: JSON.stringify(payload) }),
};

export { API_BASE };
