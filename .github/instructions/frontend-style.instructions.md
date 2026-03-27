---
applyTo: "gestionale-electron/src/**/*.{js,jsx,ts,tsx,css}"
description: "Use when editing frontend UI/layout for the Electron React app. Enforce modern light dashboard style: sidebar + topbar, icon navigation, collapsible sidebar, non-rounded main containers, and subtle separators/shadows."
---

# Frontend UI Instructions (Dashboard Style)

Use these rules for renderer UI changes.

## Layout
- Use a shell with: left sidebar, top header bar, and content section.
- Keep layout logic centralized in the shared app layout component.
- Maintain responsive behavior (desktop dashboard first, mobile fallback).

## Navigation
- Sidebar entries should include icons.
- Preserve collapsed sidebar mode where only icons are visible.
- Active state should be clear but not visually heavy.

## Visual style
- Prefer a modern light theme with clean spacing and readable contrast.
- Main surfaces should be square-edged (no rounded corners on sidebar/content/topbar containers).
- Avoid "boxed window" outlines; use subtle borders, separators, and soft shadows.
- Keep typography simple, crisp, and consistent.

## Tailwind usage
- Prefer Tailwind utility classes over custom CSS for component styling.
- Keep utility classes readable and composable.
- Avoid unnecessary one-off style hacks.

## Implementation guardrails
- Do not mix data/business logic into layout components.
- Do not break existing route structure when only style changes are requested.
- Keep accessibility attributes for icon-only controls (aria-label/title).
