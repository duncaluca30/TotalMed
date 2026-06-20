export const API_URL = import.meta.env.PROD ? '' : 'http://localhost:5000';

// In-memory CSRF token — set from login/register/2FA response body.
// This avoids relying on document.cookie which fails in cross-origin setups.
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
    const error = new Error(data?.error || response.statusText);
    error.response = response;
    error.data = data;
    throw error;
  }

  return data;
};

// Upload a file via multipart/form-data. We must NOT set Content-Type ourselves —
// the browser adds it with the correct multipart boundary. CSRF + auth cookie
// still apply.
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

// Download a file (GET, CSRF-exempt) and trigger a browser save dialog. Falls
// back to the Content-Disposition filename when none is supplied.
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
