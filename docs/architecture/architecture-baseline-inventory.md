# Baseline Architecture Inventory

## Purpose
This inventory establishes current data-fetch paths and state ownership before migration.

Why this is necessary:
- Prevents mixing server data with UI-only state during refactors.
- Enables incremental migration by state class.
- Reduces regression risk by making hidden coupling explicit.

State taxonomy used:
- `server-state`: backend-derived data (query/mutation results)
- `shared-ui-state`: UI/session state shared across features/components
- `local-ui-state`: page/component-only state

## Repo Map: `esp32_ui`

### Data-fetch paths
- Template API modules with in-memory data: `src/api/*`
- Async flow pattern: thunk -> API module -> Redux slice
- Page-level local async hook pattern in dashboard pages
- Target data source boundary: `esp32_api` telemetry and RAG endpoints

### Global/shared state paths
- Redux Toolkit store: `src/store/index.ts`
- Root reducers: `src/store/root-reducer.ts`
- App providers: Redux + Auth + Settings + Time in `src/pages/_app.tsx`
- Time context: `src/contexts/time-context.tsx`

### Component/page-local state examples
- search/filter/sort/pagination in dashboard pages
- local request loading/results state in page hooks
- modal, tab, and form interaction state

### State field classification
- Redux slice entities (calendar/chat/kanban/mail and similar) -> currently treated as `server-state`
- auth/settings/time context values -> `shared-ui-state`
- page search/filter pagination state -> `local-ui-state`
- in-memory API module backing data -> pseudo-`server-state` (mocked locally)

## Cross-Repo Interface Notes
- Backend contract source is `esp32_api`.
- Parallel architecture mirror exists in `orcasound-next/docs/architecture/*`.
