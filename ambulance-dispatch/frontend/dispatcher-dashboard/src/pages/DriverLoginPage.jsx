import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Box } from '@mui/material';
import supabase from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { useAmbulances } from '../hooks/useData';
import MobileFrame from '../components/MobileFrame';
import { mobileVars } from '../theme/mobile';
import { EMPLOYEE_KEY, SHIFT_KEY, VEHICLE_KEY, startDriverShift } from '../services/driverSession';

const MONO = "'IBM Plex Mono', monospace";
const SERIF = "'Newsreader', Georgia, serif";

const field = {
  height: 52, px: '14px', border: '1px solid var(--bd2)', borderRadius: '4px', background: 'var(--sf)',
  color: 'var(--tx)', fontFamily: MONO, fontSize: 16, outline: 'none', width: '100%',
  '&:focus': { borderColor: 'var(--tx)' },
};

// The edge function answers non-2xx with { error }; surface that message.
async function errorMessage(err) {
  try {
    const body = await err?.context?.json?.();
    if (body?.error) return body.error;
  } catch { /* not JSON */ }
  return 'Couldn’t reach dispatch. Check your connection and try again.';
}

/** Ambulance-crew sign-in: employee ID, 4-digit PIN and vehicle. */
export default function DriverLoginPage() {
  const { isAuthenticated } = useAuth();
  const { ambulances } = useAmbulances();
  const navigate = useNavigate();
  const [emp, setEmp] = useState(() => localStorage.getItem(EMPLOYEE_KEY) || '');
  const [pin, setPin] = useState('');
  const [veh, setVeh] = useState(() => localStorage.getItem(VEHICLE_KEY) || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (isAuthenticated && localStorage.getItem(SHIFT_KEY)) return <Navigate to="/driver" replace />;

  const vehicles = ambulances.filter((a) => !['MAINTENANCE', 'OFFLINE'].includes(a.status)).slice(0, 6);
  const vehicleId = veh || vehicles[0]?.id || '';
  const ready = /^[A-Za-z]{2,6}-\d{2,8}$/.test(emp.trim()) && /^\d{4}$/.test(pin) && vehicleId;

  const startShift = async (e) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError('');
    const { data, error: fnErr } = await supabase.functions.invoke('driver-login', {
      body: { employeeId: emp.trim(), pin, vehicleId },
    });
    if (fnErr || !data?.access_token) {
      setError(fnErr ? await errorMessage(fnErr) : 'Sign-in failed. Try again.');
      setPin('');
      setBusy(false);
      return;
    }
    const { error: sessErr } = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
    if (sessErr) {
      setError('Sign-in failed. Try again.');
      setBusy(false);
      return;
    }
    startDriverShift(data.employeeId, vehicleId);
    navigate('/driver', { replace: true });
  };

  return (
    <MobileFrame vars={mobileVars(false)}>
      <Box component="form" onSubmit={startShift} noValidate
        sx={{ flex: 1, overflow: 'auto', p: '28px 24px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <rect x="1" y="1" width="6" height="6" fill="var(--tx)" /><rect x="11" y="1" width="6" height="6" fill="var(--tx)" />
            <rect x="1" y="11" width="6" height="6" fill="var(--tx)" /><rect x="11" y="11" width="6" height="6" fill="var(--o)" />
          </svg>
          <Box component="span" sx={{ fontFamily: SERIF, fontSize: 21, letterSpacing: '-0.01em' }}>MediCluster</Box>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: '36px' }}>
          <Box component="h1" sx={{ m: 0, fontFamily: SERIF, fontWeight: 400, fontSize: 38, lineHeight: 1.05, letterSpacing: '-0.02em' }}>Sign in</Box>
          <Box component="span" sx={{ fontSize: 15, color: 'var(--tx2)', lineHeight: 1.45 }}>Duty status, calls and radio for your unit.</Box>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <Box component="label" sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <Box component="span" sx={{ fontSize: 13, color: 'var(--tx2)' }}>Employee ID</Box>
            <Box component="input" value={emp} onChange={(e) => setEmp(e.target.value.toUpperCase())} placeholder="EMS-2041"
              autoComplete="username" autoCapitalize="characters" sx={field} />
          </Box>
          <Box component="label" sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <Box component="span" sx={{ fontSize: 13, color: 'var(--tx2)' }}>4-digit PIN</Box>
            <Box component="input" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              type="password" inputMode="numeric" maxLength={4} placeholder="••••" autoComplete="current-password"
              sx={{ ...field, fontSize: 20, letterSpacing: '0.3em' }} />
          </Box>
          <Box role="radiogroup" aria-label="Vehicle" sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <Box component="span" sx={{ fontSize: 13, color: 'var(--tx2)' }}>Vehicle</Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--bd2)', borderRadius: '4px', overflow: 'hidden' }}>
              {vehicles.map((v, i) => {
                const on = v.id === vehicleId;
                return (
                  <Box key={v.id} component="button" type="button" role="radio" aria-checked={on} onClick={() => setVeh(v.id)}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: '12px', minHeight: 56, px: '14px', border: 0,
                      borderTop: i ? '1px solid var(--bd)' : 0, background: on ? 'var(--sf)' : 'transparent',
                      color: 'var(--tx)', font: 'inherit', fontSize: 14, cursor: 'pointer', textAlign: 'left',
                    }}>
                    <Box component="span" sx={{ width: 18, height: 18, flex: 'none', borderRadius: '50%', background: 'var(--sf)',
                      border: on ? '5px solid var(--tx)' : '1.5px solid var(--bd2)' }} />
                    <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontWeight: 500 }}>{v.call_sign} · {v.type}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--tx3)' }}>{v.vehicle_number}</span>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>

          {error && <Box role="alert" sx={{ fontSize: 13, color: 'var(--r-t)' }}>{error}</Box>}

          <Box component="button" type="submit" disabled={!ready || busy}
            sx={{ height: 52, border: 0, borderRadius: '4px', background: 'var(--tx)', color: 'var(--bg)', font: 'inherit', fontSize: 16,
              fontWeight: 500, cursor: 'pointer', '&:disabled': { opacity: 0.5, cursor: 'default' } }}>
            {busy ? 'Signing in…' : 'Start shift'}
          </Box>
          <Box component="span" sx={{ fontSize: 13, color: 'var(--tx3)', lineHeight: 1.5 }}>
            Location sharing with dispatch turns on when your shift starts and stops when you go off duty.
          </Box>
        </Box>
        <Box component="span" sx={{ mt: 3, fontSize: 13, color: 'var(--tx3)' }}>Dispatcher? Use the web app.</Box>
      </Box>
    </MobileFrame>
  );
}
