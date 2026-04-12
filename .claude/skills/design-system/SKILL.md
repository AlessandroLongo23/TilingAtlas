---
name: design-system
description: Use when someone asks to apply design system rules, audit a component for consistency or accessibility, build a component with proper tokens and structure, enforce a11y standards, or review frontend code for design system violations.
---

## What This Skill Does

Enforces design system discipline across all frontend work. Covers three modes — apply rules silently as a reference during UI work, audit an existing component, or generate a new component from scratch. Stack: SvelteKit 2 + Svelte 5 runes + Tailwind CSS 3 + CSS custom properties.

---

## Mode Detection

Detect which mode to use from context:

- **Reference mode** — user is writing or editing UI code. Apply rules inline without announcing it.
- **Audit mode** — user says "audit", "review", "check", or points at a specific component file.
- **Generate mode** — user asks to "build", "create", or "scaffold" a component.

---

## 1. Design Tokens

### Token Hierarchy

Always use **semantic tokens** (named by purpose) over **literal tokens** (named by value).

```
// BAD — literal
color: #3b82f6;
color: theme('colors.blue.500');

// GOOD — semantic
color: var(--color-primary);
color: var(--color-text-muted);
```

### Token Categories

Define tokens in this structure inside CSS (`:root` or a theme class):

```css
:root {
  /* Color — base palette (literal, never used directly in components) */
  /* oklch(L C H) — L: 0–1 lightness, C: 0–0.4 chroma, H: 0–360 hue */
  --palette-brand-50: oklch(0.97 0.02 250);
  --palette-brand-500: oklch(0.55 0.18 250);
  --palette-brand-600: oklch(0.48 0.18 250);

  /* Color — semantic (use these everywhere) */
  --color-primary: var(--palette-brand-500);
  --color-primary-hover: var(--palette-brand-600);
  --color-surface: oklch(1 0 0);
  --color-surface-elevated: oklch(0.98 0 0);
  --color-surface-overlay: oklch(0.96 0 0);
  --color-border: oklch(0.88 0 0);
  --color-border-strong: oklch(0.72 0 0);
  --color-text: oklch(0.15 0 0);
  --color-text-muted: oklch(0.50 0 0);
  --color-text-disabled: oklch(0.65 0 0);
  --color-text-inverse: oklch(1 0 0);
  --color-error: oklch(0.55 0.20 27);
  --color-success: oklch(0.60 0.17 145);
  --color-warning: oklch(0.72 0.17 75);

  /* Spacing — 4px base unit */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  --space-16: 4rem;

  /* Typography */
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 1.875rem;
  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.7;
  --tracking-tight: -0.03em;
  --tracking-normal: 0em;
  --tracking-wide: 0.05em;

  /* Radius */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --radius-full: 9999px;

  /* Shadows — always color-tinted, never flat gray */
  --shadow-sm: 0 1px 2px hsl(0 0% 0% / 0.05);
  --shadow-md: 0 2px 8px hsl(0 0% 0% / 0.08), 0 1px 2px hsl(0 0% 0% / 0.04);
  --shadow-lg: 0 8px 24px hsl(0 0% 0% / 0.1), 0 2px 4px hsl(0 0% 0% / 0.05);
  --shadow-xl: 0 20px 48px hsl(0 0% 0% / 0.12), 0 4px 8px hsl(0 0% 0% / 0.06);

  /* Z-index layers */
  --z-base: 0;
  --z-elevated: 10;
  --z-dropdown: 100;
  --z-modal: 200;
  --z-toast: 300;
  --z-tooltip: 400;

  /* Motion */
  --duration-fast: 120ms;
  --duration-base: 200ms;
  --duration-slow: 350ms;
  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
}
```

### Token Rules

- Never use raw hex, `rgb()`, `hsl()`, or hardcoded values in component styles — always reference a token.
- All color token values must use `oklch(L C H)` — never hex or hsl. oklch produces perceptually uniform palettes and predictable lightness steps.
- Never use default Tailwind color palette directly (`blue-500`, `indigo-600`, etc.) — map Tailwind to CSS vars via `tailwind.config.js`.
- Spacing must follow the 4px grid — use token steps, not arbitrary values.
- Shadows must be layered and color-tinted — never `shadow-md` alone without customization.

### Tailwind Token Mapping

Wire CSS vars into Tailwind config:

```js
// tailwind.config.js
theme: {
  extend: {
    colors: {
      primary: 'var(--color-primary)',
      'primary-hover': 'var(--color-primary-hover)',
      surface: 'var(--color-surface)',
      'surface-elevated': 'var(--color-surface-elevated)',
      border: 'var(--color-border)',
      text: 'var(--color-text)',
      'text-muted': 'var(--color-text-muted)',
      error: 'var(--color-error)',
      success: 'var(--color-success)',
    },
    borderRadius: {
      sm: 'var(--radius-sm)',
      md: 'var(--radius-md)',
      lg: 'var(--radius-lg)',
    },
  }
}
```

---

## 2. Component Structure

### File Naming

```
PascalCase.svelte          → UI components  (Button.svelte, TransactionCard.svelte)
camelCase.svelte.ts        → stores/utils   (transactions.svelte.ts)
+page.svelte               → SvelteKit routes
+layout.svelte             → SvelteKit layouts
```

### Component Anatomy (Svelte 5)

Every component follows this structure:

```svelte
<script lang="ts">
  // 1. Props (Svelte 5 runes)
  interface Props {
    variant?: 'primary' | 'secondary' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    // event handlers via $props, not createEventDispatcher
    onclick?: (e: MouseEvent) => void;
  }

  let { variant = 'primary', size = 'md', disabled = false, onclick }: Props = $props();

  // 2. Local state
  let isHovered = $state(false);

  // 3. Derived values
  const classes = $derived(buildClasses(variant, size, disabled));
</script>

<!-- 4. Template — single root element -->
<button
  class={classes}
  {disabled}
  aria-disabled={disabled}
  on:click={onclick}
>
  <slot />
</button>

<!-- 5. Scoped styles (only when CSS vars alone aren't enough) -->
<style>
  button {
    transition: transform var(--duration-base) var(--ease-out),
                opacity var(--duration-base) var(--ease-out);
  }
</style>
```

### Props API Rules

- Use typed interfaces for all props — never untyped.
- Provide sensible defaults for all optional props.
- Use string unions for variants, not booleans (`variant="danger"` not `isDanger`).
- Never expose internal implementation details through props.
- Pass event handlers as props (`onclick`) instead of `createEventDispatcher` (Svelte 5 pattern).

### Composability

- Prefer **slots** for content injection over content props.
- Use named slots for multi-region components (`slot="header"`, `slot="footer"`).
- Build small, focused components — one responsibility per component.
- Compose complex UIs by nesting primitives rather than adding props to a single component.

### Variant Pattern

Use a class builder function rather than ternary chains in templates:

```ts
function buildClasses(variant: string, size: string, disabled: boolean): string {
  const base = 'inline-flex items-center justify-center font-medium rounded-md transition-transform transition-opacity';
  const variants = {
    primary: 'bg-primary text-text-inverse hover:bg-primary-hover',
    secondary: 'bg-surface-elevated text-text border border-border hover:bg-surface-overlay',
    ghost: 'text-text-muted hover:text-text hover:bg-surface-overlay',
  };
  const sizes = {
    sm: 'h-8 px-3 text-sm gap-1.5',
    md: 'h-10 px-4 text-base gap-2',
    lg: 'h-12 px-6 text-lg gap-2.5',
  };
  const state = disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : '';
  return [base, variants[variant], sizes[size], state].filter(Boolean).join(' ');
}
```

---

## 3. Accessibility (a11y)

### Mandatory Rules

Every interactive component must have:

1. **Semantic HTML** — use `<button>` for actions, `<a>` for navigation, never `<div>` for either.
2. **Visible focus ring** — never `outline: none` without a custom `focus-visible` replacement.
3. **Keyboard operability** — all actions reachable by Tab/Enter/Space/Escape.
4. **ARIA labels** — every icon-only button needs `aria-label`. Every form input needs a `<label>`.
5. **Color contrast** — minimum 4.5:1 for body text, 3:1 for large text and UI components.

### Focus Management

```svelte
<!-- Always use focus-visible, never focus alone -->
<style>
  button:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
</style>
```

For modals and dialogs:
- Trap focus inside when open
- Return focus to trigger element when closed
- First focusable element receives focus on open
- Close on Escape key

### ARIA Patterns

```svelte
<!-- Icon-only button -->
<button aria-label="Delete transaction">
  <Trash2 size={16} aria-hidden="true" />
</button>

<!-- Toggle button -->
<button
  aria-pressed={isActive}
  on:click={() => isActive = !isActive}
>
  {isActive ? 'Active' : 'Inactive'}
</button>

<!-- Loading state -->
<button aria-busy={isLoading} aria-disabled={isLoading} disabled={isLoading}>
  {#if isLoading}<span class="sr-only">Loading...</span>{/if}
  {isLoading ? '' : 'Save'}
</button>

<!-- Error messages -->
<input
  id="email"
  aria-describedby={error ? 'email-error' : undefined}
  aria-invalid={!!error}
/>
{#if error}
  <p id="email-error" role="alert">{error}</p>
{/if}
```

### Screen Reader Utilities

Always have these available:

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

### Keyboard Navigation Checklist

- [ ] All interactive elements reachable via Tab
- [ ] Logical tab order matches visual order
- [ ] Dropdowns/menus: Arrow keys navigate, Escape closes
- [ ] Modals: Focus trapped, Escape closes, focus returns to trigger
- [ ] Custom select/combobox: follows ARIA `combobox` pattern

---

## 4. Consistency Rules

### When to Reuse vs. Create

**Reuse** when:
- A component for this pattern already exists in `src/lib/components/`
- The only difference is content (use slots/props)
- You're building a one-off that matches an existing variant

**Create** when:
- No existing component serves the pattern
- An existing component would need 3+ new props to accommodate the case
- The new component is genuinely a different responsibility

**Never:**
- Copy-paste a component and modify it inline — extract the variation as a prop/variant
- Create a wrapper that just adds one CSS class — extend the original
- Build a new component before checking `src/lib/components/` first

### Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Component file | PascalCase | `TransactionRow.svelte` |
| CSS token | `--category-name` | `--color-primary`, `--space-4` |
| Tailwind class extension | kebab-case | `text-muted`, `bg-surface` |
| Store | camelCase noun | `transactions`, `activeAccount` |
| Util function | camelCase verb | `deleteTransaction`, `formatCurrency` |
| Event handler prop | `on` + PascalCase | `onDelete`, `onClose` |
| Boolean prop | noun or adjective, not `is`-prefixed (except `isOpen`, `isLoading`) | `disabled`, `selected`, `required` |

### Anti-Patterns

- `transition-all` — always specify properties explicitly
- Inline `style=""` for token values — use CSS var references or Tailwind tokens
- Magic numbers in spacing/sizing — use token steps
- Nested `$effect` — flatten reactive logic
- `!important` anywhere — fix the specificity instead
- Non-semantic wrappers (`<div class="button">`) — use the real element
- Empty `alt=""` on meaningful images — always describe the content
- Hardcoded color values in components — always use tokens

### Depth / Layering System

Use this consistently — never place all UI at the same z-plane:

| Layer | Token | Use |
|---|---|---|
| Base | `--z-base: 0` | Page content |
| Elevated | `--z-elevated: 10` | Cards, sticky headers |
| Dropdown | `--z-dropdown: 100` | Menus, popovers |
| Modal | `--z-modal: 200` | Dialogs, drawers |
| Toast | `--z-toast: 300` | Notifications |
| Tooltip | `--z-tooltip: 400` | Tooltips |

---

## 5. Audit Mode

When auditing a component, read the file first, then report violations grouped by category.

**Audit report format:**

```
## Design System Audit: ComponentName.svelte

### Token Violations
- Line 12: Hardcoded `#3b82f6` — use `var(--color-primary)`
- Line 34: `shadow-md` without customization — use layered shadow token

### Accessibility Violations
- Line 8: Icon button missing `aria-label`
- Line 22: `outline: none` without focus-visible replacement

### Component Structure Violations
- Props not typed (no interface defined)
- Using `createEventDispatcher` — migrate to $props callback pattern (Svelte 5)

### Consistency Violations
- `transition-all` on line 45 — specify properties explicitly
- Magic number `margin: 14px` — use `--space-3` (12px) or `--space-4` (16px)

### Summary
5 violations found: 2 token, 2 a11y, 1 consistency
```

Fix each violation after reporting, unless the user asks for report-only.

---

## 6. Generate Mode

When generating a new component:

1. Ask for (or infer from context): name, purpose, variants needed, size options, a11y requirements.
2. Build the full component following all rules in sections 1–4.
3. Include: typed props interface, variant class builder, proper ARIA attributes, focus-visible styles, semantic HTML.
4. Output the component to `src/lib/components/` unless another path is specified.
5. After output, list any tokens the component requires that may not yet exist in the project's token system.

---

## Notes

- This skill is complementary to `frontend-design` — that skill handles aesthetics and creative direction; this one handles structure, tokens, and a11y discipline. Both apply when building new UI.
- Always check `src/lib/components/` before creating a new component.
- Token values in this skill are canonical patterns — adapt names to match the project's actual CSS var names if they differ.
- When in reference mode, don't announce the skill is loaded — just apply the rules silently.
