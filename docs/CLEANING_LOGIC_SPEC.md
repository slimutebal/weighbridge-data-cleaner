# Cleaning Logic Specification

## 1. Purpose

This document defines the formal cleaning logic for the Weighbridge Data
Cleaner app. It translates `docs/INFRASTRUCTURE_BLUEPRINT.md` (architecture)
and `docs/LEGACY_PARITY_PROFILE.md` (legacy baseline findings) into concrete,
implementable pipeline rules for the HYNC, SLNC, and ESG profiles.

This document is the source of truth for Claude Code implementation phases
that write the actual `js/core/*` and `js/profiles/*` modules. It does not
contain JavaScript; it defines behavior precisely enough that implementation
should not require re-deriving decisions already made here.

---

## 2. Scope

In scope:

```text
Profile detection for HYNC, SLNC, ESG
Raw-to-normalized field mapping per profile
Date/time parsing and shift classification (legacy + improved)
DT ID normalization and List DT contractor join
Validation rules and report contents
TSV clipboard output rules
Legacy parity acceptance targets
```

Out of scope (per blueprint §3, §22):

```text
Excel parsing implementation (SheetJS wiring) — later phase
UI implementation — later phase
PWA / manifest / service worker
XLSX export
Rule profile editor
Multi-day batch processing
```

---

## 3. Shared Terms

```text
Raw row       - one row from a source Excel file, as read from the sheet.
Valid row     - a raw row that passes profile-specific validity filtering
                (e.g. has a usable NO.NOTA / ticket identity and a parseable
                weigh timestamp). Invalid rows are excluded and counted as
                lost rows, not silently dropped.
Clean row     - a valid row after normalization into the shared output
                schema (§6), with contractor join and shift classification
                applied.
Bucket        - the Day Shift / Night Shift input area the user dropped the
                file into. This is declared intent, not validated fact
                (blueprint §7.2).
Detected shift- the shift computed from row timestamps against the
                profile's configured Day Shift window (config/shift-rules.json).
Legacy shift  - the single whole-file shift value the existing Excel
                workflow would have produced for this file (§8 of the
                parity profile). Preserved for parity comparison only.
```

---

## 4. Cleaning Group Definition

```text
Cleaning Group = Profile + Date + Detected Shift
```

Every clean row belongs to exactly one Cleaning Group. Groups are never
merged across profile, date, or detected shift boundaries, even if two
groups originate from the same uploaded file (blueprint §7.4, §20 rules
5–7).

Example groups for the parity sample set:

```text
HYNC | 2026-05-16 | DS
SLNC | 2026-05-16 | DS
ESG  | 2026-05-16 | DS
```

---

## 5. Supported Profiles

```text
HYNC - Chinese weighbridge format. Sheet name: 过磅明细.
       Detected by SCHY marker in 备注 / PILE ID.

SLNC - Chinese weighbridge format, structurally identical to HYNC.
       Sheet name: 过磅明细.
       Detected by SCSL marker in 备注 / PILE ID.

ESG  - Indonesian weighbridge format. Sheet name is date-dependent
       (e.g. "DATA ORE 16 MEI 2026"), not a fixed literal.
       Detected by header block containing TIMBANGAN ISI, TIMBANGAN
       KOSONG, TIMBANGAN BERSIH.
       Source layout is a repeated header/detail block report, not a
       single flat table (parity profile §12 finding 1).
```

HYNC and SLNC cannot be distinguished by header shape alone. The SCHY/SCSL
marker check is mandatory and must run before either profile's pipeline is
selected.

---

## 6. Shared Normalized Concepts

These concepts are shared across all three profiles and must resolve to
the same meaning regardless of source format.

```text
dt_id          - Truck/unit identifier, normalized via normalizeDtId()
                 (§10). Used only as a join key against List DT; never
                 displayed raw without normalization applied at least for
                 matching purposes.

contractor     - Resolved via joinContractor() (§10) using normalized
                 dt_id → List DT. May be "Unmatched" if no List DT row
                 matches; unmatched rows must be reported (§13).

date           - Calendar date (TANGGAL) the weigh-in occurred on, in
                 YYYY-MM-DD form for internal grouping.

shift          - Clean output "Shift" column is always the group's
                 declared operational bucket ("DS" for Day Shift Input,
                 "NS" for Night Shift Input) for every row in that group,
                 never the row's own detected shift (v0.2 pilot fix,
                 D009 — confirmed correct: the weighbridge operation has
                 no reliable timestamp boundary for shift handover).
                 Row-level detected shift — "DS" or "NS" per
                 classifyShift() (§10), evaluated per row against the
                 profile's configured dayShiftStart/dayShiftEnd window —
                 is preserved separately in an internal `_detectedShift`
                 field for informational/audit use only, surfaced in the
                 UI as Timestamp Window Information / Shift Window Audit
                 Note (never as "Shift Warning" — this is not a blocking
                 issue). It must never overwrite the clean output Shift
                 value, move a row to another group, or gate copy/
                 readiness.

source         - Parsed from 规格 (HYNC/SLNC) or KODE ORE (ESG) via
                 parseSource() (§10).

grade          - Parsed from 规格 (HYNC/SLNC) or KODE ORE (ESG) via
                 parseGrade() (§10).

net tonnage    - Net weight in tonnes. HYNC/SLNC: 净重 (kg) / 1000.
                 ESG: TIMBANGAN BERSIH, already in tonnes (no conversion).

buyer/receiver - Derived from the PILE ID marker, not from any raw
                 "receiver" column. 收货单位 (HYNC/SLNC) is raw shipment
                 metadata only and is NOT the source of Buyer in
                 legacy-compatible output (see LC-12/LC-13 in §11).
                 HYNC/SLNC: PILE ID contains "HY" → Buyer = "HYNC",
                 otherwise → Buyer = "SLNC".
                 ESG: PILE ID contains "HY" → "HYNC"; contains "ESG" →
                 "ESG"; contains "MEIM" → "MEIM"; contains "QMB" → "QMB";
                 otherwise → "ESG".
```

Normalized output schema (blueprint §12), used by all three profiles:

```text
TANGGAL, NO. DT, Contractor, Shift, Datetime, NO.NOTA,
Type, Buyer, Net, PILE ID, Source, Grade, Profile
```

---

## 7. HYNC Pipeline

```text
1. Read workbook, locate sheet 过磅明细.
2. Read Chinese headers and map to raw fields:
     流水号 → SerialNo, 车号 → DtIdRaw, 货名 → Material,
     发货单位 → Shipper, 毛重 → GrossWeightKg, 皮重 → TareWeightKg,
     净重 → NetWeightKg, 毛重时间 → WeighInDatetime,
     皮重时间 → WeighOutDatetime, 收货单位 → BuyerRaw,
     日期 → DateRaw, 备注 → Remark, 规格 → Spec, 客户类型 → CustomerType.
3. Confirm HYNC by checking 备注 / PILE ID contains "SCHY".
   If not present, do not run this pipeline — fall through to detection
   as SLNC or Unknown.
4. Filter valid rows (parseable WeighInDatetime and non-blank ticket
   identity). Excluded rows are counted as lost rows, not dropped silently.
5. parseDateTime(毛重时间) → Datetime, Date.
6. classifyShift(Datetime, HYNC shift window) → row-level Shift
   (improved validation, §12).
   Separately compute legacyShift per file per §11.
7. cleanPileId(备注 / PILE ID) → PILE ID, then canonicalizeHyncPileId()
   (LC-16) to normalize SCHY/EX hyphenation.
8. cleanDtId(车号) then normalizeDtId() at join time → NO. DT.
9. parseSource(规格) → Source.
10. parseGrade(规格) → Grade.
11. Type = "EXW" if PILE ID contains "EX", else "DAP" (legacy
    compatibility, LC-12). 客户类型 (CustomerType) is raw metadata only
    and is not used to derive Type.
12. Buyer = "HYNC" if PILE ID / 备注 contains "HY", else "SLNC" (legacy
    compatibility, LC-13). 收货单位 (BuyerRaw) is raw shipment metadata
    only and is NOT the source of Buyer.
13. Net = NetWeightKg / 1000 (legacy compatibility, §11).
14. joinContractor(NO. DT) via List DT.
15. Reorder into normalized output schema (§6).
16. Run validation engine (§13).
17. Generate report (§14), grouped into Cleaning Groups (§4).
```

---

## 8. SLNC Pipeline

```text
Identical to the HYNC pipeline (§7), with two differences:

1. Confirmation check in step 3 uses 备注 / PILE ID contains "SCSL"
   instead of "SCHY".
2. Profile label in output is "SLNC" instead of "HYNC".

All other steps (raw field mapping, date/time parsing, shift
classification, DT/PILE ID cleaning, source/grade parsing, Net conversion,
List DT join, validation, and reporting) are identical to HYNC, because
HYNC and SLNC share the same raw Chinese weighbridge structure (parity
profile §4.2, §6) — except step 7's canonicalizeHyncPileId() call
(LC-16), which is HYNC-only and must not run for SLNC. SLNC's PILE ID
goes through cleanPileId() only, same as before.
```

---

## 9. ESG Pipeline

```text
1. Read workbook. Locate the ESG sheet by header signature (TIMBANGAN ISI,
   TIMBANGAN KOSONG, TIMBANGAN BERSIH), not by fixed sheet name — the
   sheet name is date-dependent (e.g. "DATA ORE 16 MEI 2026").
2. Treat the sheet as a repeated header/detail block report:
     - scan for repeated header rows matching the ESG header signature;
     - for each block, read the detail rows that follow until the next
       header block or end of sheet;
     - do not assume a single flat table starting at row 1
       (parity profile §12 finding 1).
3. Within each block, map Indonesian headers to raw fields:
     NO.NOTA, NO. DT, MATERIAL, PENYUPLAI, PENERIMA,
     TIMBANGAN ISI, TIMBANGAN KOSONG, TIMBANGAN BERSIH,
     JAM TIMBANG ISI, JAM TIMBANG KOSONG, LOKASI DUMPING,
     TANGGAL, PILE ID, KODE ORE.
4. Filter valid detail rows: rows with a usable NO.NOTA and a parseable
   JAM TIMBANG ISI. Header/subtotal/blank rows within a block are
   excluded and counted as lost rows if they were not genuine detail
   rows to begin with (they are not "rows" in the parity row count and
   must not be double-counted).
5. parseDateTime(TANGGAL + JAM TIMBANG ISI) → Datetime, Date.
6. classifyShift(Datetime, ESG shift window) → row-level Shift (improved
   validation, §12). Separately compute legacyShift per file per §11.
7. cleanPileId(PILE ID) → PILE ID.
8. cleanDtId(NO. DT) then normalizeDtId() at join time → NO. DT.
9. parseSource(KODE ORE) → Source.
10. parseGrade(KODE ORE) → Grade.
11. Type = "EXW" if PILE ID contains "EX", else "DAP" (legacy
    compatibility, LC-12).
12. Buyer: PILE ID contains "HY" → "HYNC"; contains "ESG" → "ESG";
    contains "MEIM" → "MEIM"; contains "QMB" → "QMB"; otherwise → "ESG"
    (legacy compatibility, LC-14). PENERIMA / Pembeli is raw metadata
    only and is not used to derive Buyer.
13. Net = TIMBANGAN BERSIH, used as-is — already in tonnes, no /1000
    conversion (legacy compatibility, §11). This is a deliberate
    divergence from HYNC/SLNC and must not be "fixed" to match them.
14. joinContractor(NO. DT) via List DT.
15. Reorder into normalized output schema (§6).
16. Run validation engine (§13).
17. Generate report (§14), grouped into Cleaning Groups (§4).
```

---

## 10. Shared Helper Rules

```text
normalizeDtId(value):
  - trim whitespace
  - convert to uppercase
  - remove trailing " DT" suffix
  - collapse multiple internal spaces to one
  - normalize common separators (treat "-", " ", and "_" as equivalent for
    matching purposes, per blueprint §14 examples)
  - remove invisible/non-breaking space characters
  - applied identically to raw NO. DT values and to List DT dt_id values
    before comparison.

parseDateTime(dateValue, timeValue):
  - accept Excel serial date/time numbers and string date/time formats
    found in HYNC/SLNC (毛重时间) and ESG (TANGGAL + JAM TIMBANG ISI)
  - return a single Datetime plus separated Date
  - invalid/unparseable input → row is excluded and counted under
    "invalid Date/Time rows" (§13), not defaulted to a guessed time.

classifyShift(datetime, shiftWindow):
  - shiftWindow = { dayShiftStart, dayShiftEnd } from
    config/shift-rules.json for the row's profile
  - if datetime's time-of-day falls within [dayShiftStart, dayShiftEnd)
    → "DS", else → "NS"
  - this is the improved, row-level classification (§12); it is distinct
    from legacyShift (§11).

parseSource(specOrKodeOre):
  - profile-specific extraction of the Source token from 规格 (HYNC/SLNC)
    or KODE ORE (ESG)
  - exact token grammar/format to be confirmed against a wider sample set
    during implementation (§17 unresolved item).

parseGrade(specOrKodeOre):
  - profile-specific extraction of the Grade token from the same source
    field as parseSource, using the remaining unparsed portion
  - exact token grammar/format to be confirmed during implementation
    (§17 unresolved item).

cleanPileId(value):
  - trim whitespace
  - normalize case/separators consistently with how SCHY/SCSL detection
    reads the same field (§5) so detection and output use one consistent
    reading of 备注 / PILE ID.

canonicalizeHyncPileId(value) — HYNC only (LC-16, v1.0.1-predeploy):
  - applied after cleanPileId(), and only in the HYNC pipeline (§7) —
    never for SLNC or ESG.
  - if the cleaned value matches SCHY[-EX]-<digits> in any
    spacing/hyphen combination, rewrite it to the canonical hyphenated
    form:
      SCHY02687        → SCHY-02687
      SCHY-02687       → SCHY-02687   (already canonical)
      SCHY 02687       → SCHY-02687
      SCHYEX02687      → SCHY-EX-02687
      SCHY-EX02687     → SCHY-EX-02687
      SCHY EX 02687    → SCHY-EX-02687
      SCHY-EX-02687    → SCHY-EX-02687   (already canonical)
  - the numeric part (including any leading zeroes) is preserved
    exactly as provided, never reparsed as a number.
  - a value that does not match this shape is returned unchanged
    (trimmed only) — it is never forced into the pattern.
  - never called for SLNC/ESG, so their PILE IDs pass through
    cleanPileId() only and are unaffected by this rule, e.g.:
      SCESG-EX-000169  → SCESG-EX-000169   (unchanged, ESG)
      SCSL-EX-0000017  → SCSL-EX-0000017   (unchanged, SLNC)

joinContractor(normalizedDtId):
  - look up normalizedDtId against the normalized List DT map
  - on match → Contractor = matched contractor
  - on no match → Contractor = "Unmatched", and the row is added to the
    "unmatched DT rows" report table (§13, §14)
  - never silently blank the Contractor field.

generateTsv(rows, columnOrder, includeHeader):
  - join columns with "\t", rows with "\n"
  - column order = normalized output schema order (§6) unless overridden
    by config
  - includeHeader defaults to false (config/app-config.json
    defaultIncludeHeader), matching the legacy macro's headerless copy
    behavior (blueprint §11)
  - normalize date and number formatting before joining (dates as
    consistent text, numbers without thousands separators) so pasted
    values land as Excel-native dates/numbers, not text.
```

---

## 11. legacyCompatibilityRules

These rules exist purely to preserve reconcilable behavior against the
current Excel workflow. They are not "the correct" behavior in an absolute
sense — they are the behavior the business currently trusts, and must be
preserved (or explicitly and visibly deviated from) so migration does not
silently change numbers users already rely on.

```text
LC-1  HYNC/SLNC legacy shift = classify the average time of the first 30
      rows (sorted ascending by JAM TIMBANG ISI / 毛重时间) against the
      profile's Day Shift window. This produces one legacyShift value per
      file, shown for parity comparison only — never used to gate or
      silently override row-level output.

LC-2  ESG legacy shift = classify the time of the 30th row (sorted
      ascending by JAM TIMBANG ISI) against the ESG Day Shift window.
      Same parity-only usage as LC-1.

LC-3  HYNC/SLNC Net = 净重 (NetWeightKg) / 1000. Always divide by 1000
      for these two profiles.

LC-4  ESG Net = TIMBANGAN BERSIH used directly, no division. ESG source
      values are already expressed in tonnes.

LC-5  HYNC detection requires SCHY found in 备注 / PILE ID. Chinese
      header shape alone is not sufficient (HYNC and SLNC are otherwise
      identical).

LC-6  SLNC detection requires SCSL found in 备注 / PILE ID, under the
      same constraint as LC-5.

LC-7  ESG detection requires the header block to contain TIMBANGAN ISI,
      TIMBANGAN KOSONG, and TIMBANGAN BERSIH together.

LC-8  ESG must be parsed as a repeated header/detail block report. A
      single-pass "read row 1 as header, rest as data" reader is not
      legacy-compatible and will corrupt row counts and tonnage.

LC-9  List DT requires only dt_id and contractor. No other List DT field
      may become a required dependency for cleaning to proceed.

LC-10 Contractor join must use normalized DT IDs (via normalizeDtId, §10)
      on both the raw data side and the List DT side. Raw string equality
      is not legacy-compatible, since the legacy workbook already
      tolerates the separator/suffix variance described in blueprint §14.

LC-11 Unmatched DT rows must be surfaced in the report (§13, §14), not
      silently blanked or excluded from output.

LC-12 Type derivation (all profiles): Type = "EXW" if PILE ID contains
      "EX", else Type = "DAP". 客户类型 (HYNC/SLNC raw CustomerType) is
      not used to derive Type — it is unused legacy raw metadata.

LC-13 HYNC/SLNC Buyer derivation: Buyer = "HYNC" if original PILE ID /
      备注 contains "HY", else Buyer = "SLNC". 收货单位 (the
      PENERIMA-equivalent raw column) is NOT the source of Buyer in
      legacy-compatible output — it is unused legacy raw metadata for
      this purpose.

LC-14 ESG Buyer derivation, checked in this order against PILE ID:
      contains "HY" → "HYNC"; contains "ESG" → "ESG"; contains "MEIM"
      → "MEIM"; contains "QMB" → "QMB"; otherwise → "ESG". PENERIMA /
      Pembeli raw column is not used to derive Buyer.

LC-15 收货单位 (HYNC/SLNC) and PENERIMA/Pembeli (ESG) must not be wired
      into the Buyer field of the normalized output. They remain
      available as raw/reference data only if retained at all; treating
      them as the Buyer source is a legacy-incompatible mistake, not a
      valid alternative implementation.

LC-16 HYNC PILE ID hyphenation is canonicalized via
      canonicalizeHyncPileId() (§10) after cleanPileId(), applied to
      every HYNC output surface (Clean Data Preview, Operational
      Summary, TSV export, PILE ID integrity validation):
      SCHY02687 / SCHY 02687 / SCHY-02687 → SCHY-02687;
      SCHYEX02687 / SCHY-EX02687 / SCHY EX 02687 / SCHY-EX-02687 →
      SCHY-EX-02687. The numeric part (including leading zeroes) is
      never altered. This is HYNC-only (SCHY marker) — SLNC (SCSL) and
      ESG PILE ID formatting are unaffected and must never be routed
      through canonicalizeHyncPileId().
```

---

## 12. improvedValidationRules

These rules are deliberate improvements over the legacy workflow. They
must never override or suppress the legacyCompatibilityRules values in
§11 — both are computed and shown side by side (legacy value for parity
trust, improved value for operational safety).

```text
IV-1  Every row's shift is classified individually via classifyShift()
      (§10) against its own timestamp, not inferred from a 30-row sample.
      This is what actually determines which Cleaning Group (§4) a row
      belongs to — legacyShift (§11) is reference-only and does not
      decide grouping.

IV-2  If a single uploaded file contains rows spanning more than one
      detected shift, the app must split the file's rows into separate
      Profile + Date + Shift groups and show a visible "mixed shift
      detected" warning (blueprint §7.4). It must never force one shift
      onto all rows in that file.

IV-3  If the file's declared input bucket (Day Shift / Night Shift) does
      not match a row's detected shift, the app must show a shift
      mismatch warning for that row/file (blueprint §7.2, §6.2 example).

IV-4  "Valid row" criteria (parseable timestamp + usable ticket identity)
      are defined explicitly by the validation engine and documented,
      rather than assumed to match legacy filtering incidentally (parity
      profile §12 finding 5).

IV-5  Unmatched DT rows are reported with enough detail (raw NO. DT,
      normalized form attempted, row reference) to be actionable, not
      just counted.

IV-6  Invalid Date/Time rows are reported explicitly as their own issue
      table, distinct from "lost rows" caused by other filtering.

IV-7  Clean output "Shift" (v0.2 pilot fix) is always the group's
      declared operational bucket (Profile + Date + Declared Bucket, as
      actually implemented in cleaning-orchestrator.js), not the row's
      own detected shift from IV-1 — this supersedes the group-splitting
      language in IV-2 above, which was never implemented; mismatches
      are surfaced as Shift Warning Rows within the same group instead.
      Detected shift remains available only as an internal
      `_detectedShift` field for Shift Warning Rows, the validation
      report's shift warning count, and wrong-bucket validation.

IV-8  Row-level weight integrity (v1.1.0, D010, §19): every candidate
      detail row is checked for Gross - Tare == Recorded Net at raw
      source precision. An unresolved mismatch (or an invalid/negative
      Gross, Tare, or Recorded Net, or Gross below Tare) is always
      blocking and never silently repairs Recorded Net, Gross, or Tare —
      this is an additional validation layer, not a replacement for any
      existing cleaning transformation.
```

---

## 13. Validation Requirements

For each Cleaning Group, the validation engine must compute:

```text
raw row count
clean row count
lost row count                 (raw - clean, with reasons)
duplicate NO.NOTA count
missing contractor count       (Contractor == "Unmatched")
missing grade count
missing source count
blank key fields count
invalid Date/Time row count
unmatched DT row count
shift mismatch warning count   (bucket vs. detected shift, IV-3)
mixed-shift-in-file warning    (IV-2)
weight integrity issue count, broken down by issue code (IV-8, §19)
```

Issue tables to produce (blueprint §10):

```text
duplicate NO.NOTA rows
missing Contractor rows
missing Grade rows
missing Source rows
invalid Date/Time rows
unmatched DT rows
weight integrity issue rows, with source identity and issue code (§19)
```

---

## 14. Report Requirements

Per Cleaning Group, the report engine must produce (blueprint §9.1, §10):

```text
raw rows, clean rows, lost rows
raw tonnage, clean tonnage, tonnage difference
duplicate NO.NOTA count
missing Contractor / Grade / Source counts
summary by Contractor
summary by PILE ID
summary by Source
summary by Grade
legacyShift value shown alongside detected shift for the group, labeled
  clearly as a legacy reference value (not the grouping key)
```

Result page grouping and layout follow blueprint §9.1 exactly — groups are
selectable tabs/cards, each showing its own summary, report, and clean
data preview independently.

---

## 15. TSV Output Requirements

```text
Default format: TSV (\t between columns, \n between rows).
Column order: normalized output schema (§6), unless config overrides it.
includeHeader: false by default (config/app-config.json).
Two output actions: "Copy This Group" and "Copy All Groups"
  (blueprint §11), both using generateTsv() (§10).
Dates and numbers must be normalized to paste correctly as Excel-native
  values, not as text strings requiring re-parsing.
```

---

## 16. Legacy Parity Acceptance Targets

For the confirmed sample set (Day Shift, 2026-05-16), the pipelines
defined in §7–§9 must reconcile to:

```text
Profile | Valid rows | Raw tonnage  | Legacy shift
HYNC    | 337        | 14,421.19 t  | DS
SLNC    | 109        | 4,776.33 t   | DS
ESG     | 224        | 10,547.46 t  | DS
```

Acceptance definition:

```text
- clean row count (after excluding genuinely invalid rows, each with a
  documented reason) must reconcile to the valid row counts above;
- clean tonnage (Net summed per profile) must reconcile to the raw
  tonnage figures above, within a documented rounding tolerance;
- legacyShift computed per LC-1/LC-2 must equal "DS" for all three files;
- any discrepancy against these targets must be investigated and
  explained (e.g. a legitimately excluded row) before the pipeline is
  considered parity-complete — it must not be treated as passing by
  adjusting the target numbers to match pipeline output.
```

---

## 17. Known Risks and Unresolved Decisions

```text
R-1  Exact parseSource()/parseGrade() token grammar for 规格 (HYNC/SLNC)
     and KODE ORE (ESG) is not yet confirmed against a wide enough sample
     set. Needs profiling against more files before implementation, or an
     explicit fallback ("Unparsed") behavior with reporting.

R-2  ESG repeated-block parsing (LC-8) needs a concrete block-detection
     algorithm (e.g. re-matching the header signature per block,
     handling blank separator rows between blocks) — this spec defines
     the requirement, not the exact scan algorithm. To be finalized when
     excel-reader.js / schema-detector.js are implemented.

R-3  "Valid row" filtering criteria (IV-4) are defined at a principle
     level (parseable timestamp + usable ticket identity) but the exact
     field-by-field validity checklist per profile is not yet enumerated
     line-by-line. Should be finalized alongside the validation engine
     implementation, using the parity row counts (§16) as the check.

R-4  Rounding tolerance for tonnage reconciliation (§16) is not yet
     numerically defined (e.g. ±0.01 t vs. exact match). Needs a decision
     before automated parity testing is built.

R-5  cleanPileId() and normalizeDtId() separator-normalization rules
     (§10) are defined at the level of blueprint §14's examples; a full
     enumerated list of accepted separator variants has not been
     confirmed beyond those examples.
```

Resolved in this revision: Type derivation (formerly R-2) and Buyer
derivation are now fully specified (LC-12/LC-13/LC-14 in §11) and removed
from this list.

---

## 18. Implementation Notes for Future Claude Code Phases

```text
- Implement shared helpers (§10) in js/core/ first, independent of any
  single profile, per blueprint §16 module boundaries.
- Implement HYNC pipeline first (§7), since SLNC (§8) is a near-direct
  reuse of it — this validates the shared Chinese-format parsing path
  once instead of twice.
- Implement ESG (§9) separately and expect it to require its own
  block-scanning reader logic distinct from the HYNC/SLNC flat-table
  reader.
- Do not implement legacyShift (§11 LC-1/LC-2) as the value used for
  grouping. It is a reporting/reference value only; classifyShift()
  row-level output (§12 IV-1) is what determines Cleaning Group
  membership.
- Validate each pipeline against the parity targets in §16 before
  considering it feature-complete, using the actual sample files in
  samples/hync/, samples/slnc/, samples/esg/.
- Resolve R-1, R-2, R-4 (§17) as concrete decisions — recorded in
  docs/DECISIONS.md — before or during their respective implementation
  phase, rather than guessing silently in code.
- Keep legacyCompatibilityRules (§11) and improvedValidationRules (§12)
  as separately identifiable rule sets in code (e.g. distinct functions
  or clearly commented sections), not interleaved, so either set can be
  audited or adjusted independently later.
```

---

## 19. Row-Level Weight Integrity Validation (v1.1.0, D010)

Implemented in the shared, profile-agnostic module `js/core/weight-
integrity.js`. Every profile pipeline (§7-§9) only supplies the correct
raw Gross/Tare/Recorded Net field values and profile id — the arithmetic
and classification below live in exactly one place, never duplicated per
profile.

```text
Confirmed raw field mapping (checked against samples/hync/, samples/slnc/,
samples/esg/ — 337 + 109 + 230 real rows, zero mismatches at the stated
precision, not assumed):

HYNC   Gross = 毛重, Tare = 皮重, Recorded Net = 净重.
       Source unit: kg. Precision: integer (0 decimal places).

SLNC   Gross = 毛重, Tare = 皮重, Recorded Net = 净重.
       Source unit: kg. Precision: integer (0 decimal places).

ESG    Gross = TIMBANGAN ISI, Tare = TIMBANGAN KOSONG,
       Recorded Net = TIMBANGAN BERSIH.
       Source unit: tonnes (already in tonnes per LC-4 — no /1000
       conversion). Precision: 2 decimal places (hundredths of a
       tonne / 10 kg).
```

Validation logic (`validateWeightIntegrity()`):

```text
1. Parse Gross, Tare, Recorded Net from the raw source cell at the
   profile's configured decimalPlaces, as an exact scaled integer
   ("minor units") — never by comparing floating-point tonnage values
   after conversion (§3 of the phase spec). Uses the parsed number's own
   canonical string form to shift the decimal point exactly, only
   falling back to a rounded multiply if the source ever supplies more
   fractional digits than configured.
2. Calculated Net (minor units) = Gross - Tare.
3. Difference (minor units) = Calculated Net - Recorded Net.
4. Classify, most-specific issue wins (never more than one issue per
   row, never a duplicate root cause):
     a. Gross unparseable/missing       -> INVALID_GROSS_WEIGHT
     b. Tare unparseable/missing        -> INVALID_TARE_WEIGHT
     c. Recorded Net unparseable/missing -> INVALID_RECORDED_NET_WEIGHT
     d. any parsed value negative       -> NEGATIVE_WEIGHT_VALUE
     e. Gross < Tare                    -> GROSS_BELOW_TARE
     f. abs(Difference) > configured tolerance -> WEIGHT_CALCULATION_MISMATCH
     g. otherwise                       -> valid, no issue
   A mathematically valid zero value is never automatically treated as
   invalid.
5. Tolerance (toleranceMinorUnits) is profile-configurable in
   config/app-config.json under "weightIntegrity". All three profiles
   default to zero tolerance at their confirmed source precision — this
   is backed by the zero-mismatch result across all inspected sample
   rows, not an invented allowance. A future nonzero tolerance must be
   justified by observed weighbridge behavior.
```

Non-negotiable business rule (D010): this is detection and reporting
only. Recorded Net, Gross, and Tare are never rewritten by the
calculated value; the clean output Net and TSV export always continue
to use the recorded source Net. Every weight issue is blocking (no
"Ignore" control in this version) — it drives the affected Cleaning
Group to `ACTION_REQUIRED` and disables copy for that group's scope,
through the same centralized readiness/copy-gating model as every other
blocking category (`js/core/readiness.js`), never a separate ad-hoc
check. The affected row is not dropped: it remains visible in Clean
Data Preview and is not counted as a lost row. Required operator
workflow: confirm the discrepancy with the weighbridge team, correct
the source file outside the app, re-upload, and re-run cleaning.

Row-level traceability: each weight issue result carries the row's
sourceRowId (`<sheet name>#R<Excel row number>`, the same mechanism
HYNC/SLNC already used, now also added to ESG for this purpose) plus
Gross/Tare/Recorded Net/Calculated Net/Difference in minor units, so the
UI (Weight Integrity Issues section) can present enough detail for
operational confirmation without exposing internal fields in the TSV
or clean output schema (§6, §15).

---

## 20. Weight Exception Resolution (v1.2.0, D011)

Extends §19 with a per-row operational resolution workflow for
`WEIGHT_CALCULATION_MISMATCH` rows only — every other weight issue code
(§19 step 4a-4e) has no resolution workflow and stays unconditionally
blocking.

```text
1. All weight-integrity issue rows for one Cleaning Group render inside
   exactly one panel and one table (never one per row) — see
   group.validation.weightIntegrityIssueRows, unchanged from §19.
2. Each WEIGHT_CALCULATION_MISMATCH row may carry an operator-recorded
   "approved weight exception" (js/core/weight-exception-store.js), keyed
   to the current in-memory run id + cleaning group id + sourceRowId +
   Gross/Tare/Recorded Net minor units — never to filename, row number,
   or NO.NOTA alone, so a changed source value can never inherit a stale
   approval.
3. Granting an exception (js/ui/weight-exception-dialog.js) requires an
   operator-entered "Confirmed by" and "Reference / reason" (both
   required); the app records these plus a timestamp, but never
   independently verifies them (no login/backend) and states this
   plainly in the dialog.
4. An approved exception never mutates Gross, Tare, or Recorded Net, and
   never removes the row or its mismatch numbers from the issue table —
   it only changes that row's operational resolution status.
5. Readiness distinguishes:
     totalWeightMismatchCount     = validation.weightMismatchCount
     approvedWeightExceptionCount = approved rows for this group
     unresolvedWeightMismatchCount = total - approved
   Only unresolvedWeightMismatchCount (plus every non-approvable weight
   issue type and every other existing blocking category) drives
   ACTION_REQUIRED. Zero unresolved mismatches with at least one approved
   exception and no other blockers is READY_WITH_INFO, never plain READY.
6. Revocation deletes the approval record only — the row and its mismatch
   data are never deleted, and blocking readiness is restored immediately.
7. Approvals are session-scoped to the current cleaning result ("run"):
   Refresh Cleaning, Clear/Reset, and any new upload that replaces the
   result set all start a fresh run with zero approvals
   (js/ui/result-page.js's reset()/showGroups(), via
   startNewRun() in the store).
8. There is no "Approve All" / "Override All" / group-wide or
   profile-wide override anywhere — resolution is always one row at a
   time.
```

---

## 21. Low Net Weight Confirmation (v1.3.0, D012)

An additional, independent operational validation layer implemented in
`js/core/net-weight-validation.js`. Uses the RECORDED source Net value
only — never Calculated Net:

```text
HYNC   Recorded Net = 净重 (same field D010 already parses).
SLNC   Recorded Net = 净重.
ESG    Recorded Net = TIMBANGAN BERSIH.

Threshold: config/app-config.json "minimumNetWeight.<PROFILE>"
  { enabled, thresholdTonnes } — all three profiles at 20.00 tonnes today.

Rule:
  Recorded Net <  threshold -> LOW_NET_WEIGHT, blocking, copy disabled.
  Recorded Net >= threshold -> valid, passes.
```

Validation logic (`validateMinimumNetWeight()`):

```text
1. Reuses the row's already-computed §19 weight-integrity result
   (recordedNetMinorUnits, sourceUnit, decimalPlaces) — never a second
   parse of the raw source cell.
2. If Recorded Net failed to parse, or the row already carries
   INVALID_GROSS_WEIGHT / INVALID_TARE_WEIGHT / INVALID_RECORDED_NET_WEIGHT
   / NEGATIVE_WEIGHT_VALUE / GROSS_BELOW_TARE, this check does not run —
   weight-integrity remains sole authority for that row (no duplicate
   issue for the same root cause). A WEIGHT_CALCULATION_MISMATCH row's
   Recorded Net is still a trustworthy parsed number, so it remains
   independently eligible here — a row can carry both issues.
3. Converts thresholdTonnes into the same scaled-integer minor-unit
   system as recordedNetMinorUnits (kg for HYNC/SLNC, hundredths of a
   tonne for ESG), via parseToMinorUnits() — never a floating-point
   tonnage comparison.
4. recordedNetMinorUnits < thresholdMinorUnits -> LOW_NET_WEIGHT
   (blocking); otherwise valid, no issue.
```

Non-negotiable business rule (D012): detection and reporting only.
Recorded Net is never modified; the clean output Net and TSV export
always continue to use the recorded source Net. The affected row is not
dropped: it remains visible in Clean Data Preview and is not counted as
a lost row, and it does not create a new shift group.

Resolution reuses §20's exact operational model (parallel, independent
session-scoped store `js/core/low-net-weight-store.js` and dialog
`js/ui/low-net-weight-dialog.js`): per-row only, "Confirmed by" +
"Reference / reason" required for approval, Recorded Net never mutated,
the finding never deleted from its table, approvals keyed to run id +
group id + sourceRowId + recordedNetMinorUnits, cleared by every path
that starts a new run. `unresolvedLowNetCount` /
`approvedLowNetExceptionCount` feed `js/core/readiness.js` exactly like
their weight-mismatch counterparts (own addend into the blocking count;
an approved-only group is `READY_WITH_INFO`, never plain `READY`).

Rendered as its own dedicated panel ("Net Below 20 Tonnes" /
"Net < 20 Tonnes Approved" once fully approved), positioned after Weight
Integrity Issues and before Other Blocking Issues — never merged into
another panel, never one panel per row. The approved 12-column TSV/clean
output schema (§15) is unchanged.
