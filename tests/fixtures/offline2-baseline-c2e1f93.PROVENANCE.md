# Provenance: `offline2-baseline-c2e1f93.json`

This fixture is the retained approved-OFFLINE-1 baseline required by
`docs/OFFLINE_V2_ROADMAP.md` §9 ("Baseline chain") and
`docs/OFFLINE_TEST_PLAN.md` ("Exact-parity requirement") for the OFFLINE-2
PWA OFFLINE REGRESSION GATE. It is the comparison target used by
`tests/offline2-baseline-parity.test.mjs`.

**It was produced by actually executing the real cleaning pipeline
against production modules at commit `c2e1f93`** — the exact approved
OFFLINE-1 commit — not inferred or copied from a later commit.

## How it was generated

1. Before any OFFLINE-2 code change was made, the working tree was
   confirmed to already be at the required starting state:
   - `git rev-parse HEAD` → `c2e1f93d76e3e1ce41a38309561aa61b21fe4733`
   - `git status --short` → empty (clean)
   - `main == origin/main`

   Because the working tree already *was* `c2e1f93` with zero
   modifications, capturing directly from this working tree is
   equivalent to using a temporary detached worktree (`git worktree add
   --detach ../weighbridge-offline2-baseline c2e1f93`) — there was no
   difference to isolate. No detached worktree was created for this
   capture since it would have checked out byte-identical file content.
2. `tests/helpers/pipeline-harness.mjs` and
   `tests/helpers/capture-pipeline-snapshot.mjs` (this repo's existing
   DOM-free harness that calls the real, unmodified
   `js/core/cleaning-orchestrator.js`) were used unmodified — the same
   harness already used for `tests/fixtures/offline1-baseline-5c6482b.json`.
3. The harness was run once, before any OFFLINE-2 file was created or
   edited:
   ```
   node tests/helpers/capture-pipeline-snapshot.mjs tests/fixtures/offline2-baseline-c2e1f93.json
   ```
4. No production file (`js/**`, `config/**`, `data/**`) was modified
   before or during this capture.

## Reference sample file checksums (SHA-256)

Identical to the checksums recorded in
`tests/fixtures/offline1-baseline-5c6482b.PROVENANCE.md`, confirming the
same gitignored sample files were used:

```
5fef55b8965c4023b0d02f94de3508eb24a54a44494768271503b438dd8bcba2  samples/hync/16-05-2026 PAGI B.xlsx
872fe90269a70f2228e20e28cf73454c7e6feddc90b64b55af20f2422d882873  samples/slnc/16-05-2026 PAGI B SLNC.xlsx
5ce4cee0549efda23e795554c5cc8fbd86fd156f35246fde29b36d7bb8a4f081  samples/esg/(Data Timbangan Ore 16 Mei  2026) DAY SHIFT.xlsx
```

## Fixture checksum (SHA-256)

```
61dae7fec4993f18c48cf05f6dd6338b248b475b49bd6b6ab67622829496f414  tests/fixtures/offline2-baseline-c2e1f93.json
```

## Result

`HYNC 2026-05-16 DS`: 337 rows / 14,421.19 t / readiness `ACTION_REQUIRED`
`SLNC 2026-05-16 DS`: 109 rows / 4,776.33 t / readiness `READY_WITH_INFO`
`ESG 2026-05-16 DS`: 224 rows / 10,547.46 t / readiness `READY_WITH_INFO`

`listDtInfo`: source `bundled`, recordCount `724`, duplicateCount `0` — the
approved OFFLINE-1 bundled List DT snapshot state, with `unmatchedDt=0`
for every group (all DT IDs across the three reference sample files
resolve against the OFFLINE-1 snapshot).

This is the fixed OFFLINE-2 comparison baseline: every OFFLINE-2 scenario
must reproduce these exact figures, byte-identical Contractor values, and
byte-identical output on every other field, with **zero permitted
differences of any kind** (unlike the OFFLINE-1 gate, which permitted one
narrow Contractor-resolution exception against `5c6482b`). See
`docs/OFFLINE_TEST_PLAN.md` and `docs/OFFLINE_V2_ROADMAP.md` §9.
