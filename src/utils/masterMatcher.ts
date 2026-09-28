/**
 * Unified Master Matcher for Customer, Model, and Part Number
 * 
 * Rules:
 * 1. Customer + Model + Part Number are treated as ONE unified master record.
 * 2. Part Number is the strongest evidence (Exact match = high confidence anchor).
 * 3. Normalized comparisons:
 *    - Uppercase, trim whitespace, ignore hyphens/spaces for comparison.
 *    - Common OCR confusions (O ↔ 0, I ↔ 1, L ↔ 1, S ↔ 5, B ↔ 8, Z ↔ 2) used ONLY for similarity calculation.
 * 4. Model matching: Token similarity + Levenshtein distance (e.g. PACKAGE LABEL LC521TN vs LC521TM).
 * 5. Customer matching: Supporting evidence, prevents over-reliance on customer alone.
 * 6. Composite Score: Part Number (50%) + Model (35%) + Customer (15%).
 * 7. Exact Match Override: If Part Number exactly matches a single master record -> win immediately.
 * 8. Ambiguity & Low Confidence: If score < threshold or multiple ambiguous candidates, preserve RAW OCR.
 * 9. Non-destructive: Raw values, matched master record, matchScore, and matchReason are preserved.
 */

import { MasterRecord, MasterMatchResult, DEFAULT_MASTER_RECORDS } from "./masterCatalog";

/**
 * Levenshtein distance
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Character-level Levenshtein similarity [0..1]
 */
function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (!a || !b) return 0.0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(a, b);
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * Normalizes Part Number strictly for comparison:
 * - uppercase
 * - remove spaces and hyphens
 */
export function normalizePartNumberForComparison(pn: string): string {
  return (pn || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Normalize OCR confusion characters solely for similarity scoring:
 * O ↔ 0, I ↔ 1, L ↔ 1, S ↔ 5, B ↔ 8, Z ↔ 2
 */
function normalizeConfusionChars(s: string): string {
  return s
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/S/g, "5")
    .replace(/B/g, "8")
    .replace(/Z/g, "2");
}

/**
 * Calculates Part Number similarity [0..1] considering OCR confusions
 */
function scorePartNumber(rawPn: string, masterPn: string): number {
  const normRaw = normalizePartNumberForComparison(rawPn);
  const normMaster = normalizePartNumberForComparison(masterPn);

  if (!normRaw || !normMaster) return 0.0;
  if (normRaw === normMaster) return 1.0;

  // Direct edit distance
  const baseSim = stringSimilarity(normRaw, normMaster);

  // Confusion-mapped edit distance
  const confRaw = normalizeConfusionChars(normRaw);
  const confMaster = normalizeConfusionChars(normMaster);
  const confSim = stringSimilarity(confRaw, confMaster);

  // If confusion-mapped is exact match, give high score but slightly below 1.0 (e.g. 0.96)
  if (confRaw === confMaster) {
    return 0.96;
  }

  return Math.max(baseSim, confSim * 0.92);
}

/**
 * Calculates Model similarity [0..1]
 * Uses token overlap + full string similarity
 */
function scoreModel(rawModel: string, masterModel: string): number {
  const cleanRaw = (rawModel || "").toUpperCase().trim().replace(/\s+/g, " ");
  const cleanMaster = (masterModel || "").toUpperCase().trim().replace(/\s+/g, " ");

  if (!cleanRaw || !cleanMaster) return 0.0;
  if (cleanRaw === cleanMaster) return 1.0;

  // String similarity
  const strSim = stringSimilarity(cleanRaw, cleanMaster);

  // Token similarity (handles word order or token level matches)
  const rawTokens = cleanRaw.split(" ").filter(Boolean);
  const masterTokens = cleanMaster.split(" ").filter(Boolean);

  let tokenMatchCount = 0;
  rawTokens.forEach((rt) => {
    if (masterTokens.some((mt) => stringSimilarity(rt, mt) >= 0.8)) {
      tokenMatchCount++;
    }
  });

  const tokenSim = (2 * tokenMatchCount) / (rawTokens.length + masterTokens.length);

  return Math.max(strSim, tokenSim * 0.9);
}

/**
 * Calculates Customer similarity [0..1]
 */
function scoreCustomer(rawCust: string, masterCust: string): number {
  const cleanRaw = (rawCust || "").toUpperCase().trim().replace(/\s+/g, " ");
  const cleanMaster = (masterCust || "").toUpperCase().trim().replace(/\s+/g, " ");

  if (!cleanRaw || !cleanMaster) return 0.0;
  if (cleanRaw === cleanMaster) return 1.0;

  // Ignore prefixes like "PT " if any
  const stripPrefix = (s: string) => s.replace(/^PT\s+/i, "");
  const strippedRaw = stripPrefix(cleanRaw);
  const strippedMaster = stripPrefix(cleanMaster);

  if (strippedRaw === strippedMaster) return 0.98;

  return stringSimilarity(cleanRaw, cleanMaster);
}

/**
 * Core Master Record Matcher
 * Matches raw customer, model, and part_number against master catalog.
 */
export function matchMasterRecord(
  rawCustomer: string,
  rawModel: string,
  rawPartNumber: string,
  catalog: MasterRecord[] = DEFAULT_MASTER_RECORDS
): MasterMatchResult {
  const cRaw = (rawCustomer || "").trim();
  const mRaw = (rawModel || "").trim();
  const pRaw = (rawPartNumber || "").trim();

  // If all three fields are empty or unreadable, return raw
  if (!cRaw && !mRaw && !pRaw) {
    return {
      matched: false,
      finalCustomer: cRaw,
      finalModel: mRaw,
      finalPartNumber: pRaw,
      rawCustomer: cRaw,
      rawModel: mRaw,
      rawPartNumber: pRaw,
      customerScore: 0,
      modelScore: 0,
      partNumberScore: 0,
      compositeScore: 0,
      matchReason: "Fields empty",
      decision: "NO_RELIABLE_MATCH",
    };
  }

  // 1. EXACT PART NUMBER CHECK
  // If Part Number matches exactly to a unique master record, it is the anchor!
  const normRawPn = normalizePartNumberForComparison(pRaw);
  if (normRawPn.length >= 4) {
    const exactPnMatches = catalog.filter(
      (rec) => normalizePartNumberForComparison(rec.partNumber) === normRawPn
    );

    if (exactPnMatches.length === 1) {
      const winner = exactPnMatches[0];
      return {
        matched: true,
        record: winner,
        finalCustomer: winner.customer,
        finalModel: winner.model,
        finalPartNumber: winner.partNumber,
        rawCustomer: cRaw,
        rawModel: mRaw,
        rawPartNumber: pRaw,
        customerScore: scoreCustomer(cRaw, winner.customer),
        modelScore: scoreModel(mRaw, winner.model),
        partNumberScore: 1.0,
        compositeScore: 1.0,
        matchReason: `Exact Part Number match (${winner.partNumber})`,
        decision: "EXACT_PART_NUMBER",
      };
    }
  }

  // 2. COMPOSITE SCORING ACROSS CATALOG
  // Weight: Part Number = 50%, Model = 35%, Customer = 15%
  interface CandidateEval {
    record: MasterRecord;
    pScore: number;
    mScore: number;
    cScore: number;
    composite: number;
  }

  const evaluations: CandidateEval[] = catalog.map((rec) => {
    const pScore = pRaw ? scorePartNumber(pRaw, rec.partNumber) : 0;
    const mScore = mRaw ? scoreModel(mRaw, rec.model) : 0;
    const cScore = cRaw ? scoreCustomer(cRaw, rec.customer) : 0;

    let composite = 0;
    if (pRaw && mRaw && cRaw) {
      composite = pScore * 0.50 + mScore * 0.35 + cScore * 0.15;
    } else if (pRaw && mRaw) {
      composite = pScore * 0.58 + mScore * 0.42;
    } else if (mRaw && cRaw) {
      composite = mScore * 0.65 + cScore * 0.35;
    } else if (pRaw && cRaw) {
      composite = pScore * 0.75 + cScore * 0.25;
    } else if (pRaw) {
      composite = pScore;
    } else if (mRaw) {
      composite = mScore;
    } else {
      composite = cScore;
    }

    return { record: rec, pScore, mScore, cScore, composite };
  });

  // Sort descending by composite score
  evaluations.sort((a, b) => b.composite - a.composite);

  const best = evaluations[0];
  const second = evaluations[1];

  if (!best) {
    return {
      matched: false,
      finalCustomer: cRaw,
      finalModel: mRaw,
      finalPartNumber: pRaw,
      rawCustomer: cRaw,
      rawModel: mRaw,
      rawPartNumber: pRaw,
      customerScore: 0,
      modelScore: 0,
      partNumberScore: 0,
      compositeScore: 0,
      matchReason: "Empty master catalog",
      decision: "NO_RELIABLE_MATCH",
    };
  }

  // Check ambiguity: if top 2 candidates have very close scores (> 0.85 and diff < 0.05)
  if (second && best.composite >= 0.80 && (best.composite - second.composite) < 0.04) {
    return {
      matched: false,
      finalCustomer: cRaw,
      finalModel: mRaw,
      finalPartNumber: pRaw,
      rawCustomer: cRaw,
      rawModel: mRaw,
      rawPartNumber: pRaw,
      customerScore: best.cScore,
      modelScore: best.mScore,
      partNumberScore: best.pScore,
      compositeScore: best.composite,
      matchReason: `Ambiguous match between ${best.record.partNumber} and ${second.record.partNumber}`,
      decision: "AMBIGUOUS",
    };
  }

  // Acceptance Thresholds:
  // Must have strong evidence from Part Number + Model
  const hasStrongPn = best.pScore >= 0.82;
  const hasStrongModel = best.mScore >= 0.80;
  const isHighComposite = best.composite >= 0.78;

  // If Part Number is confused (e.g. O->0) and Model is close
  const isPartNumberAndModelMatch = best.pScore >= 0.75 && best.mScore >= 0.75 && best.composite >= 0.75;

  if (isHighComposite || (hasStrongPn && (hasStrongModel || best.cScore >= 0.70)) || isPartNumberAndModelMatch) {
    const reasons: string[] = [];
    if (best.pScore >= 0.90) reasons.push("high part number similarity");
    else if (best.pScore >= 0.75) reasons.push("good part number similarity");

    if (best.mScore >= 0.90) reasons.push("high model similarity");
    else if (best.mScore >= 0.75) reasons.push("good model similarity");

    if (best.cScore >= 0.90) reasons.push("customer match");

    return {
      matched: true,
      record: best.record,
      finalCustomer: best.record.customer,
      finalModel: best.record.model,
      finalPartNumber: best.record.partNumber,
      rawCustomer: cRaw,
      rawModel: mRaw,
      rawPartNumber: pRaw,
      customerScore: best.cScore,
      modelScore: best.mScore,
      partNumberScore: best.pScore,
      compositeScore: best.composite,
      matchReason: reasons.join(" + ") || "composite master score match",
      decision: "MASTER_MATCH",
    };
  }

  // No reliable match found -> KEEP RAW OCR
  return {
    matched: false,
    finalCustomer: cRaw,
    finalModel: mRaw,
    finalPartNumber: pRaw,
    rawCustomer: cRaw,
    rawModel: mRaw,
    rawPartNumber: pRaw,
    customerScore: best.cScore,
    modelScore: best.mScore,
    partNumberScore: best.pScore,
    compositeScore: best.composite,
    matchReason: `Score below threshold (${Math.round(best.composite * 100)}%)`,
    decision: "NO_RELIABLE_MATCH",
  };
}
