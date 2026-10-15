import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box } from '@mui/material';
import supabase from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { useAmbulances, useHospitals } from '../hooks/useData';
import { dispatchBroadcast, DISPATCH_EVENTS } from '../services/dispatchBroadcast';
import { EMPLOYEE_KEY, SHIFT_KEY, VEHICLE_KEY, clearDriverShift } from '../services/driverSession';
import MobileFrame from '../components/MobileFrame';
import { mobileVars } from '../theme/mobile';

const MONO = "'IBM Plex Mono', monospace";
const SERIF = "'Newsreader', Georgia, serif";
const RESPOND_SECONDS = 30;
const NIGHT_KEY = 'medicluster.driver.night';

// Mission stages shown to the crew, and the incident status each "next" step writes.
const STEPS = ['Accepted', 'En route', 'On scene', 'Transport', 'Hospital'];
const NEXT = [
  null,
  { label: 'Arrived on scene', status: 'ON_SCENE', at: 'arrived_scene_at' },
  { label: 'Patient loaded · start transport', status: 'TRANSPORTING_TO_HOSPITAL', at: 'transport_started_at' },
  { label: 'Arrived at hospital', status: 'ARRIVED_AT_HOSPITAL', at: 'arrived_hospital_at' },
  { label: 'Handover complete', status: 'RESOLVED', at: 'resolved_at' },
];
const STAGE_STATUS = ['Standby', 'En route', 'On scene', 'Transporting', 'At hospital'];
const PILL_TONE = { Standby: 'g', 'On break': 'y', 'En route': 'r', 'On scene': 'o', Transporting: 'r', 'At hospital': 'ac' };

// ── helpers ───────────────────────────────────────────────────────────────────
function km(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLon = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
const etaMin = (d) => (d == null ? null : Math.max(1, Math.round((d / 40) * 60)));   // ~40 km/h urban average
const hm = (ms) => `${Math.floor(ms / 3_600_000)}h ${String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, '0')}m`;
const clock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
const mapsUrl = (to) => to && `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}&travelmode=driving`;

const btn = (primary) => ({
  height: 52, border: primary ? 0 : '1px solid var(--bd2)', borderRadius: '4px', background: primary ? 'var(--tx)' : 'transparent',
  color: primary ? 'var(--bg)' : 'var(--tx)', font: 'inherit', fontSize: 15, fontWeight: primary ? 500 : 400, cursor: 'pointer',
  '&:disabled': { opacity: 0.5, cursor: 'default' },
});
const eyebrow = { fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', color: 'var(--tx3)', textTransform: 'uppercase' };
const seg = (on) => ({ height: 48, border: 0, background: on ? 'var(--tx)' : 'transparent', color: on ? 'var(--bg)' : 'var(--tx)', font: 'inherit', fontSize: 15, fontWeight: on ? 500 : 400, cursor: 'pointer' });

function Strip({ items }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))`, border: '1px solid var(--bd)', borderRadius: '3px' }}>
      {items.map(([l, v, style], i) => (
        <Box key={l} sx={{ display: 'flex', flexDirection: 'column', gap: '5px', p: '10px 12px', borderRight: i < items.length - 1 ? '1px solid var(--bd)' : 0 }}>
          <Box component="span" sx={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em', color: 'var(--tx3)' }}>{l}</Box>
          <Box component="span" sx={style || { fontFamily: SERIF, fontSize: 24, lineHeight: 1 }}>{v}</Box>
        </Box>
      ))}
    </Box>
  );
}

function MapPanel({ label, route, link, height = 190 }) {
  return (
    <Box sx={{ position: 'relative', height, border: '1px solid var(--bd)', borderRadius: '3px', overflow: 'hidden', backgroundColor: 'var(--sf2)',
      backgroundImage: 'linear-gradient(var(--bd) 1px,transparent 1px),linear-gradient(90deg,var(--bd) 1px,transparent 1px)', backgroundSize: '36px 36px' }}>
      {route ? (
        <>
          <svg width="100%" height="100%" viewBox="0 0 348 210" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }} aria-hidden="true">
            <polyline points="54,170 54,118 150,118 150,64 290,64" fill="none" stroke="var(--ac)" strokeWidth="4" strokeLinejoin="round" />
          </svg>
          <Box component="span" sx={{ position: 'absolute', left: '15.5%', top: '81%', width: 18, height: 18, m: '-9px 0 0 -9px', borderRadius: '50%', background: 'var(--ac)', border: '4px solid var(--sf)', boxShadow: '0 0 0 1px var(--bd2)' }} />
          <Box component="span" sx={{ position: 'absolute', left: '83%', top: '30%', width: 14, height: 14, m: '-7px 0 0 -7px', background: 'var(--r)', border: '2px solid var(--sf)' }} />
        </>
      ) : (
        <>
          <Box sx={{ position: 'absolute', left: '50%', top: '50%', width: 120, height: 120, m: '-60px 0 0 -60px', borderRadius: '50%', border: '1px dashed var(--bd2)' }} />
          <Box component="span" sx={{ position: 'absolute', left: '50%', top: '50%', width: 18, height: 18, m: '-9px 0 0 -9px', borderRadius: '50%', background: 'var(--ac)', border: '4px solid var(--sf)', boxShadow: '0 0 0 1px var(--bd2)' }} />
        </>
      )}
      <Box component="span" sx={{ position: 'absolute', left: 12, top: 10, fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.06em', color: 'var(--tx2)' }}>{label}</Box>
      {link
        ? <Box component="a" href={link} target="_blank" rel="noreferrer" sx={{ position: 'absolute', right: 10, bottom: 8, fontSize: 12, color: 'var(--ac)' }}>Open in Maps</Box>
        : <Box component="span" sx={{ position: 'absolute', right: 10, bottom: 10, fontFamily: MONO, fontSize: 10, color: 'var(--tx3)' }}>MAP</Box>}
    </Box>
  );
}

// ── incoming call ─────────────────────────────────────────────────────────────
function Incoming({ call, seconds, onAccept, onDecline }) {
  return (
    <Box sx={{ flex: 1, overflow: 'auto', mt: { sm: '-48px' }, p: { xs: '40px 24px 34px', sm: '72px 24px 34px' }, display: 'flex', flexDirection: 'column', gap: '22px', background: '#a8231f', color: '#fff' }}
      role="alertdialog" aria-label={`Incoming call: ${call.incident_type}`}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontFamily: MONO, fontSize: 12, letterSpacing: '0.08em' }}>
        <span>INCOMING CALL · {call.id}</span><span>{call.severity}</span>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px', mt: '20px' }}>
        <Box component="span" sx={{ fontFamily: SERIF, fontSize: 52, lineHeight: 1, letterSpacing: '-0.02em' }}>{call.incident_type}</Box>
        <Box component="span" sx={{ fontSize: 18 }}>{call.location_address}</Box>
        {call.distanceKm != null && (
          <Box component="span" sx={{ fontFamily: MONO, fontSize: 14 }}>{call.distanceKm.toFixed(1)} km · ETA {etaMin(call.distanceKm)} min</Box>
        )}
      </Box>
      {call.description && (
        <Box component="p" sx={{ m: 0, py: '14px', borderTop: '1px solid rgba(255,255,255,.35)', borderBottom: '1px solid rgba(255,255,255,.35)', fontSize: 15, lineHeight: 1.5 }}>
          {call.description}
        </Box>
      )}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', mt: 'auto' }} aria-live="polite">
        <Box component="span" sx={{ fontFamily: SERIF, fontSize: 72, lineHeight: 1 }}>0:{String(seconds).padStart(2, '0')}</Box>
        <Box component="span" sx={{ fontSize: 13 }}>to respond before control reassigns</Box>
        <Box sx={{ width: '100%', height: 4, mt: 1, background: 'rgba(255,255,255,.3)' }}>
          <Box sx={{ width: `${(seconds / RESPOND_SECONDS) * 100}%`, height: '100%', background: '#fff', transition: 'width 1s linear' }} />
        </Box>
      </Box>
      <Box component="button" type="button" onClick={onAccept} autoFocus
        sx={{ height: 60, border: 0, borderRadius: '4px', background: '#fff', color: '#a8231f', font: 'inherit', fontSize: 18, fontWeight: 600, cursor: 'pointer' }}>
        Accept call
      </Box>
      <Box component="button" type="button" onClick={onDecline}
        sx={{ height: 48, border: '1px solid rgba(255,255,255,.6)', borderRadius: '4px', background: 'transparent', color: '#fff', font: 'inherit', fontSize: 15, cursor: 'pointer' }}>
        Decline · I’m unavailable
      </Box>
    </Box>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────
export default function DriverApp() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { ambulances } = useAmbulances();
  const { hospitals } = useHospitals();

  const employeeId = localStorage.getItem(EMPLOYEE_KEY) || profile?.full_name || 'Crew';
  const vehicleId = localStorage.getItem(VEHICLE_KEY);
  const [shiftStart] = useState(() => Number(localStorage.getItem(SHIFT_KEY)) || Date.now());
  const unit = ambulances.find((a) => a.id === vehicleId) || ambulances[0] || {};

  const [tab, setTab] = useState('duty');                  // duty | radio | shift
  const [night, setNight] = useState(() => localStorage.getItem(NIGHT_KEY) === '1');
  const [avail, setAvail] = useState(true);
  const [notice, setNotice] = useState('Shift started · location sharing on');
  const [incoming, setIncoming] = useState(null);         // { call, seconds }
  const [mission, setMission] = useState(null);           // the accepted incident
  const [stage, setStage] = useState(1);
  const [hospId, setHospId] = useState(null);
  const [preAlert, setPreAlert] = useState(false);
  const [vitals, setVitals] = useState({ hr: '', bp: '', spo2: '', gcs: '' });
  const [msgs, setMsgs] = useState([]);
  const [draft, setDraft] = useState('');
  const [calls, setCalls] = useState([]);
  const [pos, setPos] = useState(null);
  const [gps, setGps] = useState(() => (navigator.geolocation ? 'starting' : 'off')); // starting | live | off
  const [hold, setHold] = useState(false);
  const [backupSent, setBackupSent] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const holdTimer = useRef();
  const stateRef = useRef({});
  // Latest state for the dispatch listener, which is subscribed once.
  useEffect(() => { stateRef.current = { avail, mission, incoming }; }, [avail, mission, incoming]);

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id); }, []);
  useEffect(() => { localStorage.setItem(NIGHT_KEY, night ? '1' : '0'); }, [night]);

  // Live GPS while on shift.
  useEffect(() => {
    if (!navigator.geolocation) return undefined;
    const id = navigator.geolocation.watchPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setGps('live'); },
      () => setGps('off'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  const here = useMemo(
    () => pos || (unit.latitude != null ? { lat: unit.latitude, lng: unit.longitude } : null),
    [pos, unit.latitude, unit.longitude],
  );

  // New calls from dispatch ring this phone when the crew is available and free.
  useEffect(() => {
    const ring = (inc) => {
      const { avail: a, mission: m, incoming: i } = stateRef.current;
      if (!inc?.id || !inc.incident_type || !a || m || i) return;
      if (inc._isAssignment && inc.ambulance?.id && vehicleId && inc.ambulance.id !== vehicleId) return; // assigned to another unit
      const to = { lat: Number(inc.location_lat), lng: Number(inc.location_lng) };
      setIncoming({ call: { ...inc, to, distanceKm: km(here, to) }, seconds: RESPOND_SECONDS });
      if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
    };
    dispatchBroadcast.on(DISPATCH_EVENTS.INCIDENT_ASSIGNED, ring);
    dispatchBroadcast.on(DISPATCH_EVENTS.SOS_CREATED, ring);
    return () => {
      dispatchBroadcast.off(DISPATCH_EVENTS.INCIDENT_ASSIGNED, ring);
      dispatchBroadcast.off(DISPATCH_EVENTS.SOS_CREATED, ring);
    };
  }, [vehicleId, here]);

  // Response countdown.
  useEffect(() => {
    if (!incoming) return undefined;
    const t = setTimeout(() => {
      if (incoming.seconds <= 1) {
        setNotice(`Missed ${incoming.call.id} · control reassigned it`);
        setIncoming(null);
      } else {
        setIncoming((c) => c && { ...c, seconds: c.seconds - 1 });
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [incoming]);

  const updateIncident = useCallback(async (id, patch) => {
    try { await supabase.from('incidents').update(patch).eq('id', id); } catch { /* demo incidents may not exist server-side */ }
    dispatchBroadcast.send(DISPATCH_EVENTS.INCIDENT_UPDATED, { id, ...patch, ambulance_id: vehicleId });
  }, [vehicleId]);

  const accept = async () => {
    const call = { ...incoming.call, acceptedAt: Date.now() };
    setIncoming(null);
    setMission(call);
    setStage(1);
    setHospId(null);
    setPreAlert(false);
    setBackupSent(false);
    setVitals({ hr: '', bp: '', spo2: '', gcs: '' });
    setNotice(null);
    setTab('duty');
    setMsgs((m) => [...m, { t: `${call.id} accepted · en route`, me: true, at: Date.now() }]);
    await updateIncident(call.id, { status: 'EN_ROUTE_TO_SCENE', assigned_ambulance_id: vehicleId, dispatched_at: new Date().toISOString() });
  };

  const decline = () => {
    setNotice(`Declined ${incoming.call.id} · control notified`);
    dispatchBroadcast.send(DISPATCH_EVENTS.INCIDENT_UPDATED, { id: incoming.call.id, declined_by: vehicleId });
    setIncoming(null);
  };

  const hospRows = useMemo(() => {
    const scene = mission?.to;
    return hospitals.map((h) => ({ ...h, d: km(scene, { lat: h.latitude, lng: h.longitude }) }))
      .sort((a, b) => (a.d ?? 99) - (b.d ?? 99)).slice(0, 3);
  }, [hospitals, mission]);
  const dest = hospRows.find((h) => h.id === hospId) || hospRows.find((h) => (h.available_beds ?? 1) > 0) || hospRows[0];

  const next = async () => {
    const step = NEXT[stage];
    if (!step || !mission) return;
    await updateIncident(mission.id, { status: step.status, [step.at]: new Date().toISOString(), ...(step.status === 'TRANSPORTING_TO_HOSPITAL' && dest ? { assigned_hospital_id: dest.id } : {}) });
    if (step.status === 'RESOLVED') {
      try { await supabase.from('ambulances').update({ status: 'AVAILABLE', assigned_incident_id: null, destination: null }).eq('id', vehicleId); } catch { /* offline demo */ }
      setCalls((c) => [...c, { t: clock(mission.acceptedAt || Date.now()), type: mission.incident_type, loc: mission.location_address, dur: `${Math.max(1, Math.round((Date.now() - (mission.acceptedAt || Date.now())) / 60_000))} m` }]);
      setNotice(`${mission.id} closed · back on standby`);
      setMission(null);
      setStage(1);
      return;
    }
    setStage(stage + 1);
  };

  const sendMsg = (t) => {
    const text = t.trim();
    if (!text) return;
    setMsgs((m) => [...m, { t: text, me: true, at: Date.now() }]);
    setDraft('');
  };

  const startHold = () => {
    if (backupSent) return;
    setHold(true);
    holdTimer.current = setTimeout(() => {
      setHold(false);
      setBackupSent(true);
      const at = here || mission?.to || {};
      dispatchBroadcast.send(DISPATCH_EVENTS.SOS_CREATED, {
        id: `BKP-${Date.now().toString().slice(-5)}`, incident_type: `Backup request · ${unit.call_sign || vehicleId}`, severity: 'CRITICAL',
        status: 'PENDING', is_sos: true, location_lat: at.lat, location_lng: at.lng,
        location_address: mission?.location_address || 'Crew location', description: `${unit.call_sign || vehicleId} requested backup.`,
        created_at: new Date().toISOString(),
      });
      setMsgs((m) => [...m, { t: `${unit.call_sign || vehicleId} BACKUP REQUEST · GPS shared`, me: true, at: Date.now() }]);
    }, 2000);
  };
  const endHold = () => { if (!backupSent) { clearTimeout(holdTimer.current); setHold(false); } };

  const goOffDuty = async () => {
    try { await supabase.from('ambulances').update({ status: 'OFFLINE', assigned_driver_id: null }).eq('id', vehicleId); } catch { /* offline demo */ }
    clearDriverShift();
    await signOut();
    navigate('/driver/login', { replace: true });
  };

  const statusText = mission ? STAGE_STATUS[stage] : avail ? 'Standby' : 'On break';
  const tone = PILL_TONE[statusText];
  const toDest = mission && stage >= 3;
  const target = mission ? (toDest && dest ? { lat: dest.latitude, lng: dest.longitude } : mission.to) : null;
  const dist = mission ? (stage === 2 ? null : km(here, target)) : null;
  const corridor = mission && (stage === 1 || stage === 3);
  const control = [
    { t: 'Shift briefing: units on duty, NH44 slow near Hebbal.', at: shiftStart },
    ...(mission ? [{ t: `${mission.id} assigned. Green corridor requested.`, at: mission.acceptedAt }] : []),
  ];
  const radio = [...control.map((m) => ({ ...m, me: false })), ...msgs].sort((a, b) => a.at - b.at);
  const lastControl = control[control.length - 1];

  if (incoming) {
    return (
      <MobileFrame vars={mobileVars(night)} inverse>
        <Incoming call={incoming.call} seconds={incoming.seconds} onAccept={accept} onDecline={decline} />
      </MobileFrame>
    );
  }

  return (
    <MobileFrame vars={mobileVars(night)}>
      {/* Unit header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', p: '10px 20px 12px', borderBottom: '1px solid var(--bd)' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
          <Box component="span" sx={{ fontWeight: 600, fontSize: 15 }}>{unit.call_sign || vehicleId} · {unit.type || 'ALS'}</Box>
          <Box component="span" sx={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.06em', color: gps === 'live' ? 'var(--g-t)' : 'var(--tx3)' }}>
            ● GPS {gps === 'live' ? 'LIVE' : gps === 'off' ? 'OFF' : '…'} · {unit.vehicle_number || ''}
          </Box>
        </Box>
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', height: 28, px: '10px', borderRadius: '2px', background: `var(--${tone}-s)`,
          color: tone === 'ac' ? 'var(--ac)' : `var(--${tone}-t)`, border: `1px solid var(--${tone})`, fontFamily: MONO, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {statusText}
        </Box>
      </Box>
      {notice && (
        <Box role="status" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', p: '10px 20px', background: 'var(--sf2)', borderBottom: '1px solid var(--bd)', fontSize: 13 }}>
          <span>{notice}</span>
          <Box component="button" type="button" aria-label="Dismiss" onClick={() => setNotice(null)}
            sx={{ width: 44, height: 32, border: 0, background: 'transparent', color: 'var(--tx2)', font: 'inherit', cursor: 'pointer' }}>✕</Box>
        </Box>
      )}

      <Box sx={{ flex: 1, overflow: 'auto', p: '18px 20px 24px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', alignContent: 'start', gap: '20px' }}>
        {/* ── Standby ── */}
        {tab === 'duty' && !mission && (
          <>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <Box component="span" sx={eyebrow}>Status</Box>
              <Box component="span" sx={{ fontFamily: SERIF, fontSize: 44, lineHeight: 1, letterSpacing: '-0.02em' }}>{avail ? 'Standby' : 'On break'}</Box>
              <Box component="span" sx={{ fontSize: 14, color: 'var(--tx2)', lineHeight: 1.45 }}>
                {avail ? 'Ready for dispatch. New calls ring this phone.' : 'Control won’t send new calls until you’re available.'}
              </Box>
            </Box>
            <Box role="radiogroup" aria-label="Availability" sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--bd2)', borderRadius: '4px', overflow: 'hidden' }}>
              <Box component="button" type="button" role="radio" aria-checked={avail} onClick={() => setAvail(true)} sx={seg(avail)}>Available</Box>
              <Box component="button" type="button" role="radio" aria-checked={!avail} onClick={() => setAvail(false)} sx={seg(!avail)}>On break</Box>
            </Box>
            <MapPanel label={here ? `${here.lat.toFixed(4)}, ${here.lng.toFixed(4)}` : 'LOCATING…'} />
            <Strip items={[['ON SHIFT', hm(now - shiftStart)], ['CALLS', String(calls.length)], ['BATTERY', unit.battery_level != null ? `${unit.battery_level}%` : '—']]} />
            <Box component="button" type="button" onClick={() => setTab('radio')}
              sx={{ display: 'flex', flexDirection: 'column', gap: '4px', py: '14px', px: 0, border: 0, borderTop: '1px solid var(--tx)', borderBottom: '1px solid var(--bd)', background: 'transparent', color: 'var(--tx)', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
              <Box component="span" sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', ...eyebrow, letterSpacing: '0.06em' }}>
                <span>Last from control · {clock(lastControl.at)}</span><span>→</span>
              </Box>
              <Box component="span" sx={{ fontSize: 15 }}>{lastControl.t}</Box>
            </Box>
            <Box component="span" sx={{ fontSize: 13, color: 'var(--tx3)', lineHeight: 1.5 }}>Keep this screen open: new calls ring and vibrate this phone.</Box>
          </>
        )}

        {/* ── Mission ── */}
        {tab === 'duty' && mission && (
          <>
            <MapPanel route height={210} link={mapsUrl(target)}
              label={toDest && dest ? `TO ${dest.name.split(/[,-]/)[0].toUpperCase()}` : `TO ${String(mission.location_address || 'SCENE').split(',')[0].toUpperCase()}`} />
            <Strip items={[
              ['ETA', stage === 2 ? 'Arrived' : dist != null ? `${etaMin(dist)} min` : '—'],
              ['DISTANCE', dist != null ? `${dist.toFixed(1)} km` : '—'],
              ['CORRIDOR', corridor ? 'Active' : 'Off', { fontSize: 15, fontWeight: 600, lineHeight: '24px', color: corridor ? 'var(--g-t)' : 'var(--tx3)' }],
            ]} />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Box component="span" sx={{ ...eyebrow, letterSpacing: '0.06em' }}>Mission · {mission.id}</Box>
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', height: 20, px: '7px', border: '1px solid var(--r)', borderRadius: '2px', color: 'var(--r-t)', fontFamily: MONO, fontSize: 10.5 }}>
                  {mission.severity}
                </Box>
              </Box>
              <Box component="span" sx={{ fontFamily: SERIF, fontSize: 28, lineHeight: 1.1, letterSpacing: '-0.01em' }}>
                {toDest && dest ? dest.name : `${mission.incident_type} · ${mission.location_address}`}
              </Box>
              <Box component="span" sx={{ fontSize: 14, color: 'var(--tx2)', lineHeight: 1.45 }}>
                {toDest ? `${mission.incident_type}. ${preAlert ? 'ER has your pre-alert.' : 'No pre-alert sent yet.'}` : mission.description}
              </Box>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: '4px' }} aria-label={`Stage: ${STEPS[stage]}`}>
              {STEPS.map((l, i) => (
                <Box key={l} sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <Box sx={{ height: 5, background: i <= stage ? 'var(--tx)' : 'var(--sf2)' }} />
                  <Box component="span" sx={{ fontSize: 10.5, color: i === stage ? 'var(--tx)' : 'var(--tx3)', fontWeight: i === stage ? 600 : 400 }}>{l}</Box>
                </Box>
              ))}
            </Box>
            <Box component="button" type="button" onClick={next} sx={{ ...btn(true), height: 56, fontSize: 16 }}>{NEXT[stage].label}</Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <Box component="a" href={mission.caller_phone ? `tel:${mission.caller_phone.replace(/\s/g, '')}` : undefined}
                sx={{ ...btn(false), height: 48, fontSize: 14, display: 'grid', placeItems: 'center', textDecoration: 'none', opacity: mission.caller_phone ? 1 : 0.5 }}>
                Call caller
              </Box>
              <Box component="button" type="button" onClick={() => setTab('radio')} sx={{ ...btn(false), height: 48, fontSize: 14 }}>Radio control</Box>
            </Box>

            {stage >= 2 && (
              <>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', pb: 1, borderBottom: '1px solid var(--tx)' }}>
                    <Box component="span" sx={{ fontSize: 14, fontWeight: 600 }}>Patient vitals</Box>
                    <Box component="span" sx={{ fontFamily: MONO, fontSize: 11, color: 'var(--tx3)' }}>TAP TO EDIT</Box>
                  </Box>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {[['hr', 'Heart rate'], ['bp', 'Blood pressure'], ['spo2', 'SpO₂ %'], ['gcs', 'GCS']].map(([k, l]) => {
                      const v = vitals[k];
                      const bad = v !== '' && ((k === 'spo2' && +v < 94) || (k === 'hr' && +v > 110) || (k === 'gcs' && +v < 13));
                      return (
                        <Box key={k} component="label" sx={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <Box component="span" sx={{ fontSize: 12, color: 'var(--tx2)' }}>{l}</Box>
                          <Box component="input" value={v} inputMode={k === 'bp' ? 'text' : 'numeric'}
                            onChange={(e) => setVitals((s) => ({ ...s, [k]: e.target.value }))}
                            sx={{ height: 48, px: '12px', border: `1px solid ${bad ? 'var(--r)' : 'var(--bd2)'}`, borderRadius: '4px', background: bad ? 'var(--r-s)' : 'var(--sf)',
                              color: bad ? 'var(--r-t)' : 'var(--tx)', fontFamily: MONO, fontSize: 18, width: '100%', outline: 'none' }} />
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column' }} role="radiogroup" aria-label="Destination hospital">
                  <Box sx={{ pb: 1, borderBottom: '1px solid var(--tx)', fontSize: 14, fontWeight: 600 }}>Destination hospital</Box>
                  {hospRows.map((h) => {
                    const on = dest?.id === h.id;
                    const full = (h.available_beds ?? 1) <= 0;
                    return (
                      <Box key={h.id} component="button" type="button" role="radio" aria-checked={on} onClick={() => { setHospId(h.id); setPreAlert(false); }}
                        sx={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: 60, py: '10px', border: 0, borderBottom: '1px solid var(--bd)', background: 'transparent', color: 'var(--tx)', font: 'inherit', fontSize: 14, cursor: 'pointer', textAlign: 'left' }}>
                        <Box component="span" sx={{ width: 18, height: 18, flex: 'none', borderRadius: '50%', background: 'var(--sf)', border: on ? '5px solid var(--tx)' : '1.5px solid var(--bd2)' }} />
                        <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                          <span style={{ fontWeight: 500 }}>{h.name}</span>
                          <Box component="span" sx={{ fontSize: 12, color: full ? 'var(--r-t)' : 'var(--tx3)' }}>
                            {full ? 'ER diverting · no beds' : `ER open · ${h.available_beds ?? '—'} beds`}
                          </Box>
                        </Box>
                        <Box component="span" sx={{ fontFamily: MONO, fontSize: 12, ml: 'auto' }}>{h.d != null ? `${h.d.toFixed(1)} km` : ''}</Box>
                      </Box>
                    );
                  })}
                  <Box component="button" type="button" disabled={!dest || preAlert}
                    onClick={() => { setPreAlert(true); updateIncident(mission.id, { assigned_hospital_id: dest.id }); setMsgs((m) => [...m, { t: `Pre-alert to ${dest.name}: ${mission.incident_type}. HR ${vitals.hr || '—'}, BP ${vitals.bp || '—'}, SpO₂ ${vitals.spo2 || '—'}, GCS ${vitals.gcs || '—'}.`, me: true, at: Date.now() }]); }}
                    sx={{ mt: '12px', height: 48, border: preAlert ? '1px solid var(--g)' : '1px solid var(--tx)', borderRadius: '4px', background: preAlert ? 'var(--g-s)' : 'transparent',
                      color: preAlert ? 'var(--g-t)' : 'var(--tx)', font: 'inherit', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                    {preAlert ? 'Pre-alert sent to ER' : 'Send pre-alert to ER'}
                  </Box>
                </Box>
              </>
            )}

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px', p: '14px', border: '1px solid var(--r)', borderRadius: '3px', background: 'var(--r-s)' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'baseline' }}>
                <Box component="span" sx={{ fontWeight: 600, color: 'var(--r-t)' }}>Emergency backup</Box>
                <Box component="span" sx={{ fontFamily: MONO, fontSize: 10, color: 'var(--r-t)' }}>HOLD 2 S</Box>
              </Box>
              <Box component="span" sx={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.5 }}>Sends your GPS position and a backup request to dispatch.</Box>
              <Box component="button" type="button" onMouseDown={startHold} onMouseUp={endHold} onMouseLeave={endHold} onTouchStart={startHold} onTouchEnd={endHold}
                onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && startHold()} onKeyUp={endHold}
                sx={{ position: 'relative', height: 54, border: 0, borderRadius: '4px', background: 'var(--r)', color: '#fff', font: 'inherit', fontSize: 15, fontWeight: 600, letterSpacing: '0.04em', cursor: 'pointer', overflow: 'hidden', userSelect: 'none' }}>
                <Box component="span" sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: hold || backupSent ? '100%' : '0%', background: 'rgba(0,0,0,.25)', transition: hold ? 'width 2s linear' : 'width .2s' }} />
                <Box component="span" sx={{ position: 'relative' }}>{backupSent ? 'BACKUP REQUESTED · DISPATCH NOTIFIED' : hold ? 'HOLD…' : 'HOLD FOR BACKUP'}</Box>
              </Box>
            </Box>
          </>
        )}

        {/* ── Radio ── */}
        {tab === 'radio' && (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', pb: 1, borderBottom: '1px solid var(--tx)' }}>
              <Box component="span" sx={{ fontFamily: SERIF, fontSize: 26 }}>Radio</Box>
              <Box component="span" sx={{ fontFamily: MONO, fontSize: 11, color: 'var(--tx3)' }}>CONTROL ↔ {unit.call_sign || vehicleId}</Box>
            </Box>
            <Box role="log" aria-live="polite" sx={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {radio.map((m, i) => (
                <Box key={i} sx={{ display: 'flex', flexDirection: 'column', alignItems: m.me ? 'flex-end' : 'flex-start', gap: '4px' }}>
                  <Box sx={{ maxWidth: '86%', p: '10px 13px', borderRadius: '4px', background: m.me ? 'var(--tx)' : 'var(--sf)', color: m.me ? 'var(--bg)' : 'var(--tx)',
                    border: m.me ? 0 : '1px solid var(--bd)', fontSize: 14, lineHeight: 1.45 }}>{m.t}</Box>
                  <Box component="span" sx={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--tx3)' }}>{m.me ? 'You' : 'Control'} · {clock(m.at)}</Box>
                </Box>
              ))}
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {['On scene', 'Need 2 more min', 'Patient stable', 'Request police'].map((q) => (
                <Box key={q} component="button" type="button" onClick={() => sendMsg(q)}
                  sx={{ height: 40, px: '14px', border: '1px solid var(--bd2)', borderRadius: '20px', background: 'var(--sf)', color: 'var(--tx)', font: 'inherit', fontSize: 13, cursor: 'pointer' }}>{q}</Box>
              ))}
            </Box>
            <Box component="form" onSubmit={(e) => { e.preventDefault(); sendMsg(draft); }} sx={{ display: 'flex', gap: 1 }}>
              <Box component="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message control" aria-label="Message control"
                sx={{ flex: 1, minWidth: 0, height: 48, px: '14px', border: '1px solid var(--bd2)', borderRadius: '4px', background: 'var(--sf)', color: 'var(--tx)', fontSize: 15, font: 'inherit', outline: 'none' }} />
              <Box component="button" type="submit" sx={{ ...btn(true), height: 48, px: '16px' }}>Send</Box>
            </Box>
          </>
        )}

        {/* ── Shift ── */}
        {tab === 'shift' && (
          <>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <Box component="span" sx={eyebrow}>On duty since {clock(shiftStart)}</Box>
              <Box component="span" sx={{ fontFamily: SERIF, fontSize: 44, lineHeight: 1, letterSpacing: '-0.02em' }}>{hm(now - shiftStart)}</Box>
              <Box component="span" sx={{ fontSize: 14, color: 'var(--tx2)' }}>{employeeId} · {unit.call_sign || vehicleId}</Box>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', pb: 1, borderBottom: '1px solid var(--tx)' }}>
                <Box component="span" sx={{ fontSize: 14, fontWeight: 600 }}>Calls this shift</Box>
                <Box component="span" sx={{ fontFamily: MONO, fontSize: 11, color: 'var(--tx3)' }}>{calls.length}</Box>
              </Box>
              {calls.length === 0 && <Box component="span" sx={{ py: '14px', fontSize: 13, color: 'var(--tx3)' }}>No calls yet this shift.</Box>}
              {calls.map((c, i) => (
                <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '48px minmax(0,1fr) auto', gap: '12px', alignItems: 'baseline', minHeight: 52, py: '12px', borderBottom: '1px solid var(--bd)' }}>
                  <Box component="span" sx={{ fontFamily: MONO, fontSize: 12, color: 'var(--tx3)' }}>{c.t}</Box>
                  <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontWeight: 500 }}>{c.type}</span>
                    <Box component="span" sx={{ fontSize: 12, color: 'var(--tx3)' }}>{c.loc}</Box>
                  </Box>
                  <Box component="span" sx={{ fontFamily: MONO, fontSize: 12 }}>{c.dur}</Box>
                </Box>
              ))}
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 56, borderBottom: '1px solid var(--bd)' }}>
              <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontWeight: 500 }}>Night display</span>
                <Box component="span" sx={{ fontSize: 12, color: 'var(--tx3)' }}>Dark screen for driving after dusk</Box>
              </Box>
              <Box component="button" type="button" role="switch" aria-checked={night} aria-label="Night display" onClick={() => setNight((n) => !n)}
                sx={{ position: 'relative', width: 52, height: 32, flex: 'none', border: 0, borderRadius: '16px', background: night ? 'var(--g)' : 'var(--bd2)', cursor: 'pointer', p: 0 }}>
                <Box component="span" sx={{ position: 'absolute', top: 3, left: night ? 23 : 3, width: 26, height: 26, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
              </Box>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box component="button" type="button" onClick={goOffDuty} disabled={!!mission}
                sx={{ ...btn(false), borderColor: 'var(--tx)', fontWeight: 500 }}>{mission ? 'Finish the mission to go off duty' : 'Go off duty'}</Box>
            </Box>
          </>
        )}
      </Box>

      {/* Tabs */}
      <Box component="nav" aria-label="Driver" sx={{ height: { xs: 64, sm: 84 }, flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderTop: '1px solid var(--bd)', background: 'var(--sf)', pb: { sm: '20px' } }}>
        {[['Duty', 'duty'], ['Radio', 'radio'], ['Shift', 'shift']].map(([l, k]) => {
          const on = tab === k;
          return (
            <Box key={k} component="button" type="button" onClick={() => setTab(k)} aria-current={on ? 'page' : undefined}
              sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', border: 0, background: 'transparent',
                color: on ? 'var(--tx)' : 'var(--tx3)', font: 'inherit', fontSize: 12, fontWeight: on ? 600 : 400, cursor: 'pointer' }}>
              <Box component="span" sx={{ width: 18, height: 3, background: on ? 'var(--tx)' : 'transparent' }} />{l}
            </Box>
          );
        })}
      </Box>
    </MobileFrame>
  );
}
