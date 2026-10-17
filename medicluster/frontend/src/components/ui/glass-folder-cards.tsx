"use client";

import * as React from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Glass Folder Cards: real files between an artwork back and a hinged frosted front. */
export type ArtPreset = "aurora" | "ember" | "dusk" | "glacier" | "verdant";
export type ArtRecipe = {
  style: "marble" | "streak";
  colors: string[];
  scale?: number;
  warp?: number;
  angle?: number;
  gloss?: number;
  veins?: number;
};
export type FolderArt = ArtPreset | ArtRecipe | "none";
export type FolderFile = {
  name: string;
  meta?: string;
  art?: ArtPreset | ArtRecipe;
  image?: string;
  href?: string;
  disabled?: boolean;
};
export type FolderMenuItem = {
  label: string;
  onSelect?: () => void;
  danger?: boolean;
};
export type GlassFolderProps = {
  label?: string;
  meta?: string;
  tone?: "light" | "dark";
  art?: FolderArt;
  seed?: number;
  image?: string;
  files?: FolderFile[];
  action?: "add" | "more" | "none";
  onAdd?: (files: FolderFile[]) => FolderFile | void;
  onFilesChange?: (files: FolderFile[]) => void;
  menu?: FolderMenuItem[];
  labelPlacement?: "bottom-left" | "top-left" | "top-right";
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onFileSelect?: (file: FolderFile, index: number) => void;
  width?: number;
  appear?: boolean;
  appearDelay?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Integrates with the host page's motion control; interactions remain available. */
  paused?: boolean;
};
export const ART_PRESETS: Record<ArtPreset, ArtRecipe> = {
  aurora: {
    style: "streak",
    colors: [
      "#f4efe9",
      "#e9c2b8",
      "#c2433f",
      "#2a1e2a",
      "#22395e",
      "#6f97c2",
      "#e5edf4",
    ],
    scale: 0.7,
    warp: 1.4,
    angle: -0.62,
    gloss: 0.18,
    veins: 0,
  },
  ember: {
    style: "marble",
    colors: [
      "#07090c",
      "#16252c",
      "#3d5f68",
      "#1a1416",
      "#a3201a",
      "#ef4a2b",
      "#ff8a5c",
    ],
    scale: 0.62,
    warp: 3.2,
    angle: -0.5,
    gloss: 0.55,
    veins: 0.6,
  },
  dusk: {
    style: "marble",
    colors: [
      "#120c18",
      "#3e2850",
      "#8f6c9c",
      "#2b1a24",
      "#b3502f",
      "#eab08a",
      "#fbe7d2",
    ],
    scale: 0.75,
    warp: 3.6,
    angle: 0.8,
    gloss: 0.5,
    veins: 0.5,
  },
  glacier: {
    style: "streak",
    colors: ["#f7f8fa", "#d9e2ea", "#9fb4c7", "#e8edf2", "#bccbd8", "#ffffff"],
    scale: 0.7,
    warp: 1.6,
    angle: 0.35,
    gloss: 0.25,
    veins: 0,
  },
  verdant: {
    style: "marble",
    colors: [
      "#070b08",
      "#173024",
      "#4f7a5a",
      "#141812",
      "#a7843a",
      "#e9cf87",
      "#fbf3d6",
    ],
    scale: 0.7,
    warp: 3.4,
    angle: 2.1,
    gloss: 0.5,
    veins: 0.5,
  },
};
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = /^[0-9a-f]{6}$/i.test(h) ? parseInt(h, 16) : 0x808080;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function makeFbm(
  seed: number,
): (x: number, y: number, octaves: number) => number {
  const r = rng(seed),
    perm = new Uint8Array(512),
    grad = new Float32Array(512),
    p: number[] = [];
  for (let i = 0; i < 256; i++) p.push(i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1)),
      t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  for (let i = 0; i < 256; i++) {
    const a = r() * Math.PI * 2;
    grad[i * 2] = Math.cos(a);
    grad[i * 2 + 1] = Math.sin(a);
  }
  const noise = (x: number, y: number): number => {
    const xi = Math.floor(x),
      yi = Math.floor(y),
      xf = x - xi,
      yf = y - yi,
      X = xi & 255,
      Y = yi & 255;
    const h00 = perm[X + perm[Y]] * 2,
      h10 = perm[X + 1 + perm[Y]] * 2,
      h01 = perm[X + perm[Y + 1]] * 2,
      h11 = perm[X + 1 + perm[Y + 1]] * 2;
    const d00 = grad[h00] * xf + grad[h00 + 1] * yf,
      d10 = grad[h10] * (xf - 1) + grad[h10 + 1] * yf;
    const d01 = grad[h01] * xf + grad[h01 + 1] * (yf - 1),
      d11 = grad[h11] * (xf - 1) + grad[h11 + 1] * (yf - 1);
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10),
      v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    return (
      d00 + u * (d10 - d00) + v * (d01 - d00 + u * (d11 - d01 - d10 + d00))
    );
  };
  return (x, y, octaves) => {
    let sum = 0,
      amp = 0.5;
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise(x, y);
      const nx = 1.6 * x + 1.2 * y + 7.1;
      y = -1.2 * x + 1.6 * y + 3.3;
      x = nx;
      amp *= 0.5;
    }
    return sum;
  };
}
export type ArtJob = {
  width: number;
  height: number;
  pixels: Uint8ClampedArray<ArrayBuffer>;
  step: (rows: number) => boolean;
};
/** Domain-warped liquid artwork, painted in row batches and shared across instances. */
export function createArtJob(
  width: number,
  height: number,
  recipe: ArtRecipe,
  seed: number,
): ArtJob {
  const w = Math.max(1, Math.round(width)),
    h = Math.max(1, Math.round(height));
  const colors =
    recipe.colors.length >= 2 ? recipe.colors : ["#111111", "#eeeeee"];
  const stops = colors.map((c, i) => ({
    t: i / (colors.length - 1),
    c: hexToRgb(c),
  }));
  const scale = recipe.scale ?? 0.7,
    warp = recipe.warp ?? 3,
    gloss = recipe.gloss ?? 0.4,
    veins = recipe.veins ?? 0,
    streak = recipe.style === "streak";
  const fbm = makeFbm(seed * 977 + 13),
    r = rng(seed + 1),
    ox = r() * 50,
    oy = r() * 50,
    angle = (recipe.angle ?? 0) + (r() - 0.5) * 0.5;
  const ca = Math.cos(angle),
    sa = Math.sin(angle),
    m = Math.min(w, h);
  const gw = Math.ceil(w / 2) + 3,
    gh = Math.ceil(h / 2) + 3,
    G = new Float32Array(gw * gh),
    GQ = new Float32Array(gw * gh);
  const F = new Float32Array(w * h),
    Q = new Float32Array(w * h),
    pixels = new Uint8ClampedArray(w * h * 4);
  let row = 0;
  const field = (gy: number) => {
    for (let gx = 0; gx < gw; gx++) {
      const u = ((gx - 1) * 2 - w / 2) / m,
        v = ((gy - 1) * 2 - h / 2) / m;
      let px = (u * ca - v * sa) * scale,
        py = (u * sa + v * ca) * scale;
      if (streak) {
        px *= 0.14;
        py *= 2.2;
      }
      px += ox;
      py += oy;
      const qx = fbm(px, py, 3),
        qy = fbm(px + 5.2, py + 1.3, 3);
      const rx = fbm(px + warp * qx + 1.7, py + warp * qy + 9.2, 3),
        ry = fbm(px + warp * qx + 8.3, py + warp * qy + 2.8, 3);
      G[gy * gw + gx] = fbm(px + warp * rx, py + warp * ry, 4);
      GQ[gy * gw + gx] = Math.sqrt(qx * qx + qy * qy);
    }
  };
  const upsample = () => {
    const cr = (a: number, b: number, c: number, d: number) =>
        (-a + 9 * b + 9 * c - d) / 16,
      T = new Float32Array(w * gh);
    for (let gy = 0; gy < gh; gy++)
      for (let x = 0; x < w; x++) {
        const r = gy * gw,
          c = (x >> 1) + 1;
        T[gy * w + x] =
          x & 1
            ? cr(G[r + c - 1], G[r + c], G[r + c + 1], G[r + c + 2])
            : G[r + c];
      }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const c = (y >> 1) + 1;
        F[y * w + x] =
          y & 1
            ? cr(
                T[(c - 1) * w + x],
                T[c * w + x],
                T[(c + 1) * w + x],
                T[(c + 2) * w + x],
              )
            : T[c * w + x];
        const gx = (x >> 1) + 1,
          q0 = GQ[c * gw + gx],
          qx = x & 1 ? (q0 + GQ[c * gw + gx + 1]) / 2 : q0;
        const q1 =
          y & 1
            ? x & 1
              ? (GQ[(c + 1) * gw + gx] + GQ[(c + 1) * gw + gx + 1]) / 2
              : GQ[(c + 1) * gw + gx]
            : qx;
        Q[y * w + x] = (qx + q1) / 2;
      }
  };
  const colorize = () => {
    const sample: number[] = [],
      stride = Math.max(1, Math.floor(F.length / 4096));
    for (let i = 0; i < F.length; i += stride) sample.push(F[i]);
    sample.sort((a, b) => a - b);
    const lo = sample[Math.floor(sample.length * 0.02)],
      hi = sample[Math.floor(sample.length * 0.98)],
      k = 1 / (hi - lo || 1),
      lx = -0.55,
      ly = -0.65,
      lz = 0.52,
      slope = k * m * 0.012;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let t = (F[i] - lo) * k;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        let j = 1;
        while (j < stops.length - 1 && stops[j].t < t) j++;
        const a = stops[j - 1],
          b = stops[j];
        let f = (t - a.t) / (b.t - a.t || 1);
        f = f < 0 ? 0 : f > 1 ? 1 : f;
        f = f * f * (3 - 2 * f);
        const gx = (F[x < w - 1 ? i + 1 : i] - F[x > 0 ? i - 1 : i]) * slope,
          gy = (F[y < h - 1 ? i + w : i] - F[y > 0 ? i - w : i]) * slope;
        const nd = (-gx * lx - gy * ly + lz) / Math.sqrt(gx * gx + gy * gy + 1),
          spec = Math.pow(nd > 0 ? nd : 0, 24) * gloss * 255;
        const silk = 1 + 0.035 * Math.sin(t * 150 + Q[i] * 24),
          vein = veins * Math.max(0, 1 - Math.abs(Q[i] - 0.42) * 14) * 0.6,
          lit = (0.82 + 0.28 * nd) * silk * (1 - vein);
        for (let channel = 0; channel < 3; channel++)
          pixels[i * 4 + channel] =
            (a.c[channel] + (b.c[channel] - a.c[channel]) * f) * lit + spec;
        pixels[i * 4 + 3] = 255;
      }
  };
  return {
    width: w,
    height: h,
    pixels,
    step: (rows: number) => {
      if (row >= gh) return true;
      const end = Math.min(gh, row + Math.max(1, rows));
      while (row < end) field(row++);
      if (row < gh) return false;
      upsample();
      colorize();
      return true;
    },
  };
}
export function fanSlot(index: number, count: number): number {
  return count <= 1 ? 0 : (index / (count - 1)) * 2 - 1;
}
const recipeOf = (art: ArtPreset | ArtRecipe): ArtRecipe =>
  typeof art === "string" ? ART_PRESETS[art] : art;

type Painted = HTMLCanvasElement;
const artCache = new Map<string, Promise<Painted>>();
const queue: {
  job: ArtJob;
  priority: number;
  done: (canvas: Painted) => void;
  fail: (error: unknown) => void;
}[] = [];
let pumping = false;
function pump() {
  if (pumping) return;
  pumping = true;
  const tick = () => {
    const until = performance.now() + 7;
    while (queue.length && performance.now() < until) {
      const head = queue[0];
      try {
        if (!head.job.step(4)) continue;
        queue.shift();
        const canvas = document.createElement("canvas");
        canvas.width = head.job.width;
        canvas.height = head.job.height;
        canvas
          .getContext("2d")
          ?.putImageData(
            new ImageData(head.job.pixels, canvas.width, canvas.height),
            0,
            0,
          );
        head.done(canvas);
      } catch (error) {
        queue.shift();
        head.fail(error);
      }
    }
    if (queue.length) requestAnimationFrame(tick);
    else pumping = false;
  };
  requestAnimationFrame(tick);
}
function paint(
  recipe: ArtRecipe,
  seed: number,
  w: number,
  h: number,
  priority: number,
): Promise<Painted> {
  const key = JSON.stringify([recipe, seed, w, h]);
  let promise = artCache.get(key);
  if (!promise) {
    promise = new Promise<Painted>((done, fail) => {
      let at = queue.length;
      while (at > 1 && queue[at - 1].priority > priority) at--;
      queue.splice(at, 0, {
        job: createArtJob(w, h, recipe, seed),
        priority,
        done,
        fail,
      });
      pump();
    });
    artCache.set(key, promise);
    promise.catch(() => artCache.delete(key));
  }
  return promise;
}
function ArtCanvas({
  art,
  seed,
  w,
  h,
  density,
  priority,
  className,
}: {
  art: ArtPreset | ArtRecipe;
  seed: number;
  w: number;
  h: number;
  density: number;
  priority: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLCanvasElement>(null),
    [ready, setReady] = React.useState(false);
  const key = JSON.stringify(recipeOf(art)),
    pw = Math.max(1, Math.round(w * density)),
    ph = Math.max(1, Math.round(h * density));
  React.useEffect(() => {
    let live = true;
    setReady(false);
    paint(JSON.parse(key) as ArtRecipe, seed, pw, ph, priority)
      .then((src) => {
        const canvas = ref.current;
        if (!live || !canvas) return;
        canvas.width = src.width;
        canvas.height = src.height;
        canvas.getContext("2d")?.drawImage(src, 0, 0);
        setReady(true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [key, seed, pw, ph, priority]);
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={className}
      data-ready={ready || undefined}
      style={{ width: w, height: h, maxWidth: "none" }}
    />
  );
}
const W = 340,
  H = 272,
  HEADROOM = 54,
  FRONT_TOP = 74,
  FRONT_H = H - FRONT_TOP,
  SHEET_W = 272,
  SHEET_H = 184,
  MAX_VISIBLE = 4;
const BACK_PATH =
  "M0 56A22 22 0 0 1 22 34L146 34C170 34 172 0 198 0L318 0A22 22 0 0 1 340 22L340 250A22 22 0 0 1 318 272L22 272A22 22 0 0 1 0 250Z";
const FRONT_PATH =
  "M0 22A22 22 0 0 1 22 0L118 0C144 0 146 32 172 32L318 32A22 22 0 0 1 340 54L340 " +
  (FRONT_H - 22) +
  "A22 22 0 0 1 318 " +
  FRONT_H +
  "L22 " +
  FRONT_H +
  "A22 22 0 0 1 0 " +
  (FRONT_H - 22) +
  "Z";
const SAMPLE_FILES: FolderFile[] = [
  { name: "Cover — final", meta: "PNG · 4.8 MB", art: "ember" },
  { name: "Moodboard", meta: "24 images", art: "dusk" },
  { name: "Brief.pdf", meta: "PDF · 1.2 MB" },
];

export default function GlassFolder({
  label = "My Files",
  meta,
  tone = "light",
  art = "aurora",
  seed = 3,
  image,
  files: initialFiles = SAMPLE_FILES,
  action = "add",
  onAdd,
  onFilesChange,
  menu = [],
  labelPlacement = "bottom-left",
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  onFileSelect,
  width = 340,
  appear = true,
  appearDelay = 0,
  className,
  style,
  paused = false,
}: GlassFolderProps) {
  const uid = React.useId().replace(/:/g, ""),
    rootRef = React.useRef<HTMLDivElement>(null),
    filesRef = React.useRef<HTMLDivElement>(null);
  const hitRef = React.useRef<HTMLButtonElement>(null),
    keyRef = React.useRef<HTMLButtonElement>(null),
    menuRef = React.useRef<HTMLDivElement>(null);
  const [files, setFiles] = React.useState<FolderFile[]>(initialFiles),
    ids = React.useRef(initialFiles.map((_, i) => i)),
    nextId = React.useRef(initialFiles.length);
  const [dropped, setDropped] = React.useState<number | null>(null),
    [bump, setBump] = React.useState(0),
    [openState, setOpenState] = React.useState(defaultOpen);
  const open = openProp ?? openState;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (openProp === undefined) setOpenState(next);
      onOpenChange?.(next);
    },
    [openProp, onOpenChange],
  );
  const [menuOpen, setMenuOpen] = React.useState(false),
    [entered, setEntered] = React.useState(!appear);
  const k = Math.max(1, width) / W,
    density =
      Math.min(
        1.5,
        Math.max(
          1,
          typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
        ),
      ) * k;
  React.useEffect(() => {
    const el = rootRef.current;
    if (
      !appear ||
      paused ||
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !el ||
      typeof IntersectionObserver === "undefined"
    ) {
      setEntered(true);
      return;
    }
    let timer = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        timer = window.setTimeout(() => setEntered(true), appearDelay);
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, [appear, appearDelay, paused]);
  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0,
      px = 0,
      py = 0;
    const write = () => {
      raf = 0;
      el.style.setProperty("--gf-px", px.toFixed(3));
      el.style.setProperty("--gf-py", py.toFixed(3));
    };
    const move = (event: PointerEvent) => {
      if (paused || reduced.matches || event.pointerType === "touch") return;
      const r = el.getBoundingClientRect();
      px = ((event.clientX - r.left) / r.width) * 2 - 1;
      py = ((event.clientY - r.top) / r.height) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(write);
    };
    const leave = () => {
      px = py = 0;
      if (!raf) raf = requestAnimationFrame(write);
    };
    el.style.setProperty("--gf-px", "0");
    el.style.setProperty("--gf-py", "0");
    el.addEventListener("pointermove", move, { passive: true });
    el.addEventListener("pointerleave", leave);
    reduced.addEventListener("change", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      reduced.removeEventListener("change", leave);
      cancelAnimationFrame(raf);
    };
  }, [paused]);
  React.useEffect(() => {
    filesRef.current?.toggleAttribute("inert", !open);
  }, [open]);
  React.useEffect(() => {
    if (!open && !menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (menuOpen) {
        setMenuOpen(false);
        keyRef.current?.focus();
      } else {
        setOpen(false);
        hitRef.current?.focus();
      }
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        menuOpen &&
        !menuRef.current?.contains(target) &&
        !keyRef.current?.contains(target)
      )
        setMenuOpen(false);
      if (open && !menuOpen && !rootRef.current?.contains(target))
        setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, menuOpen, setOpen]);
  React.useEffect(() => {
    if (menuOpen)
      menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [menuOpen]);
  const addFile = () => {
    const made = onAdd?.(files),
      file: FolderFile = made || {
        name: "Untitled " + (files.length + 1),
        meta: "Just now",
      },
      next = [...files, file],
      id = nextId.current++;
    ids.current = [...ids.current, id];
    setFiles(next);
    setDropped(id);
    setBump((b) => b + 1);
    onFilesChange?.(next);
  };
  const menuItems: FolderMenuItem[] = [
    {
      label: open ? "Close folder" : "Open folder",
      onSelect: () => setOpen(!open),
    },
    ...menu,
  ];
  const onMenuKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [],
      ),
      at = items.indexOf(document.activeElement as HTMLElement);
    const go = (index: number) => {
      event.preventDefault();
      items[(index + items.length) % items.length]?.focus();
    };
    if (event.key === "ArrowDown") go(at + 1);
    else if (event.key === "ArrowUp") go(at - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(items.length - 1);
    else if (event.key === "Tab") setMenuOpen(false);
  };
  const start = Math.max(0, files.length - MAX_VISIBLE),
    visible = files.slice(start),
    count = files.length,
    metaLine = meta ?? count + (count === 1 ? " item" : " items");
  return (
    <div
      ref={rootRef}
      className={cn("gf-root", className)}
      data-tone={tone}
      data-open={open || undefined}
      data-entered={entered || undefined}
      data-place={labelPlacement}
      data-paused={paused || undefined}
      style={{ width, height: (H + HEADROOM) * k, ...style }}
    >
      <style>{GF_CSS}</style>
      <div
        className="gf-stage"
        style={{ transform: `translateY(${HEADROOM * k}px) scale(${k})` }}
      >
        <div className="gf-tilt">
          <div className="gf-shadow" aria-hidden="true" />
          <div
            className="gf-back"
            style={{ clipPath: `path('${BACK_PATH}')` }}
            aria-hidden="true"
          >
            {image ? (
              <img
                className="gf-art"
                src={image}
                alt=""
                width={W + 24}
                height={H + 24}
                draggable={false}
              />
            ) : art !== "none" ? (
              <ArtCanvas
                className="gf-art"
                art={art}
                seed={seed}
                w={W + 24}
                h={H + 24}
                density={density}
                priority={0}
              />
            ) : null}
            <div className="gf-back-sheen" />
          </div>
          <svg
            className="gf-rim gf-back-rim"
            viewBox={`0 0 ${W} ${H}`}
            aria-hidden="true"
          >
            <path d={BACK_PATH} />
          </svg>
          <div
            key={bump}
            className={cn("gf-front", bump > 0 && "gf-front--bump")}
            style={{ clipPath: `path('${FRONT_PATH}')` }}
          >
            <div className="gf-tint" aria-hidden="true" />
            <div className="gf-spec" aria-hidden="true" />
            <svg
              className="gf-rim gf-front-rim"
              viewBox={`0 0 ${W} ${FRONT_H}`}
              aria-hidden="true"
            >
              <defs>
                <linearGradient
                  id={`gf-rim-${uid}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
                  <stop offset="0.35" stopColor="#fff" stopOpacity="0.35" />
                  <stop offset="1" stopColor="#fff" stopOpacity="0.12" />
                </linearGradient>
              </defs>
              <path d={FRONT_PATH} stroke={`url(#gf-rim-${uid})`} />
            </svg>
            <button
              ref={hitRef}
              type="button"
              className="gf-hit"
              aria-expanded={open}
              aria-controls={`gf-files-${uid}`}
              aria-label={
                (open ? "Close " : "Open ") +
                label +
                ", " +
                count +
                (count === 1 ? " item" : " items")
              }
              onClick={() => {
                setMenuOpen(false);
                setOpen(!open);
              }}
            />
            <div className="gf-label">
              <span className="gf-title">{label}</span>
              <span className="gf-meta" key={metaLine}>
                {metaLine}
              </span>
            </div>
          </div>
          <div
            ref={filesRef}
            id={`gf-files-${uid}`}
            className="gf-files"
            role="list"
            aria-label={label + " contents"}
            aria-hidden={!open}
          >
            {visible.map((file, v) => {
              const id = ids.current[start + v],
                slot = fanSlot(v, visible.length),
                jitter = rng(hashString(file.name) + id),
                picture = !!(file.art || file.image);
              const inner = (
                <>
                  {picture ? (
                    file.image ? (
                      <img
                        className="gf-sheet-art"
                        src={file.image}
                        alt=""
                        width={SHEET_W}
                        height={SHEET_H}
                        draggable={false}
                      />
                    ) : (
                      <ArtCanvas
                        className="gf-sheet-art"
                        art={file.art as ArtPreset | ArtRecipe}
                        seed={hashString(file.name) % 997}
                        w={SHEET_W}
                        h={SHEET_H}
                        density={Math.min(density, 1.25)}
                        priority={1}
                      />
                    )
                  ) : (
                    <span className="gf-lines" aria-hidden="true">
                      {["86%", "92%", "64%", "88%", "42%"].map((w, i) => (
                        <i key={i} style={{ width: w }} />
                      ))}
                    </span>
                  )}
                  <span className="gf-sheet-head">
                    <span className="gf-sheet-name">{file.name}</span>
                    {file.meta ? (
                      <span className="gf-sheet-meta">{file.meta}</span>
                    ) : null}
                  </span>
                </>
              );
              const common = {
                className: cn(
                  "gf-sheet",
                  picture && "gf-sheet--art",
                  id === dropped && "gf-sheet--drop",
                ),
                tabIndex: open && !file.disabled ? 0 : -1,
                style: {
                  "--gf-slot": slot,
                  "--gf-depth": visible.length - 1 - v,
                  "--gf-jx": ((jitter() - 0.5) * 10).toFixed(2) + "px",
                  "--gf-jr": ((jitter() - 0.5) * 3.2).toFixed(2) + "deg",
                  zIndex: v + 1,
                } as React.CSSProperties,
                onAnimationEnd:
                  id === dropped ? () => setDropped(null) : undefined,
              };
              return (
                <div key={id} role="listitem" className="gf-sheet-slot">
                  {file.href && !file.disabled ? (
                    <a
                      {...common}
                      href={file.href}
                      onClick={() => onFileSelect?.(file, start + v)}
                    >
                      {inner}
                    </a>
                  ) : (
                    <button
                      {...common}
                      type="button"
                      disabled={file.disabled}
                      onClick={() => onFileSelect?.(file, start + v)}
                    >
                      {inner}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {action !== "none" ? (
            <button
              ref={keyRef}
              type="button"
              className={cn("gf-key", `gf-key--${action}`)}
              aria-label={
                action === "add"
                  ? "Add a file to " + label
                  : "More options for " + label
              }
              aria-haspopup={action === "more" ? "menu" : undefined}
              aria-expanded={action === "more" ? menuOpen : undefined}
              aria-controls={action === "more" ? `gf-menu-${uid}` : undefined}
              onClick={() =>
                action === "add" ? addFile() : setMenuOpen((m) => !m)
              }
            >
              {action === "add" ? (
                <Plus
                  key={bump}
                  className="gf-glyph gf-glyph--plus"
                  aria-hidden="true"
                />
              ) : (
                <MoreHorizontal
                  className="gf-glyph gf-glyph--more"
                  aria-hidden="true"
                />
              )}
            </button>
          ) : null}
          {action === "more" ? (
            <div
              ref={menuRef}
              id={`gf-menu-${uid}`}
              role="menu"
              aria-label={label + " options"}
              className="gf-menu"
              data-open={menuOpen || undefined}
              onKeyDown={onMenuKey}
            >
              {menuItems.map((item, i) => (
                <button
                  key={item.label + i}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  disabled={!menuOpen}
                  className={cn(
                    "gf-menu-item",
                    item.danger && "gf-menu-item--danger",
                  )}
                  onClick={() => {
                    setMenuOpen(false);
                    keyRef.current?.focus();
                    item.onSelect?.();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const GF_CSS = `
.gf-root {
  --gf-px:0; --gf-py:0; --gf-ease:cubic-bezier(.2,.8,.2,1); --gf-spring:cubic-bezier(.34,1.36,.5,1);
  --gf-hinge:0deg; --gf-lift:42px; --gf-spread:0px; --gf-fan:0deg; --gf-stack:15px;
  --gf-ink:#141416; --gf-ink-soft:rgba(20,20,22,.55);
  position:relative; display:inline-block; flex:none; vertical-align:top;
  font-family:ui-sans-serif,system-ui,-apple-system,"SF Pro Text","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  -webkit-font-smoothing:antialiased; -webkit-tap-highlight-color:transparent; isolation:isolate;
}
.gf-root[data-tone="dark"] { --gf-ink:#f5f5f7; --gf-ink-soft:rgba(245,245,247,.58); }
.gf-root:hover,.gf-root:focus-within { --gf-hinge:-11deg; --gf-lift:-34px; --gf-spread:8px; --gf-fan:1.4deg; --gf-stack:10px; }
.gf-root[data-open] { --gf-hinge:-24deg; --gf-lift:-96px; --gf-spread:40px; --gf-fan:5deg; --gf-stack:30px; }
.gf-stage { position:absolute;left:0;top:0;width:340px;height:272px;transform-origin:0 0; }
.gf-tilt { position:absolute;inset:0;transform:perspective(1400px) rotateX(calc(var(--gf-py) * -3deg)) rotateY(calc(var(--gf-px) * 4deg));transition:transform .9s var(--gf-ease); }
.gf-shadow { position:absolute;left:18px;right:18px;bottom:-6px;height:60px;border-radius:40px;background:rgba(16,18,24,.34);filter:blur(22px);transform:translateX(calc(var(--gf-px) * -8px));transition:transform .9s var(--gf-ease),opacity .9s var(--gf-ease); }
.gf-root[data-tone="dark"] .gf-shadow { background:rgba(0,0,0,.62); }
.gf-back { position:absolute;inset:0;overflow:hidden;background:linear-gradient(180deg,#f3f3f4 0%,#e3e3e6 100%); }
.gf-root[data-tone="dark"] .gf-back { background:linear-gradient(180deg,#2a2a2e 0%,#121214 100%); }
.gf-art { position:absolute;left:-12px;top:-12px;max-width:none;object-fit:cover;transform:translate(calc(var(--gf-px) * -7px),calc(var(--gf-py) * -6px)) scale(1.02);transition:transform 1.1s var(--gf-ease),opacity 1.2s var(--gf-ease),filter 1.2s var(--gf-ease); }
canvas.gf-art { opacity:0;filter:blur(14px) saturate(.6); }
canvas.gf-art[data-ready] { opacity:1;filter:none; }
.gf-back-sheen { position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.22) 0%,rgba(255,255,255,0) 22%),radial-gradient(120% 80% at 80% 0%,rgba(255,255,255,.16),rgba(255,255,255,0) 60%);pointer-events:none; }
.gf-rim { position:absolute;left:0;top:0;max-width:none;overflow:visible;pointer-events:none;fill:none; }
.gf-back-rim { width:340px;height:272px; }
.gf-back-rim path { stroke:rgba(255,255,255,.45);stroke-width:1; }
.gf-root[data-tone="dark"] .gf-back-rim path { stroke:rgba(255,255,255,.16); }
.gf-files { position:absolute;inset:0;z-index:5;pointer-events:none;clip-path:inset(-400px -400px 10px -400px); }
.gf-sheet-slot { display:contents; }
.gf-sheet {
  all:unset;box-sizing:border-box;position:absolute;left:34px;top:96px;width:272px;height:184px;border-radius:16px;overflow:hidden;cursor:pointer;pointer-events:auto;
  background:linear-gradient(180deg,#ffffff 0%,#f2f2f0 100%);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 0 0 .5px rgba(0,0,0,.1),0 10px 26px -8px rgba(10,12,20,.28);
  transform-origin:50% 100%;transform:translate(calc(var(--gf-jx) + var(--gf-slot) * var(--gf-spread)),calc(var(--gf-lift) + var(--gf-depth) * var(--gf-stack) * -1)) rotate(calc(var(--gf-jr) + var(--gf-slot) * var(--gf-fan)));
  transition:transform .75s var(--gf-spring) calc(var(--gf-depth) * 40ms),box-shadow .4s var(--gf-ease),translate .9s var(--gf-ease),opacity .9s var(--gf-ease);
}
.gf-sheet:disabled { cursor:default; }
.gf-root[data-tone="dark"] .gf-sheet { background:linear-gradient(180deg,#2c2c30 0%,#1c1c1f 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 0 0 .5px rgba(255,255,255,.08),0 12px 28px -8px rgba(0,0,0,.7); }
.gf-sheet--art { background:#1a1a1d; }
.gf-root[data-open] .gf-sheet:hover,.gf-root[data-open] .gf-sheet:focus-visible {
  transform:translate(calc(var(--gf-jx) + var(--gf-slot) * var(--gf-spread)),calc(var(--gf-lift) + var(--gf-depth) * var(--gf-stack) * -1 - 18px)) rotate(calc(var(--gf-slot) * var(--gf-fan) * .6));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 0 0 .5px rgba(0,0,0,.1),0 22px 40px -12px rgba(10,12,20,.42);transition-delay:0s;
}
.gf-sheet:focus-visible { outline:2px solid #4c8dff;outline-offset:2px; }
.gf-sheet-art { position:absolute;left:0;top:0;width:272px;height:184px;max-width:none;object-fit:cover;transition:opacity .9s var(--gf-ease),filter .9s var(--gf-ease); }
canvas.gf-sheet-art { opacity:0;filter:blur(10px); }
canvas.gf-sheet-art[data-ready] { opacity:1;filter:none; }
.gf-sheet--art::after { content:"";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(180deg,rgba(0,0,0,.42) 0%,rgba(0,0,0,0) 34%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.2);pointer-events:none; }
.gf-sheet-head { position:absolute;left:14px;right:14px;top:11px;z-index:1;display:flex;align-items:baseline;justify-content:space-between;gap:10px;white-space:nowrap; }
.gf-sheet-name { overflow:hidden;text-overflow:ellipsis;font-size:12.5px;font-weight:560;letter-spacing:-.005em;color:#18181b; }
.gf-sheet-meta { flex:none;font-family:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.02em;color:rgba(24,24,27,.5); }
.gf-root[data-tone="dark"] .gf-sheet-name,.gf-sheet--art .gf-sheet-name { color:#fafafa; }
.gf-root[data-tone="dark"] .gf-sheet-meta,.gf-sheet--art .gf-sheet-meta { color:rgba(250,250,250,.66); }
.gf-lines { position:absolute;left:14px;right:14px;top:40px;display:flex;flex-direction:column;gap:9px; }
.gf-lines i { display:block;height:5px;border-radius:3px;background:rgba(24,24,27,.08); }
.gf-lines i:first-child { height:9px;margin-bottom:4px;background:rgba(24,24,27,.14); }
.gf-root[data-tone="dark"] .gf-lines i { background:rgba(255,255,255,.08); }
.gf-root[data-tone="dark"] .gf-lines i:first-child { background:rgba(255,255,255,.16); }
.gf-sheet--drop { animation:gf-drop .85s var(--gf-ease) both; }
@keyframes gf-drop { 0% {translate:0 -190px;rotate:-9deg;opacity:0}35%{opacity:1}72%{translate:0 10px;rotate:1deg}100%{translate:0 0;rotate:0deg;opacity:1} }
.gf-front {
  position:absolute;left:0;top:74px;width:340px;height:198px;z-index:10;-webkit-backdrop-filter:blur(22px) saturate(1.5);backdrop-filter:blur(22px) saturate(1.5);
  transform-origin:50% 100%;transform:perspective(760px) rotateX(var(--gf-hinge));transition:transform .8s var(--gf-spring),translate 1s var(--gf-ease),opacity 1s var(--gf-ease);
}
.gf-front--bump { animation:gf-bump .7s var(--gf-ease) .38s both; }
@keyframes gf-bump { 0%{scale:1}35%{scale:1.018 .975}70%{scale:.996 1.006}100%{scale:1} }
.gf-tint { position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.16) 0%,rgba(255,255,255,.5) 42%,rgba(252,252,252,.93) 100%); }
.gf-root[data-tone="dark"] .gf-tint { background:linear-gradient(180deg,rgba(18,18,20,.18) 0%,rgba(14,14,16,.62) 46%,rgba(8,8,10,.94) 100%); }
.gf-spec { position:absolute;inset:0;background:radial-gradient(260px 200px at calc(50% + var(--gf-px) * 46%) calc(30% + var(--gf-py) * 40%),rgba(255,255,255,.5),rgba(255,255,255,0) 70%);mix-blend-mode:soft-light;opacity:.9;transition:background-position .6s var(--gf-ease);pointer-events:none; }
.gf-root[data-tone="dark"] .gf-spec { mix-blend-mode:screen;opacity:.16; }
.gf-front-rim { width:340px;height:198px; }
.gf-front-rim path { stroke-width:2.4;transition:stroke-width .3s var(--gf-ease); }
.gf-root[data-tone="dark"] .gf-front-rim { opacity:.55; }
.gf-hit { all:unset;position:absolute;inset:0;z-index:1;cursor:pointer; }
.gf-hit:focus-visible ~ .gf-label .gf-title { text-decoration:underline;text-decoration-thickness:1.5px;text-underline-offset:4px; }
.gf-front:has(.gf-hit:focus-visible) .gf-front-rim path { stroke-width:5; }
.gf-label { position:absolute;z-index:2;display:flex;flex-direction:column;gap:4px;max-width:200px;pointer-events:none;color:var(--gf-ink); }
.gf-root[data-place="bottom-left"] .gf-label { left:28px;bottom:32px; }
.gf-root[data-place="top-left"] .gf-label { left:28px;top:34px; }
.gf-root[data-place="top-right"] .gf-label { right:32px;top:52px;align-items:flex-start; }
.gf-title { font-size:18px;font-weight:500;line-height:1.15;letter-spacing:-.012em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.gf-meta { font-family:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;letter-spacing:.03em;color:var(--gf-ink-soft);white-space:nowrap;animation:gf-roll .5s var(--gf-ease) both; }
@keyframes gf-roll {from{opacity:0;translate:0 7px;filter:blur(3px)}to{opacity:1;translate:0 0;filter:blur(0)}}
.gf-key {all:unset;box-sizing:border-box;position:absolute;right:22px;bottom:22px;z-index:12;width:58px;height:58px;border-radius:18px;display:grid;place-items:center;cursor:pointer;transition:transform .35s var(--gf-spring),box-shadow .35s var(--gf-ease),background .35s var(--gf-ease);}
.gf-key:hover {transform:translateY(-2px)}
.gf-key:active {transform:translateY(0) scale(.93);transition-duration:.12s}
.gf-key:focus-visible {outline:2px solid #4c8dff;outline-offset:3px}
.gf-key--add {color:#fff;background:radial-gradient(120% 90% at 50% 0%,#3a3a3f 0%,#121214 55%,#050506 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.22),inset 0 -3px 8px rgba(0,0,0,.7),0 0 0 1px rgba(0,0,0,.75),0 14px 22px -8px rgba(0,0,0,.55),0 3px 6px -2px rgba(0,0,0,.35);}
.gf-root[data-tone="dark"] .gf-key--add {color:#111113;background:radial-gradient(120% 90% at 50% 0%,#ffffff 0%,#ececee 55%,#d2d2d6 100%);box-shadow:inset 0 1px 0 #fff,inset 0 -3px 8px rgba(0,0,0,.14),0 0 0 1px rgba(0,0,0,.4),0 14px 22px -8px rgba(0,0,0,.7);}
.gf-key--more {color:#111113;background:linear-gradient(180deg,rgba(255,255,255,.92) 0%,rgba(226,226,230,.82) 100%);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:inset 0 1px 0 #fff,inset 0 -2px 4px rgba(0,0,0,.06),0 0 0 1px rgba(0,0,0,.16),0 10px 18px -8px rgba(0,0,0,.3);}
.gf-root[data-tone="dark"] .gf-key--more {color:#f5f5f7;background:linear-gradient(180deg,rgba(255,255,255,.16) 0%,rgba(255,255,255,.06) 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 0 0 1px rgba(255,255,255,.1),0 10px 18px -8px rgba(0,0,0,.6);}
.gf-key--more[aria-expanded="true"] {transform:scale(.96)}
.gf-glyph {display:block;max-width:none;fill:none;stroke:currentColor;stroke-linecap:round}
.gf-glyph--plus {width:26px;height:26px;stroke-width:1.6;animation:gf-turn .6s var(--gf-spring)}
.gf-glyph--more {width:30px;height:20px;stroke-width:1.7}
@keyframes gf-turn {from{rotate:-90deg}to{rotate:0deg}}
.gf-menu {position:absolute;right:22px;bottom:90px;z-index:20;min-width:176px;padding:6px;border-radius:16px;display:flex;flex-direction:column;background:rgba(252,252,253,.72);-webkit-backdrop-filter:blur(24px) saturate(1.6);backdrop-filter:blur(24px) saturate(1.6);box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 0 0 .5px rgba(0,0,0,.14),0 24px 48px -16px rgba(10,12,20,.4);transform-origin:100% 100%;opacity:0;visibility:hidden;transform:translateY(6px) scale(.94);transition:opacity .2s var(--gf-ease),transform .32s var(--gf-spring),visibility 0s .32s}
.gf-menu[data-open] {opacity:1;visibility:visible;transform:none;transition-delay:0s}
.gf-root[data-tone="dark"] .gf-menu {background:rgba(30,30,34,.72);box-shadow:inset 0 1px 0 rgba(255,255,255,.1),0 0 0 .5px rgba(255,255,255,.1),0 24px 48px -16px rgba(0,0,0,.8)}
.gf-menu-item {all:unset;box-sizing:border-box;padding:9px 12px;border-radius:10px;font-size:13.5px;font-weight:450;color:#18181b;cursor:pointer}
.gf-root[data-tone="dark"] .gf-menu-item {color:#f4f4f5}
.gf-menu-item:hover,.gf-menu-item:focus-visible {background:rgba(24,24,27,.07)}
.gf-root[data-tone="dark"] .gf-menu-item:hover,.gf-root[data-tone="dark"] .gf-menu-item:focus-visible {background:rgba(255,255,255,.09)}
.gf-menu-item--danger {color:#d92d20}
.gf-root[data-tone="dark"] .gf-menu-item--danger {color:#ff6b5e}
.gf-root:not([data-entered]) .gf-back,.gf-root:not([data-entered]) .gf-back-rim {translate:0 22px;opacity:0}
.gf-root:not([data-entered]) .gf-sheet {translate:0 -120px;opacity:0}
.gf-root:not([data-entered]) .gf-front {translate:0 46px;opacity:0}
.gf-root:not([data-entered]) .gf-key {opacity:0;scale:.6}
.gf-root:not([data-entered]) .gf-shadow {opacity:0}
.gf-back,.gf-back-rim {transition:translate 1s var(--gf-ease),opacity .9s var(--gf-ease)}
.gf-root[data-entered] .gf-sheet {transition-delay:calc(var(--gf-depth) * 40ms),0s,calc(.18s + var(--gf-depth) * 90ms),calc(.18s + var(--gf-depth) * 90ms)}
.gf-root[data-entered] .gf-front {transition-delay:0s,.42s,.42s}
.gf-key {transition:transform .35s var(--gf-spring),box-shadow .35s var(--gf-ease),opacity .6s var(--gf-ease) .7s,scale .7s var(--gf-spring) .7s}
.gf-root[data-paused] *,.gf-root[data-paused] *::before,.gf-root[data-paused] *::after {transition:none!important;animation:none!important}
.gf-root[data-paused] .gf-tilt {transform:none}
@media (prefers-reduced-motion:reduce) {
  .gf-root *,.gf-root *::before,.gf-root *::after {transition-duration:0s!important;transition-delay:0s!important;animation:none!important}
  .gf-tilt {transform:none}
}
`;
