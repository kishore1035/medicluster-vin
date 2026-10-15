import React from 'react';
import { Box } from '@mui/material';

// Where the MediCluster clinician/patient app lives (set VITE_MEDICLUSTER_URL in production builds).
const MEDICLUSTER_URL = import.meta.env.VITE_MEDICLUSTER_URL || 'http://localhost:3000';
const MONO = "'IBM Plex Mono', monospace";

// Who signs in where. Shown on every sign-in screen so nobody tries the wrong door.
const ACCESS = [
  { id: 'dispatcher', who: 'Dispatchers',               what: 'Live incidents, ambulances, hospitals and radio',   how: 'Dispatch account email + password', where: 'Dispatch center',        href: '#/login' },
  { id: 'crew',       who: 'Ambulance crews',           what: 'Duty status, incoming calls, missions and radio',   how: 'Employee ID + 4-digit PIN',         where: 'Crew app',               href: '#/driver/login' },
  { id: 'clinician',  who: 'Doctors, nurses & analysts', what: 'Patients, clustering, imaging, reminders, reports', how: 'Hospital email + password',         where: 'MediCluster web app',    href: `${MEDICLUSTER_URL}/login` },
  { id: 'patient',    who: 'Patients',                  what: 'Your medicines, reminders, readings and CliniQ',    how: 'Mobile number + 6-digit text code', where: 'MediCluster mobile app', href: `${MEDICLUSTER_URL}/app` },
];

/** Compact list of every role, its sign-in method and a link to the right screen. `current` is highlighted. */
export default function AccessGuide({ current, dark = false, sx }) {
  const c = dark
    ? { head: '#8a8c8e', headRule: '#45484d', rule: '#2e3036', muted: '#b3b4b3', faint: '#8a8c8e', link: '#ecebe6' }
    : { head: 'var(--tx3, #6c6e73)', headRule: 'var(--tx, #15171a)', rule: 'var(--bd, #dcd8cf)', muted: 'var(--tx2, #45484d)', faint: 'var(--tx3, #6c6e73)', link: 'var(--ac, #2447c9)' };
  return (
    <Box component="section" aria-labelledby="access-guide" sx={{ display: 'flex', flexDirection: 'column', ...sx }}>
      <Box component="h2" id="access-guide" sx={{ m: 0, pb: 1, borderBottom: `1px solid ${c.headRule}`, fontFamily: MONO, fontWeight: 400, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: c.head }}>
        Who signs in where
      </Box>
      <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
        {ACCESS.map((a) => {
          const here = a.id === current;
          return (
            <Box component="li" key={a.id} sx={{ py: 1.5, borderBottom: `1px solid ${c.rule}`, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1.5 }}>
                <Box component="span" sx={{ fontSize: 13.5, fontWeight: 500 }}>{a.who}</Box>
                {here
                  ? <Box component="span" sx={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: c.faint }}>You are here</Box>
                  : <Box component="a" href={a.href} sx={{ fontSize: 12.5, color: c.link, textDecoration: 'underline', textUnderlineOffset: '2px', whiteSpace: 'nowrap' }}>{a.where} →</Box>}
              </Box>
              <Box component="span" sx={{ fontSize: 12.5, color: c.muted }}>{a.what}</Box>
              <Box component="span" sx={{ fontFamily: MONO, fontSize: 11, color: c.faint }}>{a.how}</Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
