# Design Tokens & Responsive Scale

This project uses a mobile-first scale driven by CSS custom properties in `src/styles/design-tokens.css`. Key decisions:

- **Root sizing**: `:root` is set to `62.5%`, so `1rem ≈ 10px` for easy math.
- **Typography**: Fluid `clamp()` sizes from `--font-size-xs` through `--font-size-xl`. Use the smallest size that keeps copy legible; body text defaults to `--font-size-base`.
- **Spacing**: `--space-1` → `0.4rem` (4px) up to `--space-10` → `6.4rem`. This mirrors a Tailwind-style rhythm for consistent padding, margins, and gaps.
- **Radii & shadows**: `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-pill`, `--shadow-soft`, and `--shadow-elevated` keep component curves and elevation consistent.
- **Palette**: Brand and neutral colors are exposed as tokens so new components avoid hard-coded hex values.

## Breakpoint Guidance

Media queries should use the following `rem`-based widths:

- `36rem` (≈576px): large phones
- `48rem` (≈768px): tablets / phablets
- `64rem` (≈1024px): small laptops
- `80rem` (≈1280px): desktop

Example:

```css
@media (min-width: 48rem) {
  .stack {
    flex-direction: row;
  }
}
```

## Usage Tips

1. Prefer `gap`, `padding`, and `margin` values from the spacing tokens instead of raw numbers.
2. Reach for `clamp()` when sizing text, media, or containers so UI scales smoothly across phones and tablets.
3. For touch targets, aim for a minimum height of `4.4rem` and use `var(--radius-pill)` or `var(--radius-md)` to keep them finger-friendly.
4. Keep cards and surfaces on `var(--color-surface)` or `var(--color-elevated)` with `var(--shadow-soft)` for consistent depth cues.
