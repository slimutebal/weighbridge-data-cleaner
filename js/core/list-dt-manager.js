import { normalizeDtId } from "./normalizers.js";

const LOCAL_STORAGE_KEY = "weighbridge.listDt.cache.v1";
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
