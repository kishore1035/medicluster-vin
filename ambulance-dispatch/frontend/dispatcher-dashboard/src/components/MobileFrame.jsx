import React, { useEffect, useState } from 'react';
import { Box } from '@mui/material';

function useClock() {
  const fmt = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '');
  const [t, setT] = useState(fmt);
  useEffect(() => { const id = setInterval(() => setT(fmt()), 15_000); return () => clearInterval(id); }, []);
  return t;
}

/** Full-screen on phones; a 390 × 844 device frame on larger screens. */
export default function MobileFrame({ vars, inverse = false, children }) {
  const time = useClock();
  return (
    <Box sx={{ minHeight: '100dvh', background: '#e4e1da', display: 'flex', alignItems: 'center', justifyContent: 'center', py: { sm: 4 } }}>
      <Box sx={{
        ...vars, position: 'relative', width: { xs: '100%', sm: 390 }, height: { xs: '100dvh', sm: 844 },
        borderRadius: { sm: '44px' }, border: { sm: '10px solid #15171a' }, overflow: 'hidden',
        display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--tx)',
        fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontSize: 14, fontVariantNumeric: 'tabular-nums',
      }}>
        <Box sx={{ display: { xs: 'none', sm: 'flex' }, height: 48, flex: 'none', justifyContent: 'space-between', alignItems: 'flex-end',
          px: '28px', pb: '6px', fontSize: 15, fontWeight: 600, position: 'relative', zIndex: 2, color: inverse ? '#fff' : 'var(--tx)' }}>
          <span>{time}</span><span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>5G ▮▮▮</span>
        </Box>
        {children}
      </Box>
    </Box>
  );
}
