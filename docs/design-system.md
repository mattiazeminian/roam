# ROAM — Design System

All tokens live in `src/theme/`. Components import from `@/theme` only; they do
not hardcode values.

```
src/theme/
├── colors.ts      # palette + semantic color tokens
├── typography.ts  # font families + type scale + tabular figures
├── spacing.ts     # 4pt spacing scale
├── borders.ts     # border widths + radii
├── use-theme.ts   # resolves semantic colors for the current color scheme
└── index.ts       # barrel export
```

## Color tokens

Raw palette (internal): `black`, `white`, `gray` `#6B6B6B`, `grayLight`
`#E5E5E5`, `grayLighter` `#F2F2F2`, `grayMid` `#A3A3A3`, `grayDark` `#1A1A1A`,
`grayBorder` `#333333`, `lime` `#B7FF00`, `limeDeep` `#A3E600`,
`limeBright` `#C9FF3D`.

Semantic tokens (use these):

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `background` | white | black | screen background |
| `surface` | grayLighter | grayDark | grouped/secondary surface |
| `border` | black | white | structural 1px borders |
| `borderSubtle` | grayLight | grayBorder | low-emphasis borders |
| `divider` | grayLight | grayBorder | horizontal rules |
| `text` | black | white | primary text |
| `textSecondary` | gray | grayMid | secondary text |
| `textDisabled` | grayMid | gray | disabled text |
| `disabled` | grayLight | grayDark | disabled fills/borders |
| `inverse` | white | black | text on inverted fill |
| `inverseBackground` | black | white | inverted fill (primary button) |
| `accent` | lime | lime | the accent fill/line/marker |
| `accentForeground` | black | black | text/icons on accent |
| `accentMuted` | lime @18% | lime @22% | rings, quiet accent surfaces |
| `selected` | lime | lime | selected preset/route |
| `active` | lime | lime | active/ready state |
| `pressed` | limeDeep | limeBright | pressed accent fill |

Access them via `useTheme()`, which returns the semantic set for the current
color scheme. Do not reference `palette` from components.

Measured contrast (WCAG AA, 4.5:1 for normal text):

| Pair | Light | Dark |
| --- | --- | --- |
| `text` on `background` | 21.0:1 | 21.0:1 |
| `textSecondary` on `background` | 5.3:1 | 8.3:1 |
| `inverse` on `inverseBackground` | 21.0:1 | 21.0:1 |
| `accentForeground` on `accent` | 17.4:1 | 17.4:1 |

Lime is a fill/line/marker color, not a text color: lime text on white would
fail contrast, so accent surfaces always use black (`accentForeground`).

Dark mode deliberately uses lighter tonal variants rather than inverted values,
so secondary text and dividers stay legible on black. `textDisabled` is exempt
from the contrast minimum (WCAG 1.4.3) and is intentionally faint.

## Typography

Native system font. `Text` primitive applies a variant, a color token, and
optional `mono` / `tabular` modifiers.

| Variant | Size | Line height | Weight | Tracking |
| --- | --- | --- | --- | --- |
| `display` | 48 | 52 | 600 | -1 |
| `large` | 32 | 38 | 600 | -0.5 |
| `title` | 24 | 30 | 600 | -0.25 |
| `heading` | 18 | 24 | 600 | 0 |
| `body` | 16 | 24 | 400 | 0 |
| `label` | 13 | 18 | 500 | +0.5 |
| `caption` | 11 | 14 | 500 | +0.75 |

Use `tabular` for any distance, time or pace value. Use `mono` sparingly for
technical values. Labels are often uppercased at the point of use (e.g. button
text), not by the variant itself.

## Spacing

4pt base scale:

| Token | Value |
| --- | --- |
| `none` | 0 |
| `xxs` | 4 |
| `xs` | 8 |
| `sm` | 12 |
| `md` | 16 |
| `lg` | 20 |
| `xl` | 24 |
| `xxl` | 32 |
| `xxxl` | 40 |
| `huge` | 48 |
| `giant` | 64 |

Prefer larger tokens. When in doubt, add space rather than a border.

## Borders & radii

- `borderWidths`: `none` 0, `hairline` (`StyleSheet.hairlineWidth`), `thin` 1,
  `thick` 2. Structural borders use `thin`.
- `radii`: `none` 0, `sm` 2, `md` 4. Default is `none`.

## Buttons

`Button` is square, has a 1px border, a 52px minimum height, and no shadow or
gradient.

- **Accent** — `accent` (lime) fill, `accentForeground` (black) text. The
  primary "go" action: `FIND ROUTES`, `START THIS ROUTE`.
- **Primary** — `inverseBackground` fill, `inverse` text. Strong neutral action.
- **Secondary** — transparent (background) fill, `border` border, `text` text.
- **Disabled** — `disabled` fill/border with `textDisabled` text.
- **Pressed** — scales to 0.97 over ~90 ms, shifts fill (`pressed` for accent,
  `surface` for secondary), and returns over ~150 ms. No bounce.

## Motion & haptics

Motion is short and purposeful; it always communicates a state change.

- Press: scale `1 → 0.97 → 1` (`usePressScale`, 90 ms / 150 ms timing).
- Distance value: eases in (fade + 6px rise, 180 ms) when it changes.
- Route: draws progressively along its geometry on mount (720 ms, staggered
  ~140 ms per candidate), and interpolates neutral → lime on selection (220 ms).
- Search: two restrained lime rings expand around the current location while
  ROAM is finding routes; the location marker eases in once and never pulses.
- Navigation: a short fade (220 ms) so the map feels anchored.

Haptics (`src/lib/haptics.ts`, via `expo-haptics`): light impact for `±`,
finding routes and back; selection for preset/route selection; medium for
starting a route; success for "route ready". Never on decorative motion.

## Component principles

- Keep the primitive set small. Current primitives: `Text`, `Button`,
  `Divider`. Add new ones only when a pattern repeats.
- No premature abstraction. Three usages before a new component.
- Components take `style` passthrough and compose via the `style` array.
- Structure comes from `Divider` and `borderWidths.thin`, not from cards or
  shadows.
- No emoji as UI. Icons, when needed, come from the platform (`expo-symbols` /
  SF Symbols) and stay monochrome.
