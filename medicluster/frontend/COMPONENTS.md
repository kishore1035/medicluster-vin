# UI components

This existing Vite application uses React 18 and Tailwind CSS 3. TypeScript now
supports incremental adoption: existing JavaScript stays valid, while `.ts` and
`.tsx` files use strict checking. No context provider is needed for SculptureHero.

## Paths

- Reusable UI: `src/components/ui`, imported as `@/components/ui/...`.
- Existing feature components: `src/components` and `src/patient-app`.
- Global styles and shadcn semantic tokens: `src/index.css`.
- Public download page styles: `src/pages/download-page.css`.
- Tailwind configuration: `tailwind.config.js`.
- shadcn configuration and aliases: `components.json`.
- Class-name utility: `src/lib/utils.ts`.

`/components/ui` means the `components/ui` folder under the source root in this
project, not a directory at the filesystem root. Keeping registry components in
`src/components/ui` gives the shadcn CLI a consistent destination and makes
`@/components/ui/...` imports resolve in both Vite and TypeScript.

## Install and validate

```bash
cd medicluster/frontend
npm ci
npm run typecheck
npm test
npm run build
```

TypeScript, React types, `lucide-react`, `clsx` and the Tailwind 3-compatible
`tailwind-merge` 2.x are installed. Tailwind already works through PostCSS; no
Tailwind upgrade is needed. `components.json` and semantic tokens configure the
existing project manually, preserving its theme.

For a fresh project, follow the [shadcn Vite setup](https://ui.shadcn.com/docs/installation/vite)
and initialize with the CLI:

```bash
npx shadcn@latest init -t vite
```

For this configured checkout, run `npx shadcn@latest info` to inspect paths. Add
future components with an explicit registry, e.g. `npx shadcn@latest add @shadcn/button`.
Do not reinitialize this checkout to install the sculpture. Tailwind 3 setup
reference: <https://v3.tailwindcss.com/docs/installation>.

## Liquid sculpture

`src/components/ui/liquid-sculpture-hero.tsx` contains the supplied WebGL2 flow-map,
ping-pong simulation, instanced particles, static image pass and reusable layout.
`src/components/ui/demo.tsx` shows the standalone component with MediCluster copy.
The supplied malformed newline literals are corrected to `\n`. Icons use Lucide.

The homepage uses `backgroundOnly`, passing `heroRef` via `eventTargetRef`, so
existing navigation, headline, app links and download controls stay semantic HTML.
The component adds no duplicate title or navigation in this mode. It is decorative
and hidden from assistive technology. Its parent softens the sculpture to keep
MediCluster text readable. The original author attribution remains in the source.

The homepage keeps motion state locally and passes `paused`. Pausing freezes GPU
rendering. Reduced motion settles to a static image, pointer events do not disturb
it, and leaving the viewport or hiding the tab stops animation. Without WebGL2,
float framebuffers, or after context loss, the static sculpture remains visible.
Desktop and mobile share a local landscape sculpture; the mobile scale allows it
to extend past the sides without horizontal page overflow. Optional `mobileSrc`,
`darkSrc`, and `mobileDarkSrc` support dedicated images in other integrations.

The provided sculpture is saved as `public/images/liquid-sculpture.webp` from the
component's supplied CDN asset. Same-origin hosting avoids third-party outages
and CORS failures. All supplied artwork is real; no placeholder image is needed.
For stock-image variants, this verified Unsplash abstract image can be passed via
`src` and `mobileSrc`:

https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?auto=format&fit=crop&w=1600&q=85

A transparent cutout or sculpture against one flat color works best for the
background-keying shader. A full photograph instead animates the image surface.
Set `imageBackground` only when the source has a known, uniform background color.

## Glass product folders

`src/components/ui/glass-folder-cards.tsx` adds the supplied layered glass folder,
seeded artwork painter, hover hinge, file fan, add animation and keyboard menu.
The artwork is generated locally from the supplied recipes; it needs no image
URLs, fonts, provider, or additional dependency. Folder action icons use the
already-installed `lucide-react`. The standalone supplied examples live in
`src/components/ui/glass-folder-cards-demo.tsx` so the sculpture's existing
`demo.tsx` is preserved.

The product grid uses `src/components/download/ProductFolderCard.tsx`:

- Four real product folders, with existing descriptions and web destinations.
- `DownloadPage` controls the single open folder; each component owns its files.
- Folder files link to web apps or installation help. The patient APK is a click
  action through the existing verified downloader, never a navigable APK URL.
- The outside download button shares that same downloader and in-flight lock.
- Unconfigured services show a disabled Coming soon sheet, without fake links.
- Production uses a More menu with real Open/Close and installation actions.
  Adding files is available in the reusable component/demo, not the product grid.
- Files are inert and outside the tab order while closed. Enter/Space toggles the
  folder; Escape closes and restores focus. Arrow keys, Home and End drive menus.
- Desktop uses four columns, intermediate screens two, and phones one. A
  ResizeObserver scales the folder geometry to its available width.
- Global pause and reduced motion suppress folder animation and pointer tilt.

The supplied component reads its initial `files` once. The patient folder is
keyed by release checksum so newly fetched release metadata refreshes its files.
To manage ordinary documents, use `onAdd` and `onFilesChange`; to run a product
file action, use `onFileSelect`. Use the optional `image` and per-file `image`
props only when replacing generated artwork with a real image is intentional.

## Full public website

`DownloadPage` now composes nine sections: the split hero, care story, cinematic
clinic scene, role-based apps, patient preview, clinical preview, getting-started
journey, closing call to action, and FAQ. The footer provides workspace and
installation links. The local `/home/vinay/yuva-garden-next` reference informed
the editorial pacing, Hanken Grotesk/Bodoni Moda typography, scroll zoom and
large closing wordmark; no garden content or runtime dependency is copied.

`LandingSections.tsx` holds the semantic sections and patient preview state.
`ClinicalSpotlight.tsx` owns the compact clinical preview, keyboard-accessible
method tabs and group-focus controls. Its hierarchy diagram, density outlines,
centroid markers and mixture overlaps illustrate the selected method without
using real patient data. Its heading uses the existing sans face, with one
terracotta serif accent, and the preview stays beside the copy on desktop.
Patient feature selectors change the phone preview; clinical tabs change an
explicitly illustrative cluster diagram. Neither preview displays patient data.
`SiteMotion.tsx` uses passive scroll events, one scheduled animation frame,
IntersectionObserver and ResizeObserver. The global pause control and reduced
motion preference also disable the scroll effects and reveal transitions.

Three generated photographic assets are hosted locally as WebP files in
`public/images`: `care-conversation.webp`, `care-corridor.webp`, and
`patient-preview-scene.webp`. Together they total about 403 KB. Text, controls,
phone UI and charts remain native elements. Hero media loads eagerly; downstream
media loads lazily. All marketing styles remain scoped to `.download-portal`.

The hero now uses `CareArtifact.tsx` and a transparent `care-island.webp` instead
of the portrait photograph. The generated clinic-and-courtyard island follows
the Yuva Garden reference's freestanding object, thin orbit and floating motion.
Separate wrappers handle scroll position, pointer response and idle floating.
The existing global pause control stops motion; reduced motion disables it,
while IntersectionObserver and document visibility pause the idle animation
offscreen and in hidden tabs. The artifact has descriptive alt text and scales
to a compact scene on phones without clipping its silhouette.
