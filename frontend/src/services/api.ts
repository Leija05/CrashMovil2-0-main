const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

type FetchOptions = {
  method?: string;
  body?: any;
  token?: string | null;
};

export async function apiRequest(path: string, options: FetchOptions = {}) {
  const { method = 'GET', body, token } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config: RequestInit = { method, headers };
  if (body) {
    config.body = JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}/api${path}`, config);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || data.message || 'Error en la solicitud');
  }
  return data;
}

// Auth
export const authAPI = {
  register: (name: string, email: string, password: string) =>
    apiRequest('/auth/register', { method: 'POST', body: { name, email, password } }),
  login: (email: string, password: string) =>
    apiRequest('/auth/login', { method: 'POST', body: { email, password } }),
  me: (token: string) =>
    apiRequest('/auth/me', { token }),
  refresh: (refreshToken: string) =>
    apiRequest('/auth/refresh', { method: 'POST', body: { refresh_token: refreshToken } }),
};

// Profile
export const profileAPI = {
  get: (token: string) =>
    apiRequest('/profile', { token }),
  update: (token: string, data: any) =>
    apiRequest('/profile', { method: 'PUT', body: data, token }),
};

// Contacts
export const contactsAPI = {
  list: (token: string) =>
    apiRequest('/contacts', { token }),
  add: (token: string, data: { name: string; phone: string; relationship?: string }) =>
    apiRequest('/contacts', { method: 'POST', body: data, token }),
  delete: (token: string, contactId: string) =>
    apiRequest(`/contacts/${contactId}`, { method: 'DELETE', token }),
};

// Impacts
export const impactsAPI = {
  list: (token: string) =>
    apiRequest('/impacts', { token }),
  get: (token: string, id: string) =>
    apiRequest(`/impacts/${id}`, { token }),
  create: (token: string, data: any) =>
    apiRequest('/impacts', { method: 'POST', body: data, token }),
};

// Settings
export const settingsAPI = {
  get: (token: string) =>
    apiRequest('/settings', { token }),
  update: (token: string, data: any) =>
    apiRequest('/settings', { method: 'PUT', body: data, token }),
};

// Telemetry
export const telemetryAPI = {
  send: (token: string, data: any) =>
    apiRequest('/telemetry', { method: 'POST', body: data, token }),
};
