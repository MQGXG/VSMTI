---
name: asymmetric-split-hero
category: hero
dial_compatibility:
  variance: [6, 10]
  motion: [3, 10]
  density: [2, 5]
when_to_use: "Landing pages with one strong asset and one strong message. Default hero for SaaS, agency, premium consumer."
not_for: "Editorial / manifesto launches where the message IS the design."
stack: ["react", "next", "tailwind", "motion"]
---

## 1. Visual sketch

```
┌─────────────────────────────────────────────────┐
│  NAV (fixed, 64px)                              │
├────────────────────┬────────────────────────────┤
│                     │                            │
│  Eyebrow (opt)     │   (asset: image / video /   │
│  Headline          │    illustration / mockup)   │
│  Subtext           │                            │
│                     │                            │
│  [CTA] [CTA]       │                            │
│                     │                            │
│                     │   (optional: glass panel   │
│                     │    floating over asset)    │
└────────────────────┴────────────────────────────┘
       50%                    50%
```

Left column: content stack with generous padding. Right column: full-height visual asset. At `md` breakpoint both stack vertically.

## 2. Props API

```typescript
interface AsymmetricSplitHeroProps {
  eyebrow?: string;
  headline: string;
  subtext: string;
  primaryCta: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  asset: {
    type: "image" | "video" | "component";
    src?: string;
    alt?: string;
    component?: React.ReactNode;
  };
  theme?: "light" | "dark";
}
```

## 3. Code Sketch

```tsx
// Server Component shell; motion island extracted below
export function AsymmetricSplitHero({
  eyebrow,
  headline,
  subtext,
  primaryCta,
  secondaryCta,
  asset,
}: AsymmetricSplitHeroProps) {
  return (
    <section className="relative grid min-h-[100dvh] grid-cols-1 md:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-24 md:px-12 lg:px-20">
        {eyebrow && (
          <p className="mb-4 text-[11px] font-mono uppercase tracking-[0.18em] text-zinc-500">
            {eyebrow}
          </p>
        )}
        <h1 className="max-w-[14ch] text-4xl font-semibold tracking-tighter leading-none md:text-5xl lg:text-6xl text-zinc-900 dark:text-zinc-100">
          {headline}
        </h1>
        <p className="mt-6 max-w-[45ch] text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          {subtext}
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <CtaButton variant="primary" href={primaryCta.href}>
            {primaryCta.label}
          </CtaButton>
          {secondaryCta && (
            <CtaButton variant="ghost" href={secondaryCta.href}>
              {secondaryCta.label}
            </CtaButton>
          )}
        </div>
      </div>
      <div className="relative min-h-[50dvh] md:min-h-full overflow-hidden bg-zinc-100 dark:bg-zinc-900">
        {asset.type === "image" && asset.src && (
          <img
            src={asset.src}
            alt={asset.alt ?? ""}
            className="h-full w-full object-cover"
          />
        )}
        {asset.type === "component" && asset.component}
        {/* Glass overlay for dark asset legibility */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/10 to-transparent pointer-events-none" />
      </div>
    </section>
  );
}
```

```tsx
// Motion island for entry animation
"use client";
import { motion, useReducedMotion } from "motion/react";

export function AnimatedHeroContent({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();

  if (reduce) return <>{children}</>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
```

## 4. Mobile Fallback

At `md` breakpoint: grid collapses to single column. Content column comes FIRST (top), asset column SECOND (bottom). Asset column shrinks to `min-h-[40dvh]`. Padding reduces from `px-12 lg:px-20` to `px-6`. Button row wraps if needed.

```css
/* Tailwind handles this via grid-cols-1 md:grid-cols-2 */
```

## 5. Motion Variants

| MOTION_INTENSITY | Behaviour |
|---|---|
| 1-3 | Static. No entry animation. CSS hover on CTAs only. |
| 4-7 | Content fades up + y-40 over 0.8s on mount. Asset has subtle scale-in (1.05 → 1). CTAs stagger in with 0.1s delay each. |
| 8-10 | Content curtain-reveal (clip-path expands from center). Asset has parallax on scroll (Motion useScroll). CTA magnetic hover physics. |

Reduced-motion: all variants collapse to static (no-op).

## 6. Dark-mode notes

- Text: uses Tailwind `dark:text-zinc-100` / `dark:text-zinc-400`.
- Asset area: `dark:bg-zinc-900` fallback if image doesn't load.
- Glass overlay: use `bg-gradient-to-r from-black/20 to-transparent` in dark.
- Eyebrow: `dark:text-zinc-400` for legibility.

## 7. Anti-patterns

- **Text + gradient blob = not an asset.** The right column MUST have a real visual. Avoid `bg-gradient-to-br from-purple-500 to-pink-500` as the "asset."
- **Eyebrow + tagline below CTAs in same hero.** If both are present, drop the tagline (Section 4.7).
- **Overflowing headline.** Ensure headline ≤ 2 lines at desktop. If longer, reduce font scale.
- **Center-aligning content when VARIANCE > 4.** This block is intentionally left-aligned. Do not add `text-center` to the content column.
- **Duplicating CTA intent.** If the nav already says "Get started," the hero CTA must match that label (Section 4.5).

## 8. References

- Linear.app hero - asymmetric text/device split
- Vercel.com hero - left text / right terminal
- Stripe.com hero - left text / right dashboard screenshot
