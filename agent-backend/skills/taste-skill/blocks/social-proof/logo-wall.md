---
name: logo-wall
category: social-proof
dial_compatibility:
  variance: [3, 8]
  motion: [3, 6]
  density: [2, 4]
when_to_use: "Building credibility by showing known brands that use the product / service. Always placed directly below hero, never inside it."
not_for: "Pages where no real brands can be listed (early-stage startup with no customers - skip this section entirely)."
stack: ["react", "next", "tailwind"]
---

## 1. Visual sketch

```
┌────────────────────────────────────────────────┐
│  "Trusted by"     (optional, plain text)       │
│                                                 │
│  [LOGO] [LOGO] [LOGO] [LOGO] [LOGO] [LOGO]    │
│  [LOGO] [LOGO] [LOGO] [LOGO] [LOGO] [LOGO]    │
│                                                 │
│  (Single row on desktop, wrapped on mobile)     │
└────────────────────────────────────────────────┘
```

No labels, no industry tags, no description text below logos. Just logos and the optional heading.

## 2. Props API

```typescript
interface LogoWallProps {
  heading?: string;         // "Trusted by", "Used at", or skip entirely
  logos: Array<{
    name: string;           // brand name (for alt text + aria-label)
    src: string;            // SVG URL (Simple Icons CDN or local)
    href?: string;          // optional link to brand site
    width?: number;         // default 120
    height?: number;        // default 24
  }>;
  variant?: "centered" | "full-width";
}
```

## 3. Code Sketch

```tsx
export function LogoWall({ heading, logos, variant = "centered" }: LogoWallProps) {
  return (
    <section className="px-6 py-16 md:py-20 max-w-7xl mx-auto">
      {heading && (
        <p className="mb-10 text-center text-xs font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-500">
          {heading}
        </p>
      )}
      <div
        className={cn(
          "flex flex-wrap items-center justify-center gap-x-12 gap-y-8",
          variant === "full-width" && "justify-between"
        )}
      >
        {logos.map((logo) => (
          <LogoItem key={logo.name} logo={logo} />
        ))}
      </div>
    </section>
  );
}
```

```tsx
// Logo item — lightweight, no motion
function LogoItem({ logo }: { logo: LogoWallProps["logos"][0] }) {
  const img = (
    <img
      src={logo.src}
      alt={`${logo.name} logo`}
      width={logo.width ?? 120}
      height={logo.height ?? 24}
      className="h-6 w-auto opacity-40 grayscale transition-opacity hover:opacity-70 dark:opacity-30 dark:hover:opacity-60"
      loading="lazy"
    />
  );

  if (logo.href) {
    return (
      <a
        href={logo.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${logo.name} website`}
      >
        {img}
      </a>
    );
  }

  return img;
}
```

## 4. Mobile Fallback

Logos wrap naturally via `flex-wrap`. `gap-x-8 gap-y-6` on mobile (narrower). Logo `max-h-[20px]` to prevent oversized logos on small screens. If > 8 logos, consider a horizontal scroll-snap container on mobile.

```tsx
// Alternative mobile layout for many logos
<div className="flex overflow-x-auto gap-8 snap-x snap-mandatory md:flex-wrap md:overflow-visible">
  {logos.map(l => (
    <div key={l.name} className="snap-center shrink-0">
      <LogoItem logo={l} />
    </div>
  ))}
</div>
```

## 5. Motion Variants

| MOTION_INTENSITY | Behaviour |
|---|---|
| 1-3 | Static render. No animation. |
| 4-7 | Logos fade in sequentially on scroll into view (stagger 0.04s per logo, `y: 12` → `y: 0`). |
| 8-10 | Logos enter from alternating sides. Subtle horizontal infinite scroll marquee (CSS `animation: marquee 30s linear infinite`). On hover, marquee pauses. |

Reduced-motion: static render, no entry animation, no marquee.

## 6. Dark-mode notes

Logos use Simple Icons CDN with color parameter: `https://cdn.simpleicons.org/{slug}/ffffff` for dark backgrounds, `https://cdn.simpleicons.org/{slug}/000000` for light backgrounds. Alternatively, use single-color SVGs with Tailwind's `dark:opacity-30` and `opacity-40`. No white/black switching needed if logos are displayed at reduced opacity.

## 7. Anti-patterns

- **Logos inside the hero section.** Logo wall goes UNDER the hero (Section 4.7).
- **Industry labels below logos** (`Vercel + hosting`, `Stripe + payments`). Banned (Section 4.8 LOGO-ONLY rule).
- **Plain text wordmarks for invented brands.** Use generated SVG marks (Section 4.8).
- **"Quietly in use at" / "Quietly trusted by"** headers. Use natural language or skip the heading (Section 9.F).
- **Fake logos for real-brands section.** If the brand has no real customers yet, SKIP this section entirely. Do not invent fake startup names.
- **Logos too small to read.** Minimum `h-5` (`20px`) on desktop, ensure the brand is recognisable.
- **Rotating / animating logos without pause.** If using a marquee, pause on hover / focus for accessibility (Section 6.B).

## 8. References

- Linear.app - "Trusted by" logo strip below hero
- Vercel.com - customer logo wall
- Stripe.com - "Millions of businesses" logo grid
- Simple Icons: https://simpleicons.org/
