# Feature-Track Integration Design (Step 4)

## Purpose
Define the implementation design for integrating feature-track data boundaries in this repository using the Step 2 (data) and Step 3 (state) standards.

## Scope
- In scope: replacing template/mock API usage with typed `esp32_api` boundaries in dashboard feature tracks.
- Out of scope: AI orchestration route design (Step 5) and backend endpoint redesign (Step 6).

## Current -> Target Boundary

Current shape:
- Dashboard pages use a mix of template API modules, thunks/slices, and page-local async fetch patterns.
- Server-like data is partly represented in Redux slices from template demo flows.
- Shared UI state is split across Redux and Context providers.

Target shape:
- `esp32_api` typed client wrappers become the only telemetry transport entrypoint.
- React Query owns telemetry server-state lifecycle (cache, stale/refetch, errors).
- Redux owns cross-feature UI/session state and orchestration state.
- Components/pages consume typed feature hooks/selectors, not raw transport calls.

## Page / Hook / Store Mapping

| Feature page/area | Current data path | Target typed boundary | Shared state owner | Notes |
| --- | --- | --- | --- | --- |
| `src/pages/dashboard/locations/index.tsx` | page-local async `locationsApi.getLocations` | `useTelemetryLocationsQuery(params)` | Redux for cross-page filters, local state for page-only table controls | replace inline async lifecycle logic |
| `src/pages/dashboard/locations/[locationId]/index.tsx` | page-local async loaders for location/invoices/logs | `useTelemetryLocationDetailQuery`, `useTelemetryLocationInvoicesQuery`, `useTelemetryLocationLogsQuery` | Redux for selected location context only if shared | keep per-tab view state local |
| `src/pages/dashboard/alerts.tsx` | mixed local mock flow | `useTelemetryAlertsQuery(timeRange, deviceIds)` | Redux for global alert filter presets | align alert polling policy with Step 2 rules |
| `src/pages/dashboard/analytics.tsx` | template charts + mock data | `useTelemetrySummaryQuery`, `useTelemetryTimeseriesQuery` | Redux for dashboard-wide filter presets | avoid storing timeseries payload in Redux |
| `src/pages/dashboard/logistics/fleet.tsx` | local effects + static-like data | `useTelemetryFleetQuery` (if in scope) | Redux only for shared fleet filters | keep feature optional if not telemetry-critical |

## Hook/Client Inventory To Implement

| New module | Responsibility |
| --- | --- |
| `src/lib/esp32ApiClient/*` | typed request/response + error normalization for `esp32_api` |
| `src/hooks/telemetry/useTelemetryTimeseriesQuery.ts` | windowed timeseries query + cache policy |
| `src/hooks/telemetry/useTelemetrySummaryQuery.ts` | aggregate metrics query |
| `src/hooks/telemetry/useTelemetryAlertsQuery.ts` | alert stream/list query |
| `src/hooks/telemetry/useTelemetryLocationsQuery.ts` | locations listing query |
| `src/hooks/telemetry/useTelemetryLocationDetailQuery.ts` | location detail query |

## Store Integration Rules For Step 4
- Redux stores only cross-feature serializable UI/session state.
- React Query stores all telemetry server-state payloads.
- Keep context providers only for narrow bounded app-shell integrations.
- Do not duplicate telemetry payloads into Redux slices.

## Migration Checklist (Manual)
1. Identify each dashboard page still using template API/thunk/local async transport.
2. Add typed `esp32_api` client wrappers for required telemetry endpoints.
3. Add React Query hooks per telemetry use case with Step 2 key/policy rules.
4. Replace page-level raw async calls with typed hooks.
5. Reduce template Redux slices to UI/session orchestration roles only.
6. Keep local UI interaction state local unless cross-route coordination is required.
7. Validate loading/error UX consistency against `frontend-data-contract-rules.md`.
8. Document unresolved API contract needs for Step 6.

## Step 4 Definition of Done
- Feature pages are mapped to typed hook boundaries.
- Template/mock transport paths are mapped to replacement hooks/clients.
- Redux/store responsibilities are explicitly separated from telemetry server-state.
- A manual migration checklist exists for implementation PR slicing.
