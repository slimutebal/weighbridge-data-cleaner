// Shared table-presentation metadata (Phase C2). Only presentation
// decisions live here (which columns of the existing OUTPUT_COLUMN_ORDER
// schema are numeric, for right-alignment) — never column order, values,
// or the schema itself (see js/core/tsv-exporter.js, untouched).
//
// Used by both the Clean Data Preview table (js/ui/profile-page.js) and the
// View All Rows modal table (js/ui/view-all-modal.js), which render the
// exact same OUTPUT_COLUMN_ORDER columns and must agree on which of them
// are numeric.
export const NUMERIC_OUTPUT_COLUMNS = new Set(["Net", "Grade"]);

export const TABLE_HEADER_NUMERIC_CLASS = "table-header-numeric";
export const TABLE_CELL_NUMERIC_CLASS = "table-cell-numeric";
