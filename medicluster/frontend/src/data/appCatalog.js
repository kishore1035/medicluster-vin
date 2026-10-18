function dispatchBase(value, allowLocal) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/\.+$/, '');
    const local = host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || host === '0.0.0.0' || host.startsWith('127.');
    if (url.username || url.password || !['https:', 'http:'].includes(url.protocol)) return null;
    if (local ? !allowLocal : url.protocol !== 'https:') return null;
    return url.origin + url.pathname.replace(/\/+$/, '');
  } catch { return null; }
}

/** Only real destinations are offered; an unset production service never points to localhost. */
export function buildAppCatalog(dispatchUrl, { allowLocal = false } = {}) {
  const base = dispatchBase(dispatchUrl, allowLocal);
  return [
    { id: 'medicluster', name: 'MediCluster', description: 'For doctors, nurses and analysts.', webHref: '/login', android: false, icon: 'clinic' },
    { id: 'patient', name: 'Patient app', description: 'Your medicines, readings and CliniQ.', webHref: '/app', android: true, icon: 'heart' },
    { id: 'dispatch', name: 'Dispatch center', description: 'Coordinate incidents and ambulances.', webHref: base ? `${base}/#/login` : null, android: false, icon: 'route' },
    { id: 'crew', name: 'Crew app', description: 'Your shift, calls and patient handovers.', webHref: base ? `${base}/#/driver/login` : null, android: true, icon: 'ambulance' },
  ];
}
