# RNNoise Client Tech Design (1-page)

Date: 2026-03-12
Scope: browser-side RNNoise preprocessing for voice capture path in Datowave (`noise_reduction` input profile).

## 1) Goal

Provide stable voice denoise in web client without server-side DSP dependency, with safe fallback and measurable rollout quality.

## 2) Current architecture

- Processing model: client-side AudioWorklet (`@sapphi-red/web-noise-suppressor`) attached to local LiveKit audio track.
- Integration points:
  - `apps/web/src/hooks/rtc/rnnoiseAudioProcessor.ts`
  - `apps/web/src/hooks/rtc/useLivekitVoiceRuntime.ts`
- User controls:
  - `noise_reduction` mode switch,
  - suppression levels: `none | soft | medium | strong`.

## 3) Performance envelope

Practical budget for interactive voice path:

- End-to-end extra latency target from preprocessing path: <= 25 ms perceived overhead.
- CPU target on typical laptop/desktop browser for active call path: <= 10% of one core for mono microphone pipeline.
- Degradation threshold for action:
  - repeated user-facing glitches in active voice path,
  - or sustained processing setup cost regressions in telemetry.

Notes:

- Current telemetry captures processor-attach cost (`rnnoise_processor_apply_ms`) as operational proxy.
- Per-frame timing is not exposed by current worklet package API; proxy metric is used for rollout gating.

## 4) Fallback policy

Fallback is mandatory and automatic when RNNoise cannot be safely applied:

- `AudioContext` unsupported -> mark unavailable, switch to regular profile behavior.
- Processor init/attach error -> mark error, stop processor, continue call without RNNoise.
- User remains in voice path; failure must not break call connectivity.

Behavioral contract:

- No hard crash in UI/runtime.
- Voice call remains functional with baseline filters.

## 5) Observability and rollout signals

Canonical telemetry counters in `/v1/telemetry/summary`:

- `rnnoise_toggle_on`
- `rnnoise_toggle_off`
- `rnnoise_init_error`
- `rnnoise_fallback_unavailable`
- `rnnoise_process_cost_us_sum`
- `rnnoise_process_cost_samples`
- derived: `rnnoise_process_avg_ms = sum / samples / 1000`

Smoke gate signals:

- `smoke:web:rnnoise:browser` (voice settings on/off scenario)
- postdeploy summary field: `web_rnnoise`

## 6) Default-enable criteria

RNNoise may be considered default-enabled only after all criteria are true:

1. At least 3 consecutive `test` postdeploy runs with `web_rnnoise=pass`.
2. `rnnoise_init_error` and `rnnoise_fallback_unavailable` remain low/stable (no increasing incident trend across those runs).
3. `rnnoise_process_avg_ms` stays within expected baseline for target browsers/devices (no significant regression vs previous stable window).
4. No user-visible regressions in voice quality/call stability from canary feedback.

If any criterion fails, keep RNNoise as opt-in profile and continue canary iteration.
