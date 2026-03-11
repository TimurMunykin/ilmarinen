import { getToken } from './auth';

const API_BASE = '/api';

export interface User {
  id: string;
  email: string;
  name: string | null;
  locale: string;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  getLoginUrl: () => `${API_BASE}/auth/login`,
  getMe: () => apiFetch<User>('/users/me'),
  updateMe: (data: { name?: string; locale?: string }) =>
    apiFetch<User>('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
};
