/**
 * Remark Normalization Utilities
 * 
 * Rules:
 * 1. Pattern Matching for Roll Codes:
 *    - Pattern: R<number> -> ROLL <number> (e.g. R5 -> ROLL 5, R.5 -> ROLL 5)
 *    - Number after R must be preserved intact.
 *    - Pattern-based, NEVER global replace of letter R (e.g. REPAIR remains REPAIR).
 * 
 * 2. Multiple Rolls:
 *    - Separated cleanly with ", " (comma and space).
 *    - Handles:
 *      R. 4.5       -> ROLL 4, ROLL 5
 *      R. 72 R. 73  -> ROLL 72, ROLL 73
 *      R. 74 R. 75  -> ROLL 74, ROLL 75
 *      R-54, R-55   -> ROLL 54, ROLL 55
 *      R.72 R.73    -> ROLL 72, ROLL 73
 *      R.74 R.75    -> ROLL 74, ROLL 75
 *      R45, R46     -> ROLL 45, ROLL 46
 *      R12/R13      -> ROLL 12, ROLL 13
 * 
 * 3. Deduplication of Identical Rolls:
 *    - R45 R45 -> ROLL 45
 *    - R45 R46 -> ROLL 45, ROLL 46
 * 
 * 4. Preserves Existing Non-Roll Remarks:
 *    - Non-roll text (e.g. REPAIR, ACC, SAMPLE, WAITING) is preserved.
 */

export function normalizeRemark(raw: string): string {
  if (!raw) return "";
  let str = String(raw).trim();
  if (!str || str === "[TIDAK_TERBACA]") return str;

  // If text is solely placeholder dash or empty indicators, return empty
  if (str === "-" || str === "--" || str === "NONE" || str === "KOSONG") {
    return "";
  }

  // If text is literally just "R" or "R." or "ROLL", return "ROLL"
  if (/^R\.?$/i.test(str) || /^ROLL$/i.test(str)) {
    return "ROLL";
  }

  // Check if string contains any roll pattern:
  // Starts with or contains (ROLL or R) followed by optional punctuation/spaces and digits
  const hasRoll = /(?:^|[\s,;/\-._(\[])(?:ROLL|R)[.\s\-_]*\d+/i.test(str);
  if (!hasRoll) {
    return str;
  }

  // Normalize initial roll tokens: e.g. "R. 72", "R.5", "R-54", "ROLL 45" -> @@ROLL_72@@
  let normalized = str.replace(
    /(?:^|(?<=[\s,;/\-._(\[]))(?:ROLL|R)[.\s\-_]*(\d+)/gi,
    " @@ROLL_$1@@ "
  );

  // Capture chained shorthand roll numbers:
  // e.g. "@@ROLL_4@@ . 5" or "@@ROLL_4@@ .5" -> "@@ROLL_4@@ @@ROLL_5@@"
  // Repeat while there are chained digits after a roll marker
  while (/@@ROLL_(\d+)@@\s*[.,\-&/]\s*(\d+)(?=[^0-9A-Za-z]|$)/.test(normalized)) {
    normalized = normalized.replace(
      /@@ROLL_(\d+)@@\s*[.,\-&/]\s*(\d+)(?=[^0-9A-Za-z]|$)/g,
      "@@ROLL_$1@@ @@ROLL_$2@@"
    );
  }

  // Extract all matched roll numbers
  const rollMatches = normalized.match(/@@ROLL_(\d+)@@/g);
  if (!rollMatches || rollMatches.length === 0) {
    return str;
  }

  const uniqueRolls: string[] = [];
  rollMatches.forEach((m) => {
    const num = m.replace(/[^0-9]/g, "");
    if (num && !uniqueRolls.includes(num)) {
      uniqueRolls.push(num);
    }
  });

  const formattedRolls = uniqueRolls.map((num) => `ROLL ${num}`).join(", ");

  // Check if string contains other substantive text besides the roll tokens and separators
  const remaining = normalized
    .replace(/@@ROLL_\d+@@/g, "")
    .replace(/[,\-./;()\[\]\s]/g, "")
    .trim();

  // If the input was exclusively roll information, return formatted rolls
  if (!remaining) {
    return formattedRolls;
  }

  // If there was other accompanying text (e.g. "ACC R45" or "SAMPLE R12-R13"), preserve it:
  const cleanedOther = normalized
    .replace(/@@ROLL_\d+@@/g, "")
    .replace(/^[,\-./;()\[\]\s]+|[,\-./;()\[\]\s]+$/g, "")
    .trim();

  if (cleanedOther) {
    return `${cleanedOther}, ${formattedRolls}`;
  }

  return formattedRolls;
}

