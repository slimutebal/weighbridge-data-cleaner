import { normalizeDtId } from "./normalizers.js";

const LOCAL_STORAGE_KEY = "weighbridge.listDt.cache.v1";
const PENDING_SYNC_KEY = "weighbridge.listDt.pendingSync.v1";
const DEFAULT_LIST_DT_PATH = "./data/default-list-dt.json";

let cached = null;

// The List DT endpoint is a Google Sheet export; its column headers (and thus
// the JSON field names) are outside this app's control and have already been
// observed to vary (e.g. "dtId" instead of "dt_id"). Resolve by alias so a
// header rename on the sheet doesn't silently empty the contractor map.
const DT_ID_FIELD_ALIASES = ["dt_id", "dtId", "DT ID", "No DT", "no_dt", "NoDT"];
const CONTRACTOR_FIELD_ALIASES = ["contractor", "Contractor"];

function normalizeFieldKey(key) {
  return key.toLowerCase().replace(/[\s_]/g, "");
}

function getAliasedField(record, aliases) {
  const targets = new Set(aliases.map(normalizeFieldKey));
  for (const key of Object.keys(record)) {
    if (targets.has(normalizeFieldKey(key))) {
      return record[key];
    }
  }
  return undefined;
}

function buildContractorMap(records) {
  const map = new Map();
  const duplicates = [];

  records.forEach((record) => {
    if (!record || typeof record !== "object") return;

    const dtIdRaw = getAliasedField(record, DT_ID_FIELD_ALIASES);
    const contractor = getAliasedField(record, CONTRACTOR_FIELD_ALIASES);
    if (!dtIdRaw || !contractor) return;

    const key = normalizeDtId(dtIdRaw);
    if (!key) return;

    if (map.has(key) && map.get(key) !== contractor) {
      duplicates.push({
        normalizedDtId: key,
        contractors: [map.get(key), contractor],
      });
    }
    map.set(key, contractor);
  });

  return { map, duplicates };
}

function readLocalStorageCache() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.records)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLocalStorageCache(records) {
  try {
    const payload = { records, updatedAt: new Date().toISOString() };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Caching is best-effort only; ignore quota/availability errors.
  }
}

async function loadBundledDefault() {
  try {
    const response = await fetch(DEFAULT_LIST_DT_PATH);
    const data = await response.json();
    return Array.isArray(data) ? data : data.data || [];
  } catch {
    return [];
  }
}

export async function loadListDt() {
  if (cached) return cached;

  const cachedPayload = readLocalStorageCache();
  const usingCache = Boolean(cachedPayload && cachedPayload.records.length);
  const records = usingCache ? cachedPayload.records : await loadBundledDefault();

  const { map, duplicates } = buildContractorMap(records);
  cached = {
    map,
    duplicates,
    source: usingCache ? "cache" : "bundled",
    recordCount: records.length,
    updatedAt: usingCache ? cachedPayload.updatedAt : null,
  };
  return cached;
}

export function joinContractor(rawDtId, listDt) {
  const normalizedDtId = normalizeDtId(rawDtId);
  if (!normalizedDtId || !listDt.map.has(normalizedDtId)) {
    return { contractor: "Unmatched", normalizedDtId };
  }
  return { contractor: listDt.map.get(normalizedDtId), normalizedDtId };
}

// --- Manual, user-triggered DT correction (pilot hardening) -----------------
//
// Corrections entered via the Unmatched DT Correction UI are applied to the
// local List DT cache immediately (so re-cleaning resolves them without a
// network round trip), and are separately tracked in a "pending sync" queue
// until a user-triggered Google Sheet sync confirms they were written
// upstream. Nothing here auto-syncs on a timer or in a loop.

function readPendingSync() {
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingSync(entries) {
  try {
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(entries));
  } catch {
    // Best-effort only.
  }
}

export function getPendingSyncEntries() {
  return readPendingSync();
}

function mergeEntriesByDtId(existing, incoming) {
  const map = new Map(existing.map((entry) => [entry.dt_id, entry]));
  incoming.forEach((entry) => map.set(entry.dt_id, entry));
  return Array.from(map.values());
}

export function addPendingSyncEntries(entries) {
  const merged = mergeEntriesByDtId(readPendingSync(), entries);
  writePendingSync(merged);
  return merged;
}

export function removePendingSyncEntries(dtIds) {
  const idSet = new Set(dtIds);
  const remaining = readPendingSync().filter((entry) => !idSet.has(entry.dt_id));
  writePendingSync(remaining);
  return remaining;
}

function serializeCurrentRecords(listDt) {
  return Array.from(listDt.map.entries()).map(([dt_id, contractor]) => ({ dt_id, contractor }));
}

// Local duplicate/conflict guard (v0.2.0-prepilot rev2). Classifies each
// { dtId, contractor } correction against the current List DT map (bundled
// or cache) *and* the pending-sync queue before anything is written:
//   - "new"       — normalized dt_id isn't known locally yet, safe to add.
//   - "duplicate" — already known locally with the exact same contractor;
//                   re-adding it would be a harmless but pointless write
//                   (e.g. an accidental double submit), so it's skipped.
//   - "conflict"  — already known locally with a *different* contractor;
//                   never silently overwritten, surfaced for user review.
//   - "invalid"   — blank dt_id or contractor after normalization/trim.
export async function classifyDtCorrections(entries) {
  const listDt = await loadListDt();
  const pendingMap = new Map(readPendingSync().map((entry) => [entry.dt_id, entry.contractor]));

  return entries.map(({ dtId, contractor }) => {
    const dt_id = normalizeDtId(dtId);
    const trimmedContractor = (contractor || "").trim();

    if (!dt_id || !trimmedContractor) {
      return { dt_id, contractor: trimmedContractor, status: "invalid" };
    }

    const existingContractor = listDt.map.has(dt_id) ? listDt.map.get(dt_id) : pendingMap.get(dt_id);

    if (existingContractor === undefined) {
      return { dt_id, contractor: trimmedContractor, status: "new" };
    }
    if (existingContractor === trimmedContractor) {
      return { dt_id, contractor: trimmedContractor, status: "duplicate", existingContractor };
    }
    return { dt_id, contractor: trimmedContractor, status: "conflict", existingContractor };
  });
}

// Applies { dtId, contractor } corrections to the local List DT cache
// immediately, using the same normalizeDtId() matching rule used for the
// contractor join, and invalidates the in-memory cache so the next
// loadListDt() (and thus the next re-clean) reflects the correction.
//
// Callers should only pass entries already classified "new" by
// classifyDtCorrections() above — this function itself does not re-check
// for duplicates/conflicts, it just writes what it's given.
export async function upsertLocalDtMappings(entries) {
  const listDt = await loadListDt();
  const baseRecords = serializeCurrentRecords(listDt);
  const overlay = new Map(baseRecords.map((record) => [record.dt_id, record]));

  const normalizedEntries = [];
  entries.forEach(({ dtId, contractor }) => {
    const key = normalizeDtId(dtId);
    const trimmedContractor = (contractor || "").trim();
    if (!key || !trimmedContractor) return;
    const record = { dt_id: key, contractor: trimmedContractor };
    overlay.set(key, record);
    normalizedEntries.push(record);
  });

  writeLocalStorageCache(Array.from(overlay.values()));
  cached = null;
  await loadListDt();
  return normalizedEntries;
}

function isSyncSuccessResponse(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (payload.ok === true) return true;
  if (payload.success === true) return true;
  if (typeof payload.status === "string") {
    const status = payload.status.toLowerCase();
    if (status === "ok" || status === "success") return true;
  }
  return false;
}

const RESPONSE_BUCKET_KEYS = ["appended", "updated_blank", "duplicate_skipped", "conflicts", "errors"];

// The Apps Script's per-bucket lists may come back as plain dt_id strings
// or as { dt_id, contractor } objects; normalize either shape to a Set of
// normalized dt_ids so entries can be matched back up regardless.
function toDtIdSet(list) {
  const set = new Set();
  if (!Array.isArray(list)) return set;
  list.forEach((item) => {
    if (typeof item === "string") set.add(normalizeDtId(item));
    else if (item && typeof item === "object" && item.dt_id) set.add(normalizeDtId(item.dt_id));
  });
  return set;
}

// Interprets the Apps Script's duplicate-safe appendListDt response, which
// buckets each submitted dt_id into appended / updated_blank /
// duplicate_skipped / conflicts / errors. Returns one outcome per entry so
// the caller can update the pending-sync queue and status display
// per-DT-ID rather than treating the whole batch as pass/fail.
function interpretBucketedResponse(result, entries) {
  const appended = toDtIdSet(result.appended);
  const updatedBlank = toDtIdSet(result.updated_blank);
  const duplicateSkipped = toDtIdSet(result.duplicate_skipped);
  const conflicts = toDtIdSet(result.conflicts);
  const errors = toDtIdSet(result.errors);

  const perEntry = entries.map(({ dt_id }) => {
    if (appended.has(dt_id) || updatedBlank.has(dt_id)) return { dt_id, outcome: "synced" };
    if (duplicateSkipped.has(dt_id)) return { dt_id, outcome: "duplicate" };
    if (conflicts.has(dt_id)) return { dt_id, outcome: "conflict" };
    if (errors.has(dt_id)) return { dt_id, outcome: "error" };
    // The endpoint didn't mention this dt_id in any bucket — do not assume
    // success for it.
    return { dt_id, outcome: "unknown" };
  });

  const anyUnconfirmed = perEntry.some((e) => e.outcome !== "synced" && e.outcome !== "duplicate");
  return {
    ok: !anyUnconfirmed,
    perEntry,
    reason: anyUnconfirmed
      ? "Some DT mappings were not confirmed synced by the endpoint (see per-row status)."
      : undefined,
  };
}

// Attempts to append DT mappings to the existing List DT endpoint. This only
// ever runs when the user explicitly clicks "Update" or "Sync Pending DT"
// (never automatically). It never reports success unless the endpoint
// responds with an unambiguous confirmation — an unreadable, non-OK, or
// non-JSON response is treated as "not supported", not as a silent success.
// If the endpoint returns the richer appendListDt bucket shape (appended /
// updated_blank / duplicate_skipped / conflicts / errors), each entry's
// outcome is reported individually via `perEntry` instead of a single
// pass/fail for the whole batch.
export async function syncDtMappingsToGoogleSheet(endpointUrl, entries) {
  if (!endpointUrl) return { ok: false, reason: "No List DT endpoint configured." };
  if (!entries.length) return { ok: true, synced: [] };

  const payload = {
    action: "appendListDt",
    data: entries.map(({ dt_id, contractor }) => ({ dt_id, contractor })),
  };

  try {
    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return { ok: false, reason: `Endpoint responded with HTTP ${response.status}.` };
    }

    let result;
    try {
      result = await response.json();
    } catch {
      return {
        ok: false,
        reason: "Endpoint response was not valid JSON (endpoint likely does not support writes).",
      };
    }

    const hasBucketedShape =
      result && typeof result === "object" && RESPONSE_BUCKET_KEYS.some((key) => key in result);

    if (hasBucketedShape) {
      return interpretBucketedResponse(result, entries);
    }

    if (!isSyncSuccessResponse(result)) {
      return { ok: false, reason: "Endpoint did not confirm success (no write support detected)." };
    }

    // Backward-compatible plain ok/success/status shape, no per-entry detail.
    return { ok: true, synced: entries };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export async function refreshFromEndpointInBackground(endpointUrl) {
  if (!endpointUrl) return { ok: false, reason: "No List DT endpoint configured." };

  try {
    const response = await fetch(endpointUrl);
    if (!response.ok) {
      return { ok: false, reason: `Endpoint responded with HTTP ${response.status}.` };
    }

    const payload = await response.json();
    const records = Array.isArray(payload) ? payload : payload.data || [];
    if (!records.length) {
      return { ok: false, reason: "Endpoint returned no records." };
    }

    writeLocalStorageCache(records);
    cached = null;
    return { ok: true, recordCount: records.length };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}
