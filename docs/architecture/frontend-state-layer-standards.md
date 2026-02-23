# Frontend State-Layer Standards

## Purpose
Define frontend state ownership standards for this repository.

## Contract Scope
- This contract applies to `esp32_ui`.
- `esp32_api` is the backend contract source.
- `orcasound-next` has a parallel contract in its own repo at `orcasound-next/docs/architecture/frontend-state-layer-standards.md`.

## Policy Provenance (Derived vs Greenfield)
- **Derived from current repository conventions**:
  - Redux slices and context providers currently hold shared UI state.
  - Local page-level state is common across dashboard pages.
- **Greenfield additions (explicitly new standards)**:
  - Ownership rules for what must be in shared store vs local state.
  - Explicit disallow-list for global store content.
  - Selector discipline and anti-pattern checks.

## State Ownership Rules

### Must Be In Shared Store (Redux)
Use shared store for state that is read/written by multiple distant components or must persist across route transitions.

Required categories:
- Cross-layout UI/session state (drawer open state, selected tabs that survive navigation).
- Dashboard/session orchestration state shared across feature modules.
- Global filter state that controls multiple feature areas simultaneously.
- Feature flags and debug toggles that must affect multiple components.

### Must Stay Local Component State
Keep local when the state is short-lived and scoped to one component/page subtree.

Required categories:
- Form inputs before submit.
- Modal open/close state only used inside one feature.
- Local pagination/sort controls that do not coordinate with other routes/components.
- Hover, focus, expansion, and temporary UI interaction state.


## State-Layer Decision Standards (`useRef`, `useState`, Redux, Context)

### Use `useRef` When
- You need a mutable runtime handle that should not trigger rerenders when it changes.
- Value is non-serializable (socket client, media player instance, observer, timer id, abort controller).
- Ownership is integration/lifecycle-oriented, not presentation-state oriented.

### Use Local `useState` When
- UI should rerender immediately when value changes.
- State is only needed by one component subtree.
- State is short-lived and interaction-scoped (inputs, open/close, active tab, hover/focus).

### Use Redux For Shared State When
- Multiple distant components/routes both read (get/select) and write (set/dispatch) the same UI/session state.
- State must survive route transitions or coordinate across feature boundaries.
- You need selector-based subscriptions and explicit reducer/action ownership.
- State should be testable in isolation with pure reducer logic.

### Use Context For Shared State When
- Scope is narrow and bounded (one provider subtree).
- Update frequency is low or moderate.
- State is primarily wiring/integration state, not a large evolving domain.
- You can keep provider values small and stable.

### Avoid Context For
- High-churn app-wide state.
- Frequently-updated values read by many unrelated components.
- Large mutable objects with broad provider value surfaces.

### Practical Thresholds (Heuristics)
- `narrow` scope: <= 10 consumer components and one provider subtree.
- `bounded` responsibility: <= 8 state fields and <= 6 core actions.
- `frequent` updates: >= 1 update/sec for sustained interaction windows.
- `high-churn`: repeated updates across many components during normal flows (typing/streaming/drag/live counters).
- `small` provider value: mostly primitives/booleans/enums and stable callbacks.
- `large` provider value: many object/array fields with multiple unrelated concerns.

Rule:
- Non-serializable integration handles should default to `useRef` + narrow Context.
- Serializable cross-feature UI/session state should default to Redux.

### Template-Derived Guidance (`esp32_ui`)
- Existing `SettingsProvider` and `TimeProvider` are valid context use cases because they provide app-shell concerns with clear provider boundaries.
- New cross-feature dashboard state should default to Redux slices instead of expanding context surface area.

## Must Never Be In Global Store
- Raw server-state/query payloads (React Query owns server cache).
- Non-serializable values (`HTMLElement`, `ReactNode`, class instances, sockets, players).
- Derived values that can be computed cheaply from existing state.
- Full API error objects and transport-specific response wrappers.
- Duplicated source-of-truth values already owned by another state layer.

## Selector Usage Standards

### Required
- Always read store state through selectors.
- Prefer narrow selectors that return only needed fields.
- Co-locate reusable selectors with each slice.
- Export stable action selectors separately from value selectors.

### Anti-Patterns
- Selecting the whole slice/object when only one field is needed.
- Building new objects/arrays in selectors without memoization.
- Mixing writes and reads in ad-hoc inline selectors across many components.
- Accessing store internals directly from presentation components.

## Redux Slice Template
```ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

type ExampleUiState = {
  selectedId: string | null;
  isPanelOpen: boolean;
};

const initialState: ExampleUiState = {
  selectedId: null,
  isPanelOpen: false,
};

const exampleUiSlice = createSlice({
  name: "exampleUi",
  initialState,
  reducers: {
    setSelectedId: (state, action: PayloadAction<string | null>) => {
      state.selectedId = action.payload;
    },
    setPanelOpen: (state, action: PayloadAction<boolean>) => {
      state.isPanelOpen = action.payload;
    },
    resetExampleUi: () => initialState,
  },
});

export const { setSelectedId, setPanelOpen, resetExampleUi } =
  exampleUiSlice.actions;

export default exampleUiSlice.reducer;

export const selectSelectedId = (state: { exampleUi: ExampleUiState }) =>
  state.exampleUi.selectedId;
export const selectIsPanelOpen = (state: { exampleUi: ExampleUiState }) =>
  state.exampleUi.isPanelOpen;
```

## Decision Checklist (Before Adding State)
1. Is this server-derived data?
- If yes: keep in React Query, not global UI store.

2. Is this used by multiple distant components/routes?
- If yes: candidate for shared store.
- If no: keep local.

3. Does it need to survive route transitions?
- If yes: candidate for shared store.
- If no: keep local.

4. Is it serializable and UI/session oriented?
- If no: do not put it in global store.

5. Is it derived from existing state?
- If yes: compute via selector, do not store duplicate.

6. Can a narrow selector read it without rerendering unrelated consumers?
- If no: redesign slice boundaries.

## Step 3 Definition of Done
- Shared-store vs local-state rules are explicit.
- Global-store disallow list is explicit.
- Selector standards and anti-patterns are documented.
- Redux slice template is defined and reusable.
- Decision checklist is available for PR reviews.
