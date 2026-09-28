/**
 * Data Pembanding Deterministic Normalizer
 * 
 * Rules:
 * 1. NOMOR NORMAL:
 *    - Ambil RAW OCR dari cell Data Pembanding.
 *    - Bersihkan karakter noise (e.g. +, spasi, tanda baca visual) yang bukan bagian identifier.
 *    - Ambil digit numerik.
 *    - Jika terdapat 7 digit seperti 0XXXXXX (leading 0 tambahan), gunakan 6 digit terakhir.
 *    - Hasil normal tepat 6 digit string (JANGAN gunakan parseInt, leading zero valid seperti 016987 tetap dipertahankan).
 *    Contoh:
 *      0816480 -> 816480
 *      0917341 -> 917341
 *      0815598 -> 815598
 *      0815167 -> 815167
 *      0917185 -> 917185
 *      0016987 -> 016987
 *      0917464 -> 917464
 *      +0815424 -> 815424
 * 
 * 2. MULTIPLE IDENTIFIERS (AMBIGU / DUAL LOTS):
 *    - Contoh: 0816080 / 0815558 -> 816080 / 815558
 *    - Dinormalisasi secara individual, pertahankan separator '/'.
 * 
 * 3. SPECIAL PREFIXES:
 *    - R, S, PROOF dipertahankan sesuai struktur data:
 *      R0917337 -> R917337
 *      S0617105 -> S617105
 *      PROOF 0917337 -> PROOF 917337
 */

/**
 * Normalizes a single Data Pembanding token/identifier
 */
export function normalizeSingleDataPembanding(token: string): string {
  if (!token) return "";
  let t = token.trim().toUpperCase();
  if (!t || t === "[TIDAK_TERBACA]") return t;

  // 1. SPECIAL PREFIX: PROOF
  const proofMatch = t.match(/^(PROOF)([\s\-_:]*)(\d*.*)$/i);
  if (proofMatch) {
    const prefix = "PROOF";
    const sep = proofMatch[2] || (proofMatch[3] ? " " : "");
    const rest = proofMatch[3].trim();
    const digitsOnly = rest.replace(/\D/g, "");
    let normalizedDigits = digitsOnly;
    if (digitsOnly.length >= 7 && digitsOnly.startsWith("0")) {
      normalizedDigits = digitsOnly.slice(-6);
    } else if (digitsOnly.length === 6) {
      normalizedDigits = digitsOnly;
    }
    return `${prefix}${sep}${normalizedDigits || rest}`.trim();
  }

  // 2. SPECIAL PREFIX: R
  const rMatch = t.match(/^(R)([\s\-_:]*)(\d+)$/i);
  if (rMatch) {
    const prefix = "R";
    const sep = rMatch[2] || "";
    let digits = rMatch[3];
    if (digits.length >= 7 && digits.startsWith("0")) {
      digits = digits.slice(-6);
    }
    return `${prefix}${sep}${digits}`.trim();
  }

  // 3. SPECIAL PREFIX: S
  const sMatch = t.match(/^(S)([\s\-_:]*)(\d+)$/i);
  if (sMatch) {
    const prefix = "S";
    const sep = sMatch[2] || "";
    let digits = sMatch[3];
    if (digits.length >= 7 && digits.startsWith("0")) {
      digits = digits.slice(-6);
    }
    return `${prefix}${sep}${digits}`.trim();
  }

  // 4. NORMAL NUMERIC IDENTIFIER (Deterministic 6-digit normalization)
  // Bersihkan karakter noise visual (seperti +, spasi, punctuation, dsb)
  const digits = t.replace(/\D/g, "");
  if (digits.length > 0) {
    // Jika terdapat 7 digit atau lebih dengan leading '0', ambil 6 digit terakhir
    if (digits.length >= 7 && digits.startsWith("0")) {
      return digits.slice(-6);
    }
    // Jika tepat 6 digit, pertahankan string asli (termasuk leading zero seperti 016987)
    if (digits.length === 6) {
      return digits;
    }
    // Jika kurang dari 6 digit, kembalikan string digit murni tanpa noise
    if (digits.length > 0 && digits.length < 6) {
      return digits;
    }
  }

  // Fallback jika bukan numerik
  return t;
}

/**
 * Normalizes full Data Pembanding field value
 * Handles multiple numbers separated by '/', ',', newline, or multiple distinct lot tokens
 */
export function normalizeDataPembanding(rawVal: string): string {
  if (!rawVal) return "";
  const val = String(rawVal).trim().toUpperCase();
  if (!val || val === "[TIDAK_TERBACA]") return val;

  let parts: string[] = [];
  if (val.includes("/") || val.includes(",") || val.includes("\n") || val.includes(";")) {
    parts = val.split(/[\/,\n;]+/).map((s) => s.trim()).filter(Boolean);
  } else if (/^PROOF(\s+[\w\-_]+)?$/i.test(val) || /^R\s*\d+$/i.test(val) || /^S\s*\d+$/i.test(val)) {
    // Single entity with special prefix (e.g. "PROOF 0917337", "R 0917337", "S 0617105")
    parts = [val];
  } else {
    const tokens = val.split(/\s+/).filter(Boolean);
    // If multiple tokens that are distinct numbers or lot codes (each having at least 4 chars)
    if (tokens.length >= 2 && tokens.every((t) => /^[A-Z0-9\-_+]{4,}$/i.test(t))) {
      parts = tokens;
    } else {
      parts = [val];
    }
  }

  const cleanedParts = parts.map(normalizeSingleDataPembanding).filter(Boolean);

  if (cleanedParts.length >= 2) {
    return cleanedParts.join(" / ");
  }
  return cleanedParts[0] || val;
}
