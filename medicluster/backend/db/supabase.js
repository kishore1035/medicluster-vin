function unavailable(message = 'Supabase is unavailable. Check backend configuration and install the MediCluster SQL migrations.') {
  const error = new Error(message);
  error.status = 503;
  error.statusCode = 503;
  return error;
}

function getConfig() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceRoleKey) throw unavailable('Configure SUPABASE_URL and backend-only SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.');
  let parsed;
  try { parsed = new URL(url); } catch { throw unavailable('SUPABASE_URL must be a valid Supabase project URL.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (!(parsed.protocol === 'https:' || parsed.protocol === 'http:' && local) || parsed.pathname !== '/' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw unavailable('SUPABASE_URL must be a valid Supabase project URL.');
  }
  let publicKey = /^sb_publishable_/i.test(serviceRoleKey) || /^(anon|publishable)(?:$|[-_])/i.test(serviceRoleKey);
  if (serviceRoleKey.split('.').length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(serviceRoleKey.split('.')[1], 'base64url').toString('utf8'));
      publicKey ||= payload.role !== 'service_role';
    } catch { publicKey = true; }
  }
  if (publicKey) throw unavailable('SUPABASE_SERVICE_ROLE_KEY requires a backend service-role or secret key; public keys are not supported.');
  return { url, serviceRoleKey };
}

async function request(path, options = {}) {
  const { url, serviceRoleKey } = getConfig();
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) throw unavailable('Invalid Supabase API path.');
  const headers = new Headers(options.headers);
  headers.set('apikey', serviceRoleKey);
  if (!serviceRoleKey.startsWith('sb_secret_')) headers.set('authorization', `Bearer ${serviceRoleKey}`);
  else headers.delete('authorization');
  const { timeoutMs = 15_000, signal: suppliedSignal, ...fetchOptions } = options;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = suppliedSignal ? AbortSignal.any([suppliedSignal, timeoutSignal]) : timeoutSignal;
  try { return await fetch(`${url}${path}`, { ...fetchOptions, headers, signal, redirect: 'error' }); }
  catch { throw unavailable(); }
}

async function rpc(name, args = {}) {
  const response = await request(`/rest/v1/rpc/${encodeURIComponent(name)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args),
  });
  let data;
  try { data = await response.json(); } catch { throw unavailable(); }
  if (!response.ok) {
    if (data?.code === '23505') {
      const error = new Error('A record with this identity already exists.');
      error.code = 11000;
      error.status = 409;
      throw error;
    }
    throw unavailable();
  }
  return data;
}

module.exports = { getConfig, request, rpc, unavailable };
