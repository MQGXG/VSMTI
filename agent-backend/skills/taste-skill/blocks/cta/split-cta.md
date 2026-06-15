---
name: split-cta
category: cta
dial_compatibility:
  variance: [5, 9]
  motion: [3, 7]
  density: [2, 4]
when_to_use: "End-of-page conversion section. For SaaS signup, portfolio contact, or download prompts. Positioned as the last section before footer."
not_for: "In-page micro-cta, or pages where the hero CTA already captures the primary conversion intent."
stack: ["react", "next", "tailwind", "motion"]
---

## 1. Visual sketch

```
┌────────────────────────────────────────────────┐
│                                                 │
│   ┌──────────────────────┬──────────────────┐  │
│   │                      │                  │  │
│   │   Headline           │   (visual asset: │  │
│   │   Subtext            │    screenshot /  │  │
│   │                      │    mockup /      │  │
│   │   [Primary CTA]      │    illustration) │  │
│   │   [Secondary CTA]    │                  │  │
│   │                      │                  │  │
│   └──────────────────────┴──────────────────┘  │
│                                                 │
│   (optional bottom text: "No credit card" etc)  │
└────────────────────────────────────────────────┘
```

Left: content stack. Right: visual asset. Full-width section with generous padding.

## 2. Props API

```typescript
interface SplitCtaProps {
  headline: string;
  subtext: string;
  primaryCta: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  asset?: {
    src: string;
    alt: string;
  };
  footnote?: string;       // "No credit card required. Cancel anytime."
  theme?: "light" | "dark" | "brand";
}
```

## 3. Code Sketch

```tsx
// Server Component
export function SplitCta({
  headline,
  subtext,
  primaryCta,
  secondaryCta,
  asset,
  footnote,
  theme = "brand",
}: SplitCtaProps) {
  return (
    <section
      className={cn(
        "px-6 py-24 md:py-32 md:px-12 lg:px-20",
        theme === "brand" && "bg-zinc-900 dark:bg-zinc-950 text-white",
        theme === "light" && "bg-zinc-50 dark:bg-zinc-900",
        theme === "dark" && "bg-black text-white"
      )}
    >
      <div className="mx-auto grid max-w-6xl grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center">
        <CtaContent
          headline={headline}
          subtext={subtext}
          primaryCta={primaryCta}
          secondaryCta={secondaryCta}
          footnote={footnote}
          theme={theme}
        />
        {asset && (
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl">
            <img
              src={asset.src}
              alt={asset.alt}
              className="h-full w-full object-cover"
            />
          </div>
        )}
      </div>
    </section>
  );
}
```

```tsx
// Client island for entry animation
"use client";
import { motion, useReducedMotion } from "motion/react";

function CtaContent({ headline, subtext, primaryCta, secondaryCta, footnote, theme }: any) {
  const reduce = useReducedMotion();
  const isDark = theme === "brand" || theme === "dark";

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, x: -30 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      <h2 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tighter leading-none">
        {headline}
      </h2>
      <p className={cn(
        "mt-6 max-w-[45ch] text-base leading-relaxed",
        isDark ? "text-zinc-400" : "text-zinc-600"
      )}>
        {subtext}
      </p>
      <div className="mt-10 flex flex-wrap gap-4">
        <CtaButton
          variant={isDark ? "light" : "primary"}
          href={primaryCta.href}
        >
          {primaryCta.label}
        </CtaButton>
        {secondaryCta && (
          <CtaButton
            variant={isDark ? "ghost-light" : "ghost"}
            href={secondaryCta.href}
          >
            {secondaryCta.label}
          </CtaButton>
        )}
      </div>
      {footnote && (
        <p className={cn(
          "mt-6 text-sm",
          isDark ? "text-zinc-500" : "text-zinc-400"
        )}>
          {footnote}
        </p>
      )}
    </motion.div>
  );
}
```

## 4. Mobile Fallback

Grid collapses to single column at `md` breakpoint. Asset appears BELOW the CTA content. `py-24` reduces to `py-16`. Image aspect ratio stays `4/3`. CTA buttons stack vertically if they don't fit side by side.

## 5. Motion Variants

| MOTION_INTENSITY | Behaviour |
|---|---|
| 1-3 | Static. No entry animation. |
| 4-7 | Content slides in from left (`x: -30` → 0) on scroll into view. Asset fades in with slight scale (`0.95` → 1). CTAs stagger with `0.08s` delay each. |
| 8-10 | Content has clip-path reveal (expanding from left edge). Asset has tilt parallax on scroll. CTA buttons have magnetic hover physics. Background has subtle mesh gradient animation. |

Reduced-motion: static render.

## 6. Dark-mode notes

- `theme="brand"` uses dark background (`bg-zinc-900 dark:bg-zinc-950`) with white text. Optimised for high contrast.
- `theme="light"` uses `bg-zinc-50 dark:bg-zinc-900` with standard text hierarchy.
- `theme="dark"` uses `bg-black` for true dark-mode CTA sections.
- CTA buttons adapt: on brand/dark themes, primary CTA is light (white bg, dark text); on light theme, primary CTA is brand-colored.

## 7. Anti-patterns

- **Matching hero CTA intent.** If the hero says "Get started," the CTA section should say "Get started" too, not "Sign up free" (Section 4.5 NO DUPLICATE CTA INTENT).
- **Missing asset.** A CTA section without any visual feels thin. Even a simple screenshot or abstract illustration improves conversion.
- **Overly long headline.** Keep ≤ 8 words. The CTA section is a closing statement, not an explanation.
- **Multiple CTAs with the same intent.** If you have "Start free trial" and "Try it out", pick one label.
- **No visual relationship to the hero asset.** The CTA asset should feel like a natural evolution of the page's visual language, not a random different image.

## 8. References

- Linear.app - bottom CTA section (dark background, split layout)
- Vercel.com - "Deploy now" CTA
- Stripe.com - "Try Stripe" closing section
