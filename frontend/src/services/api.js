export const API_URL = import.meta.env.PROD ? '' : 'http://localhost:5000';

// Read a cookie by name (the csrf-token cookie is non-httpOnly, so JS can access it)
function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

export const fetchWithAuth = async (endpoint, options = {}) => {
  const csrfToken = getCookie('csrf-token');

  const headers = {
    'Content-Type': 'application/json',
    ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
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
