# Architecture Workstream Index

This folder tracks the manual architecture walkthrough and implementation progress for this repository.

## Core Documents
- Walkthrough plan: `docs/architecture/architecture-walkthrough-plan.md`
- Baseline inventory: `docs/architecture/architecture-baseline-inventory.md`
- Frontend data contract rules (Step 2): `docs/architecture/frontend-data-contract-rules.md`
- Frontend state-layer standards (Step 3): `docs/architecture/frontend-state-layer-standards.md`
- Feature-track integration design (Step 4): `docs/architecture/feature-track-integration-design.md`

## Parallel-Repo Mirror
- This structure is mirrored in `orcasound-next` at `docs/architecture/*`.
- Keep section order and wording aligned across repos unless project constraints require differences.

## Step Checklist
- [x] Step 1: Baseline architecture inventory
- [x] Step 2: Define frontend data-layer standards
- [x] Step 3: Define frontend state-layer standards
- [x] Step 4: Telemetry integration design
- [ ] Step 5: AI SDK boundary design
- [ ] Step 6: Backend contract hygiene (interface-facing)
- [ ] Step 7: Cross-repo pattern transfer matrix
- [ ] Step 8: Personal engineering best-practices rubric

## Current Focus
- Active step: Step 5
- Goal: Design AI boundary orchestration (UI -> server route -> backend -> stream).
