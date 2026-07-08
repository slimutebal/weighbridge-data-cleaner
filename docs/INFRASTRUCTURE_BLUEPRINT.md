# Weighbridge Data Cleaner — Infrastructure Blueprint

## 1. Purpose

This document is the infrastructure and architecture reference for building the **Weighbridge Data Cleaner** application.

The application will replace the current Excel + Power Query + Macro workflow used for weighbridge data cleaning.

The app must support multiple weighbridge source formats, clean them through profile-specific pipelines, validate the result, generate reports, and allow users to copy clean data back into Excel.

This document is intended for LLM builders such as ChatGPT, Claude, or other coding assistants.

---

## 2. Product Objective

Build a Windows-friendly, offline-first local web application for cleaning weighbridge Excel data.

The application must:

1. accept original weighbridge Excel source files directly;
2. support HYNC, SLNC, and ESG source formats;
3. avoid raw data copy-paste input;
4. reduce the heavy processing caused by Excel Power Query;
5. support Day Shift and Night Shift input buckets;
6. validate that files are placed in the correct shift bucket;
7. clean each file using the correct profile logic;
8. group results by profile, date, and shift;
9. produce summary reports similar to the existing Excel cleaning workbooks;
10. use an updatable `List DT` contractor mapping from Google Sheet;
11. allow clean output to be copied as TSV and pasted into Excel.

---

## 3. Final Architecture Direction

Use a browser-based local web app:

```text
HTML + CSS + JavaScript
+ SheetJS for Excel reading
+ Tabulator for table previews
+ JSON rules/configuration
+ local cache for List DT
+ optional PWA support
```

Do not use these in the MVP:

```text
Python
Streamlit
Node.js backend
database
ODBC
cloud database
login system
real-time weighbridge integration
automatic folder watcher
```

The MVP must run client-side in the browser.

---

## 4. Key Infrastructure Principle

Use:

```text
Single App
+ Multiple Cleaning Profiles
+ Shared Core Engine
+ Shared Validation Engine
+ Shared Master Data Manager
```

Do **not** build one large universal cleaning function.

Correct architecture:

```text
Weighbridge Data Cleaner
├─ Shared Core
├─ Profile: HYNC
├─ Profile: SLNC
├─ Profile: ESG
├─ Master Data: List DT
├─ Validation Engine
├─ Report Engine
└─ Clipboard Output Engine
```

Each source type must have its own profile-specific rules and pipeline.

---

## 5. Supported Source Types

### 5.1 HYNC

HYNC source file uses Chinese weighbridge headers.

Typical sheet name:

```text
过磅明细
```

Common raw columns include:

```text
流水号
车号
货名
发货单位
毛重
皮重
净重
毛重时间
皮重时间
收货单位
日期
备注
规格
客户类型
```

HYNC detection signal:

```text
备注 / PILE ID contains SCHY
```

Example:

```text
SCHY02814
SCHY02818
```

---

### 5.2 SLNC

SLNC source file uses the same Chinese weighbridge structure as HYNC.

Typical sheet name:

```text
过磅明细
```

SLNC detection signal:

```text
备注 / PILE ID contains SCSL
```

Example:

```text
SCSL-0000031
```

---

### 5.3 ESG

ESG source file uses Indonesian-style weighbridge headers.

Common raw columns include:

```text
NO
NO.NOTA
NO. DT
MATERIAL
PENYUPLAI
PENERIMA
TIMBANGAN ISI
TIMBANGAN KOSONG
TIMBANGAN BERSIH
JAM TIMBANG ISI
JAM TIMBANG KOSONG
LOKASI DUMPING
TANGGAL
PILE ID
KODE ORE
```

ESG detection signal:

```text
header contains:
TIMBANGAN ISI
TIMBANGAN KOSONG
TIMBANGAN BERSIH
```

---

## 6. Input Design

The first page must have two shift-based input buckets:

```text
Day Shift Input
Night Shift Input
```

Each bucket accepts HYNC, SLNC, and ESG source files.

The bucket represents the user's declared shift intent.

The app must still validate the shift from the row timestamps.

### 6.1 Import Page Layout

Recommended first page:

```text
┌──────────────────────────────────────────────────────────────┐
│ Weighbridge Data Cleaner                                     │
├──────────────────────────────┬───────────────────────────────┤
│ Day Shift Input              │ Night Shift Input              │
│                              │                               │
│ [Insert Excel Files]         │ [Insert Excel Files]           │
│ Accepts HYNC, SLNC, ESG      │ Accepts HYNC, SLNC, ESG        │
│ Day Shift source files       │ Night Shift source files       │
│                              │                               │
│ Drop files here              │ Drop files here                │
└──────────────────────────────┴───────────────────────────────┘
```

### 6.2 Imported Files Panel

After files are inserted, show a file card/table:

```text
Imported Files

✓ HYNC | 337 rows | DS | 16 May 2026 | Day bucket | Ready
✓ SLNC | 109 rows | DS | 16 May 2026 | Day bucket | Ready
✓ ESG  | 304 rows | DS | 16 May 2026 | Day bucket | Ready
⚠ ESG  | 42 rows  | NS | 16 May 2026 | Day bucket | Shift mismatch

Overall status: Warning
```

Each file row/card must show:

```text
file name
detected profile
row count
detected date
detected shift
input bucket
status
warnings/errors
manual profile override option
remove file option
preview option
```

---

## 7. Shift Handling

### 7.1 Core Rule

The app must prevent silent mixing of shifts.

The system must group output by:

```text
Profile + Date + Detected Shift
```

A cleaning group is defined as:

```text
Cleaning Group = Profile + Date + Shift
```

Example groups:

```text
HYNC | 2026-05-16 | DS
SLNC | 2026-05-16 | DS
ESG  | 2026-05-16 | DS
HYNC | 2026-05-16 | NS
SLNC | 2026-05-16 | NS
```

### 7.2 Bucket Is Intent, Timestamp Is Validation

The input bucket is not the final authority.

```text
Day Shift bucket = user-declared intent
Night Shift bucket = user-declared intent
Row timestamp = validation source
```

If a Night Shift row is found inside the Day Shift bucket, the app must show a warning.

### 7.3 Shift Detection Strategy

The app should read all rows, not only the first 30 rows.

This is a key improvement over the current Excel Power Query approach.

Recommended shift classification:

```text
DS = within configured Day Shift time window
NS = outside Day Shift time window
```

The shift time window should be configurable per profile.

Example configuration:

```json
{
  "shiftRules": {
    "HYNC": {
      "dayShiftStart": "06:00",
      "dayShiftEnd": "18:00"
    },
    "SLNC": {
      "dayShiftStart": "06:00",
      "dayShiftEnd": "18:00"
    },
    "ESG": {
      "dayShiftStart": "07:00",
      "dayShiftEnd": "19:00"
    }
  }
}
```

### 7.4 Mixed Shift Inside One File

If one uploaded file contains both DS and NS rows, the app must not silently force one shift.

Recommended behavior:

```text
Mixed shift detected inside file.
The app will split the rows into separate Profile + Date + Shift groups.
User must review the grouped result before copying output.
```

For MVP, this can be shown as a warning but must be visible.

---

## 8. Profile Detection

### 8.1 Detection Flow

```text
Read workbook
↓
Find candidate sheet
↓
Read headers and sample rows
↓
Detect source profile
↓
Calculate confidence
↓
If confidence is low, require manual profile selection
```

### 8.2 Detection Rules

ESG:

```text
If headers contain:
TIMBANGAN ISI
TIMBANGAN KOSONG
TIMBANGAN BERSIH

Then profile = ESG
```

HYNC:

```text
If Chinese header format is detected
and PILE ID / 备注 contains SCHY

Then profile = HYNC
```

SLNC:

```text
If Chinese header format is detected
and PILE ID / 备注 contains SCSL

Then profile = SLNC
```

Unknown:

```text
If detection confidence is low,
show manual override:
[HYNC] [SLNC] [ESG]
```

---

## 9. Result Page Design

After clicking `Run Cleaning`, show the result page.

The result page must be grouped by:

```text
Profile + Date + Shift
```

### 9.1 Result Page Layout

```text
┌──────────────────────────────────────────────────────────────┐
│ Cleaning Results                                             │
├──────────────────────────────────────────────────────────────┤
│ Groups                                                       │
│ [HYNC | 16 May | DS] [SLNC | 16 May | DS] [ESG | 16 May | DS] │
│ [HYNC | 16 May | NS] [SLNC | 16 May | NS]                    │
├──────────────────────────────────────────────────────────────┤
│ Selected Group: HYNC | 16 May 2026 | DS                      │
├──────────────────────────────────────────────────────────────┤
│ Summary                                                      │
│ Raw rows             : 337                                   │
│ Clean rows           : 337                                   │
│ Lost rows            : 0                                     │
│ Raw tonnage          : 12,345.67                             │
│ Clean tonnage        : 12,345.67                             │
│ Tonnage difference   : 0.00                                  │
│ Duplicate NO.NOTA    : 0                                     │
│ Missing Contractor   : 3                                     │
│ Missing Grade        : 0                                     │
│ Missing Source       : 0                                     │
├──────────────────────────────────────────────────────────────┤
│ Report                                                       │
│ Summary by Contractor / PILE ID / Source / Grade              │
├──────────────────────────────────────────────────────────────┤
│ Clean Data Preview                                           │
│ [table preview]                                              │
├──────────────────────────────────────────────────────────────┤
│ [Copy This Group] [Copy All Groups] [Back to Import]          │
└──────────────────────────────────────────────────────────────┘
```

---

## 10. Report Requirements

Each cleaning group must have a report similar to the existing Excel cleaning workbook.

Minimum report items:

```text
raw row count
clean row count
lost row count
raw tonnage
clean tonnage
tonnage difference
duplicate NO.NOTA count
missing contractor count
missing grade count
missing source count
blank key fields count
summary by Contractor
summary by PILE ID
summary by Source
summary by Grade
```

Recommended issue tables:

```text
duplicate NO.NOTA rows
missing Contractor rows
missing Grade rows
missing Source rows
invalid Date/Time rows
unmatched DT rows
```

---

## 11. Output Design

The app must support separate group outputs.

Primary output:

```text
Copy This Group
```

Secondary output:

```text
Copy All Groups
```

The default output must be TSV:

```text
tab-separated values
```

Reason:

```text
Excel reads tabs as column separators.
TSV is safer for direct paste than CSV.
```

Clipboard rules:

```text
use \t between columns
use \n between rows
preserve configured output column order
include or exclude header based on config
normalize date and number values before copying
```

The current Excel macro copies clean data without headers, so the app must support:

```text
includeHeader: false
```

---

## 12. Normalized Output Schema

Each profile may have its own raw structure, but the app should normalize clean output.

Recommended normalized schema:

```text
TANGGAL
NO. DT
Contractor
Shift
Datetime
NO.NOTA
Type
Buyer
Net
PILE ID
Source
Grade
Profile
```

Mapping:

```text
HYNC/SLNC PENERIMA → Buyer
ESG Pembeli       → Buyer
HYNC/SLNC NET     → Net
ESG TIMBANGAN BERSIH → Net
HYNC/SLNC TYPE    → Type
ESG Type          → Type
```

For transition from the existing Excel workbook, profile-specific output may also be supported if needed.

---

## 13. List DT Master Data

### 13.1 Purpose

`List DT` maps truck/unit ID to contractor.

Only two fields are required:

```text
dt_id
contractor
```

No additional required fields are needed for MVP.

### 13.2 Source

The master List DT source is a Google Sheet exposed through a Google Apps Script endpoint.

Configured endpoint:

```text
https://script.google.com/macros/s/AKfycbwoakor1_LBN52GYBACijgorUEE5cPqjrnR_ncmCBzJH2YKf6Yl42Ys2m3VpSVoSuFs/exec
```

### 13.3 Required JSON Shape

The endpoint should return either this preferred structure:

```json
{
  "data": [
    {
      "dt_id": "SCM-LIM 934",
      "contractor": "MIM"
    },
    {
      "dt_id": "SCM LIM 982",
      "contractor": "STM"
    }
  ]
}
```

or a raw array:

```json
[
  {
    "dt_id": "SCM-LIM 934",
    "contractor": "MIM"
  },
  {
    "dt_id": "SCM LIM 982",
    "contractor": "STM"
  }
]
```

The app must ignore extra fields if they exist.

The app must require only:

```text
dt_id
contractor
```

### 13.4 Master Data Loading Priority

The app must not depend on internet access during cleaning.

Recommended loading priority:

```text
1. local cached List DT
2. bundled default List DT
3. online update from Google Sheet when user requests update
4. manual import fallback if needed
```

### 13.5 Update Behavior

The app should provide a `Master Data / List DT` page or panel:

```text
List DT
Rows             : 705
Last Updated     : 2026-07-08 12:30
Source           : Google Sheet / Local Cache / Bundled Default
Status           : Ready

[Update from Google Sheet]
[Preview List DT]
[Validate Duplicate DT]
```

Update flow:

```text
User clicks Update from Google Sheet
↓
Fetch Apps Script endpoint
↓
Validate JSON
↓
Check required fields: dt_id, contractor
↓
Normalize dt_id
↓
Detect duplicate normalized dt_id
↓
Save to local cache
↓
Use updated List DT for cleaning
```

### 13.6 Offline Behavior

If online update fails:

```text
Show warning:
"List DT update failed. Using cached List DT."

Do not block cleaning if cached or bundled List DT exists.
```

Cleaning should only be blocked if no usable List DT exists and contractor mapping is required.

---

## 14. DT ID Normalization

Contractor mapping must not rely only on raw strings.

Create a shared function:

```text
normalizeDtId()
```

This function should normalize both:

```text
raw NO. DT from weighbridge data
dt_id from List DT
```

Minimum normalization:

```text
trim whitespace
convert to uppercase
remove suffix " DT"
collapse multiple spaces
normalize common separators
remove invisible/non-breaking spaces
```

Example variants that should be handled carefully:

```text
SCM LIM 982 DT
SCM LIM 982
SCM-LIM 982
SCM-LIM-982
SCM LIM982
```

The contractor join must use:

```text
normalized NO. DT → normalized dt_id
```

The app must report unmatched DT rows.

---

## 15. Data Cleaning Pipelines

### 15.1 HYNC Pipeline

Expected HYNC flow:

```text
read Chinese weighbridge sheet
map Chinese headers to normalized raw fields
detect HYNC from PILE ID / 备注 containing SCHY
parse Date/Time
validate shift
clean NO. DT
clean PILE ID
parse Source from 规格
parse Grade from 规格
set Type
set Buyer/Penerima
convert Net from kg to ton if required
join List DT
reorder output columns
run validation
generate report
```

### 15.2 SLNC Pipeline

Expected SLNC flow:

```text
read Chinese weighbridge sheet
map Chinese headers to normalized raw fields
detect SLNC from PILE ID / 备注 containing SCSL
parse Date/Time
validate shift
clean NO. DT
clean PILE ID
parse Source from 规格
parse Grade from 规格
set Type
set Buyer/Penerima
convert Net from kg to ton if required
join List DT
reorder output columns
run validation
generate report
```

### 15.3 ESG Pipeline

Expected ESG flow:

```text
read ESG sheet
validate Indonesian headers
filter valid NO.NOTA rows if needed
parse ori_datetime from JAM TIMBANG ISI
validate shift
clean NO. DT
clean PILE ID
parse Source from KODE ORE
parse Grade from KODE ORE
set Type
set Buyer/Pembeli
convert TIMBANGAN BERSIH to Net
join List DT
reorder output columns
run validation
generate report
```

---

## 16. Shared Core Modules

Recommended shared modules:

```text
js/core/
├─ excel-reader.js
├─ schema-detector.js
├─ profile-registry.js
├─ pipeline-runner.js
├─ shift-engine.js
├─ date-time-parser.js
├─ dt-normalizer.js
├─ list-dt-manager.js
├─ validation-engine.js
├─ report-engine.js
├─ clipboard-tsv.js
└─ storage.js
```

Recommended profile modules:

```text
js/profiles/
├─ hync/
│  ├─ profile.json
│  ├─ detector.js
│  ├─ pipeline.js
│  └─ rules.json
│
├─ slnc/
│  ├─ profile.json
│  ├─ detector.js
│  ├─ pipeline.js
│  └─ rules.json
│
└─ esg/
   ├─ profile.json
   ├─ detector.js
   ├─ pipeline.js
   └─ rules.json
```

Recommended UI modules:

```text
js/ui/
├─ import-page.js
├─ shift-bucket.js
├─ imported-file-list.js
├─ validation-panel.js
├─ result-page.js
├─ result-group-tabs.js
├─ summary-panel.js
├─ report-table.js
├─ clean-data-preview.js
└─ list-dt-page.js
```

---

## 17. Suggested Folder Structure

```text
weighbridge-data-cleaner/
│
├─ index.html
├─ manifest.json
├─ service-worker.js
├─ README.md
│
├─ assets/
│  ├─ icon-192.png
│  ├─ icon-512.png
│  └─ icon.ico
│
├─ css/
│  └─ app.css
│
├─ lib/
│  ├─ sheetjs/
│  └─ tabulator/
│
├─ config/
│  ├─ app-config.json
│  └─ shift-rules.json
│
├─ data/
│  └─ default-list-dt.json
│
├─ js/
│  ├─ main.js
│  │
│  ├─ core/
│  │  ├─ excel-reader.js
│  │  ├─ schema-detector.js
│  │  ├─ profile-registry.js
│  │  ├─ pipeline-runner.js
│  │  ├─ shift-engine.js
│  │  ├─ date-time-parser.js
│  │  ├─ dt-normalizer.js
│  │  ├─ list-dt-manager.js
│  │  ├─ validation-engine.js
│  │  ├─ report-engine.js
│  │  ├─ clipboard-tsv.js
│  │  └─ storage.js
│  │
│  ├─ profiles/
│  │  ├─ hync/
│  │  │  ├─ profile.json
│  │  │  ├─ detector.js
│  │  │  ├─ pipeline.js
│  │  │  └─ rules.json
│  │  │
│  │  ├─ slnc/
│  │  │  ├─ profile.json
│  │  │  ├─ detector.js
│  │  │  ├─ pipeline.js
│  │  │  └─ rules.json
│  │  │
│  │  └─ esg/
│  │     ├─ profile.json
│  │     ├─ detector.js
│  │     ├─ pipeline.js
│  │     └─ rules.json
│  │
│  └─ ui/
│     ├─ import-page.js
│     ├─ shift-bucket.js
│     ├─ imported-file-list.js
│     ├─ validation-panel.js
│     ├─ result-page.js
│     ├─ result-group-tabs.js
│     ├─ summary-panel.js
│     ├─ report-table.js
│     ├─ clean-data-preview.js
│     └─ list-dt-page.js
│
└─ samples/
   ├─ hync-sample.xlsx
   ├─ slnc-sample.xlsx
   └─ esg-sample.xlsx
```

---

## 18. Configuration Files

### 18.1 App Config

Example:

```json
{
  "appName": "Weighbridge Data Cleaner",
  "version": "0.1.0",
  "listDtEndpoint": "https://script.google.com/macros/s/AKfycbwoakor1_LBN52GYBACijgorUEE5cPqjrnR_ncmCBzJH2YKf6Yl42Ys2m3VpSVoSuFs/exec",
  "defaultIncludeHeader": false,
  "clipboardFormat": "tsv"
}
```

### 18.2 Shift Rules

Example:

```json
{
  "HYNC": {
    "dayShiftStart": "06:00",
    "dayShiftEnd": "18:00"
  },
  "SLNC": {
    "dayShiftStart": "06:00",
    "dayShiftEnd": "18:00"
  },
  "ESG": {
    "dayShiftStart": "07:00",
    "dayShiftEnd": "19:00"
  }
}
```

---

## 19. MVP Acceptance Criteria

The MVP is acceptable when:

1. the app opens locally in a browser;
2. the first page has Day Shift and Night Shift input buckets;
3. user can insert one or more Excel source files;
4. app can detect HYNC, SLNC, and ESG files;
5. app can identify file date and detected shift;
6. app can warn if file is placed in the wrong shift bucket;
7. app can split rows into Profile + Date + Shift groups;
8. app can run profile-specific cleaning;
9. app can update List DT from the Google Apps Script endpoint;
10. app can cache List DT locally;
11. app can continue using cached/bundled List DT when offline;
12. app can join Contractor using normalized DT ID;
13. app reports unmatched DT rows;
14. result page shows each cleaning group separately;
15. each group has clean data preview;
16. each group has summary/report;
17. app can copy clean data as TSV;
18. pasted TSV lands correctly in Excel columns;
19. no backend is required;
20. cleaning logic is modular and editable.

---

## 20. Non-Negotiable Rules for LLM Builders

The LLM builder must follow these rules:

1. Do not build a one-file monolithic app.
2. Do not mix profile-specific logic into one giant function.
3. Do not rely on raw paste input.
4. Do not remove Day Shift and Night Shift input buckets.
5. Do not silently mix DS and NS rows.
6. Do not silently merge different dates into one report.
7. Group results by `Profile + Date + Shift`.
8. Use the input bucket only as user intent, not as final shift truth.
9. Validate shift from row timestamps.
10. Use only `dt_id` and `contractor` for List DT.
11. Cache List DT locally.
12. Do not block cleaning if online List DT update fails and cache exists.
13. Use normalized DT ID for contractor joins.
14. Report unmatched DT rows.
15. Keep HYNC, SLNC, and ESG as separate cleaning profiles.
16. Use TSV as the primary copy output.
17. Prioritize correctness and operational safety over visual polish.
18. Keep the application offline-first.
19. Avoid server/backend complexity in MVP.
20. Keep source code readable and editable.

---

## 21. Suggested LLM Build Prompt

Use this prompt to start implementation:

```text
You are building a Windows-friendly offline-first local web app called Weighbridge Data Cleaner.

The app replaces an Excel + Power Query + Macro workflow for weighbridge data cleaning.

Build it using HTML, CSS, and vanilla JavaScript. Do not use Python, Streamlit, Node backend, database, ODBC, login, or cloud backend in the MVP.

The app must accept original Excel weighbridge source files directly. Do not use raw paste input.

The first page must have two input buckets:
1. Day Shift Input
2. Night Shift Input

Each bucket accepts HYNC, SLNC, and ESG Excel files.

The app must:
- read Excel files with SheetJS;
- detect whether each file is HYNC, SLNC, or ESG;
- detect date and shift from row timestamps;
- treat the input bucket as user-declared intent only;
- validate whether detected shift matches the bucket;
- group all results by Profile + Date + Shift;
- clean each group using profile-specific pipelines;
- generate clean data preview;
- generate summary/report similar to the existing Excel cleaning workbook;
- copy clean data as TSV for direct paste into Excel.

Supported profiles:
- HYNC: Chinese weighbridge format, detected by PILE ID / 备注 containing SCHY.
- SLNC: Chinese weighbridge format, detected by PILE ID / 备注 containing SCSL.
- ESG: Indonesian weighbridge format, detected by headers TIMBANGAN ISI, TIMBANGAN KOSONG, TIMBANGAN BERSIH.

The app must include a List DT master data manager.
List DT requires only two fields:
- dt_id
- contractor

The app must update List DT from this Google Apps Script endpoint:
https://script.google.com/macros/s/AKfycbwoakor1_LBN52GYBACijgorUEE5cPqjrnR_ncmCBzJH2YKf6Yl42Ys2m3VpSVoSuFs/exec

The app must cache List DT locally and continue working offline using cached or bundled List DT when online update fails.

Use normalized DT ID for contractor matching and report unmatched DT rows.

Use modular architecture:
- shared core modules;
- separate profile modules for HYNC, SLNC, ESG;
- shared validation engine;
- shared report engine;
- shared clipboard TSV engine;
- shared List DT manager.

Do not build a monolithic app.
Do not silently mix dates or shifts.
Prioritize correctness, editability, and operational reliability.
```

---

## 22. Future Upgrade Path

After MVP validation, possible future upgrades:

```text
PWA install polish
desktop shortcut guidance
export clean output to XLSX
rule profile editor
manual List DT import
summary dashboard
row-level issue export
contractor mapping audit
duplicate ticket resolution helper
multi-day batch processing
Tauri/Electron shell if deeper Windows integration is needed
```

Do not add these before the MVP cleaning logic is proven correct.

---

## 23. Final Verdict

The recommended infrastructure is:

```text
Single browser-based local web app
+ Day/Night shift input buckets
+ HYNC, SLNC, ESG profile detection
+ Profile-specific cleaning pipelines
+ Grouping by Profile + Date + Shift
+ List DT manager with Google Sheet update
+ local cache fallback
+ validation/report dashboard
+ TSV copy output
```

This design is strong because it:

- avoids heavy Excel Power Query refresh;
- avoids manual raw data paste;
- supports multiple source types;
- reduces risk of mixed-shift data;
- keeps contractor mapping updateable;
- stays simple enough for MVP;
- remains editable for future improvement.
