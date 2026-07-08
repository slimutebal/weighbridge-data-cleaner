# Legacy Parity Profile

## 1. Purpose

This document records the legacy parity targets for the HYNC, SLNC, and ESG
weighbridge source formats before the formal `CLEANING_LOGIC_SPEC.md` is
written.

The goal is to capture what the existing Excel + Power Query + Macro
workflow currently produces (row counts, tonnage totals, detection
behavior, shift behavior) so the new app's cleaning pipelines can be
validated against a known-correct baseline, rather than being designed from
assumptions.

This document does not define final cleaning logic. It defines the target
the cleaning logic must reproduce (legacy parity) or intentionally improve
upon (improved validation), and keeps those two concerns separate.

---

## 2. Source Files Analyzed

```text
samples/hync/16-05-2026 PAGI B.xlsx
samples/slnc/16-05-2026 PAGI B SLNC.xlsx
samples/esg/(Data Timbangan Ore 16 Mei 2026) DAY SHIFT.xlsx
```

All three files represent Day Shift input for the same operational date,
2026-05-16, one per profile.

---

## 3. Legacy Workbook References

Findings in this document originate from legacy workbook profiling
performed in ChatGPT Project 01, cross-referenced against the sample files
listed above and against `docs/INFRASTRUCTURE_BLUEPRINT.md`. No new parsing
code was written to produce these numbers; they are carried forward as
confirmed baseline figures.

---

## 4. Raw Schema Summary Per Profile

### 4.1 HYNC

```text
Sheet name: 过磅明细
Header language: Chinese
Columns include:
  流水号, 车号, 货名, 发货单位, 毛重, 皮重, 净重,
  毛重时间, 皮重时间, 收货单位, 日期, 备注, 规格, 客户类型
```

### 4.2 SLNC

```text
Sheet name: 过磅明细
Header language: Chinese
Same raw structure as HYNC.
```

### 4.3 ESG

```text
Sheet name: DATA ORE 16 MEI 2026
Header language: Indonesian
Layout: repeated header/detail blocks, not a single flat table
Columns include:
  NO, NO.NOTA, NO. DT, MATERIAL, PENYUPLAI, PENERIMA,
  TIMBANGAN ISI, TIMBANGAN KOSONG, TIMBANGAN BERSIH,
  JAM TIMBANG ISI, JAM TIMBANG KOSONG, LOKASI DUMPING,
  TANGGAL, PILE ID, KODE ORE
```

The ESG sheet name is date-specific (`DATA ORE 16 MEI 2026`), not a fixed
literal sheet name like HYNC/SLNC's `过磅明细`. Sheet detection for ESG must
not assume a fixed sheet name.

---

## 5. Legacy Output Schema Per Profile

All three profiles are expected to normalize into the schema defined in
`INFRASTRUCTURE_BLUEPRINT.md` §12:

```text
TANGGAL, NO. DT, Contractor, Shift, Datetime, NO.NOTA,
Type, Buyer, Net, PILE ID, Source, Grade, Profile
```

Field mapping confirmed:

```text
HYNC/SLNC PENERIMA      → Buyer
ESG Pembeli              → Buyer
HYNC/SLNC NET (净重)     → Net
ESG TIMBANGAN BERSIH     → Net
HYNC/SLNC TYPE           → Type
ESG Type                 → Type
```

No profile-specific output schema deviation has been confirmed as required
yet; the blueprint's normalized schema is the working target for all three.

---

## 6. Detection Rules

```text
HYNC:
  Chinese header format detected
  AND 备注 / PILE ID contains "SCHY"

SLNC:
  Chinese header format detected
  AND 备注 / PILE ID contains "SCSL"

ESG:
  Header block contains:
    TIMBANGAN ISI
    TIMBANGAN KOSONG
    TIMBANGAN BERSIH
```

Confirmed finding: HYNC and SLNC share an identical raw structure and
cannot be distinguished by header shape alone — the SCHY/SCSL marker in
备注 / PILE ID is the only reliable discriminator between them.

---

## 7. Date/Time Parsing Notes

```text
HYNC/SLNC: 毛重时间 (gross weigh time) is the timestamp used for
           shift classification (referred to as JAM TIMBANG ISI equivalent).
ESG:       JAM TIMBANG ISI is the timestamp used for shift classification.
```

ESG's repeated-block layout means date/time values may repeat per block
header and must be associated back to their own detail rows rather than
assumed to apply to the whole sheet.

---

## 8. Legacy Shift Behavior

This is a legacy-only computation used by the current Excel workflow, and
is **not** the row-level shift validation the new app is required to add
(see §9 and §14).

```text
HYNC/SLNC legacy shift:
  Sort JAM TIMBANG ISI (毛重时间) ascending.
  Take the first 30 sorted rows.
  Compute the average time of those 30 rows.
  Classify the whole file's shift using that average time
  against the profile's configured Day Shift window.

ESG legacy shift:
  Sort JAM TIMBANG ISI ascending.
  Take the 30th sorted row.
  Classify the whole file's shift using that single row's time
  against the profile's configured Day Shift window.
```

Confirmed legacy results for the sample set (all Day Shift, 2026-05-16):

```text
HYNC: DS
SLNC: DS
ESG:  DS
```

This whole-file, sample-based shift classification is a known legacy
weakness: it produces one shift label per file rather than validating
every row, and can misclassify a file that contains a genuine mix of DS
and NS rows.

---

## 9. Row-Level Shift Warning Findings

The blueprint (§7.3, §7.4) requires the new app to read all rows — not a
30-row sample — and to detect mixed-shift files explicitly. This is a
deliberate improvement over the legacy behavior in §8, not a parity
requirement.

Findings to carry forward:

```text
- The legacy 30-row sample approach can silently mask mixed-shift files
  because only a small slice of rows determines the whole file's shift.
- The new app must classify shift per row against the profile's configured
  dayShiftStart/dayShiftEnd window.
- If any row's shift disagrees with the majority/declared bucket, the file
  must be flagged, not silently corrected.
- If a file contains both DS and NS rows, the app must split it into
  separate Profile + Date + Shift groups rather than forcing one shift.
```

---

## 10. List DT Join Requirements

```text
List DT requires only two fields: dt_id, contractor.
Contractor join must use normalized DT ID on both sides
  (raw NO. DT from weighbridge data, and dt_id from List DT).
Unmatched DT rows must be reported, not silently dropped or blanked.
```

No legacy List DT dataset was profiled as part of this document; the join
contract above is carried forward directly from
`INFRASTRUCTURE_BLUEPRINT.md` §13–§14 and confirmed as unchanged for
parity purposes.

---

## 11. Validation/Report Requirements

Confirmed baseline figures the new app's report engine must be able to
reproduce for the sample set (Day Shift, 2026-05-16):

```text
Profile | Sheet              | Valid rows | Raw tonnage
HYNC    | 过磅明细            | 337        | 14,421.19 t
SLNC    | 过磅明细            | 109        | 4,776.33 t
ESG     | DATA ORE 16 MEI 2026 | 224      | 10,547.46 t
```

These row counts and tonnage totals are the parity baseline: the new
cleaning pipeline's `clean row count` and `clean tonnage` for these exact
files should reconcile against these figures (allowing for legitimately
excluded invalid/blank rows, which must be reported as lost rows per
`INFRASTRUCTURE_BLUEPRINT.md` §10).

The report engine must still produce the full minimum report set defined
in the blueprint (§10): raw/clean/lost row counts, raw/clean tonnage,
tonnage difference, duplicate NO.NOTA count, missing contractor/grade/
source counts, and summaries by Contractor / PILE ID / Source / Grade.

---

## 12. Risky or Ambiguous Legacy Behavior

```text
1. ESG's repeated-block layout is not a flat table. Any generic single-pass
   header reader will fail on ESG. The reader must detect and iterate
   header/detail blocks rather than assuming one header row.

2. ESG's sheet name is date-dependent ("DATA ORE 16 MEI 2026"), so
   detection cannot rely on matching a fixed sheet name; it must scan
   sheets for the ESG header signature instead.

3. HYNC and SLNC are structurally identical. A detector that only checks
   header shape will not be able to tell them apart — the SCHY/SCSL marker
   is mandatory, not optional, for correct routing.

4. The legacy 30-row-sample shift classification is a whole-file heuristic,
   not a row-level truth. Treating its output as ground truth for
   validation (rather than as a legacy reference value) would reintroduce
   the exact silent-mixing risk the blueprint explicitly warns against
   (§7, §20 rule 5).

5. Valid row counts (337 / 109 / 224) are counts of rows the legacy
   workflow treated as valid, not raw sheet row counts. The new app's
   validation engine must define its own "valid row" criteria explicitly
   rather than assuming it matches legacy filtering rules by coincidence.
```

---

## 13. Required Parity Targets

For the sample set (Day Shift, 2026-05-16), the new pipeline must be able
to reproduce:

```text
HYNC: 337 valid rows, 14,421.19 t raw tonnage, detected shift = DS
SLNC: 109 valid rows, 4,776.33 t raw tonnage, detected shift = DS
ESG:  224 valid detail rows, 10,547.46 t raw tonnage, detected shift = DS
```

Detection routing must be reproducible from the rules in §6 for all three
files, with HYNC/SLNC discriminated only by the SCHY/SCSL marker.

---

## 14. Separation Between legacyCompatibilityRules and improvedValidationRules

To avoid conflating "what the legacy workbook did" with "what the new app
should do", parity targets are split into two explicit categories. The
formal `CLEANING_LOGIC_SPEC.md` should preserve this split when it defines
concrete rules.

### legacyCompatibilityRules

```text
- Row counts and tonnage totals in §11/§13 are the reconciliation baseline.
- Detection signals (SCHY / SCSL / TIMBANGAN* headers) match legacy routing.
- Legacy whole-file shift result (§8) is preserved as a reference value
  for parity comparison, so a user migrating from the old workbook sees a
  familiar shift label for the whole file.
- Normalized output schema field mapping (§5) matches legacy column intent
  (PENERIMA/Pembeli → Buyer, NET/TIMBANGAN BERSIH → Net, etc.).
```

### improvedValidationRules

```text
- Row-level shift classification against every row's timestamp, not a
  30-row sample (§9).
- Explicit mixed-shift-in-one-file detection and splitting into separate
  Profile + Date + Shift groups, shown as a visible warning (§9,
  blueprint §7.4).
- Warning when a file's declared input bucket disagrees with its
  row-validated shift (blueprint §7.2).
- Explicit unmatched-DT-row reporting rather than silent contractor blanks
  (§10).
- Explicit "valid row" criteria defined by the new validation engine,
  documented rather than inherited implicitly from legacy filtering (§12
  finding 5).
```

These two sets must not be merged into a single rule list in the cleaning
logic spec. Legacy compatibility rules exist to preserve trust and
reconciliation with the old workbook; improved validation rules exist to
fix known legacy weaknesses. Mixing them risks silently reintroducing the
legacy shift-mixing bug under the guise of parity.

---

## 15. Final Verdict

```text
READY_FOR_CLEANING_LOGIC_SPEC
```
