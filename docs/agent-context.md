
## Milestone update: dashboard fixed-slot chart mapping
- Implemented fixed bucket-slot mapping in `src/pages/dashboard/index.tsx`.
- Chart x-axis/series now derive from a full aligned slot timeline (`from`/`to`/`bucketValue`) instead of only returned aggregate rows.
- Added mapping of aggregate rows by `bucket_start` to fill missing/truncated buckets with `null` series values.
- Tooltip categories and sparse x-axis labels are now generated from the fixed slot list, improving label stability across bucket changes.
- Updated `src/utils/chart-utils.ts` to use `TimeWindow` type (renamed from older `TimePreset`).

## Milestone update: time-context bucket/window point-cap guard
- Added a 1000-point aggregate guard in `src/contexts/time-context.tsx`.
- New helpers:
  - `getExpectedAggregatePoints(window, bucket)`
  - `isBucketAllowedForWindow(window, bucket)`
  - `getAllowedBucketsForWindow(window)`
- Time context now exposes `allowedBuckets` for UI controls.
- `src/components/time-context-controls.tsx` now disables bucket menu options that would exceed the 1000-point limit for the selected window.
- Invalid URL/query buckets (e.g. manual `tcBucket=2s` on a large window) are auto-corrected to a coarser valid bucket using `router.replace(..., { shallow: true })`.

## Milestone update: fixed time-window URL sync regression
- Root cause: URL normalization effect in `src/contexts/time-context.tsx` depended on local `window`/`bucket` state, so it re-ran before `router.replace` completed and restored stale query values.
- Fix: limit the effect dependencies to router readiness/query params only.
- Result: changing window/bucket updates the URL and no longer reverts on refresh.
- Added `docs/alerts-threshold-baseline.md` documenting current event baseline/deviation logic: window-mean baseline per event-build run, percent deviation formula, breach rule, and why the drawer preview threshold line appears to move (nearest upper/lower threshold + rolling aggregate source window).
- Refactor: extracted hour-of-day baseline and region summary calculations from `dashboard/index` into `src/utils/compute-hourly-baseline.ts` (`computeHourlyBaselineCurve`, `computeRegionBaselineSummary`, `REGION_LABEL`) to keep the page component smaller and make baseline logic easier to reuse/test.
- Added repeating 30d hour-of-day baseline overlay to the main overview `TimeSeriesChart`: `dashboard/index` now maps each aggregate point to its hour-of-day baseline value (Temp/RH) and passes two dashed overlay series into `TimeSeriesChart` (`overlaySeries`) so the idealized daily curve repeats across the full selected window.
- Fixed overview chart RH threshold annotation axis mapping when baseline overlay series are present (`TimeSeriesChart` now targets RH threshold line at y-axis index 2 in the 4-series/4-axis overlay mode).
- Updated event source for `dashboard/alerts` and `AlertsTable` to a bounded trailing `30d / 1h` aggregate query (`start_ts/end_ts`, `bucket=3600`, `limit=1000`) and switched `buildThresholdEvents(...)` to `baselineMethod: 'hour-of-day-mean'` for event classification against same-hour baselines.
- `buildThresholdEvents` now supports `baselineMethod` option (`window-mean` default, `hour-of-day-mean`), and event settings metadata reflects the selected baseline method.
- `AlertsTable` no longer truncates filtered results; removed the post-filter `.slice(0, 6)` so the component shows all events in the current time window/category/status filters (day grouping and empty-state behavior unchanged).
- Reduced unnecessary baseline chart redraws on overview alert hover: wrapped `TimeSeriesChart` in `React.memo` and memoized the 30d baseline chart props (`baselineChartSeries`, `baselineChartXAxisLabels`) in `dashboard/index`, so hover state changes affecting only the main chart do not trigger an Apex re-render of the separate baseline panel.
- Performance pass for overview event interactions: hover now updates only the chart mask (threshold annotations are selected-alert-only), `TimeSeriesChart` plot-bound measurement no longer depends on hover state, and `TimeSeriesChart`, `AlertsTable`, and `AlertDetailsDrawer` are memoized to reduce page-wide rerenders/redraws during hover/click.

## Milestone - Memoized component runtime fix
- Current objective: Restore dashboard runtime after memoization performance pass while keeping memoization benefits.
- What changed: Replaced anonymous `memo(...)` exports for `TimeSeriesChart`, `AlertsTable`, and `AlertDetailsDrawer` with named component functions wrapped by `memo(...)`, and set explicit `displayName` values.
- Next step: Reload `/dashboard` and verify the `Component is not a function` runtime error is resolved; then re-check hover/click responsiveness.
- Blockers/risks: If error persists, likely source is a non-memoized component import/export mismatch elsewhere rather than the memo wrapper syntax.

## Milestone - Hover chart redraw reduction
- Current objective: Make event-row hover on dashboard overview update only the visual mask, not redraw the full Apex time-series chart.
- What changed: Memoized `useChartOptions` return value in `TimeSeriesChart`, memoized `seriesNames`, used threshold primitive deps (`temp`/`rh`) instead of thresholds object identity, and memoized the rendered `<Chart>` node so hover-only mask changes do not trigger Apex redraws.
- Next step: Validate hover responsiveness on `/dashboard` and confirm main chart no longer redraws while mask flashes on/off.
- Blockers/risks: If hover still feels slow, remaining cost is likely page-level rerender pressure (alerts table + state churn) rather than Apex chart redraw; next step would isolate hover state into a lighter component boundary.

## Milestone - Main chart prop identity stabilization on hover
- Current objective: Stop `TimeSeriesChart` redraws on event-row hover so only the mask overlay updates.
- What changed: In `dashboard/index`, memoized the main chart prop objects (`chartSeries`, `highlightRange`, `thresholds`) and made `round`/`getSeries` stable with `useCallback` so hover does not rebuild main chart data props.
- Next step: Validate hover performance; if redraw persists, inspect remaining prop identity churn (`overlaySeries`, labels, timestamps) and/or isolate hover state into a smaller component boundary.
- Blockers/risks: If any parent-level derived arrays are still rebuilt on hover, `TimeSeriesChart` will continue to redraw despite internal memoization.

## Milestone - Overview drawer interaction performance + mask reliability pass
- Current objective: Make overview alert row hover/click feel crisp by preventing expensive main-chart redraws and fixing mask alignment/resizing during drawer open/close.
- What changed:
  - `dashboard/index`: main overview chart no longer receives threshold annotations; baseline overlay is disabled while an overview alert drawer is open; dispatches resize events on drawer open/close for chart layout updates.
  - `TimeSeriesChart`: mask calculation now snaps by overlapping bucket indices (robust against descending/misaligned timestamps); added `ResizeObserver` + proper cleanup so chart plot bounds update with container width changes.
- Next step: Validate all five interaction issues (hover mask, selected mask visibility, click redraws, close freezes, resize reliability) and then decide whether to further isolate hover state if needed.
- Blockers/risks: Disabling baseline overlay while drawer is open is a deliberate performance tradeoff; if baseline overlay must remain visible during selection, a different rendering strategy is needed.

## Milestone - Mask width remeasure during drawer layout transition
- Current objective: Fix stale time-series mask width when overview drawer opens/closes and changes column width.
- What changed: Added `layoutSignal` prop to `TimeSeriesChart` and included it in the plot-bounds measurement effect; on each layout signal change the chart now runs immediate + RAF + delayed measurements (120/260/420ms) during the drawer transition, in addition to `ResizeObserver` and resize listener updates. `dashboard/index` passes `layoutSignal` based on overview drawer open/closed state.
- Next step: Verify mask width resets correctly after drawer open and close (especially at end of animation).
- Blockers/risks: If Apex plot area settles later than the current delayed measurements on some machines, timing values may need tuning or a transitionend hook on the drawer container.

## Milestone - Disable Apex animations in shared TimeSeriesChart
- Current objective: Reduce perceived UI slowness/crawling during initial render and drawer open/close interactions by removing Apex line animation cost from the shared time-series chart.
- What changed: Disabled Apex `chart.animations` in `src/pages/components/time-series.tsx`.
- Next step: Re-test overview page interactions (initial load, hover, drawer open/close) to determine how much of the sluggishness was animation vs redraw/layout behavior.
- Blockers/risks: This improves perceived performance but does not eliminate redraws caused by width changes; likely next step is keeping the main chart width fixed when the drawer opens.

## Milestone - Drawer preview chart baseline/threshold rebuild
- Current objective: Make alert drawer preview chart consistent with main time-series styling/scales and correctly visualize breach regions against thresholds.
- What changed: Switched temp styling in alerts chips to the same primary blue used by main charts; rebuilt drawer preview as a single combined chart with temp/RH actuals, dashed baselines, dashed upper/lower threshold curves, dual-axis bindings, and `rangeArea` fills between curve and threshold for breached segments; expanded preview buffer from 10m to 1h and preview payload now includes per-point baselines + `thresholdPct`.
- Next step: Validate drawer chart behavior (axis alignment, threshold visibility, fill geometry) on both `dashboard/alerts` and `dashboard/index` drawers.
- Blockers/risks: Mixed `rangeArea` + `line` series behavior in Apex may require minor tuning if fills don’t render as expected in this wrapper/version.

## Milestone - Fix Apex rangeArea crash in drawer preview
- Current objective: Stabilize the new combined drawer preview chart after switching breach fill to `rangeArea`.
- What changed: Filtered `Temp Breach Fill` and `RH Breach Fill` rangeArea series to include only valid highlighted points (`{ x, y: [low, high] }`) and exclude `null` placeholders that caused Apex runtime error (`Cannot read properties of undefined (reading '0')`).
- Next step: Re-test drawer chart rendering and verify fills/thresholds display correctly without crashes.
- Blockers/risks: If Apex still errors, the next likely issue is mixed series ordering/type compatibility in this wrapper/version rather than point data shape.

## Milestone - Drawer rangeArea data format compatibility fix
- Current objective: Eliminate persistent Apex runtime error in drawer preview mixed chart (`Cannot read properties of undefined (reading '0')`).
- What changed: Switched drawer `rangeArea` series data from object points (`{ x, y: [low, high] }`) to category-aligned tuple arrays (`[low, high]`) to match the chart's `xaxis.categories` + line-series array data format.
- Next step: Re-test drawer chart render in both overview and alerts pages.
- Blockers/risks: If Apex still crashes, likely issue is mixed-series ordering/type support in this Apex version; fallback is to move threshold fill to annotations/rectangles instead of `rangeArea`.

## Milestone - Drawer chart fill removed to isolate Apex crash
- Current objective: Determine whether the drawer preview crash is caused by the mixed `rangeArea` breach fill series.
- What changed: Removed `Temp Breach Fill` and `RH Breach Fill` series from the drawer preview chart and simplified colors/stroke/fill/y-axis config back to 8 line-series entries (temp/rh actual + baseline + upper/lower thresholds).
- Next step: Reload and confirm whether `Cannot read properties of undefined (reading '0')` persists without any `rangeArea` series.
- Blockers/risks: If the error persists, the issue is likely mixed line-series axis bindings/series config rather than the fill implementation.

## Milestone - Drawer chart simplified to 4 paired series on 2 axes
- Current objective: Align drawer preview chart semantics with expected structure (4 temp/RH series pairs sharing only the temp and RH axes) after removing crash-prone fill.
- What changed: Reordered drawer chart series into paired temp/RH groups (aggregates, baselines, upper thresholds, lower thresholds), updated color/stroke arrays to match paired ordering, and collapsed y-axis config to exactly two axes using `seriesName` arrays for temp-family and RH-family bindings.
- Next step: Verify that aggregate, baseline, and threshold curves now align on the correct axes in the drawer chart.
- Blockers/risks: Apex `seriesName` array binding behavior varies by version; if any series still drift, fallback is explicit hidden per-series axes with corrected ordering.

## Milestone - Drawer chart simplified to aggregates + thresholds only
- Current objective: Reduce drawer chart complexity and fix visual confusion by removing baseline display while retaining threshold context.
- What changed: Removed temp/RH baseline series from drawer chart rendering; chart now shows only 3 paired series groups (aggregates, upper thresholds, lower thresholds). Updated colors/stroke/fill/y-axis bindings to match the 6-series configuration.
- Next step: Verify drawer chart readability and axis alignment with only aggregates + thresholds.
- Blockers/risks: Threshold lines still depend on baseline-derived calculations in preview payload (by design), but baselines are no longer displayed.

## Milestone - Add overlapping threshold bands in drawer chart
- Current objective: Visualize threshold envelope in drawer preview chart without reintroducing per-breach fill complexity.
- What changed: Added two dense, null-free `rangeArea` series (`Temp Threshold Band`, `RH Threshold Band`) rendered beneath the line series, filling between upper/lower threshold curves with semi-transparent blue/orange bands. Updated color/stroke/fill arrays and y-axis bindings for 8 series (2 bands + 6 lines).
- Next step: Verify Apex stability and band rendering in drawer charts on overview and alerts pages.
- Blockers/risks: Mixed `rangeArea` + line series may still trigger Apex version-specific issues; fallback is to replace bands with lighter threshold lines only.

## Milestone - Fix threshold band rangeArea point format
- Current objective: Resolve Apex runtime error requiring valid `[Start, End]` range values in drawer threshold bands.
- What changed: Updated threshold band `rangeArea` series data from bare tuple arrays to dense object points with explicit category x-values (`{ x, y: [low, high] }`) to match Apex range-series format requirements.
- Next step: Re-test drawer chart rendering with threshold bands enabled.
- Blockers/risks: If Apex still errors, mixed category-based line arrays + object-based rangeArea points may be incompatible in this wrapper/version; fallback is line-only thresholds.

## Milestone - Threshold fill switched to annotation bands (no rangeArea)
- Current objective: Keep a threshold envelope fill in drawer chart while avoiding Apex mixed `rangeArea` runtime errors.
- What changed: Removed threshold band `rangeArea` series and implemented overlapping horizontal `annotations.yaxis` shaded bands for temp/RH between lower and upper threshold values. Drawer chart now returns to 6 line series (aggregates + upper/lower thresholds) with two-axis bindings.
- Next step: Verify drawer chart stability and confirm overlapping translucent threshold fills render as expected.
- Blockers/risks: Annotation bands are horizontal (constant across x), matching the user's request for straight threshold lines; if time-varying threshold envelopes are needed later, a different chart library or custom canvas overlay may be necessary.

## Milestone - Hide drawer threshold lines, keep envelope fills
- Current objective: Simplify drawer preview chart so threshold context is shown only as colored envelope fills (no dashed threshold lines).
- What changed: Set stroke widths for threshold upper/lower series to `0` in drawer chart config while keeping those series in place to preserve axis range calculations and SVG envelope overlay inputs.
- Next step: Verify drawer chart now shows only aggregate lines + threshold fills.
- Blockers/risks: Threshold series may still appear in shared tooltip rows unless explicitly filtered later.

## Milestone - Main chart expected RH on temp-aligned axis
- Current objective: Show expected RH directly on the main overview time-series and keep observed RH on the same temp-aligned visual scheme for easier comparison.
- What changed:
  - `src/pages/dashboard/index.tsx`
    - Added `Expected RH (temp-aligned)` as a visible main chart series.
    - Kept `Observed RH (temp-aligned)` and `Absolute Moisture (g/m³)` in the main chart.
    - Reordered main series to preserve threshold-envelope mapping assumptions for the first three metrics (`temp`, `rh`, `moisture`).
    - Expanded `mainChartOverlaySeries` to four entries so range equalization still has baseline references for all visible series.
  - `src/pages/components/time-series.tsx`
    - Added a 4th default color token so the new expected RH line renders with stable, non-cycled palette behavior.
- Verification:
  - `npx eslint src/pages/dashboard/index.tsx src/pages/components/time-series.tsx` passed.
- Next step:
  - Visually validate `/dashboard` for line ordering/legend clarity and confirm expected vs observed RH now track with aligned vertical behavior against temperature.
- Blockers/risks:
  - Main chart now has four series; if legend/axis readability is too dense, consider secondary toggle controls for expected RH visibility.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - Fix missing Expected RH in main chart
- Current objective: Ensure `Expected RH` actually renders in the main overview chart.
- What changed:
  - `src/pages/components/time-series.tsx`
    - Fixed `combinedSeries` fallback to be dynamic (`activeChartSeries.map(...)`) instead of hardcoded to 3 metrics.
    - This removed the truncation that silently dropped the 4th series (`Expected RH`).
- Verification:
  - `npx eslint src/pages/components/time-series.tsx src/pages/dashboard/index.tsx` passed.
- Next step:
  - Reload `/dashboard` and verify legend/plot now include `Expected RH (temp-aligned)`.
- Blockers/risks:
  - None; this is a rendering pipeline bug fix, no data-shape changes.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - Main chart RH styling and moisture removal
- Current objective: Make main chart show expected RH as temp-colored dashed line, observed RH as solid line, and remove moisture from the main chart.
- What changed:
  - `src/pages/dashboard/index.tsx`
    - Removed `Absolute Moisture` from `mainChartSeries`.
    - Kept main series as: `Temperature`, `Observed RH (temp-aligned)`, `Expected RH (temp-aligned)`.
    - Updated main overlay mapping to 3-series baseline alignment for normalization/equalization.
    - Forced main-chart `thresholdBandVisibility.moisture = false`.
  - `src/pages/components/time-series.tsx`
    - Added non-overlay per-series styling logic by series name:
      - `Expected RH` uses temperature color and dashed stroke.
      - `Observed RH` remains solid.
      - `Temperature` remains solid.
- Verification:
  - `npx eslint src/pages/dashboard/index.tsx src/pages/components/time-series.tsx` passed.
- Next step:
  - Visual QA on `/dashboard` to confirm legend/order and line styles are exactly as intended.
- Blockers/risks:
  - Style logic is name-based; renaming series labels will require updating this mapping.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - Expected RH line color alignment
- Current objective: Make expected RH line use the same orange family as observed RH while remaining dashed.
- What changed:
  - `src/pages/components/time-series.tsx`
    - In non-overlay main RH styling, changed `Expected RH` color from primary blue to warning orange.
    - Dashed stroke for expected RH remains unchanged.
- Verification:
  - `npx eslint src/pages/components/time-series.tsx` passed.
- Next step:
  - Visual confirm in `/dashboard` that observed RH is orange solid and expected RH is orange dashed.
- Blockers/risks:
  - None.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - Main chart RH threshold baseline anchor fix
- Current objective: Ensure RH threshold band in main chart follows RH 30d hour-of-day baseline (temp-aligned), not expected RH curve.
- What changed:
  - `src/pages/dashboard/index.tsx`
    - Updated `mainChartOverlaySeries` second metric from expected RH to aligned RH baseline.
    - Removed unused moisture baseline reference from this main-chart overlay block.
    - Kept third overlay slot for expected RH series range alignment by reusing RH baseline anchor (no moisture band shown in main chart).
- Verification:
  - `npx eslint src/pages/dashboard/index.tsx src/pages/components/time-series.tsx` passed.
- Next step:
  - Visual validation: RH threshold envelope should now track RH baseline behavior rather than expected RH variations.
- Blockers/risks:
  - None.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - Fixed affine RH mapping + Mirror RH toggle
- Current objective: Preserve RH baseline shape differences while keeping RH/Temp deviation heights comparable in main chart.
- What changed:
  - `src/pages/dashboard/index.tsx`
    - Replaced pointwise RH->temp recentering with fixed affine mapping (`mapped = A + K * rh`) derived from 30d baseline anchors and average threshold-band ratio.
    - Updated main `Observed RH` and `Expected RH` display series to use this fixed mapping.
    - Updated RH baseline overlay anchor to use the same fixed mapping (no per-point collapse onto temp baseline).
    - Added `Mirror RH` UI toggle to optionally invert RH display around its mapped baseline.
- Verification:
  - `npx eslint src/pages/dashboard/index.tsx src/pages/components/time-series.tsx` passed.
- Next step:
  - Visual QA on `/dashboard`:
    - RH baseline should no longer be identical to temp baseline.
    - Threshold bands remain comparable in height.
    - `Mirror RH` should invert RH movement around its baseline.
- Blockers/risks:
  - Scale factor `K` uses mean band-ratio over valid baseline points; if you want stronger robustness against outliers we can switch to median.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - Main chart tooltip unit fix for RH temp-aligned series
- Current objective: Correct tooltip units for mixed-unit main chart series after RH temp-aligned mapping.
- What changed:
  - `src/pages/components/time-series.tsx`
    - Extended `useChartOptions` with `normalizeDeviation` input.
    - Added `tooltip.y.formatter` with series-aware unit labels:
      - `temp-aligned` series -> `°F-eq`
      - `Temperature` -> `°F`
      - `RH` -> `%`
      - `Moisture` -> `g/m³`
      - normalized view -> `%`
    - Wired `normalizeDeviation` from `TimeSeriesChart` into chart options.
- Verification:
  - `npx eslint src/pages/components/time-series.tsx src/pages/dashboard/index.tsx` passed.
- Next step:
  - Visual verify tooltip values/units in both raw and normalized modes.
- Blockers/risks:
  - Unit matching is series-name based; renaming labels requires updating formatter conditions.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - RH tooltip units simplified to percent
- Current objective: Remove confusing `°F-eq` unit label from RH tooltip values.
- What changed:
  - `src/pages/components/time-series.tsx`
    - Updated `tooltip.y.formatter` to always show RH series values as `%`.
    - Removed `temp-aligned -> °F-eq` special-case output.
- Verification:
  - `npx eslint src/pages/components/time-series.tsx` passed.
- Next step:
  - Visual verify tooltips in main chart for observed/expected RH now both show `%`.
- Blockers/risks:
  - None.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - Main chart RH tooltip uses raw values
- Current objective: Fix misleading RH tooltip values showing transformed display magnitudes instead of raw RH percent.
- What changed:
  - `src/pages/components/time-series.tsx`
    - Added optional `tooltipValueOverrides` prop to `TimeSeriesChart`.
    - `tooltip.y.formatter` now uses override values by `[seriesIndex][dataPointIndex]` when provided (non-normalized mode).
  - `src/pages/dashboard/index.tsx`
    - Added `mainChartTooltipOverrides` with raw series values:
      - temperature raw avg (°F)
      - observed RH raw avg (%)
      - expected RH raw (%)
    - Passed overrides into main `TimeSeriesChart`.
- Verification:
  - `npx eslint src/pages/components/time-series.tsx src/pages/dashboard/index.tsx` passed.
- Next step:
  - Visual verify RH tooltips now show expected `%` ranges (~30-50 where appropriate) while line positions remain temp-aligned.
- Blockers/risks:
  - Overrides are index-aligned to `chartSeries`; if main series order changes, override ordering must be updated accordingly.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - Alerts table row description switched to time-range + duration
- Current objective: On dashboard/index event rows, show description as `start — end (duration)` while keeping drawer detail description unchanged.
- What changed:
  - `src/pages/components/alerts-table.tsx`
    - Added `formatEventTimeRangeLabel(startAt, endAt)` formatter (`haaa — haaa (Nh)`).
    - Replaced row secondary text with formatted time-range when `alert.startAt`/`alert.endAt` are available.
    - Kept prior event-context fallback only when start/end timestamps are missing.
- Verification:
  - `npx eslint src/pages/components/alerts-table.tsx` passed.
- Next step:
  - Visual check on `/dashboard` row text examples (e.g. `6pm — 9pm (3h)`).
- Blockers/risks:
  - Duration is rounded to nearest hour by design (`Math.round`). If you prefer floor/ceil behavior, update helper accordingly.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - Normalized band visual fix + RH breach semantics update
- Current objective: Fix normalized-view threshold visual mismatch and enforce RH breach logic tied to temperature/expected-RH behavior.
- What changed:
  - `src/pages/components/time-series.tsx`
    - In normalized view, chart stroke now uses `curve: 'straight'` to avoid spline overshoot that made line values appear outside a ±threshold envelope.
  - `src/utils/build-threshold-events.ts`
    - Updated per-bucket breach evaluation logic:
      - Temp breach remains baseline-threshold based.
      - RH breach now triggers only if:
        1) temp is breached, OR
        2) observed RH deviates from expected RH beyond threshold.
    - Added expected RH calculation from baseline absolute moisture + current temperature for residual check.
    - RH breach deviation uses residual-vs-expected when residual breach is present; otherwise uses baseline RH deviation for temp-coupled cases.
- Verification:
  - `npx eslint src/utils/build-threshold-events.ts src/pages/components/time-series.tsx src/pages/dashboard/index.tsx` passed.
- Next step:
  - Validate two scenarios in UI/events:
    - temp-only breach should carry RH event as temp-coupled;
    - non-temp periods should only produce RH breach when observed RH diverges beyond expected RH.
- Blockers/risks:
  - RH residual threshold currently reuses `thresholdPct` relative to expected RH magnitude; if you want an absolute pct-point residual threshold instead, add a dedicated option.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - Proportional expected-RH model (main chart + events)
- Current objective: Make expected RH deviation proportionate/inverse to temperature deviation, and use the same logic for RH breach classification.
- What changed:
  - `src/pages/dashboard/index.tsx`
    - Replaced expected RH computation with proportional model:
      - `tempDeviation = (temp - tempBaseline) / tempBaseline`
      - `expectedRh = rhBaseline * (1 - tempDeviation)`
    - Updated RH Attribution subheader text to reflect proportional expected-RH semantics.
  - `src/utils/build-threshold-events.ts`
    - Replaced expected RH residual baseline from moisture-physics conversion to the same proportional formula above.
    - RH breach remains gated as:
      - temp breach OR residual breach (`observed RH` vs `expected RH`).
- Verification:
  - `npx eslint src/pages/dashboard/index.tsx src/utils/build-threshold-events.ts src/pages/components/time-series.tsx` passed.
- Next step:
  - Visual verify in normalized view that +X% temp deviation corresponds to approximately -X% expected RH deviation.
- Blockers/risks:
  - This is a deliberate display/event model choice (proportional inverse), not a psychrometric physical model.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - Main chart RH axis grouping fix
- Current objective: Ensure observed RH and expected RH are plotted on the same y-scale so RH threshold band alignment is consistent between normalized and non-normalized views.
- What changed:
  - `src/pages/components/time-series.tsx`
    - Added optional `axisGroupBySeries` support in chart options y-axis mapping.
    - In non-overlay mode, when both `Observed RH` and `Expected RH` are present, map `Expected RH` to the same axis group as `Observed RH`.
    - Added merged range computation per axis-group so grouped RH series share one consistent min/max scale.
- Verification:
  - `npx eslint src/pages/components/time-series.tsx src/pages/dashboard/index.tsx` passed.
- Next step:
  - Visual verify non-normalized RH baseline-centered points now align with RH threshold envelope center and match normalized-view expectations.
- Blockers/risks:
  - Grouping logic is series-name based; if labels change, grouping rule must be updated.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - RH threshold envelope now uses grouped axis ranges
- Current objective: Fix non-normalized RH threshold band vertical offset after axis grouping changes.
- What changed:
  - `src/pages/components/time-series.tsx`
    - Updated `thresholdEnvelopePaths` to compute envelope y-mapping from the same grouped chart ranges (`chartMetricRanges` + `axisGroupBySeries`) used by rendered y-axes.
    - Removed stale envelope dependence on pre-group `comparableRanges` that caused visual offset.
- Verification:
  - `npx eslint src/pages/components/time-series.tsx src/pages/dashboard/index.tsx` passed.
- Next step:
  - Re-check same reference point: in non-normalized view, a 0% expected-RH deviation point should sit at RH threshold band center (matching normalized view semantics).
- Blockers/risks:
  - If offset persists, remaining cause is baseline source mismatch (which baseline series is used for expected-RH vs envelope anchor), not axis mapping.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - RH threshold band center anchored to expected-RH baseline track
- Current objective: Resolve persistent non-normalized RH band center mismatch against expected-RH 0% normalized reference.
- What changed:
  - `src/pages/components/time-series.tsx`
    - In `thresholdEnvelopePaths`, RH band baseline now prefers the expected-RH overlay track (series index 2 in non-overlay expected-RH mode) instead of generic RH baseline slot.
    - Added mode guards (`overlayMetricCount`, `seriesNames`) to keep existing behavior for other chart configurations.
- Verification:
  - `npx eslint src/pages/components/time-series.tsx src/pages/dashboard/index.tsx` passed.
- Next step:
  - Re-check the same reference timestamp where expected RH is 0% deviation; non-normalized RH band center should coincide with that expected-RH line.
- Blockers/risks:
  - If mismatch persists, the remaining issue is upstream in `dashboard/index` (expected-RH vs overlay baseline generation), not in chart envelope projection.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - Unified RH->temp mapping source in dashboard/index
- Current objective: Eliminate persistent non-normalized RH band/line mismatch by ensuring series and band baseline use identical transform parameters.
- What changed:
  - `src/pages/dashboard/index.tsx`
    - Added shared `mainRhAlignment` memo that computes one RH->temp affine mapping (`offsetA`, `scaleK`) and `mappedRhBaseline`.
    - Updated `mainChartSeries` to use `mainRhAlignment` for observed/expected RH display mapping.
    - Updated `mainChartOverlaySeries` to use the same `mainRhAlignment.mappedRhBaseline` for RH threshold centerline anchor.
    - Removed duplicate, independently computed mapping blocks that could drift.
- Verification:
  - `npx eslint src/pages/dashboard/index.tsx src/pages/components/time-series.tsx` passed.
- Next step:
  - Re-validate the exact timestamp check: expected RH at 0% normalized should align to RH band center in non-normalized view.
- Blockers/risks:
  - If mismatch still appears, likely remaining cause is stale browser bundle/cache; hard-refresh should be tested before further code changes.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - Remove spline/envelope mismatch in threshold charts
- Current objective: Eliminate apparent line-vs-band offset caused by smooth spline interpolation against piecewise-linear threshold envelopes.
- What changed:
  - `src/pages/components/time-series.tsx`
    - Added `forceStraightLines` option to chart options.
    - When baseline/envelope overlays are active (`activeOverlaySeries.length >= 2`), render lines as `straight` instead of `smooth`.
    - Keeps normalized mode `straight` behavior and now applies same geometry consistency to non-normalized threshold-band charts.
- Verification:
  - `npx eslint src/pages/components/time-series.tsx src/pages/dashboard/index.tsx` passed.
- Next step:
  - Re-check reference point alignment in non-normalized view against normalized 0% expected-RH baseline.
- Blockers/risks:
  - Visual style is less smooth by design for geometric correctness.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - Disable raw threshold-band equalization for main chart
- Current objective: Remove forced equal top/bottom threshold-band scaling that can offset RH interpretation against its own baseline in non-normalized view.
- What changed:
  - `src/pages/components/time-series.tsx`
    - Added `equalizeThresholdBands?: boolean` prop (default `true`).
    - In raw mode with overlays, threshold-band equalization now runs only when `equalizeThresholdBands` is enabled.
    - When disabled, chart uses direct `metricRanges` (no forced equalized band heights).
  - `src/pages/dashboard/index.tsx`
    - Main overview `TimeSeriesChart` now passes `equalizeThresholdBands={false}`.
- Verification:
  - `npx eslint src/pages/components/time-series.tsx src/pages/dashboard/index.tsx` passed.
- Next step:
  - Re-check the non-normalized RH band center vs expected-RH 0% normalized reference point.
- Blockers/risks:
  - Temp/RH/moisture threshold bands are no longer guaranteed identical visual height in the main raw chart (intentional).
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - Main chart RH threshold band centered on expected RH
- Current objective: Replace observed-RH-centered threshold envelope with expected-RH-centered envelope in main chart.
- What changed:
  - `src/pages/dashboard/index.tsx`
    - Updated `mainChartOverlaySeries` third track (`Expected RH`) to use mapped expected-RH values (including mirror transform when enabled) instead of reusing mapped RH baseline.
    - Kept second track as mapped RH baseline for reference/debug consistency.
    - RH threshold envelope logic in `TimeSeriesChart` already prefers the expected-RH overlay track in this mode, so band center now follows expected RH.
- Verification:
  - `npx eslint src/pages/dashboard/index.tsx src/pages/components/time-series.tsx` passed.
- Next step:
  - Validate that RH band now visually tracks expected RH and no longer behaves as observed-RH band in main chart.
- Blockers/risks:
  - None.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - Revert RH envelope/normalization to baseline-centered model
- Current objective: Correct regressions where expected RH became flat in normalized view and RH band anchoring drifted.
- What changed:
  - `src/pages/dashboard/index.tsx`
    - Set main overlay third track (`Expected RH`) back to mapped RH baseline (not mapped expected RH).
    - This restores normalized expected-RH behavior as deviation from RH baseline instead of self-normalized flat line.
  - `src/pages/components/time-series.tsx`
    - Removed special-case RH envelope centering on expected track.
    - RH threshold envelope now consistently centers on RH baseline overlay track (index 1).
- Verification:
  - `npx eslint src/pages/dashboard/index.tsx src/pages/components/time-series.tsx src/utils/build-threshold-events.ts` passed.
- Next step:
  - Re-check:
    1) normalized expected RH is no longer flat;
    2) RH threshold band centers on RH baseline-consistent reference.
- Blockers/risks:
  - If temperature ±5% envelope still appears inconsistent to spot checks, next debug step is to print exact per-index `temp/base/upper/lower` values at hovered point.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - Expected RH baseline series + expected RH threshold band wiring
- Current objective: Add explicit expected-RH baseline series and use expected-RH threshold envelope (not observed-RH envelope) in main chart.
- What changed:
  - `src/pages/dashboard/index.tsx`
    - Added `expectedRhHourOfDaySeries` for 30d baseline chart (inverse-proportional to temp baseline deviations around mean).
    - Updated 30d baseline chart series to: Temp baseline, RH baseline, Expected RH baseline.
    - Main chart threshold-band visibility now disables observed RH band and enables third band slot for expected RH (`rh: false`, third-slot on).
    - Baseline chart threshold-band visibility maps RH toggle to both RH and Expected RH bands.
  - `src/pages/components/time-series.tsx`
    - Third threshold-band fill color is now warning/orange when series includes `Expected RH`; otherwise remains success/green.
- Verification:
  - `npx eslint src/pages/dashboard/index.tsx src/pages/components/time-series.tsx` passed.
- Next step:
  - Visual confirm:
    - main chart shows temp band + expected RH band (no observed RH band)
    - 30d baseline chart includes Expected RH baseline series and its threshold envelope.
- Blockers/risks:
  - Third-band plumbing still uses generic slot naming internally; behavior relies on series-name detection for expected-RH color.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - Main chart expected-RH baseline series + expected-only RH band
- Current objective: Remove observed-RH threshold band from main chart, add expected-RH baseline series, and keep dedicated expected-RH threshold envelope.
- What changed:
  - `src/pages/dashboard/index.tsx`
    - Added visible `Expected RH Baseline (temp-aligned)` series to `mainChartSeries`.
    - Extended `mainChartTooltipOverrides` with raw RH baseline values for that new series.
    - Main chart threshold visibility remains configured to hide observed RH band (`rh: false`) and show expected-RH band on third-slot (`moisture` slot).
  - `src/pages/components/time-series.tsx`
    - Added non-overlay styling for `Expected RH Baseline` (lighter orange, finer dash/width).
    - Extended RH axis grouping so `Expected RH Baseline` shares observed/expected RH axis.
- Verification:
  - `npx eslint src/pages/dashboard/index.tsx src/pages/components/time-series.tsx` passed.
- Next step:
  - Visual confirm:
    - no observed RH threshold envelope on main chart;
    - expected RH baseline line visible;
    - expected RH threshold envelope centered on expected baseline track.
- Blockers/risks:
  - Third-band slot is still internally named `moisture`; behavior is intentional but naming is overloaded.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - Distinct color for Expected RH Baseline
- Current objective: Differentiate expected RH baseline color from expected RH series in main chart.
- What changed:
  - `src/pages/components/time-series.tsx`
    - Updated non-overlay color mapping order so `Expected RH Baseline` matches first.
    - Set `Expected RH Baseline` to `theme.palette.info.main`.
    - Kept `Expected RH` as warning/orange.
- Verification:
  - `npx eslint src/pages/components/time-series.tsx` passed.
- Next step:
  - Visual confirm line color separation between expected RH (orange) and expected RH baseline (info/blue).
- Blockers/risks:
  - None.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - Expected RH Baseline band color matched to series color
- Current objective: Make expected-RH-baseline threshold envelope match expected-RH-baseline line color.
- What changed:
  - `src/pages/components/time-series.tsx`
    - Updated third-envelope color selection logic:
      - if chart includes `Expected RH Baseline` -> band fill uses `theme.palette.info.main`
      - else if includes `Expected RH` -> warning/orange
      - else fallback to success/green.
- Verification:
  - `npx eslint src/pages/components/time-series.tsx` passed.
- Next step:
  - Visual confirm expected RH baseline line and band now share the same info color.
- Blockers/risks:
  - None.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - Expected RH baseline band centered from rendered baseline series
- Current objective: Ensure expected-RH-baseline threshold envelope centers on the visible expected-RH-baseline line with no slot/index mismatch.
- What changed:
  - `src/pages/components/time-series.tsx`
    - In `thresholdEnvelopePaths`, third-band baseline now prefers the rendered `Expected RH Baseline` chart series (by name) in non-normalized mode.
    - Falls back to overlay slot 3 baseline only when expected-baseline series is unavailable.
- Verification:
  - `npx eslint src/pages/components/time-series.tsx src/pages/dashboard/index.tsx` passed.
- Next step:
  - Recheck that expected RH baseline line is always vertically centered in its own threshold band.
- Blockers/risks:
  - Name-based match requires `Expected RH Baseline` label consistency.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - Explicit threshold-band centerline source indices
- Current objective: Eliminate threshold-envelope offset from implicit slot/index assumptions.
- What changed:
  - `src/pages/components/time-series.tsx`
    - Added `thresholdBandCenterSeries` prop to explicitly set centerline source series index per band (`temp`/`rh`/`moisture`).
    - Threshold envelope baselines and y-range projection now use these explicit indices when provided.
  - `src/pages/dashboard/index.tsx`
    - Main chart now passes `thresholdBandCenterSeries={{ temp: 0, rh: 1, moisture: 3 }}` so expected-RH band (3rd band) is explicitly centered on visible `Expected RH Baseline` series.
- Verification:
  - `npx eslint src/pages/components/time-series.tsx src/pages/dashboard/index.tsx` passed.
- Next step:
  - Re-check expected-RH baseline line centering inside expected-RH threshold band.
- Blockers/risks:
  - If visual offset still appears after hard-refresh, likely due stale client bundle/cache rather than centerline source ambiguity.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - Fix threshold center-source regression (actual line vs baseline)
- Current objective: Correct broken threshold centering/scale inflation caused by using chart series as default threshold centerline.
- What changed:
  - `src/pages/components/time-series.tsx`
    - Threshold envelope centerlines now default back to overlay baselines for temp/rh/moisture.
    - Chart-series centerline is used only when explicit `thresholdBandCenterSeries.<metric>` is provided.
    - Range selection for envelope projection now respects optional explicit center index and otherwise uses baseline slot defaults.
  - `src/pages/dashboard/index.tsx`
    - Main chart center override reduced to `{ moisture: 3 }` only (expected-RH baseline band).
    - Removed accidental temp/rh center overrides that forced temp band onto actual temp line.
- Verification:
  - `npx eslint src/pages/components/time-series.tsx src/pages/dashboard/index.tsx` passed.
- Next step:
  - Re-check:
    1) temp band scale no longer inflated;
    2) expected-RH baseline line centered inside expected-RH band.
- Blockers/risks:
  - If misalignment persists after hard-refresh, remaining issue is likely stale browser bundle or independent axis grouping side effect.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - Disable auto axis grouping for main chart threshold alignment
- Current objective: Remove hidden axis-group remapping that may visually offset expected-RH baseline threshold envelope.
- What changed:
  - `src/pages/components/time-series.tsx`
    - Added `disableAutoAxisGrouping?: boolean` prop.
    - `axisGroupBySeries` now bypasses grouping when this flag is enabled.
  - `src/pages/dashboard/index.tsx`
    - Main chart now passes `disableAutoAxisGrouping` to keep direct per-series range mapping.
- Verification:
  - `npx eslint src/pages/components/time-series.tsx src/pages/dashboard/index.tsx` passed.
- Next step:
  - Re-check expected-RH baseline line centering within expected-RH threshold band on main chart.
- Blockers/risks:
  - Main chart now has independent axis ranges per series in non-overlay mode (intentional for alignment correctness).
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - Main chart expected-RH threshold band centered on expected-RH series
- Current objective: Remove expected-RH-baseline threshold band and center threshold envelope around expected-RH series.
- What changed:
  - `src/pages/dashboard/index.tsx`
    - Updated main chart `thresholdBandCenterSeries` from `{ moisture: 3 }` to `{ moisture: 2 }`.
    - This re-centers the third threshold envelope on `Expected RH (temp-aligned)` series instead of `Expected RH Baseline`.
- Verification:
  - `npx eslint src/pages/dashboard/index.tsx src/pages/components/time-series.tsx` passed.
- Next step:
  - Visual verify third threshold band tracks expected-RH line center in main chart.
- Blockers/risks:
  - None.
- Branch and latest commit hash:
  - Branch: main
  - Latest commit: caf3a8a

## Milestone - Normalized threshold envelope alignment fix (Apex nice-scale)
- Current objective: Fix normalized threshold band appearing slightly wider than selected threshold (e.g. ±10%).
- What changed: In `src/pages/components/time-series.tsx`, changed chart y-axis config from `forceNiceScale: true` to `forceNiceScale: false` so Apex does not auto-expand min/max beyond the computed range used by the custom SVG threshold envelope.
- Next step: Visual validation on `/dashboard` in normalized mode at multiple thresholds (±5/±10/±15) to confirm envelope matches selected threshold.
- Blockers/risks: If any residual mismatch remains, it is likely due to SVG plot-bound measurement (`.apexcharts-grid`) versus actual plot area; next fix would anchor to the exact plot element bounds used by series rendering.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Event title phrasing update (dominant driver + strong label)
- Current objective: Update event card titles per new wording rules.
- What changed:
  - In `src/pages/dashboard/alerts.tsx` and `src/pages/components/alerts-table.tsx`:
    - Title severity label now maps `extreme` -> `strong` (title text only).
    - When both temperature and moisture breach in same event, title now chooses dominant driver by larger absolute peak deviation (`peakDeviationPctByMetric`) and renders one sentence with `despite ...` phrasing:
      - `Strong/moderate/slight moisture spike/dip driving RH up/down despite temperature spike/dip`
      - `Strong/moderate/slight temperature spike/dip driving RH down/up despite moisture spike/dip`
    - Single-metric titles still render as before, with `strong` replacing `extreme`.
- Next step: Visual QA on `/dashboard` and `/dashboard/alerts` event cards for both single-metric and dual-metric events.
- Blockers/risks: If you want temp-dominant wording to always say `driving RH up` (as in your second example), that conflicts with physical direction mapping (temp spike->RH down, temp dip->RH up); current implementation keeps physically consistent direction.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Dual temp+AH event title matrix (8-case RH logic)
- Current objective: Make dual-breach event titles follow an explicit RH-sign matrix.
- What changed:
  - Updated `buildEventTitle` in:
    - `src/pages/dashboard/alerts.tsx`
    - `src/pages/components/alerts-table.tsx`
  - For events with both temp and AH breaches and RH direction present, titles now follow the exact 8-case matrix:
    - RH dip: 4 explicit combinations (including `Unexplained RH dip ...`).
    - RH spike: 4 explicit combinations (including `Unexplained RH spike ...`).
  - Preserved prior single-metric fallback behavior when one of temp/AH/RH directions is missing.
  - Severity word in titles still maps `extreme` -> `strong`.
- Next step: Visual QA on cards in `/dashboard` and `/dashboard/alerts` to confirm each combination renders expected wording.
- Blockers/risks: None.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Event title punctuation/casing normalization
- Current objective: Remove periods from event titles and ensure only first letter is capitalized.
- What changed:
  - Updated title rendering in:
    - `src/pages/dashboard/alerts.tsx`
    - `src/pages/components/alerts-table.tsx`
  - Added `toTitleSentenceCase(...)` helper in both files:
    - strips trailing period
    - lowercases full title
    - capitalizes only first character
  - Applied to all dual-breach matrix title return paths and fallback joined-title path.
- Next step: Visual QA to confirm titles render without trailing periods and with single initial capitalization.
- Blockers/risks: Acronyms in title text (e.g. RH) are intentionally lowercased by this rule.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Event title casing rule adjusted (only RH uppercase)
- Current objective: Apply title casing rule: no capital letters except `RH`.
- What changed:
  - In both title builders:
    - `src/pages/dashboard/alerts.tsx`
    - `src/pages/components/alerts-table.tsx`
  - Replaced sentence-case helper with `toTitleTextCase(...)`:
    - strips trailing period
    - lowercases full title
    - re-uppercases exact word `RH`
  - Updated fallback title string to lowercase: `threshold event`.
- Next step: Visual QA to confirm titles show lowercase text with only `RH` uppercase.
- Blockers/risks: None.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Event title casing tweak (first letter + RH uppercase)
- Current objective: Match exact casing rule: only first letter capitalized plus acronym `RH`.
- What changed:
  - Updated `toTitleTextCase(...)` in:
    - `src/pages/dashboard/alerts.tsx`
    - `src/pages/components/alerts-table.tsx`
  - Logic now:
    - remove trailing period
    - lowercase all text
    - uppercase standalone `RH`
    - uppercase first character of the full title
- Next step: Visual check on event cards to confirm casing output format.
- Blockers/risks: None.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Single-metric event title format
- Current objective: For events with only one breached metric, title should be `[Slight/Moderate/Strong] [temperature/RH/moisture] [spike/dip]`.
- What changed:
  - Added explicit single-metric branch at top of `buildEventTitle(...)` in:
    - `src/pages/dashboard/alerts.tsx`
    - `src/pages/components/alerts-table.tsx`
  - Branch triggers when exactly one of `temp`, `RH`, `moisture` has a breach direction.
  - Uses metric-specific severity + direction and outputs concise title without `driving RH ...` phrasing.
- Next step: Visual QA on cards to confirm single-metric events now show concise format.
- Blockers/risks: None.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Moisture chart hover mask + alert row hover color alignment
- Current objective: Mirror main chart hover highlight behavior on absolute moisture chart and align row hover color with selected state.
- What changed:
  - `src/pages/dashboard/index.tsx`
    - Added `moistureMaskPercents` derived from the active alert highlight range and `bucketStarts`, using the same overlap-index approach as `TimeSeriesChart`.
    - Added left/right white mask overlays on the absolute moisture chart so hover/selection highlights the same interval as the main time-series.
  - `src/pages/components/alerts-table.tsx`
    - Updated alert row `TableRow` styles so hover background uses the same light blue-lavender tint as selected state (`alpha(theme.palette.primary.main, 0.08)`).
    - Selected and selected-hover now use the same tint for consistency.
- Next step: Visual QA in `/dashboard` for hover behavior and row background consistency.
- Blockers/risks: None.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Fix moisture mask runtime crash
- Current objective: Resolve dashboard runtime error `Cannot read properties of undefined (reading 'length')` in `index.tsx`.
- What changed:
  - In `src/pages/dashboard/index.tsx`, updated `moistureMaskPercents` memo to guard moisture series length:
    - introduced `const moisturePointCount = moistureDeviationSeries?.length ?? 0`
    - replaced direct `moistureDeviationSeries.length` usage in both condition and dependency list.
- Next step: Reload `/dashboard` and verify hover masking still works on absolute moisture chart without runtime errors.
- Blockers/risks: None.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Event window filter by end time
- Current objective: Include events that started before the selected window but ended within it.
- What changed:
  - `src/pages/components/alerts-table.tsx`
    - Updated time filter to use event end time:
      - `eventEndTime = alert.endAt ?? alert.createdAt`
      - window match now uses `eventEndTime` instead of `createdAt`.
- Next step: Verify in `/dashboard` that events crossing into the selected window are now shown.
- Blockers/risks: `dashboard/alerts` page currently does not apply time-window filtering in its `alerts` memo; if you want the same rule there, we should add an equivalent end-time filter.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Include ongoing events via overlap window filter
- Current objective: Ensure active events (that may not have ended yet) still appear in window-filtered event list.
- What changed:
  - `src/pages/components/alerts-table.tsx`
    - Replaced end-time-only window filter with overlap logic:
      - `eventStart <= windowEnd && eventEnd >= windowStart`
    - Uses `startAt/endAt` with `createdAt` fallback.
- Next step: Verify current active RH/moisture spike appears in 24h and other relevant windows.
- Blockers/risks: If needed, apply the same overlap filter rule to any other event list views that later add/restore time filtering.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Active event "now" rendering
- Current objective: If an event is still active at the most recent reading, render end-time as `now` in card and drawer display.
- What changed:
  - Added `isActive?: boolean` to `Alert` type (`src/types/alert.ts`).
  - Updated event mapping in:
    - `src/pages/components/alerts-table.tsx`
    - `src/pages/dashboard/alerts.tsx`
  - Active detection now compares `event.last_ts` to latest aggregate reading timestamp (`agg.last_ts`, fallback `bucket_end`) with 1s tolerance.
  - For active events:
    - `endAt` is set to `Date.now()` when mapping.
    - `isActive` is set to `true`.
  - Dashboard event-card time label now shows `now` for active events via `formatEventTimeRangeLabel(..., isActive)`.
  - Drawer `Start / End` now renders active end as `<end-date>, now`.
  - Drawer `Duration` now computes live duration from `startAt -> Date.now()` for active events.
- Next step: Visual QA to confirm examples like `12am — now (35h)` and `3/3/2026, 12:00:00 AM — 3/5/2026, now`.
- Blockers/risks: Active status updates on re-render; it is snapshot-based per fetch/render cycle, not a timer-driven second-by-second update.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Retry hover highlight + hover color parity
- Current objective: Ensure moisture chart gets same hover mask behavior and row hover color matches selected tint.
- What changed:
  - `src/pages/dashboard/index.tsx`
    - Simplified `moistureMaskPercents` guard to only require active highlight + `bucketStarts.length >= 2`.
    - Removed strict series-length equality gate that could suppress the moisture mask.
  - `src/pages/dashboard/alerts.tsx`
    - Updated table row hover/selected styling to same blue-lavender tint used in overview alerts list:
      - `alpha(theme.palette.primary.main, 0.08)` for hover and selected.
- Next step: Verify in `/dashboard` that hover on event rows dims outside range on both main and moisture charts; verify row hover color in both `/dashboard` and `/dashboard/alerts` is no longer gray.
- Blockers/risks: None.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - AlertsTable hover color specificity fix
- Current objective: Make event-row hover color visibly use blue-lavender tint instead of default gray.
- What changed:
  - `src/pages/components/alerts-table.tsx`
    - Increased selector specificity to override MUI default row hover:
      - `&.MuiTableRow-hover:hover`
    - Increased tint to `alpha(theme.palette.primary.main, 0.12)`.
    - Added `!important` for hover/selected hover background to prevent gray override.
- Next step: Visual check on `/dashboard` events list hover state.
- Blockers/risks: If you want a subtler tint later, reduce alpha from `0.12`.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Drawer top aligned to events box position
- Current objective: Keep overview detail drawer top aligned with top of events box even during transition between natural and sticky positions.
- What changed:
  - `src/pages/dashboard/index.tsx`
    - Added `eventsBoxRef` on the sticky events container.
    - Added `drawerTopOffset` state and measurement effect (scroll + resize + delayed measures).
    - Computes offset as `eventsBoxRect.top - rootRect.top` and passes it to drawer.
    - Passed `desktopOffsetTop={drawerTopOffset}` into `AlertDetailsDrawer`.
  - `src/sections/dashboard/alerts/alert-details-drawer.tsx`
    - Added optional prop `desktopOffsetTop?: number`.
    - Desktop drawer panel now uses `mt` and adjusted `height` based on this offset.
- Next step: Visual verify on `/dashboard` that drawer top tracks events box top at initial, in-between scroll, and sticky states.
- Blockers/risks: Offset is measured from layout boxes; if you later change parent padding/margins, this alignment measurement may need retuning.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Drawer sticky behavior switched to pure CSS (no JS measuring)
- Current objective: Match drawer behavior to events box sticky model without scroll/resize measurement logic.
- What changed:
  - `src/pages/dashboard/index.tsx`
    - Removed `eventsBoxRef`, `drawerTopOffset` state, and the scroll/resize measurement effect.
    - Removed `desktopOffsetTop` prop passing to drawer.
  - `src/sections/dashboard/alerts/alert-details-drawer.tsx`
    - Removed `desktopOffsetTop` prop from API.
    - Desktop drawer outer container now uses the same sticky pattern as events box:
      - `position: sticky`, `top: 80`, `alignSelf: flex-start`, `maxHeight: calc(100vh - 40px)`
    - Inner drawer panel uses `maxHeight: calc(100vh - 40px)` and `overflow: auto` for independent internal scrolling.
- Next step: Visual verify sticky alignment and independent internal scroll behavior while main window scrolls.
- Blockers/risks: None.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Drawer initial vertical alignment offset (no JS measurement)
- Current objective: Keep sticky behavior but move drawer down initially to align under filters/events box.
- What changed:
  - `src/sections/dashboard/alerts/alert-details-drawer.tsx`
    - Added optional prop `desktopInitialOffsetTop?: number` (default `88`).
    - Desktop sticky wrapper now applies static `mt` with that offset.
    - Desktop max-height now subtracts the same offset to preserve internal scroll behavior.
  - `src/pages/dashboard/index.tsx`
    - Passed `desktopInitialOffsetTop={88}` to overview `AlertDetailsDrawer`.
- Next step: Visual adjust offset value if needed (e.g. 80/88/96) based on exact filter row height.
- Blockers/risks: Static offset is layout-dependent; if filter row height changes significantly, this value should be retuned.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Drawer chart switched to main-series parity
- Current objective: Make drawer preview chart use same series + threshold-band model as main time-series, with clipped event window and minimal chrome.
- What changed:
  - `src/sections/dashboard/alerts/alert-details-drawer.tsx`
    - Replaced custom Apex drawer chart implementation with shared `TimeSeriesChart`.
    - Drawer chart now uses 4 series:
      - Temperature (observed)
      - Relative Humidity (observed)
      - Expected RH
      - Absolute Moisture
    - Drawer threshold bands now match main chart model:
      - Temp baseline band (centered from temp baseline overlay)
      - Expected RH band (centered on Expected RH via `thresholdBandCenterSeries.rhExpected = 2`)
      - Moisture baseline band (centered from moisture baseline overlay)
    - Added derived expected RH + absolute moisture series from preview data.
    - Added props support in shared chart usage for drawer style:
      - no legend
      - no x-axis labels
      - fixed height 220
    - Removed old custom chart code path (manual y-axis equalization, manual SVG envelope for temp/rh, local resize measuring).
  - `src/pages/components/time-series.tsx`
    - Added optional props `showLegend`, `showXAxisLabels`, and `chartHeight` to support drawer rendering needs.
  - `src/pages/dashboard/alerts.tsx` and `src/pages/components/alerts-table.tsx`
    - Updated `buildEventPreview` to use strict event time window (no +/- buffer).
    - Preview row filtering now includes buckets overlapping event interval.
- Next step: Visual QA that drawer chart series and threshold bands match main-chart behavior while only showing event range.
- Blockers/risks: Main and drawer now share chart behavior; future threshold logic changes in `TimeSeriesChart` will affect both views (intended).
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - URL param preservation + drawer de-equalization + peak headroom
- Current objective:
  1) Preserve existing URL filter params when opening/closing alert drawer.
  2) Remove drawer chart special equalization causing threshold/series vertical forcing.
  3) Reduce short-window peak clipping.
- What changed:
  - `src/pages/components/alerts-table.tsx`
    - `updateFilters`, `handleAlertSelect`, `handleDrawerClose` now merge from `router.query` and only mutate relevant keys.
    - `handleDrawerClose` explicitly deletes only `alertId`.
  - `src/pages/dashboard/alerts.tsx`
    - Applied same query-preserving pattern to filter/select/close handlers.
  - `src/sections/dashboard/alerts/alert-details-drawer.tsx`
    - Drawer preview chart now sets `equalizeThresholdBands={false}` to avoid forced cross-metric vertical alignment behavior.
  - `src/pages/components/time-series.tsx`
    - Increased y-range padding in `getSeriesRange` from 10% to 20% to avoid clipping peaks in shorter windows.
- Next step: Verify:
  - opening drawer no longer drops `tc*` URL params,
  - drawer chart bands remain centered without forced alignment,
  - short-window peaks no longer clip.
- Blockers/risks:
  - Increased padding changes apparent vertical zoom (more headroom) across all charts using `TimeSeriesChart`.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Keep main overlay active while drawer is open
- Current objective: Fix main chart threshold bands disappearing and vertical/range shifts when opening detail drawer.
- What changed:
  - `src/pages/dashboard/index.tsx`
    - Removed `if (selectedOverviewAlert) return undefined;` from `mainChartOverlaySeries`.
    - Main chart baseline/overlay series now stays active regardless of drawer open state.
- Why this addresses reported issues:
  - Threshold bands depend on overlay baselines; disabling overlay removed bands.
  - Disabling overlay also changed curve/range behavior, causing visible vertical alignment shifts and higher clipping risk in short windows.
- Next step: Re-test 24h/6h/1h/15m with drawer open to confirm:
  - bands remain visible,
  - no vertical alignment jump,
  - peaks remain within chart bounds.
- Blockers/risks:
  - Restoring overlay during drawer-open may reintroduce some rendering cost compared with the prior optimization.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Short-window top clipping headroom fix
- Current objective: Stop series from clipping at top in short windows (6h and smaller).
- What changed:
  - `src/pages/components/time-series.tsx`
    - Added `paddedChartMetricRanges` (+5% span headroom per metric after range/equalization).
    - `useChartOptions` now uses padded ranges for y-axis min/max.
    - Threshold envelope drawing now uses the same padded ranges to keep overlay alignment consistent.
- Next step: Re-test 6h/1h/15m with drawer open/closed to confirm no top clipping.
- Blockers/risks: Slightly more empty vertical space due to added headroom.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Drawer threshold bands aligned to metric baselines
- Current objective: Fix oversized temperature threshold band in alert detail drawer and keep bands on their own metric scales.
- What changed:
  - `src/sections/dashboard/alerts/alert-details-drawer.tsx`
    - Updated drawer `TimeSeriesChart` config to stop forcing temp/moisture band centers to observed series indices.
    - `thresholdBandCenterSeries` now only pins `rhExpected: 2` (expected RH band), while temperature and moisture bands use default baseline-centered behavior from overlay series.
- Next step: Visual verify drawer temperature/moisture bands are centered and scaled consistently with their respective series.
- Blockers/risks: None.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Drawer threshold scaling aligned with main chart equalization
- Current objective: Address oversized temp threshold band in drawer by matching main chart scaling behavior.
- What changed:
  - `src/sections/dashboard/alerts/alert-details-drawer.tsx`
    - Enabled `equalizeThresholdBands` on drawer `TimeSeriesChart` (was disabled).
    - This makes drawer use the same threshold-range equalization strategy as the main chart.
- Next step: Visual verify drawer temp band thickness now matches expected behavior relative to selected threshold.
- Blockers/risks:
  - Equalization intentionally harmonizes visual band ratios across metrics; if strict per-metric independent scaling is required, this may need a dedicated drawer-only range mode.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - 30d baseline chart RH band switched to expected baseline
- Current objective: Ensure 30d baseline chart shows expected RH baseline threshold band instead of observed RH baseline threshold band.
- What changed:
  - `src/pages/dashboard/index.tsx`
    - In the 30-day hour-of-day baseline `TimeSeriesChart` config:
      - Set `thresholdBandVisibility.rhObserved = false`.
      - Kept `thresholdBandVisibility.rhExpectedBaseline` driven by the existing toggle.
- Next step: Visual verify the 30d baseline chart no longer renders observed RH band and only renders expected RH baseline band when enabled.
- Blockers/risks: None.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Restore RH-family band visibility on 30d baseline chart
- Current objective: Fix case where no RH band appears on 30d baseline chart after switching off observed RH band.
- What changed:
  - `src/pages/dashboard/index.tsx`
    - In 30d baseline chart `thresholdBandVisibility`:
      - `rhExpectedBaseline` now enables when either `rhExpectedBaseline` OR `rhExpected` toggle is selected.
      - `rhObserved` remains disabled.
- Next step: Visual verify RH band appears on baseline chart when expected RH toggle is enabled.
- Blockers/risks: None.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Removed "Humidity (baseline expected)" toggle and unified RH expected band control
- Current objective: Keep only one humidity band toggle and make it control expected RH threshold band across main and 30d baseline charts.
- What changed:
  - `src/contexts/time-context.tsx`
    - Removed `rh_expected_baseline` from `ThresholdBandKey`.
  - `src/pages/dashboard/index.tsx`
    - Removed `Humidity (baseline expected)` from `THRESHOLD_BAND_OPTIONS`.
    - Sanitized band selection input to allow only listed options (also drops legacy keys).
    - Main chart: `rhExpected` controls RH expected band; `rhExpectedBaseline` explicitly disabled.
    - 30d baseline chart: switched band center to `rhExpected: 2` and visibility to `rhExpected`; `rhExpectedBaseline` disabled.
    - `thresholdBandVisibility` now maps RH visibility only from `rh_expected` (plus legacy `rh`/`rh_observed` for compatibility), with no baseline-expected toggle path.
- Result:
  - Single humidity toggle now controls expected RH threshold bands in both charts.
  - RH band color remains orange (warning palette via `rhExpected` path in `TimeSeriesChart`).
- Next step: Visual verify dropdown now has only 3 band options and RH expected band toggles on/off in both charts.
- Blockers/risks: None.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Vercel build failure fixed (invalid pages under src/pages)
- Current objective: Resolve Vercel build error: pages without valid default export components.
- What changed:
  - Moved non-route modules out of `src/pages/components/`:
    - `src/pages/components/alerts-table.tsx` -> `src/components/dashboard/alerts-table.tsx`
    - `src/pages/components/time-series.tsx` -> `src/components/dashboard/time-series.tsx`
  - Updated imports:
    - `src/pages/dashboard/index.tsx` now imports from `@/components/dashboard/*`
    - `src/sections/dashboard/alerts/alert-details-drawer.tsx` now imports `TimeSeriesChart` from `@/components/dashboard/time-series`
  - Updated moved `alerts-table` imports to use `@/...` aliases.
  - Made `src/pages/dashboard/assistant.tsx` a valid page module with a default React component export.
- Verification:
  - Ran `npm run build` locally; build completes successfully and no page-without-component error remains.
- Next step:
  - Push commit and redeploy on Vercel.
- Blockers/risks:
  - `dashboard/assistant` now builds as an empty page by design; replace with real page when implemented.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Main chart anti-clipping fix for baseline-centered scaling
- Current objective: Stop 24h main time-series peaks from running off the chart without adding window-specific exceptions.
- What changed:
  - `src/components/dashboard/time-series.tsx`
    - Updated `equalizeRawRangesByThresholdBandMulti` so baseline-centered ranges are guaranteed to fully contain each metric's original min/max before any equalization.
    - Added `centeredDataSpan` safeguard and enforce `targetSpan >= centeredDataSpan`.
- Why:
  - Prior logic could recenter around baseline with unchanged span, clipping asymmetric peaks (most visible in shorter windows like 24h).
- Next step:
  - Visual verify 24h/6h/1h windows no longer clip top peaks in main chart.
- Blockers/risks:
  - Slightly larger vertical span in some windows where data is highly asymmetric around baseline.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Main chart switched to independent per-metric range scaling
- Current objective: Fix RH clipping in 24h main time series and remove nonessential cross-metric scaling behavior.
- What changed:
  - `src/pages/dashboard/index.tsx`
    - Main `TimeSeriesChart` now sets `equalizeThresholdBands={false}`.
- Why:
  - Cross-metric threshold equalization can constrain a metric range despite local data headroom.
  - Independent scaling uses each metric's own data + baseline + threshold envelope, plus built-in padding.
- Next step:
  - Verify 24h window RH no longer clips at top.
- Blockers/risks:
  - Threshold band heights across metrics are no longer forced visually comparable in the main chart.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Increased global y-axis headroom to prevent clipping
- Current objective: Remove clipping without window-specific exceptions.
- What changed:
  - `src/components/dashboard/time-series.tsx`
    - Increased shared `paddedChartMetricRanges` padding from 5% to 15% of span.
- Why:
  - This is a global chart-level headroom increase (no per-window special rules), so short windows with steep local peaks no longer touch/clip chart bounds.
- Next step:
  - Recheck 24h main chart RH peaks.
- Blockers/risks:
  - Slightly less vertical zoom due to larger top/bottom margins.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Increased global chart headroom again (no window-specific logic)
- Current objective: Eliminate persistent top clipping in main chart while keeping scaling rules global.
- What changed:
  - `src/components/dashboard/time-series.tsx`
    - `getSeriesRange` padding increased from 20% to 35%.
    - Final `paddedChartMetricRanges` padding increased from 15% to 25%.
- Why:
  - Applies uniformly to all windows/metrics and avoids special-case branches.
  - Provides substantial headroom at both pre- and post-grouping stages.
- Next step:
  - Recheck 24h RH and expected RH peaks for top-edge clipping.
- Blockers/risks:
  - Reduced vertical zoom due to larger margins.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Added global plot-area padding to prevent visual clipping
- Current objective: Address persistent top clipping after range headroom changes.
- What changed:
  - `src/components/dashboard/time-series.tsx`
    - Added global Apex grid padding in `useChartOptions`:
      - `top: 20`, `right: 8`, `bottom: 8`, `left: 8`
- Why:
  - This handles render-box edge clipping independent of numeric y-axis range calculations.
- Next step:
  - Recheck 24h main chart for top clipping of RH/expected RH.
- Blockers/risks:
  - Slightly reduced drawable plot area due to padding.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Main chart y-axis locked to trailing 30d reference ranges
- Current objective: Remove window-dependent vertical rescaling in main time series (only x-axis should vary by window).
- What changed:
  - `src/components/dashboard/time-series.tsx`
    - Added `metricRangesOverride?: AxisRange[]` prop to allow caller-provided y-axis ranges.
    - Effective ranges now use overrides when provided, then apply shared padding.
  - `src/pages/dashboard/index.tsx`
    - Added `computeRange` helper and `mainChartMetricRangesOverride` memo built from trailing 30d `baselineAggregates`:
      - temp range from `temp_f_avg`
      - RH ranges (observed + expected axis) from `rh_avg`
      - moisture range from derived absolute humidity
    - Passed `metricRangesOverride={mainChartMetricRangesOverride}` to the main `TimeSeriesChart`.
- Effect:
  - Main chart y-axis ranges are now anchored to a stable trailing-30d reference, avoiding per-window autoscaling shifts.
- Next step:
  - Verify 24h and shorter windows keep stable vertical scale and no top clipping.
- Blockers/risks:
  - If current-window values exceed trailing-30d extremes, clipping can still occur (by design of locked scale).
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Reduced chart padding after over-correction
- Current objective: Keep stable y-scales but remove excessive vertical whitespace.
- What changed:
  - `src/components/dashboard/time-series.tsx`
    - Reduced pre-range padding (`getSeriesRange`) from 35% to 15%.
    - Reduced final padded range headroom from 25% to 8%.
    - Reduced Apex grid plot padding from top/right/bottom/left `20/8/8/8` to `6/2/2/2`.
- Effect:
  - Charts retain the fixed y-scale behavior from prior change but regain tighter vertical fit.
- Next step:
  - Visual check on localhost for acceptable density without clipping.
- Blockers/risks:
  - If clipping returns on extreme spikes, we can slightly increase only final headroom (e.g., 10%) without reintroducing large whitespace.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Restored main chart autoscaling (removed fixed range override)
- Current objective: Re-enable automatic y-axis scaling on the main chart.
- What changed:
  - `src/pages/dashboard/index.tsx`
    - Removed temporary fixed-range override plumbing (`AxisRange`, `computeRange`, `mainChartMetricRangesOverride`).
    - Removed `metricRangesOverride` prop from main `TimeSeriesChart` usage.
  - `src/components/dashboard/time-series.tsx`
    - Removed `metricRangesOverride` prop support.
    - Restored range flow to derive from internal `chartMetricRanges` only.
- Result:
  - Main chart y-axis now autoscales again based on current plotted data.
- Next step:
  - Visual verify main chart behavior matches pre-override autoscale expectations.
- Blockers/risks: None.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Restored main-chart cross-metric comparability
- Current objective: Fix temp y-scale appearing too large versus RH/moisture after autoscale restore.
- What changed:
  - `src/pages/dashboard/index.tsx`
    - Main `TimeSeriesChart` switched back to `equalizeThresholdBands` enabled.
- Result:
  - Main chart keeps autoscale behavior but restores the cross-metric visual comparability logic the user had tuned earlier.
- Next step:
  - Visual verify temp vs RH relative vertical scale looks correct again.
- Blockers/risks:
  - Equalization may reduce independent range tightness for one metric in some windows.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree

## Milestone - Drawer chart right-side gutter reduced via single-side y-axis
- Current objective: Remove excess right whitespace in alert detail drawer chart.
- What changed:
  - `src/components/dashboard/time-series.tsx`
    - Added optional prop `showSecondaryAxes?: boolean` (default `true`).
    - When `false`, only primary (left) y-axis is shown and all axes are non-opposite.
  - `src/sections/dashboard/alerts/alert-details-drawer.tsx`
    - Drawer `TimeSeriesChart` now sets `showSecondaryAxes={false}`.
- Effect:
  - Detail drawer chart no longer reserves right-side axis gutter from secondary axes, so right spacing matches left much more closely.
- Next step:
  - Visual verify drawer chart plot area symmetry and line/band rendering.
- Blockers/risks:
  - None expected; only affects drawer chart configuration.
- Branch and latest commit hash (if available):
  - Branch: main
  - Latest commit: uncommitted changes in working tree
