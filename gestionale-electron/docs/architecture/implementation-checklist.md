# Implementation Checklist (File by File)

## 1) Prisma and data model

- [X] `prisma/schema.prisma`
- [X] Add missing entities (if needed): table/room/ticket settings.
- [X] Review enum coverage for domain states.
- [X] Ensure all entities keep sync metadata (`createdAt`, `updatedAt`, `deletedAt`, `version`, `syncStatus`, `lastSyncedAt`).

## 2) Electron local DB layer

- [X] `electron/db/client.cjs`
- [X] Initialize Prisma Client for local SQLite.
- [X] Export singleton client with safe shutdown hooks.

- [X] `electron/db/repositories/order.repository.cjs`
- [X] Implement `list` with pagination/filter by status/date.
- [X] Implement `create` with transaction for order + items + modifiers.

- [X] `electron/db/repositories/product.repository.cjs`
- [X] Implement `list` with category and active/deleted filters.

## 3) Electron service layer

- [X] `electron/services/order.service.cjs`
- [X] Validate payload shape.
- [X] Apply business rules (totals in cents, status transitions).

- [X] `electron/services/product.service.cjs`
- [X] Add query options mapping to repository filters.

- [X] `electron/services/sync.service.cjs`
- [X] Implement queue enqueue/flush and retry policy.

## 4) IPC layer

- [X] `shared/contracts/ipc-contracts.js`
- [X] Keep this as single source of truth for channel names.

- [X] `electron/ipc/channels.cjs`
- [X] Keep channel names aligned with shared contract.

- [X] `electron/ipc/handlers/order.handlers.cjs`
- [X] Add input validation and normalized error responses.

- [X] `electron/ipc/handlers/product.handlers.cjs`
- [X] Add filters payload validation.

- [X] `electron/preload.cjs`
- [X] Keep only safe methods and expose typed wrappers.

## 5) Renderer integration

- [X] `src/services/ipc/client.js`
- [X] Add standardized error mapper.

- [X] `src/services/ipc/orders.ipc.js`
- [X] Implement all order actions (list/create/updateStatus).

- [X] `src/services/ipc/products.ipc.js`
- [X] Implement product list and product CRUD calls.

- [X] `src/features/orders/hooks/useOrders.js`
- [X] Add loading/error/reload states.

- [X] `src/features/products/hooks/useProducts.js`
- [X] Add loading/error/reload states.

## 6) UI pages

- [X] `src/pages/OrdersPage.jsx`
- [X] Build order creation flow (customer, items, modifiers).

- [X] `src/pages/ProductsPage.jsx`
- [X] Build products management flow.

- [X] `src/pages/DashboardPage.jsx`
- [X] Add KPIs from local DB.

## 7) Cloud API scaffold

- [X] `api/src/index.ts`
- [X] Bootstrap Express + health route.

- [X] `api/src/routes/orders.routes.ts`
- [X] Add endpoints for sync up/down.

- [X] `api/src/routes/products.routes.ts`
- [X] Add endpoints for products replication.

- [X] `api/docs/sync-contract.md`
- [X] Finalize payload contract and conflict strategy.
