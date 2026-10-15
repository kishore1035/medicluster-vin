import React, { useState } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { T, MONO, SERIF, btnSx, monoLabelSx } from '../theme/tokens';

// Demand estimates for the next 6 hours. There is no forecasting service yet, so these are
// the same planning estimates the detailed Insights page uses.
const HOTSPOTS = [
  { area: 'Koramangala 5th Block',      why: 'Cardiac & trauma · peak 17:00–20:30',     risk: 88, calls: 14, need: 2, have: 1 },
  { area: 'Indiranagar 100ft Road',     why: 'Road traffic accidents · peak 18:00–21:00', risk: 82, calls: 11, need: 2, have: 2 },
  { area: 'Hebbal – Airport Expressway', why: 'High-speed trauma · peak 20:00–23:00',   risk: 79, calls: 10, need: 2, have: 1 },
  { area: 'Whitefield – ITPL Corridor', why: 'Respiratory & stroke · peak 16:30–19:30', risk: 74, calls: 9,  need: 3, have: 1 },
  { area: 'Electronic City Phase 1',    why: 'General emergency · peak 17:30–20:00',     risk: 68, calls: 7,  need: 2, have: 2 },
];

const riskColor = (r) => (r >= 85 ? T.r : r >= 75 ? T.o : r >= 65 ? T.y : T.g);

export default function AIInsightsView({ ambulances = [], onApprove }) {
  const [approved, setApproved] = useState({});
  const [dismissed, setDismissed] = useState({});

  // Under-covered hotspots, each paired with a different available unit.
  const idle = ambulances.filter((a) => a.status === 'AVAILABLE');
  const moves = HOTSPOTS.filter((h) => h.need > h.have)
    .map((h, i) => ({ h, unit: idle[i] }))
    .filter((m) => m.unit && !dismissed[m.h.area])
    .slice(0, 3);

  return (
    <Box component="main" sx={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '28px', p: { xs: '24px 16px 48px', md: '24px 32px 48px' } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <Typography sx={monoLabelSx}>AI insights · next 6 hours</Typography>
          <Typography component="h1" sx={{ fontFamily: SERIF, fontSize: 'clamp(28px,4vw,38px)', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
            Demand forecast &amp; fleet positioning
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 12, color: T.tx3 }}>Planning estimates · {idle.length} unit{idle.length === 1 ? '' : 's'} on standby</Typography>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '40px', alignItems: 'flex-start' }}>
        <Box component="section" aria-label="Hotspots" sx={{ flex: '3 1 420px', minWidth: 0 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(80px,180px) 50px', gap: 2, pb: 1, borderBottom: `1px solid ${T.tx}`, ...monoLabelSx, letterSpacing: '0.04em' }}>
            <span>Hotspot</span><span>Risk</span><span style={{ textAlign: 'right' }}>Calls</span>
          </Box>
          {HOTSPOTS.map((h) => (
            <Box key={h.area} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(80px,180px) 50px', gap: 2, alignItems: 'center', py: 1.5, borderBottom: `1px solid ${T.bd}` }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 500 }} noWrap>{h.area}</Typography>
                <Typography sx={{ fontSize: 12, color: T.tx3 }} noWrap>{h.why}</Typography>
              </Box>
              <Box sx={{ height: 8, background: T.sf2 }} aria-label={`Risk ${h.risk} of 100`}>
                <Box sx={{ height: '100%', width: `${h.risk}%`, background: riskColor(h.risk) }} />
              </Box>
              <Typography sx={{ fontFamily: MONO, textAlign: 'right' }}>{h.calls}</Typography>
            </Box>
          ))}
        </Box>

        <Box component="section" aria-label="Suggested repositioning" sx={{ flex: '2 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography sx={{ pb: 1, borderBottom: `1px solid ${T.tx}`, fontSize: 13, fontWeight: 600 }}>Suggested repositioning</Typography>
          {moves.length === 0 && (
            <Typography sx={{ fontSize: 13, color: T.tx3 }}>
              {idle.length ? 'Coverage matches forecast demand. No moves needed.' : 'No units on standby to reposition.'}
            </Typography>
          )}
          {moves.map(({ h, unit }) => {
            const done = approved[h.area];
            const name = unit.call_sign || unit.vehicle_number;
            return (
              <Box key={h.area} sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, p: '14px', background: T.sf, border: `1px solid ${T.bd}`, borderRadius: '2px' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.25, alignItems: 'baseline' }}>
                  <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{name} → {h.area}</Typography>
                  <Typography sx={{ fontFamily: MONO, fontSize: 12, color: T.gT, whiteSpace: 'nowrap' }}>+{h.need - h.have} coverage</Typography>
                </Box>
                <Typography sx={{ fontSize: 13, color: T.tx2, lineHeight: 1.5 }}>
                  {h.area} has {h.have} of {h.need} recommended units for a forecast of {h.calls} calls ({h.why.split(' · ')[0].toLowerCase()}).
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button disabled={done} onClick={() => { setApproved((a) => ({ ...a, [h.area]: true })); onApprove?.(unit, h.area); }}
                    sx={{ ...btnSx(true), height: 32, px: '12px', fontSize: 12.5 }}>
                    {done ? 'Move sent' : 'Approve move'}
                  </Button>
                  {!done && (
                    <Button onClick={() => setDismissed((d) => ({ ...d, [h.area]: true }))} sx={{ ...btnSx(false), height: 32, px: '12px', fontSize: 12.5, color: T.tx2 }}>
                      Dismiss
                    </Button>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
