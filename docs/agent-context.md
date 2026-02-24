
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
