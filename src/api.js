const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export async function api(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Request failed.');
  return data;
}
