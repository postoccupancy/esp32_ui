# Manual Architecture Walkthrough Plan

## Summary
This is a guided, manual implementation framework (no auto-implementation).

Primary goal:
- Build reusable architectural best practices across repositories.

Scope for this repo:
- `esp32_ui` is the active implementation context.
- `esp32_api` is the backend contract source for telemetry and RAG endpoints.
- `orcasound-next`/`orcasite` are parallel tracks in separate repositories with mirrored document structure.

## Explicit Separation: Backend vs Frontend Concerns
Backend concerns:
- Endpoint contracts and validation
- Auth boundaries
- Response consistency
- Schema clarity

Frontend concerns:
- Data-fetch boundaries and query keys
- Cache/refetch policy
- Shared vs local state ownership
- DTO-to-domain transforms
- Component data access rules

## Architecture Decisions
- Server data: `@tanstack/react-query` (target state)
- Shared UI state: `redux` (with existing template context narrowed over time)
- API contract style: typed DTOs from published backend schema/OpenAPI
- AI integration path: server-route proxy boundary (Vercel AI SDK-ready)

## Manual Walkthrough Steps
1. Baseline architecture inventory
- Document current data-fetch paths, global state paths, and component-level state.
- Mark each state field as: server-state, shared-ui-state, local-ui-state.
- Deliverable: one-page architecture map for this repo.

2. Define frontend data-layer standards
- Decide and document:
- query key conventions
- stale/refetch policies by data class
- error/loading state policy
- where transforms live (hook vs selector vs component)
- Deliverable: `frontend-data-contract-rules.md`.

3. Define frontend state-layer standards
- Decide and document:
- what must be in Redux vs local component state
- what must never be in global store
- selector usage and anti-patterns
- Deliverable: Redux slice template + decision checklist.

4. Feature-track integration design
- Replace template/mock API paths with typed client boundaries.
- Keep components consuming hooks/selectors, not raw transport calls.
- Deliverable: migration checklist with page/hook/store mapping.

5. AI boundary design
- Define server-side orchestration boundary for AI features.
- Keep prompt/tool/auth logic server-side, not browser-side.
- Deliverable: sequence diagram (UI -> server route -> backend -> stream back).

6. Interface-facing backend contract hygiene
- Keep existing endpoints initially; avoid major redesign.
- Ensure schema clarity for active frontend dependencies.
- Deliverable: compact API contract reference used by frontend teams.

7. Pattern transfer matrix
- Map equivalent modules and boundaries between this repo and parallel repos.
- Deliverable: adaptation matrix with “same”, “modified”, and “greenfield” classifications.

8. Personal engineering best-practices rubric
- Convert decisions into reusable prompts/checklists.
- Deliverable: personal engineering playbook markdown.

## Validation Checklist
- Query behavior matches stale/refetch policy.
- Error/loading handling is consistent.
- No direct fetch in presentation-only components.
- No server-state copied into global UI store without reason.
- Local UI state remains local where possible.
