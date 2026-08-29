// Regression tests for ESG KODE ORE full-width parenthesis compatibility.
// Plain Node, no test framework or dependencies: run with
//   node tests/esg-kode-ore-fullwidth.test.mjs
// A new ESG source file spells KODE ORE's grade parentheses using the
// Unicode full-width forms (U+FF08 "（" / U+FF09 "）") instead of ASCII
// "(" / ")" (e.g. "L31-21（NI:1.06)"). js/profiles/esg/cleaner.js now
// normalizes just those two characters before handing the value to
// parseSourceGrade() in js/core/normalizers.js. This file builds
// workbook.sheets[0].rows directly (the same shape js/core/excel-reader.js
// produces) rather than round-tripping through SheetJS, since clean() only
// ever reads that shape.

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(fileURLToPath(import.meta.url)) + "/..";

const { clean: cleanEsg } = await import("file://" + repoRoot + "/js/profiles/esg/cleaner.js");

const fs = await import("node:fs/promises");
const APP_CONFIG = JSON.parse(
  await fs.readFile(path.join(repoRoot, "config/app-config.json"), "utf8")
);
const REAL_WEIGHT_CONFIG = APP_CONFIG.weightIntegrity;
const REAL_MIN_NET_CONFIG = APP_CONFIG.minimumNetWeight;

function noopJoinContractor(dtIdRaw) {
  return { contractor: "Unmatched", normalizedDtId: dtIdRaw };
}

const ESG_HEADERS = [
  "NO.NOTA",
  "NO. DT",
  "TIMBANGAN ISI",
  "TIMBANGAN KOSONG",
  "TIMBANGAN BERSIH",
  "JAM TIMBANG ISI",
  "TANGGAL",
  "PILE ID",
  "KODE ORE",
];

let notaCounter = 0;

function buildEsgRow(kodeOre) {
  notaCounter += 1;
  return [
    `NOTA-${notaCounter}`,
    `SCM-LIM ${300 + notaCounter} DT`,
    53.76,
    5.0,
    48.76,
    "2026-07-14 07:54:00",
    "2026-07-14",
    "SCESG-EX-000119",
    kodeOre,
  ];
}

function runEsg(kodeOreValues) {
  const rows = [ESG_HEADERS, ...kodeOreValues.map(buildEsgRow)];
  const workbook = { sheets: [{ name: "DATA ORE", rows }] };
  return cleanEsg(workbook, {
    joinContractor: noopJoinContractor,
    listDt: [],
    weightIntegrityConfig: REAL_WEIGHT_CONFIG,
    minimumNetWeightConfig: REAL_MIN_NET_CONFIG,
  });
}

function sourceGradeOf(kodeOre) {
  const result = runEsg([kodeOre]);
  assert.equal(result.cleanRows.length, 1, `expected exactly one clean row for ${JSON.stringify(kodeOre)}`);
  const row = result.cleanRows[0];
  return { source: row.Source, grade: row.Grade };
}

// --- 1. Existing ASCII behavior is preserved --------------------------------
{
  const { source, grade } = sourceGradeOf("L31-21 (NI:1.06)");
  assert.equal(source, "L31_21");
  assert.equal(grade, "NI:1.06");
  console.log("PASS: ASCII parentheses parse unchanged");
}

// --- 2. Full-width open, ASCII close ----------------------------------------
{
  const { source, grade } = sourceGradeOf("L31-21（NI:1.06)");
  assert.equal(source, "L31_21");
  assert.equal(grade, "NI:1.06");
  console.log("PASS: full-width open + ASCII close parses equivalently");
}

// --- 3. Full-width open and close -------------------------------------------
{
  const { source, grade } = sourceGradeOf("L31-21（NI:1.06）");
  assert.equal(source, "L31_21");
  assert.equal(grade, "NI:1.06");
  console.log("PASS: full-width open + full-width close parses equivalently");
}

// --- 4. All three forms of the same value produce identical output ---------
{
  const ascii = sourceGradeOf("L31-21 (NI:1.06)");
  const mixed = sourceGradeOf("L31-21（NI:1.06)");
  const fullwidth = sourceGradeOf("L31-21（NI:1.06）");
  assert.deepEqual(mixed, ascii);
  assert.deepEqual(fullwidth, ascii);
  console.log("PASS: ASCII/mixed/full-width variants of the same value are identical");
}

// --- 5. Additional real-world examples from the report ---------------------
{
  const { source, grade } = sourceGradeOf("L41-01（NI:1.12)");
  assert.equal(source, "L41_01");
  assert.equal(grade, "NI:1.12");
  console.log("PASS: L41-01（NI:1.12) parses correctly");
}
{
  const { source, grade } = sourceGradeOf("S14-L11（NI:1.03)");
  assert.equal(source, "S14_L11");
  assert.equal(grade, "NI:1.03");
  console.log("PASS: S14-L11（NI:1.03) parses correctly");
}

// --- 6. Malformed input is not silently made valid --------------------------
// No parenthesis at all: entire trimmed string becomes Source, Grade stays
// empty — same as the pre-existing ASCII-only behavior. The fix must not
// invent a grade out of a value that never had one.
{
  const { source, grade } = sourceGradeOf("L31-21 NI:1.06");
  assert.equal(source, "L31_21 NI:1.06");
  assert.equal(grade, "");
  console.log("PASS: value with no parentheses at all is left unparsed, as before");
}

// Unrelated full-width punctuation elsewhere in the value must NOT be
// touched — only U+FF08/U+FF09 are substituted. A full-width colon
// (U+FF1A) inside the grade segment must pass through verbatim, proving
// this isn't a broad "normalize all full-width punctuation" pass.
{
  const { source, grade } = sourceGradeOf("L31-21 (NI：1.06)");
  assert.equal(source, "L31_21");
  assert.equal(grade, "NI：1.06");
  console.log("PASS: unrelated full-width punctuation (non-paren) is left untouched");
}

console.log("All esg-kode-ore-fullwidth tests passed.");
