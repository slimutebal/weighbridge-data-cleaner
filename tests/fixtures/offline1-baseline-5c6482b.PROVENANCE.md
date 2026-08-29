# Provenance: `offline1-baseline-5c6482b.json`

This fixture is the retained pre-OFFLINE-1 baseline required by
`docs/OFFLINE_TEST_PLAN.md` ("Regression comparison method") and is the
comparison target used by `tests/offline1-baseline-parity.test.mjs`.

**It was produced by actually executing the real cleaning pipeline
against production modules checked out at commit `5c6482b`** — not
inferred or copied from a later commit.

## How it was generated

1. A detached temporary Git worktree was created at the exact commit
   under test:
   ```
   git worktree add --detach ../weighbridge-offline1-baseline 5c6482b
   ```
   Verified: `git rev-parse HEAD` inside that worktree reported
   `5c6482b996eb887d18ab91668003fcf483370a27`.
2. `data/default-list-dt.json` inside that worktree was confirmed to be
   `[]` (the pre-OFFLINE-1 baseline state).
3. The three fixed reference sample files (`samples/hync/16-05-2026 PAGI
   B.xlsx`, `samples/slnc/16-05-2026 PAGI B SLNC.xlsx`, `samples/esg/
   (Data Timbangan Ore 16 Mei  2026) DAY SHIFT.xlsx`) are gitignored
   (`.gitignore` line 20, `samples/**/*.xlsx`) and so are not part of any
   commit's tree; the exact same files already present in the main
   working tree were copied into the temporary worktree as untracked
   files (verified identical by SHA-256 before and after the copy — see
   below) and used unmodified.
4. `tests/helpers/pipeline-harness.mjs` (this repo's DOM-free harness
   that calls the real, unmodified `js/core/cleaning-orchestrator.js`)
   was copied into the temporary worktree's equivalent
   `tests/helpers/` path as an **untracked development helper only** —
   nothing in the temporary worktree's production tree (`js/**`,
   `config/**`, `data/**`) was modified, and nothing was committed there.
   Because the harness resolves its own module root relative to its own
   file location, running it from inside the temporary worktree caused
   every production module it imports (`cleaning-orchestrator.js`,
   `list-dt-manager.js`, the profile cleaners, etc.) to load from the
   **temporary worktree's `5c6482b` tree**, not from the main working
   tree.
5. The harness was run once:
   `node tests/helpers/capture-pipeline-snapshot.mjs
   tests/fixtures/offline1-baseline-5c6482b-DIRECT.json`.
6. The temporary worktree was removed afterward
   (`git worktree remove ../weighbridge-offline1-baseline`); it is not
   retained.

## Reference sample file checksums (SHA-256, identical in both trees)

```
5fef55b8965c4023b0d02f94de3508eb24a54a44494768271503b438dd8bcba2  samples/hync/16-05-2026 PAGI B.xlsx
872fe90269a70f2228e20e28cf73454c7e6feddc90b64b55af20f2422d882873  samples/slnc/16-05-2026 PAGI B SLNC.xlsx
5ce4cee0549efda23e795554c5cc8fbd86fd156f35246fde29b36d7bb8a4f081  samples/esg/(Data Timbangan Ore 16 Mei  2026) DAY SHIFT.xlsx
```

## Result

`HYNC 337 rows / 14,421.19 t`, `SLNC 109 rows / 4,776.33 t`,
`ESG 224 rows / 10,547.46 t` — all readiness `ACTION_REQUIRED`, all rows
`Contractor = "Unmatched"` — matching `docs/LEGACY_PARITY_PROFILE.md` §13
exactly.

This direct-from-`5c6482b` capture (`offline1-baseline-5c6482b-DIRECT.json`,
not retained in this repo) was diffed byte-for-byte against the
previously-committed `offline1-baseline-5c6482b.json` (which had been
captured at commit `6165493`, reasoned to be code-path-identical to
`5c6482b` per `git diff --stat 5c6482b 6165493` showing zero changes
under `js/**`, `config/**`, or `data/**`) — **the two were byte-for-byte
identical**, confirming that reasoning was correct. `offline1-baseline-
5c6482b.json` was then replaced with the direct-from-`5c6482b` capture
(same bytes) so its provenance is now literal, not inferred.
