# Design tokens: moving raw hex colours to `@theme` (proposal)

Status: proposal only (UX/UI batch 2026-11-13, WS-G). No code has moved yet.
This file plans the move; each step below is a separate, reviewable change.

## Where we are

Counted on 2026-11-13 with `grep -roE "#[0-9a-fA-F]{6}" web/src | wc -l`:

| Measure | Count |
|---|---|
| Six-digit hex literals in `web/src` | 2 791 |
| of which in `.ts`/`.tsx` | 2 474 |
| of which in `.css` | 313 |
| Tailwind arbitrary colours (`[#rrggbb]`) | 2 056 |
| Distinct colours | 525 |

The owner brief quoted 1 927; the number has grown since. Re-count before each step.

By folder (`web/src/...`):

| Folder | Hex literals |
|---|---|
| `features/administration` | 546 |
| `routes/staff` | 465 |
| `features/landing` | 444 (own token set in `landing.css`, scoped to `.lp`) |
| `components` | 354 |
| `routes/technical` | 227 |
| `features/staff` | 209 |
| `features/digital-twin` | 142 |
| `features/technical` | 114 |
| `routes/admin` | 103 |
| `features/representative` | 66 (most already behind `--rep-*` in `tokens.css`) |
| `auth` | 23 |

Ten colours cover about 40% of all uses: `#64748b` (316), `#e2e8f0` (134),
`#0f172a` (133), `#f1f5f9` (85), `#2d719e` (72), `#2563eb` (72), `#94a3b8` (70),
`#b23e31` (63), `#334155` (62), `#2d3748` (59). Several are near-duplicates
(`#2d3748` and `#334155` as body text, `#2563eb` and `#2d719e` as the accent),
which is why the four consoles drift apart.

Today `web/src/index.css` has no `@theme` block: only `--bg-primary`,
`--text-primary`, `--text-muted` on `:root` and the `text-muted` utility (WS-0).

## Target

One `@theme` block in `web/src/index.css`, named by role, not by hue, so Tailwind
generates `bg-*`, `text-*`, `border-*`, `ring-*` utilities from it:

```css
@theme {
  --color-ink: #0f172a;          /* headings, values */
  --color-body: #334155;         /* running text */
  --color-muted: #5b6b7f;        /* meaningful secondary text, 4.5:1 (replaces #64748b/#94a3b8 for words) */
  --color-faint: #94a3b8;        /* icons and decoration only, never words */
  --color-line: #e2e8f0;         /* borders, dividers */
  --color-ground: #f4f7fb;       /* console page ground */
  --color-surface: #ffffff;      /* cards */
  --color-subtle: #f1f5f9;       /* hover, quiet tiles */
  --color-accent: #2d719e;       /* links, focus, the one console blue */
  --color-accent-soft: #edf3fb;  /* primary button ground in every console */
  --color-accent-ink: #4a6fa5;   /* primary button text */
  --color-ok: #15803d;   --color-ok-soft: #ecfdf3;
  --color-warn: #b45309; --color-warn-soft: #fffbeb;
  --color-danger: #b23e31; --color-danger-soft: #fff1ef;
}
```

`text-muted` from WS-0 keeps working; it becomes an alias of `--color-muted`.
The landing page keeps its own `.lp` token set; the Representative `--rep-*`
variables are redefined as `var(--color-*)` so their pages need no edit.

## Steps

Each step is one PR, does not change how anything looks (except step 2), and
ends with `scripts/verify web` green plus screenshots at 375/800/1366 px.

1. **Add the `@theme` block** with the values above, and a Vitest check that
   every `--color-*` text token reaches 4.5:1 on `--color-surface` and
   `--color-ground` (extend `web/src/muted-text.test.ts`). No usage changes.
2. **Shared primitives** (`components/ui/ui-classes.ts`, `ConsolePrimitives.tsx`,
   `ConsoleHeader.tsx`, `GroupedSidebar.tsx`, `status-tone.ts`): replace hex with
   token utilities (`text-ink`, `border-line`, `bg-accent-soft`). These feed
   every console, so most screens move with a few files. Fold
   `softConsoleMain`'s primary-button override into `buttonClass('primary')`
   itself, so no shell has to repaint buttons.
3. **One area per PR**, in order of size: `features/administration` and
   `routes/staff/manage`, then `routes/staff` + `features/staff`, then
   `routes/technical` + `features/technical`, then `routes/admin`, `auth`,
   `features/digital-twin`. A codemod replaces only exact matches of the ten
   common colours; anything else is mapped by hand or left with a comment.
4. **CSS files**: point `features/representative/tokens.css` at the theme
   variables; leave `features/landing/landing.css` on its own scope.
5. **Guard**: an ESLint `no-restricted-syntax` rule (or a Vitest scan like
   `nav-page-titles.test.ts`) that fails on a new `[#rrggbb]` in `routes/` and
   `features/` outside the landing page. Turn it on only after step 3, with
   the remaining count as an allow-list that may only shrink.

## Rules while migrating

- Map by role, not by nearest hue: `#64748b` used for a word becomes
  `text-muted`; used for an icon it becomes `text-faint`.
- No visual redesign inside a migration PR. A colour that should change is a
  separate PR with its own screenshots.
- Do not migrate a file another open PR is editing; rebase first.
