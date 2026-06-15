---
name: bento-grid
category: feature
dial_compatibility:
  variance: [7, 10]
  motion: [4, 8]
  density: [2, 5]
when_to_use: "Showcasing multiple features, capabilities, or offerings in a visually rich grid. Apple-style asymmetric tile composition."
not_for: "Simple 3-feature rows, dense data tables, or pages where content is uniform (use standard grid instead)."
stack: ["react", "next", "tailwind", "motion"]
---

## 1. Visual sketch

```
┌──────────────────────────────────────────────┐
│  Section header (optional eyebrow, headline)  │
├──────────────────────┬───────────────────────┤
│                      │                       │
│    FEATURE 1         │    FEATURE 2          │
│    (large tile,      │    (medium tile,      │
│     image + text)    │     text + stat)      │
│                      │                       │
├──────────────────────┴──────────┬────────────┤
│                                 │            │
│    FEATURE 3 (wide tile,        │  FEATURE 4 │
│     full-width, image bg)       │  (tall,    │
│                                 │   icon+)   │
└─────────────────────────────────┴────────────┘
```

Tiles are deliberately sized differently: 2-col hero tile, 1-col text tiles, full-width media tile, tall accent tile. No two tiles have the same aspect ratio.

## 2. Props API

```typescript
interface BentoTile {
  id: string;
  title: string;
  description?: string;
  image?: { src: string; alt: string };
  gradient?: string;           // brand-appropriate gradient
  stat?: { value: string; label: string };
  icon?: React.ReactNode;
  span: "2col" | "2row" | "full" | "1x1" | "tall";
  theme?: "light" | "dark" | "tinted";
}

interface BentoGridProps {
  eyebrow?: string;
  headline: string;
  tiles: BentoTile[];
}
```

## 3. Code Sketch

```tsx
// Server Component
import { cn } from "@/lib/utils";

const spanClasses: Record<string, string> = {
  "2col": "md:col-span-2",
  "2row": "md:row-span-2",
  full: "md:col-span-3",
  "1x1": "",
  tall: "md:row-span-2",
};

export function BentoGrid({ eyebrow, headline, tiles }: BentoGridProps) {
  return (
    <section className="px-6 py-24 md:px-12 lg:px-20 max-w-7xl mx-auto">
      {eyebrow && (
        <p className="mb-4 text-[11px] font-mono uppercase tracking-[0.18em] text-zinc-500">
          {eyebrow}
        </p>
      )}
      <h2 className="mb-16 text-3xl md:text-4xl font-semibold tracking-tighter text-zinc-900 dark:text-zinc-100">
        {headline}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-[200px] md:auto-rows-[240px]">
        {tiles.map((tile) => (
          <BentoTile key={tile.id} tile={tile} />
        ))}
      </div>
    </section>
  );
}
```

```tsx
// Client island for hover + entry effects
"use client";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

function BentoTile({ tile }: { tile: BentoTile }) {
  const reduce = useReducedMotion();
  const hasVisual = tile.image || tile.gradient;

  return (
    <motion.div
      className={cn(
        "relative rounded-2xl overflow-hidden p-6 flex flex-col justify-end",
        spanClasses[tile.span],
        hasVisual
          ? "text-white"
          : "bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100",
        tile.theme === "tinted" && "bg-zinc-900/5 dark:bg-zinc-100/5"
      )}
      initial={reduce ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      whileHover={reduce ? undefined : { scale: 1.01 }}
    >
      {/* Background image */}
      {tile.image && (
        <img
          src={tile.image.src}
          alt={tile.image.alt}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {/* Gradient overlay */}
      {tile.gradient && (
        <div className={cn("absolute inset-0", tile.gradient)} />
      )}
      {/* Dark scrim for text legibility over images */}
      {tile.image && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
      )}

      {/* Content */}
      <div className="relative z-10">
        {tile.icon && <div className="mb-3">{tile.icon}</div>}
        {tile.stat && (
          <div className="mb-1">
            <span className="text-2xl md:text-3xl font-bold tracking-tight">
              {tile.stat.value}
            </span>
            <span className="ml-1.5 text-sm opacity-70">{tile.stat.label}</span>
          </div>
        )}
        <h3 className="text-lg font-semibold tracking-tight">{tile.title}</h3>
        {tile.description && (
          <p className="mt-1 text-sm opacity-80 max-w-[40ch]">
            {tile.description}
          </p>
        )}
      </div>
    </motion.div>
  );
}
```

## 4. Mobile Fallback

At `md` breakpoint: ALL tiles collapse to `w-full` single column. The `auto-rows` grid becomes `grid-cols-1`. `spanClasses` are ignored (Tailwind `md:` prefix ensures no effect below `md`). Tile order is preserved but all tiles render at equal visual weight (no size hierarchy on mobile). Tile height becomes `h-[200px]` minimum.

## 5. Motion Variants

| MOTION_INTENSITY | Behaviour |
|---|---|
| 1-3 | Static grid (no entry, no hover). Content displayed. |
| 4-7 | Staggered entry: each tile fades up with `y: 20` on scroll into view. Delay cascade `0.08s` per tile. `whileHover: scale(1.01)` with subtle shadow. |
| 8-10 | Tiles enter from different directions (odd: left, even: right, center: bottom). Parallax background shift on mouse move within tile. Spotlight border on hover (radial gradient following cursor). |

Reduced-motion: all motion disabled, immediate render.

## 6. Dark-mode notes

- Non-visual tiles: `bg-zinc-50 dark:bg-zinc-900` with `text-zinc-900 dark:text-zinc-100`.
- Tinted tiles: `bg-zinc-900/5 dark:bg-zinc-100/5` for a subtle tinted surface.
- Gradient tiles: ensure text contrast against any background. Test `opacity-80` for descriptions in both modes.
- Image tiles: the scrim (`bg-gradient-to-t from-black/60`) works in both modes independently of the page theme.

## 7. Anti-patterns

- **ALL tiles are white-on-white text cards.** At least 2-3 tiles MUST have real visual variation (image, gradient, tinted background). Section 4.7 Bento Background Diversity.
- **Empty cells.** N tiles = N cells. Do not add blank placeholder tiles to fill the grid (Section 4.7 BENTO CELL COUNT RULE).
- **Repetitive composition.** Do not use the same span pattern for all tiles (e.g. all `1x1`). Mix `2col`, `tall`, `full`, `1x1`.
- **Text-heavy tiles without visual.** A tile with only an icon + 3 lines of text is low density. Add a stat, gradient background, or image.
- **Purple gradients.** Avoid AI-purple. Use brand-appropriate gradients or neutral-toned overlays (Section 4.2 LILA RULE).
- **Section-Layout-Repetition.** If you already used a bento grid for "Features," do not use another bento grid for "Capabilities" on the same page (Section 4.7).

## 8. References

- Apple.com - MacBook Pro / iPad Pro feature grids
- Linear.app - feature bento on /pricing
- Stripe.com - "Why Stripe?" bento section
