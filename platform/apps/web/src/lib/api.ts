// platform/apps/web/src/lib/api.ts
import { getToken } from './auth';

const API_BASE = '/api';

export interface User {
  id: string;
  email: string;
  name: string | null;
  locale: string;
  googleId: string;
  isAdmin: boolean;
}

export interface App {
  id: string;
  name: string;
  subdomain: string;
  status: 'CREATING' | 'RUNNING' | 'STOPPED' | 'ERROR';
  errorReason: string | null;
  deployedAt: string | null;
  createdAt: string;
}

export interface AiAccessStatus {
  hasOwnKey: boolean;
  requestStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
}

export interface AiAccessRequest {
  id: string;
  status: string;
  user: { id: string; email: string; name: string | null };
  createdAt: string;
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
  getLoginUrl: () => `${API_BASE}/auth/google`,
  getMe: () => apiFetch<User>('/users/me'),
  updateMe: (data: { name?: string; locale?: string }) =>
    apiFetch<User>('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),

  // Apps
  getApps: () => apiFetch<App[]>('/apps'),
  getApp: (id: string) => apiFetch<App>(`/apps/${id}`),
  createApp: (data: { name: string; subdomain: string }) =>
    apiFetch<App>('/apps', { method: 'POST', body: JSON.stringify(data) }),
  stopApp: (id: string) => apiFetch<App>(`/apps/${id}/stop`, { method: 'PATCH' }),

  // AI Access
  getAiStatus: () => apiFetch<AiAccessStatus>('/ai-access/status'),
  setAiKey: (apiKey: string) =>
    apiFetch('/ai-access/key', { method: 'POST', body: JSON.stringify({ apiKey }) }),
  removeAiKey: () => apiFetch('/ai-access/key', { method: 'DELETE' }),
  requestAiAccess: () => apiFetch('/ai-access/request', { method: 'POST' }),

  // Admin
  getPendingRequests: () => apiFetch<AiAccessRequest[]>('/admin/ai-access/requests'),
  approveRequest: (id: string) =>
    apiFetch(`/admin/ai-access/requests/${id}/approve`, { method: 'POST' }),
  rejectRequest: (id: string) =>
    apiFetch(`/admin/ai-access/requests/${id}/reject`, { method: 'POST' }),
  setPlatformKey: (apiKey: string) =>
    apiFetch('/admin/ai-access/platform-key', { method: 'POST', body: JSON.stringify({ apiKey }) }),
};
