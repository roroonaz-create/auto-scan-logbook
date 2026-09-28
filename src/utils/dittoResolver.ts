/**
 * Ditto Mark Resolver
 * 
 * Rules:
 * 1. If a cell contains a ditto mark (", "", '', ”, “, 〃, - " -, etc.), copy the value from the previous row on the same column.
 * 2. Column-aware: Value is strictly taken from the same column of the previous row.
 * 3. Chained: If multiple consecutive rows have ditto marks, continually use the last known valid non-ditto value.
 * 4. Structured fields only: Does not touch free-text where quotes are part of a word or sentence.
 */

export interface DittoTrace {
  rowIndex: number;
  field: string;
  rawVal: string;
  resolvedVal: string;
}

export function isDittoMark(val: string): boolean {
  if (!val) return false;
  const s = val.trim();
  if (!s) return false;

  // Single or multiple quotes, unicode quotes, ditto marks (〃, „, etc.)
  // with optional leading/trailing dashes, hyphens, or spaces (e.g. '- " -', '— " —', '-"-')
  if (/^[-—~_\s]*["'”’“„〃`]{1,3}[-—~_\s]*$/.test(s)) {
    return true;
  }

  // Standalone commas used as handwriting ditto mark (e.g. ',,', ',-,', '-,,-')
  if (/^[-—~_\s]*,{1,2}[-—~_\s]*$/.test(s)) {
    return true;
  }

  // Explicit ditto shorthand (e.g. "do", "idem", ".do.")
  if (/^(?:do|idem|\.do\.)$/i.test(s)) {
    return true;
  }

  return false;
}

export function resolveDittoMarks<T extends Record<string, any>>(
  rows: T[],
  structuredFields: (keyof T)[] = [
    "tanggal" as keyof T,
    "costumer" as keyof T,
    "model" as keyof T,
    "part_number" as keyof T,
    "pic" as keyof T,
    "operator" as keyof T,
    "remark" as keyof T,
  ],
  onDittoResolved?: (trace: DittoTrace) => void
): T[] {
  if (!rows || rows.length === 0) return rows;

  const lastValidValue: Partial<Record<keyof T, string>> = {};

  return rows.map((row, rowIndex) => {
    const updated = { ...row };

    for (const field of structuredFields) {
      const val = typeof updated[field] === "string" ? (updated[field] as string) : "";
      if (isDittoMark(val)) {
        if (lastValidValue[field] !== undefined && lastValidValue[field] !== "") {
          const filled = lastValidValue[field] as any;
          updated[field] = filled;
          if (onDittoResolved) {
            onDittoResolved({
              rowIndex: rowIndex + 1,
              field: String(field),
              rawVal: val,
              resolvedVal: filled,
            });
          }
        }
      } else if (val.trim() && val !== "[TIDAK_TERBACA]") {
        lastValidValue[field] = val;
      }
    }

    return updated;
  });
}

