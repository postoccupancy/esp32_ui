# CLAUDE.md

## Project overview

**Resident Frequency** — environmental sensor data (ESP32: temperature, humidity, dew point) drives generative sound compositions. This repo is the Next.js frontend dashboard.

Companion repo: `esp32_api` (FastAPI/Python, runs on `localhost:8000`).

## Quick start

```bash
npm run dev          # UI on localhost:3001 (or next available port)
# API: cd esp32_api/server && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

API auth: `X-Status-Token` header. Dev fallback key: `"a-long-secret-key"`. Set `NEXT_PUBLIC_API_TOKEN` in `.env.local` for real deployments.

## Dashboard pages

- `/dashboard/analytics` — overview
- `/dashboard/spectrum` — background-corrected FFT (log-binned, dual-series temp + dew point, 95% chi-squared significance threshold, gap interpolation)
- `/dashboard/wavelet` — CWT scalogram with zoom, blob extraction, NOAA weather overlay

## SuperCollider composition

The wavelet and spectrum analysis pages export data that feeds a generative SC composition.

**Main sketch**: `residentfrequency/electric-sky/wavelet_generative.scd`
**JSON export** (static): `residentfrequency/electric-sky/wavelet_2025-11-11_2026-06-16.json`
**Older live OSC client**: `artist/supercollider/claude-sketch.scd`

### Parameters extracted from wavelet analysis → SC

| Parameter | Source | Controls |
|---|---|---|
| `period_hours` per band | CWT significant blobs | Synth voice selection; polyrhythmic loop length |
| `euclidean.k / n` | Blob activity density | Euclidean gate pattern (rhythmic density per voice) |
| `amplitude_envelope` mean | Blob amplitude | Base loudness per voice |
| `plv_matrix` | Phase-locking value between bands | Timing jitter (low PLV = loose dub, high PLV = tight grid) |

### Voice design

- **wvPad** (≥36h cycles): detuned sine cluster, slow attack — Eno tape-loop texture
- **wvBass** (20–36h): sine harmonic stack, long release — dub sub-bass
- **wvTone** (9–20h): filtered pulse + LFTri, Moog sweep — midrange rhythmic voice
- **wvClick** (<9h): bandpass noise burst — hi-hat / transient

Root: `~rootFreq = 55.0` (A2). All voices are harmonics of this root. Dub ghost layer on every voice (gate rotated 1 step, opposite pan, `~echoAmt`).

### Artist / genre references

Eno · Steve Reich · Dub · Detroit Techno

### Open compositional question

There is a deliberate tension between **representing the data** and **arranging a musical composition**. The goal is to stay grounded in physically meaningful patterns while developing the piece as music, not just sonification. The current sketch is mostly representation (period → voice, density → gate, PLV → jitter). What's not yet developed:

1. Development over time — voices entering/leaving, density building and releasing
2. Harmonic movement — `~rootFreq` shifting slowly (e.g. tracking temperature mean)
3. Macro form — the weekly PLV cycle gating entire sections in/out
4. Timbral response over time — filter cutoff / reverb tracking `amplitude_envelope` shape, not just its mean
5. The 24h band as conductor — diurnal cycle acting as explicit section-change trigger

### Next technical step

Stream parameters **live** from an **INMP441** (I2S MEMS microphone on ESP32) rather than from a pre-exported JSON:
- ESP32 reads audio via I2S → FFT/band-energy extraction on-device or streamed to API
- Dominant period, band energies, phase relationships sent over WiFi → OSC → SuperCollider
- SC receives live parameter stream and updates the generative arrangement in real time

This turns the composition into a live instrument that responds to the acoustic environment.
