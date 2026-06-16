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
