import axios from 'axios';

export function resolveApiUrl(value, production = false) {
  if (!value?.trim()) return '/api';
  if (value.startsWith('/') && !value.startsWith('//')) return value.replace(/\/$/, '');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('VITE_API_URL must be an HTTP(S) URL without credentials, query or fragment');
  }
  if (production && (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('Production VITE_API_URL must use HTTPS and a deployed host');
  }
  return url.href.replace(/\/$/, '');
}

export function createApiClient({ auth, baseURL, location, adapter }) {
  const api = axios.create({ baseURL, timeout: 15000, adapter, headers: { 'Content-Type': 'application/json' } });
  api.interceptors.request.use(async config => {
    const { data, error } = await auth.getSession();
    if (error) throw error;
    const token = data?.session?.access_token;
    if (!token) throw new Error('Sign in before accessing the dispatch API');
    config.headers.Authorization = `Bearer ${token}`;
    config._sessionToken = token;
    return config;
  });
  api.interceptors.response.use(response => response, async error => {
    if (error.response?.status === 401) {
      const { data } = await auth.getSession();
      // A delayed failure from an earlier session must not sign out a newly signed in user.
      if (data?.session?.access_token === error.config?._sessionToken) {
        await auth.signOut({ scope: 'local' });
        if (location) location.hash = '/login';
      }
    }
    return Promise.reject(error);
  });
  return api;
}
