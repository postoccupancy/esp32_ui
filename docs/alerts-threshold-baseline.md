# Alerts Threshold Baseline and Deviation Logic

This document explains how the current client-side event system computes:
- the baseline
- threshold breach detection
- deviation percentages
- why the visible threshold line can appear to move between events

## Short version

The current event builder (`src/utils/build-threshold-events.ts`) uses a **window mean baseline** (`baselineMethod: 'window-mean'`) for each metric.

For each run of `buildThresholdEvents(...)`:
- one baseline is computed for `temp_f_avg`
- one baseline is computed for `rh_avg`
- every event generated from that run uses those same two baselines

So the baseline is **not per-event**. It is **per event-build run** (per dataset passed into the transform).

## What data the baseline is computed from

`buildThresholdEvents(aggregates, { thresholdPct, ... })` receives aggregated buckets (currently 5-minute buckets for alerts).

The baseline is computed from the numeric values in the provided aggregate array:
- `temp_f_avg` baseline = mean of all numeric `temp_f_avg` bucket values in `aggregates`
- `rh_avg` baseline = mean of all numeric `rh_avg` bucket values in `aggregates`

In code terms (conceptually):
- collect numeric values for a metric across all buckets
- compute arithmetic mean
- store in `event.baselineByMetric`

## Deviation percentage formula

For each bucket and metric:

`deviationPct = ((value - baseline) / baseline) * 100`

Notes:
- positive deviation => above baseline (`high` / `peak` direction)
- negative deviation => below baseline (`low` / `dip` direction)
- values are rounded to 1 decimal place in the event metadata

## Threshold breach rule

A metric is considered breached when the value is outside the symmetric threshold band around the baseline.

Current rule:
- threshold percent is shared across metrics (`thresholdPct`)
- breach if `abs(value - baseline) > abs(baseline) * thresholdPct`

Example with `thresholdPct = 0.10` (10%):
- baseline temp = `72°F`
- threshold band = `72 ± 7.2`
- breach if temp is `< 64.8` or `> 79.2`

## Why the visible threshold line appears to move between events

Two things are happening:

### 1. The drawer preview shows the **nearest threshold**, not the baseline

In the alert detail drawer preview charts, the horizontal line is not the baseline itself.
It is the threshold line on the side of the breach:

- for a peak event (`high`): `baseline + (baseline * thresholdPct)`
- for a dip event (`low`): `baseline - (baseline * thresholdPct)`

So even if the baseline were constant, the line can appear to "move" because:
- one event may show the upper threshold
- another event may show the lower threshold

This is intentional so the line corresponds to the side that was actually breached.

### 2. The baseline is recalculated whenever the event list is rebuilt

The baseline is recomputed from the current aggregate dataset each time `buildThresholdEvents(...)` runs.

That means it can drift over time because the source aggregate data changes.

In the current alerts UI (`AlertsTable` / `dashboard/alerts`):
- events are built from the latest `1000` buckets at fixed `5m` aggregation
- this is a rolling window (~3.5 days)
- as new buckets arrive and older buckets drop off, the mean baseline changes

So the baseline can move between page loads, refetches, or threshold recalculations (the threshold value changes the event set; the baseline changes only if the aggregate source changed).

## Important distinction: baseline vs threshold line vs chart masking

These are separate concepts:

- **Baseline**: mean of the aggregate values across the event-build dataset
- **Threshold line (drawer preview)**: nearest upper/lower threshold derived from that baseline
- **Dashboard chart mask**: visual highlight range for the selected event time span; it does not affect baseline math

## Current implications (by page)

### `dashboard/alerts` and `pages/components/alerts-table`
- Baseline is derived from the fixed event source dataset (latest 1000 x 5m buckets)
- Filtering rows by time window happens **after** event generation
- Therefore, the visible event list can change with the time filter without changing the baseline (unless the underlying aggregate query refetched and rolled forward)

### `dashboard/index`
- The overview chart can use different bucket sizes/time windows for visualization
- Alert events still come from the fixed 5-minute event source
- So the highlighted event range and the chart bucket snapping may change, while the event baseline remains tied to the event source dataset

## Why this design was chosen (current phase)

This is a pragmatic client-side prototype design:
- simple to tune (`thresholdPct` dropdown)
- stable event semantics (`window-mean` baseline)
- fast enough to iterate before moving event generation server-side

## Future options (if you want more stable or intuitive baselines)

Possible alternatives:
- **Time-window baseline**: compute baseline only from the currently selected UI time window
- **Daily baseline**: compare to same hour-of-day / same weekday windows
- **Rolling baseline**: per-bucket rolling mean (e.g. prior 24h)
- **Robust baseline**: median + MAD instead of mean
- **Static thresholds**: absolute temperature/RH limits instead of percent-from-mean

Each changes what an "event" means, so this should be treated as a product/analytics decision, not just a code refactor.
