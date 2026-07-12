// Stable identity for a cleaning group, derived purely from the fields
// that already define Cleaning Group uniqueness (Profile + Date + Declared
// Bucket Shift, D009) — the same formula cleaning-orchestrator.js uses
// internally for its group Map key. Computed here (UI layer only) so no
// group-identity field needs to be added to the group object returned by
// runCleaning().
export function getGroupKey(group) {
  return `${group.profile}|${group.date}|${group.bucket}`;
}
