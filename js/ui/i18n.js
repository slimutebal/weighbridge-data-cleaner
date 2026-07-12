// Centralized UI localization (Phase C1). Presentation-only: never used to
// translate business data (Source/Grade/Contractor/DT values, filenames,
// exported schema, etc. — see README "Localization" and Part 6 of the C1
// spec). Canonical stored language values are "en" / "id"; default is "en"
// so existing behavior is unchanged for anyone who has never picked a
// language.

const STORAGE_KEY = "weighbridge-language";
const VALID_LANGUAGES = ["en", "id"];
const DEFAULT_LANGUAGE = "en";

const translations = {
  en: {
    // Header / shell
    "header.decimalFormat": "Excel Decimal Format",
    "header.clearReset": "Clear / Reset",
    "header.allCleared": "All uploaded files and results cleared.",

    // Settings
    "settings.title": "Settings",
    "settings.language": "Language",
    "settings.theme": "Theme",
    "language.english": "English",
    "language.indonesian": "Indonesia",
    "theme.label": "Theme:",
    "theme.auto": "Auto",
    "theme.light": "Light",
    "theme.dark": "Dark",
    "common.close": "Close",

    // List DT compact bar
    "listdt.title": "List DT (Master Data)",
    "listdt.source": "Source",
    "listdt.records": "Records",
    "listdt.duplicates": "Duplicate DT ID conflicts",
    "listdt.lastUpdated": "Last updated",
    "listdt.update": "Update List DT",
    "listdt.updating": "Updating from Google Sheet...",
    "listdt.updateSuccess": "List DT updated: {{count}} record(s) cached.",
    "listdt.updateFailed": "List DT update failed ({{reason}}). Using cached/bundled List DT.",
    "listdt.updateSuccessAnnounce": "List DT updated.",
    "listdt.updateFailedAnnounce": "List DT update failed.",
    "listdt.pendingSync": "Pending Google Sheet sync: {{count}} DT mapping(s).",
    "listdt.syncPending": "Sync Pending DT",
    "listdt.syncPendingSuccess": "Synced {{count}} pending DT mapping(s) to Google Sheet.",
    "listdt.syncPendingFailed": "Saved locally, pending Google Sheet sync. ({{reason}})",
    "listdt.syncedAnnounce": "Contractor mappings synchronized.",
    "listdt.syncPendingAnnounce": "Synchronization pending.",
    "listdt.source.cache": "cache",
    "listdt.source.bundled": "bundled",
    "listdt.na": "—",

    // Import / upload
    "import.dayShift": "Day Shift Input",
    "import.nightShift": "Night Shift Input",
    "import.dayHint": "Accepts HYNC, SLNC, ESG Day Shift source files.",
    "import.nightHint": "Accepts HYNC, SLNC, ESG Night Shift source files.",
    "import.dropZoneText": "Insert Excel Files or drop files here",
    "import.dropZoneAriaLabel": "{{label}} drop zone, click or drop Excel files here",
    "import.noFilesSelected": "No files selected.",
    "import.removeFile": "Remove {{filename}}",
    "import.removeFileTitle": "Remove {{filename}}",
    "import.fileRemovedAnnounce": "Removed {{filename}}.",

    // Wrong shift bucket modal
    "wrongBucket.unableToValidate": "Unable to validate shift",
    "wrongBucket.wrongBucket": "Wrong shift bucket",
    "wrongBucket.file": "File",
    "wrongBucket.ambiguousExplain":
      "The app could not determine whether this file is Day Shift or Night Shift from timestamps. This file was removed.",
    "wrongBucket.dsRows": "DS rows",
    "wrongBucket.nsRows": "NS rows",
    "wrongBucket.unknownRows": "Unknown timestamp rows",
    "wrongBucket.selectedBucket": "Selected bucket",
    "wrongBucket.detectedShift": "Detected shift",
    "wrongBucket.instruction": "This file was removed. Please upload it to {{bucket}}.",
    "wrongBucket.ok": "OK",
    "shift.day": "Day Shift",
    "shift.night": "Night Shift",

    // Results shell
    "results.heading": "Cleaning Results",
    "results.overview": "Overview",
    "results.tablistLabel": "Cleaning result profile tabs",
    "results.startCleaning": "Start Cleaning",
    "results.refreshCleaning": "Refresh Cleaning",
    "results.copyAll": "Copy All Groups",
    "results.copyProfile": "Copy This Profile",
    "results.copied": "Copied!",
    "results.copyFailed": "Copy failed",
    "results.copiedAnnounce": "Data copied to clipboard.",
    "results.copyFailedAnnounce": "Copy failed.",
    "results.noRowsProfile": "No rows for this profile yet.",
    "results.noGroupsEmpty":
      "No cleaning groups yet. Import files to see a summary grouped by Profile + Date + Bucket.",
    "results.noGroupsErrors": "No cleaning groups detected from the imported files.",
    "results.viewAllRows": "View All {{count}} Rows",
    "results.showingRows": "Showing {{shown}} of {{total}} rows",
    "results.cleanDataPreview": "Clean Data Preview",
    "results.viewAllSubtitle": "{{profile}} | {{date}} | {{bucket}} — {{count}} rows",
    "results.groupsSuffix": "groups",
    "results.groupSuffix": "group",

    // Readiness
    "readiness.ready": "Ready to Copy",
    "readiness.readyInfo": "Ready to Copy — Information Available",
    "readiness.actionRequired": "Action Required — Copy Disabled",
    "readiness.failed": "Cleaning Failed",
    "readiness.short.ready": "Ready",
    "readiness.short.readyInfo": "Ready with Information",
    "readiness.short.actionRequired": "Action Required",
    "readiness.short.failed": "Cleaning Failed",

    // Validation Report
    "validation.title": "Validation Report",
    "validation.rawRows": "Raw rows",
    "validation.cleanRows": "Clean rows",
    "validation.esgReportGroups": "ESG Report Groups",
    "validation.lostRows": "Lost rows",
    "validation.rawTonnage": "Raw tonnage",
    "validation.cleanTonnage": "Clean tonnage",
    "validation.tonnageDifference": "Tonnage difference",
    "validation.duplicateNota": "Duplicate NO.NOTA",
    "validation.missingContractor": "Missing Contractor",
    "validation.missingSource": "Missing Source",
    "validation.missingGrade": "Missing Grade",
    "validation.unmatchedDtRows": "Unmatched DT rows",
    "validation.timestampWindowInfoRows": "Timestamp window informational rows",
    "validation.pileIdSourceConflicts": "PILE ID / Source conflicts",
    "validation.placeholder": "Validation and report details will appear here after cleaning is run.",

    // Overview
    "overview.profile": "Profile",
    "overview.date": "Date",
    "overview.bucket": "Bucket",
    "overview.rows": "Rows",
    "overview.netTonnage": "Net Tonnage",
    "overview.missingContractor": "Missing Contractor",
    "overview.missingSource": "Missing Source",
    "overview.missingGrade": "Missing Grade",
    "overview.timestampWindowNotes": "Timestamp Window Notes",
    "overview.skippedRows": "Skipped Rows",
    "overview.unmatchedDtCorrection": "Unmatched DT Correction",
    "overview.unknownDt": "Unknown DT",
    "overview.contractorInput": "Contractor input",
    "overview.status": "Status",
    "overview.contractorPlaceholder": "Contractor name",
    "overview.noUnmatched": "No unmatched DT IDs in the currently uploaded files.",
    "overview.rawSourceValue": "Raw source value: {{value}}",
    "overview.unmatchedCount": "Unmatched ({{count}} row(s))",
    "overview.updateBtn": "Update",
    "overview.enterContractorFirst": "Enter at least one contractor name before clicking Update.",
    "overview.summaryNewSaved": "{{count}} new correction(s) saved",
    "overview.summaryAlreadyExisted": "{{count}} already existed (skipped)",
    "overview.summaryConflicts": "{{count}} conflict(s) need review",
    "overview.summaryNoChanges": "No changes.",
    "overview.alreadyExistsSkipped": "Already exists / duplicate skipped (contractor: \"{{contractor}}\").",
    "overview.conflictExisting": "Conflict: existing contractor differs (existing: \"{{contractor}}\").",
    "overview.syncedOk": "Synced to Google Sheet.",
    "overview.syncedDuplicate": "Already exists on Google Sheet.",
    "overview.syncedConflict": "Conflict: Google Sheet has a different contractor for this DT.",
    "overview.syncedPendingLocal": "Saved locally, pending Google Sheet sync.",
    "overview.syncedPendingLocalReason": "Saved locally, pending Google Sheet sync. ({{reason}})",

    // Profile page
    "profile.mainSummary": "Main Summary",
    "profile.additionalBreakdown": "Additional Breakdown (Contractor / PILE ID / Source / Grade)",
    "profile.byContractor": "By Contractor",
    "profile.byPileId": "By PILE ID",
    "profile.bySource": "By Source",
    "profile.byGrade": "By Grade",
    "profile.operationalSummary": "Operational Summary",
    "profile.noData": "No data.",
    "profile.key": "Key",
    "profile.rows": "Rows",
    "profile.netTotal": "Net Total",
    "profile.remark": "Remark",
    "profile.blank": "(blank)",
    "profile.timestampWindowNotesHeading": "Timestamp Window Notes ({{count}}) — Information only",
    "profile.timestampWindowNote":
      "{{count}} row(s) fall outside the nominal time window for the selected {{bucket}} bucket. They remain classified as {{bucket}}. No action is required.",
    "profile.unmatchedDtHeading": "Unmatched DT Rows ({{count}}) — Action required",
    "profile.unmatchedDtNote":
      "These NO. DT values were not found in List DT. Add them to List DT (or fix the raw DT ID) and re-run cleaning. Source file(s): {{files}}.",
    "profile.otherBlockingHeading": "Other Blocking Issues ({{count}}) — Action required",
    "profile.blockingCategoryNoRows":
      "See Validation Report for the count. Row-level detail is not tracked for this category.",
    "profile.summaryHeading": "{{profile}} Summary",
    "profile.summaryGroupsRows": "{{groups}} groups | {{rows}} rows",
    "profile.summaryStatusLine":
      "Ready: {{ready}} | Ready with Information: {{readyInfo}} | Action Required: {{actionRequired}} | Failed: {{failed}}",
    "profile.timestampNoteCount": "{{count}} timestamp note(s)",
    "profile.bucketLabel": "Bucket: {{bucket}}",
    "profile.rowsCount": "{{count}} rows",
    "blocking.missingSource": "Missing Source",
    "blocking.missingGrade": "Missing Grade",
    "blocking.duplicateNota": "Duplicate NO.NOTA",
    "blocking.pileIdSourceConflict": "PILE ID / Source Conflicts",
    "blocking.lostRows": "Lost Rows",
    "blockingSummary.unmatchedDt": "{{count}} unmatched DT",
    "blockingSummary.missingSource": "{{count}} missing Source",
    "blockingSummary.missingGrade": "{{count}} missing Grade",
    "blockingSummary.duplicateNota": "{{count}} duplicate NO.NOTA",
    "blockingSummary.lostRows": "{{count}} lost rows",
    "blockingSummary.pileIdSourceConflict": "{{count}} PILE ID/Source conflicts",
    "blockingSummary.more": "+ {{count}} more",
  },
  id: {
    // Header / shell
    "header.decimalFormat": "Format Desimal Excel",
    "header.clearReset": "Hapus / Atur Ulang",
    "header.allCleared": "Semua file yang diunggah dan hasil telah dihapus.",

    // Settings
    "settings.title": "Pengaturan",
    "settings.language": "Bahasa",
    "settings.theme": "Tema",
    "language.english": "English",
    "language.indonesian": "Indonesia",
    "theme.label": "Tema:",
    "theme.auto": "Otomatis",
    "theme.light": "Terang",
    "theme.dark": "Gelap",
    "common.close": "Tutup",

    // List DT compact bar
    "listdt.title": "List DT (Data Master)",
    "listdt.source": "Sumber",
    "listdt.records": "Data",
    "listdt.duplicates": "Konflik ID DT duplikat",
    "listdt.lastUpdated": "Terakhir diperbarui",
    "listdt.update": "Perbarui List DT",
    "listdt.updating": "Memperbarui dari Google Sheet...",
    "listdt.updateSuccess": "List DT diperbarui: {{count}} data tersimpan.",
    "listdt.updateFailed": "Pembaruan List DT gagal ({{reason}}). Menggunakan List DT tersimpan/bawaan.",
    "listdt.updateSuccessAnnounce": "List DT diperbarui.",
    "listdt.updateFailedAnnounce": "Pembaruan List DT gagal.",
    "listdt.pendingSync": "Menunggu sinkronisasi Google Sheet: {{count}} pemetaan DT.",
    "listdt.syncPending": "Sinkronkan DT Tertunda",
    "listdt.syncPendingSuccess": "{{count}} pemetaan DT tertunda berhasil disinkronkan ke Google Sheet.",
    "listdt.syncPendingFailed": "Tersimpan secara lokal, menunggu sinkronisasi Google Sheet. ({{reason}})",
    "listdt.syncedAnnounce": "Pemetaan kontraktor berhasil disinkronkan.",
    "listdt.syncPendingAnnounce": "Sinkronisasi masih tertunda.",
    "listdt.source.cache": "cache",
    "listdt.source.bundled": "bawaan",
    "listdt.na": "—",

    // Import / upload
    "import.dayShift": "Input Shift Siang",
    "import.nightShift": "Input Shift Malam",
    "import.dayHint": "Menerima file sumber HYNC, SLNC, ESG Shift Siang.",
    "import.nightHint": "Menerima file sumber HYNC, SLNC, ESG Shift Malam.",
    "import.dropZoneText": "Masukkan File Excel atau seret file ke sini",
    "import.dropZoneAriaLabel": "Area unggah {{label}}, klik atau seret file Excel ke sini",
    "import.noFilesSelected": "Belum ada file dipilih.",
    "import.removeFile": "Hapus {{filename}}",
    "import.removeFileTitle": "Hapus {{filename}}",
    "import.fileRemovedAnnounce": "{{filename}} telah dihapus.",

    // Wrong shift bucket modal
    "wrongBucket.unableToValidate": "Tidak dapat memvalidasi shift",
    "wrongBucket.wrongBucket": "Bucket shift salah",
    "wrongBucket.file": "File",
    "wrongBucket.ambiguousExplain":
      "Aplikasi tidak dapat menentukan apakah file ini Shift Siang atau Shift Malam dari stempel waktu. File ini telah dihapus.",
    "wrongBucket.dsRows": "Baris DS",
    "wrongBucket.nsRows": "Baris NS",
    "wrongBucket.unknownRows": "Baris dengan stempel waktu tidak diketahui",
    "wrongBucket.selectedBucket": "Bucket yang dipilih",
    "wrongBucket.detectedShift": "Shift terdeteksi",
    "wrongBucket.instruction": "File ini telah dihapus. Silakan unggah ke {{bucket}}.",
    "wrongBucket.ok": "OK",
    "shift.day": "Shift Siang",
    "shift.night": "Shift Malam",

    // Results shell
    "results.heading": "Hasil Pembersihan",
    "results.overview": "Ringkasan",
    "results.tablistLabel": "Tab profil hasil pembersihan",
    "results.startCleaning": "Mulai Pembersihan",
    "results.refreshCleaning": "Perbarui Pembersihan",
    "results.copyAll": "Salin Semua Grup",
    "results.copyProfile": "Salin Profil Ini",
    "results.copied": "Tersalin!",
    "results.copyFailed": "Salin gagal",
    "results.copiedAnnounce": "Data berhasil disalin ke clipboard.",
    "results.copyFailedAnnounce": "Gagal menyalin.",
    "results.noRowsProfile": "Belum ada baris untuk profil ini.",
    "results.noGroupsEmpty":
      "Belum ada grup pembersihan. Impor file untuk melihat ringkasan yang dikelompokkan berdasarkan Profil + Tanggal + Bucket.",
    "results.noGroupsErrors": "Tidak ada grup pembersihan terdeteksi dari file yang diimpor.",
    "results.viewAllRows": "Lihat Semua {{count}} Baris",
    "results.showingRows": "Menampilkan {{shown}} dari {{total}} baris",
    "results.cleanDataPreview": "Pratinjau Data Bersih",
    "results.viewAllSubtitle": "{{profile}} | {{date}} | {{bucket}} — {{count}} baris",
    "results.groupsSuffix": "grup",
    "results.groupSuffix": "grup",

    // Readiness
    "readiness.ready": "Siap Disalin",
    "readiness.readyInfo": "Siap Disalin — Ada Informasi",
    "readiness.actionRequired": "Perlu Tindakan — Penyalinan Dinonaktifkan",
    "readiness.failed": "Pembersihan Gagal",
    "readiness.short.ready": "Siap",
    "readiness.short.readyInfo": "Siap dengan Informasi",
    "readiness.short.actionRequired": "Perlu Tindakan",
    "readiness.short.failed": "Pembersihan Gagal",

    // Validation Report
    "validation.title": "Laporan Validasi",
    "validation.rawRows": "Baris Mentah",
    "validation.cleanRows": "Baris Bersih",
    "validation.esgReportGroups": "Grup Laporan ESG",
    "validation.lostRows": "Baris Hilang",
    "validation.rawTonnage": "Tonase Mentah",
    "validation.cleanTonnage": "Tonase Bersih",
    "validation.tonnageDifference": "Selisih Tonase",
    "validation.duplicateNota": "NO.NOTA Duplikat",
    "validation.missingContractor": "Kontraktor Tidak Ada",
    "validation.missingSource": "Source Tidak Ada",
    "validation.missingGrade": "Grade Tidak Ada",
    "validation.unmatchedDtRows": "Baris DT Tidak Cocok",
    "validation.timestampWindowInfoRows": "Baris informasi jendela waktu",
    "validation.pileIdSourceConflicts": "Konflik PILE ID / Source",
    "validation.placeholder": "Detail validasi dan laporan akan muncul di sini setelah pembersihan dijalankan.",

    // Overview
    "overview.profile": "Profil",
    "overview.date": "Tanggal",
    "overview.bucket": "Bucket",
    "overview.rows": "Baris",
    "overview.netTonnage": "Tonase Bersih",
    "overview.missingContractor": "Kontraktor Tidak Ada",
    "overview.missingSource": "Source Tidak Ada",
    "overview.missingGrade": "Grade Tidak Ada",
    "overview.timestampWindowNotes": "Catatan Jendela Waktu",
    "overview.skippedRows": "Baris Dilewati",
    "overview.unmatchedDtCorrection": "Koreksi DT Tidak Cocok",
    "overview.unknownDt": "DT Tidak Diketahui",
    "overview.contractorInput": "Input Kontraktor",
    "overview.status": "Status",
    "overview.contractorPlaceholder": "Nama kontraktor",
    "overview.noUnmatched": "Tidak ada ID DT yang tidak cocok pada file yang sedang diunggah.",
    "overview.rawSourceValue": "Nilai sumber mentah: {{value}}",
    "overview.unmatchedCount": "Tidak cocok ({{count}} baris)",
    "overview.updateBtn": "Perbarui",
    "overview.enterContractorFirst": "Masukkan setidaknya satu nama kontraktor sebelum mengklik Perbarui.",
    "overview.summaryNewSaved": "{{count}} koreksi baru tersimpan",
    "overview.summaryAlreadyExisted": "{{count}} sudah ada sebelumnya (dilewati)",
    "overview.summaryConflicts": "{{count}} konflik perlu ditinjau",
    "overview.summaryNoChanges": "Tidak ada perubahan.",
    "overview.alreadyExistsSkipped": "Sudah ada / duplikat dilewati (kontraktor: \"{{contractor}}\").",
    "overview.conflictExisting": "Konflik: kontraktor yang ada berbeda (kontraktor saat ini: \"{{contractor}}\").",
    "overview.syncedOk": "Disinkronkan ke Google Sheet.",
    "overview.syncedDuplicate": "Sudah ada di Google Sheet.",
    "overview.syncedConflict": "Konflik: Google Sheet memiliki kontraktor berbeda untuk DT ini.",
    "overview.syncedPendingLocal": "Tersimpan secara lokal, menunggu sinkronisasi Google Sheet.",
    "overview.syncedPendingLocalReason": "Tersimpan secara lokal, menunggu sinkronisasi Google Sheet. ({{reason}})",

    // Profile page
    "profile.mainSummary": "Ringkasan Utama",
    "profile.additionalBreakdown": "Rincian Tambahan (Kontraktor / PILE ID / Source / Grade)",
    "profile.byContractor": "Berdasarkan Kontraktor",
    "profile.byPileId": "Berdasarkan PILE ID",
    "profile.bySource": "Berdasarkan Source",
    "profile.byGrade": "Berdasarkan Grade",
    "profile.operationalSummary": "Ringkasan Operasional",
    "profile.noData": "Tidak ada data.",
    "profile.key": "Kunci",
    "profile.rows": "Baris",
    "profile.netTotal": "Total Bersih",
    "profile.remark": "Catatan",
    "profile.blank": "(kosong)",
    "profile.timestampWindowNotesHeading": "Catatan Jendela Waktu ({{count}}) — Hanya informasi",
    "profile.timestampWindowNote":
      "{{count}} baris berada di luar jendela waktu nominal untuk bucket {{bucket}} yang dipilih. Baris ini tetap diklasifikasikan sebagai {{bucket}}. Tidak diperlukan tindakan.",
    "profile.unmatchedDtHeading": "Baris DT Tidak Cocok ({{count}}) — Perlu tindakan",
    "profile.unmatchedDtNote":
      "Nilai NO. DT ini tidak ditemukan di List DT. Tambahkan ke List DT (atau perbaiki ID DT mentah) lalu jalankan ulang pembersihan. File sumber: {{files}}.",
    "profile.otherBlockingHeading": "Masalah Penghambat Lainnya ({{count}}) — Perlu tindakan",
    "profile.blockingCategoryNoRows":
      "Lihat Laporan Validasi untuk jumlahnya. Detail per baris tidak dilacak untuk kategori ini.",
    "profile.summaryHeading": "Ringkasan {{profile}}",
    "profile.summaryGroupsRows": "{{groups}} grup | {{rows}} baris",
    "profile.summaryStatusLine":
      "Siap: {{ready}} | Siap dengan Informasi: {{readyInfo}} | Perlu Tindakan: {{actionRequired}} | Gagal: {{failed}}",
    "profile.timestampNoteCount": "{{count}} catatan stempel waktu",
    "profile.bucketLabel": "Bucket: {{bucket}}",
    "profile.rowsCount": "{{count}} baris",
    "blocking.missingSource": "Source Tidak Ada",
    "blocking.missingGrade": "Grade Tidak Ada",
    "blocking.duplicateNota": "NO.NOTA Duplikat",
    "blocking.pileIdSourceConflict": "Konflik PILE ID / Source",
    "blocking.lostRows": "Baris Hilang",
    "blockingSummary.unmatchedDt": "{{count}} DT tidak cocok",
    "blockingSummary.missingSource": "{{count}} Source tidak ada",
    "blockingSummary.missingGrade": "{{count}} Grade tidak ada",
    "blockingSummary.duplicateNota": "{{count}} NO.NOTA duplikat",
    "blockingSummary.lostRows": "{{count}} baris hilang",
    "blockingSummary.pileIdSourceConflict": "{{count}} konflik PILE ID/Source",
    "blockingSummary.more": "+ {{count}} lainnya",
  },
};

let currentLanguage = DEFAULT_LANGUAGE;
const listeners = new Set();

function readStoredLanguage() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return VALID_LANGUAGES.includes(value) ? value : null;
  } catch {
    return null;
  }
}

function storeLanguage(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Persistence is best-effort only.
  }
}

function applyDocumentLang(lang) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
  }
}

// Must be called once at startup, before any UI module renders text via
// t() — reads the persisted choice (falling back to English on an invalid
// or missing value, never throwing) and applies <html lang> immediately.
export function initializeLanguage() {
  currentLanguage = readStoredLanguage() || DEFAULT_LANGUAGE;
  applyDocumentLang(currentLanguage);
  return currentLanguage;
}

export function getLanguage() {
  return currentLanguage;
}

// Updates the persisted choice, <html lang>, and notifies every subscriber
// so already-mounted UI can re-render its own text in place — callers must
// never reload the page or re-run cleaning as a side effect of this call.
export function setLanguage(lang) {
  const next = VALID_LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE;
  if (next === currentLanguage) return;
  currentLanguage = next;
  storeLanguage(next);
  applyDocumentLang(next);
  listeners.forEach((fn) => fn(next));
}

export function subscribeLanguage(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  );
}

// Falls back to the English string (then the bare key) if a translation is
// missing for the current language, so a gap in the "id" dictionary never
// throws or renders blank.
export function t(key, params) {
  const dict = translations[currentLanguage] || translations[DEFAULT_LANGUAGE];
  const template = dict[key] ?? translations[DEFAULT_LANGUAGE][key] ?? key;
  return interpolate(template, params);
}
