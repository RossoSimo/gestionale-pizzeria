# Role and Context
You are an expert Full-Stack Software Engineer specialized in building "Local-First" desktop applications using Electron, and RESTful APIs using Node.js. 
The current project is a take-away pizzeria management system (Point of Sale / POS).
The architecture relies on an Electron desktop app with a local SQLite database for offline capabilities, and an Express.js server connected to a PostgreSQL cloud database for web/mobile orders and synchronization.

# Tech Stack
- Frontend: React, React Router, Tailwind CSS (or similar UI framework).
- Desktop Shell: Electron.
- Local Database (Offline-first): SQLite.
- Backend/API: Node.js, Express.
- Cloud Database: PostgreSQL.
- ORM: Prisma or TypeORM (to be used both in Electron's main process and Express backend).

# Critical Architectural Rules (NEVER VIOLATE THESE)
1. **Primary Keys (IDs):** NEVER use auto-incrementing integers for primary keys. You MUST ALWAYS use UUIDs (v4) or CUIDs for every database table (Orders, Products, Customers, etc.). This is strictly required to prevent conflicts during the offline-to-online sync process.
2. **Offline-First Approach:** The Electron app (React frontend) must ALWAYS read from and write to the local SQLite database first. Do not make the UI wait for a cloud API call to save an order. 
3. **Synchronization Logic:** Network calls to the Express API should be treated as background sync tasks. Assume network availability is unreliable.
4. **Electron IPC:** The React frontend (Renderer process) MUST NOT access SQLite or the file system directly. All database operations must go through Electron's `ipcRenderer` and `ipcMain` context bridge. Ensure secure IPC communication.
5. **Local vs Cloud Data Ownership:** Deleting or resetting the local SQLite database MUST NOT be treated as a cloud delete. Cloud data remains untouched unless explicit cloud-side operations are executed.
6. **Cloud Rehydration Is Explicit:** Do not assume automatic data restore from cloud after local DB loss. Implement an explicit bootstrap/pull flow if local rehydration is required.
7. **Corrupted Local Data Guardrails:** Repository bootstrapping for singleton settings/config rows should be defensive (sanitize invalid persisted values before ORM reads) to prevent runtime crashes.

# Coding Standards
- Write modular, clean, and self-documenting code.
- Use functional React components and Hooks. Avoid class components.
- Separate business logic from UI components.
- For backend and DB operations, use try/catch blocks and handle errors gracefully. Never crash the Electron main process.
- Prioritize TypeScript (if used) interface definitions for entities like `Order`, `Product`, and `Customer` shared between frontend and backend.

# Frontend Style Guidelines (Current Direction)

Apply these guidelines for UI/layout tasks unless the user explicitly asks otherwise:

1. Visual direction: modern light dashboard (clean, neutral, high readability).
2. Layout shell: left sidebar + top header bar + main content area.
3. Sidebar: include icons for navigation entries and support collapsed icon-only mode.
4. Shape language: main containers (sidebar, topbar, page surface) should NOT be rounded.
5. Borders: avoid heavy framed/windowed look; prefer subtle separators and light shadows.
6. Palette: light backgrounds with slate/neutral text and restrained accent colors.
7. Responsiveness: preserve desktop-first dashboard layout and graceful mobile fallback.
8. Consistency: reuse shared layout component and avoid duplicating shell structure per page.

# Project Folder Conventions

Use this structure as the default unless explicitly asked otherwise:

- `gestionale-electron/src`: React renderer only (UI, hooks, IPC client wrappers).
- `gestionale-electron/electron`: Electron main process only (IPC handlers, SQLite access, sync orchestration).
- `gestionale-electron/shared`: constants and contracts shared between renderer and main.
- `gestionale-electron/prisma`: Prisma schema and migrations for local SQLite.
- `gestionale-electron/docs`: architecture notes and local-first flow docs.
- `api/src`: cloud backend (Express modules, routes, services).

# Strict Layer Boundaries

1. Renderer (`src`) may call only preload-exposed APIs.
2. Main process (`electron`) owns Prisma/SQLite access and file system access.
3. Shared DTOs/contracts belong in `shared`, not duplicated in renderer/main.
4. API code in `api/` must not be imported by Electron runtime code.

# Data And Sync Conventions

1. Monetary values: use integer cents fields (example: `priceCents`, `totalAmountCents`).
1. UI monetary display: show amounts as EUR with comma decimal separator (example `12,50 EUR`) while keeping persistence and calculations in cents.
2. Domain statuses/types: use enums instead of free-form strings.
3. Sync metadata per entity: `createdAt`, `updatedAt`, `deletedAt`, `version`, `syncStatus`, `lastSyncedAt`.
4. Deletions must be soft deletes (`deletedAt`) to support sync reconciliation.

# Current UI Product/Order Workflows

1. Product and ingredient create/edit flows must use modal dialogs, not inline forms.
2. Product page layout should keep searchable list/table sections and place primary create actions (`Aggiungi prodotto`, `Aggiungi ingrediente`) in top-right header actions.
3. Pizza product upsert must allow selecting base ingredients (`ingredientIds`) in the product modal.
4. Orders page supports product customization via a shared modal:
	- right-click on product card opens customization modal before adding to cart
	- cart item `Personalizza` opens the same modal for editing existing line item customization
5. Cart line items must show a readable variation summary under product name (adds/removals with price impact).
6. Settings page must support category administration (add/edit/remove custom categories) while preserving the base categories (`PIZZA`, `BEVANDA`, `ALTRO`).
7. Products and Orders UIs must consume categories dynamically from settings; avoid hard-coded category option lists in renderer logic.
8. Cart category counters should render only categories with quantity greater than zero.

# IPC Conventions

1. Declare channel names centrally in `shared/contracts`.
2. Register handlers in `electron/ipc/handlers`.
3. Keep handlers thin and delegate logic to services/repositories.
4. Validate payloads before DB writes.

# Implementation Order (Preferred)

1. Prisma model change.
2. Repository implementation in Electron main.
3. Service implementation in Electron main.
4. IPC handler and preload exposure.
5. Renderer hook/component integration.
6. Background sync integration.