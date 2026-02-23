# Frontend Data Contract Rules

## Purpose
Define frontend data-layer standards for this repository.

## Contract Scope
- This contract applies to `esp32_ui`.
- `esp32_api` is the backend contract source.
- `orcasound-next` has a parallel contract in its own repo at `orcasound-next/docs/architecture/frontend-data-contract-rules.md`.

## Policy Provenance (Derived vs Greenfield)
- **Derived from current `esp32_ui` conventions**:
  - Current project includes Redux slices/thunks and template-local fetch patterns.
  - No repo-wide React Query stale/refetch policy is currently established.
- **Greenfield additions (explicitly new standards)**:
  - React Query key taxonomy for telemetry/rag/auth domains.
  - Data-class stale/refetch matrix.
  - Unified error/loading wording and transform-layer boundaries.

## Data Sources and Transports
- Primary: `esp32_api` telemetry and RAG endpoints.
- Expected transport: REST/JSON (plus streaming boundary for AI route path if added).
- No Orcasound GraphQL dependencies in this track.

## Auth Boundary
- Follow `esp32_api` endpoint auth model only.
- No Orcasound server/session token assumptions.

## Query Key Conventions
Standard to apply:
- `['esp-telemetry', '<resource>', '<scope>', { ...params }]`
- `['esp-rag', '<mode>', { ...context }]`
- `['esp-auth', '<identity-scope>']`

Field mapping for manual keys:
- `domain`: source family.
- `resource`: what the data is about.
- `scope`: query intent.
- `params`: stable serializable inputs.

Rules:
- Key shape is `[domain, resource, scope, params]`.
- `params` must be serializable and deterministic.
- Query-key factories live with hooks.
- No non-serializable values in query keys.

## Stale / Refetch Policy by Data Class
Current (derived) baseline:
- No explicit React Query stale/refetch policy detected.
- Current refetch behavior is mostly lifecycle-driven by existing page/hook logic.

Target standard (greenfield policy):
- `reference-data`
  - stale: 5-15 min
  - refetch-on-focus: false
- `interactive-list`
  - stale: 15-60 sec
  - refetch-on-focus: true
- `near-live telemetry`
  - stale: 0-10 sec
  - polling/websocket invalidation allowed
- `session-identity`
  - stale: 1-5 min
  - refetch-on-focus: true
- `rag-response`
  - request-scoped cache
  - no long retention unless explicit replay behavior is intended

## Error / Loading Policy
- Normalize transport errors in the API client layer to typed frontend errors.
- Components consume typed errors, not raw network exceptions.
- Initial load: show skeleton/full placeholder.
- Background refresh: keep stale data visible and show a lightweight refresh indicator.
- Retries: enabled by default for idempotent reads; disabled for auth and validation failures.
- Mutations: show explicit success/failure feedback.

## Transform Placement
- API/client layer: transport + raw DTOs.
- Hook layer: DTO -> domain mapping + query behavior.
- Selector layer: cross-component derived views.
- Component layer: presentation formatting only.

## Disallowed
- Direct data fetch in presentation components.
- Duplicating query payloads into global UI state.
- Storing non-serializable payload artifacts in shared stores.
