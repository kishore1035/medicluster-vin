import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import { T, SANS, MONO, SERIF, btnSx, monoLabelSx } from '../theme/tokens';

const DEMO_ACCOUNTS = [
  {
    label: 'Dispatcher / CAD Operator',
    email: 'dispatcher@cad.emergency.in',
    role: 'DISPATCHER',
    desc: 'Full Command Center, AI dispatching, live fleet overview',
  },
  {
    label: 'Driver: Alpha-1 (ALS)',
    email: 'driver.alpha1@cad.emergency.in',
    role: 'DRIVER',
    desc: 'Locked to Alpha-1 vehicle · Mission status & turn-by-turn HUD',
  },
  {
    label: 'Driver: Charlie-3 (ALS)',
    email: 'driver.charlie3@cad.emergency.in',
    role: 'DRIVER',
    desc: 'Locked to Charlie-3 vehicle · Patient vitals & hospital selector',
  },
];

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('Emergency@123');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const { signInWithEmail } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/';

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const res = await signInWithEmail(email.trim(), password);
      console.log('[LoginPage] Sign in successful:', res);

      // Determine appropriate redirect destination
      if (email.includes('driver') || res.user?.user_metadata?.role === 'DRIVER') {
        navigate('/driver', { replace: true });
      } else {
        navigate(from === '/login' ? '/' : from, { replace: true });
      }
    } catch (err) {
      console.error('[LoginPage] Authentication failed:', err);
      setErrorMsg(err.message || 'Invalid email or password. Check credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectDemo = (demo) => {
    setEmail(demo.email);
    setPassword('Emergency@123');
    setErrorMsg(null);
  };

  const fieldSx = {
    height: 44, px: '12px', width: '100%', border: `1px solid ${T.bd2}`, borderRadius: '3px',
    background: T.sf, color: T.tx, font: 'inherit', fontSize: 14, outline: 'none',
    '&:focus': { borderColor: T.tx, boxShadow: `inset 0 0 0 0.5px ${T.tx}` },
  };
  const linkSx = { color: T.ac, textDecoration: 'underline', textUnderlineOffset: '2px', background: 'none', border: 0, p: 0, font: 'inherit', cursor: 'pointer', '&:hover': { color: T.tx } };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, background: T.bg, color: T.tx, fontFamily: SANS }}>
      {/* ── Brand panel ── */}
      <Box component="aside" sx={{ display: { xs: 'none', lg: 'flex' }, flexDirection: 'column', justifyContent: 'space-between', p: '56px', background: T.tx, color: '#ecebe6' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true">
            <rect x="1" y="1" width="6" height="6" fill="#ecebe6" /><rect x="11" y="1" width="6" height="6" fill="#ecebe6" />
            <rect x="1" y="11" width="6" height="6" fill="#ecebe6" /><rect x="11" y="11" width="6" height="6" fill="#e0703f" />
          </svg>
          <Typography sx={{ fontFamily: SERIF, fontSize: 24 }}>MediCluster</Typography>
          <Typography sx={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', color: '#8a8c8e', pl: '12px', borderLeft: '1px solid #45484d' }}>DISPATCH CENTER</Typography>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          <Typography sx={{ fontFamily: SERIF, fontSize: 44, lineHeight: 1.15, letterSpacing: '-0.015em', maxWidth: 480 }}>
            Every second counts. Every unit, in one view.
          </Typography>
          <Box sx={{ display: 'flex', gap: '2px', height: 14, maxWidth: 420 }} aria-hidden="true">
            <Box sx={{ flex: 41, background: '#6fa585' }} /><Box sx={{ flex: 32, background: '#d5a640' }} />
            <Box sx={{ flex: 20, background: '#e0703f' }} /><Box sx={{ flex: 7, minWidth: 20, background: '#d0433d' }} />
          </Box>
          <Typography sx={{ fontSize: 15, lineHeight: 1.55, color: '#b3b4b3', maxWidth: 420 }}>
            Live incidents, unit positions, hospital capacity and radio comms — triaged and dispatched from a single screen.
          </Typography>
        </Box>
        <Typography sx={{ fontFamily: MONO, fontSize: 11, color: '#8a8c8e' }}>Authorised personnel only · Activity is logged</Typography>
      </Box>

      {/* ── Sign-in form ── */}
      <Box component="main" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: { xs: 3, sm: '56px' } }}>
        <Box component="form" onSubmit={handleLogin} noValidate sx={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: '22px' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <Typography component="h1" sx={{ fontFamily: SERIF, fontSize: 32, letterSpacing: '-0.01em' }}>Sign in</Typography>
            <Typography sx={{ fontSize: 14, color: T.tx2 }}>Use your dispatch centre account.</Typography>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <Typography component="label" htmlFor="email" sx={{ fontSize: 12, color: T.tx2 }}>Work email</Typography>
            <Box component="input" id="email" type="email" autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="operator@cad.emergency.in" sx={fieldSx} />
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <Typography component="label" htmlFor="password" sx={{ fontSize: 12, color: T.tx2 }}>Password</Typography>
              <Box component="button" type="button" onClick={() => setShowPassword((v) => !v)} sx={{ ...linkSx, fontSize: 12 }}
                aria-pressed={showPassword}>{showPassword ? 'Hide' : 'Show'}</Box>
            </Box>
            <Box component="input" id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} sx={fieldSx} />
          </Box>

          {errorMsg && <Typography role="alert" sx={{ fontSize: 13, color: T.rT }}>{errorMsg}</Typography>}

          <Button type="submit" disabled={isSubmitting} sx={{ ...btnSx(true), height: 44 }}>
            {isSubmitting ? <CircularProgress size={18} sx={{ color: T.bg }} /> : 'Sign in'}
          </Button>

          {/* Demo roles (dev builds only) */}
          {import.meta.env.DEV && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px', pt: '6px' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', ...monoLabelSx, fontSize: 11 }}>
                <Box sx={{ flex: 1, height: '1px', background: T.bd }} />DEMO ROLES · DEV ONLY<Box sx={{ flex: 1, height: '1px', background: T.bd }} />
              </Box>
              <Box role="radiogroup" aria-label="Demo role" sx={{ borderTop: `1px solid ${T.tx}` }}>
                {DEMO_ACCOUNTS.map((demo) => {
                  const on = email === demo.email;
                  return (
                    <Box key={demo.email} component="button" type="button" role="radio" aria-checked={on} onClick={() => handleSelectDemo(demo)}
                      sx={{
                        width: '100%', display: 'grid', gridTemplateColumns: '14px minmax(0,1fr) auto', gap: '14px', alignItems: 'center',
                        p: '12px 10px', border: 0, borderBottom: `1px solid ${T.bd}`, textAlign: 'left', font: 'inherit', cursor: 'pointer',
                        background: on ? T.tx : 'transparent', color: on ? T.bg : T.tx,
                        '&:hover': { background: on ? T.tx : T.sf2 },
                      }}>
                      <Box component="span" sx={{ width: 12, height: 12, borderRadius: '50%', border: on ? `4px solid ${T.bg}` : `1px solid ${T.bd2}` }} />
                      <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                        <Box component="span" sx={{ fontSize: 13.5, fontWeight: 500 }}>{demo.label}</Box>
                        <Box component="span" sx={{ fontSize: 12, opacity: on ? 0.75 : 1, color: on ? T.bg : T.tx3 }}>{demo.desc}</Box>
                      </Box>
                      <Box component="span" sx={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.04em', opacity: 0.75 }}>{demo.role}</Box>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
