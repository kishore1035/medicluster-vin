// MediCluster design tokens (paper neutrals, ink primary, muted semantic colours).
export const T = {
  bg: '#f3f1ec', sf: '#fbfaf7', sf2: '#e9e6df',
  bd: '#dcd8cf', bd2: '#bcb6a9',
  tx: '#15171a', tx2: '#45484d', tx3: '#6c6e73',
  ac: '#2447c9',
  g: '#5b8f72', gT: '#2f6448',
  y: '#c8962c', yT: '#8a6312',
  o: '#cf5a2a', oT: '#a63f14',
  r: '#a8231f', rT: '#951c19',
};

export const SANS  = "'IBM Plex Sans', system-ui, sans-serif";
export const MONO  = "'IBM Plex Mono', monospace";
export const SERIF = "'Newsreader', Georgia, serif";

// Severity → [border colour, text colour]
export const SEV = {
  CRITICAL: [T.r, T.rT],
  HIGH:     [T.o, T.oT],
  MEDIUM:   [T.y, T.yT],
  MODERATE: [T.y, T.yT],
  LOW:      [T.g, T.gT],
};

export const tagSx = (sev) => {
  const [b, c] = SEV[sev] || [T.bd2, T.tx2];
  return {
    display: 'inline-block', fontFamily: MONO, fontSize: 11, letterSpacing: '0.04em',
    textTransform: 'uppercase', px: '6px', border: `1px solid ${b}`, color: c,
    borderRadius: '2px', whiteSpace: 'nowrap', lineHeight: '16px',
  };
};

export const monoLabelSx = {
  fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.tx3,
};

export const btnSx = (primary = false) => ({
  height: 38, px: '16px', borderRadius: '3px', fontFamily: SANS, fontSize: 13.5,
  fontWeight: primary ? 500 : 400, textTransform: 'none', whiteSpace: 'nowrap',
  ...(primary
    ? { background: T.tx, color: T.bg, '&:hover': { background: '#33353a' } }
    : { border: `1px solid ${T.bd2}`, color: T.tx, background: 'transparent', '&:hover': { background: T.sf2 } }),
  '&.Mui-disabled': { opacity: 0.5, color: primary ? T.bg : T.tx },
});
