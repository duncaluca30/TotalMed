export const API_URL = import.meta.env.PROD ? '' : 'http://localhost:5000';

let _csrfToken = null;

export function setCsrfToken(token) {
  _csrfToken = token;
}

export function clearCsrfToken() {
  _csrfToken = null;
}

export const fetchWithAuth = async (endpoint, options = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...(_csrfToken && { 'X-CSRF-Token': _csrfToken }),
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : null;

  if (!response.ok) {

    const detail = Array.isArray(data?.details) && data.details[0]?.message;
    const error = new Error(detail || data?.error || response.statusText);
    error.response = response;
    error.data = data;
    throw error;
  }

  return data;
};

export const uploadFile = async (endpoint, formData, options = {}) => {
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    credentials: 'include',
    headers: { ...(_csrfToken && { 'X-CSRF-Token': _csrfToken }), ...options.headers },
    body: formData,
  });

  const data = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : null;

  if (!response.ok) {
    const error = new Error(data?.error || response.statusText);
    error.data = data;
    throw error;
  }
  return data;
};

export const downloadFile = async (endpoint, fallbackName = 'download') => {
  const response = await fetch(`${API_URL}${endpoint}`, { credentials: 'include' });
  if (!response.ok) {
    let message = response.statusText;
    try { message = (await response.json())?.error || message; } catch { /* not json */ }
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
