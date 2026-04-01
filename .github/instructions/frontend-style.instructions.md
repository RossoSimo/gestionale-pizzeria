---
applyTo: "gestionale-electron/src/**/*.{js,jsx,ts,tsx,css}"
description: "Use when editing frontend UI/layout for the Electron React app. Enforce modern light dashboard style: sidebar + topbar, icon navigation, collapsible sidebar, rounded main containers, hover interactions, transitions, and subtle separators/shadows."
---

# Frontend UI Instructions (Dashboard Style)

Use these rules for renderer UI changes.

## Layout
- Use a shell with: left sidebar, top header bar, and content section.
- Keep layout logic centralized in the shared app layout component.
- Maintain responsive behavior (desktop dashboard first, mobile fallback).
- Prefer modern layouts like grid-based cards over simple long lists when dealing with multiple items (e.g., products).

## Navigation
- Sidebar entries should include icons (`lucide-react`).
- Preserve collapsed sidebar mode where only icons are visible.
- Active state should be clear but not visually heavy, usually utilizing softly rounded backgrounds (`rounded-md` or `rounded-lg`).

## Visual style
- Prefer a modern light theme with clean spacing and readable contrast.
- Shape language: rely on soft, rounded edges (`rounded-lg` for inputs, `rounded-xl` for cards, `rounded-2xl` for modals) to create a premium, friendly look.
- Modals: use modern floating window styles with subtle backdrop blurs (`backdrop-blur-sm bg-slate-900/40`), removing old-school heavy borders. Use large shadows (`shadow-2xl` or `shadow-xl`) to elevate them.
- Form Elements: Inputs should have soft backgrounds (e.g., `bg-slate-50`), rounded borders (`rounded-lg`), subtle borders, and smooth transitions on focus with a specific colored ring (e.g., `focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20`).
- Typography: Keep typography simple, crisp, and consistent. Use badging (`inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs`) and distinct colors to differentiate information hierarchy.
- Interaction: Use fluid `transition-all` or `transition-colors` on interactive elements. Display secondary actions like "Modifica/Elimina" gracefully on group hover (`opacity-0 group-hover:opacity-100`).

## Interaction patterns
- Prefer modal-based create/edit flows for catalog entities (products, ingredients) instead of long inline forms.
- Keep searchable list-first management screens: list/table visible by default, forms in modal overlays. Consider using elegant Tab navigation to separate views if a page handles multiple entity types.
- For order composition, support context actions from catalog cards (right-click customization) and reuse the same modal for cart-item edits.
- Keep variation summaries visible in cart rows (under product name) so operators can review changes without reopening modals.
- In Orders UI, keep compose/list switching in the top bar (URL-state friendly) rather than embedding redundant toggles in page body sections.
- For delivery maps, prefer compact headers with icon controls only; avoid adding extra text actions in map header unless explicitly requested.
- Delivery map panels should start collapsed by default and expand on demand, especially in dense operator screens.

## Money display
- Persist and compute monetary values in integer cents only.
- In renderer UI, display monetary values as euro labels with comma separator (example: `12,50 EUR`).

## Tailwind usage
- Prefer Tailwind utility classes over custom CSS for component styling.
- Keep utility classes readable and composable.
- Avoid unnecessary one-off style hacks.

## Implementation guardrails
- Do not mix data/business logic into layout components.
- Do not break existing route structure when only style changes are requested.
- Keep accessibility attributes for icon-only controls (aria-label/title).
