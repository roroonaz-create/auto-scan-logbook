/**
 * PIC Official Roster Fuzzy Matcher
 * 
 * Implements "closed vocabulary" matching for the PIC field:
 * - Aggressive matching against official PIC roster
 * - Combines character similarity, edit distance, bigram similarity, and Jaro-Winkler
 * - "Mendekati langsung tembak" if single clear winner
 * - Ambiguity detection (prevents blind guesses if multiple candidates tie)
 * - Safe fallback: preserves raw OCR if no confident match or ambiguous
 */

export interface PicMatchDetail {
  raw: string;
  matched: string;
  isCorrected: boolean;
  score: number;
}

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

function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;
  const len1 = s1.length;
  const len2 = s2.length;
  const matchDistance = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);
  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j]) continue;
      if (s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0.0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) t++;
    k++;
  }
  const transpositions = t / 2;
  const jaro = (matches / len1 + matches / len2 + (matches - transpositions) / matches) / 3.0;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, len1, len2); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1.0 - jaro);
}

/**
 * Normalizes string for comparison:
 * - Uppercase
 * - Replaces common OCR digit-for-letter misreads (0->O, 1->I, 4->A, 5->S, 8->B, 3->E)
 * - Strips non-alphanumeric except spaces
 * - Collapses repeated whitespace
 */
function normalizeDigitsAndChars(str: string): string {
  return (str || "")
    .toUpperCase()
    .replace(/0/g, "O")
    .replace(/1/g, "I")
    .replace(/4/g, "A")
    .replace(/5/g, "S")
    .replace(/8/g, "B")
    .replace(/3/g, "E")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanAlphaOnly(str: string): string {
  return (str || "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Bigram Dice coefficient for character sequence similarity
 */
function bigramSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length < 2 || b.length < 2) return 0.0;

  const getBigrams = (s: string) => {
    const bg: Record<string, number> = {};
    for (let i = 0; i < s.length - 1; i++) {
      const pair = s.slice(i, i + 2);
      bg[pair] = (bg[pair] || 0) + 1;
    }
    return bg;
  };

  const bgA = getBigrams(a);
  const bgB = getBigrams(b);

  let intersection = 0;
  for (const pair of Object.keys(bgA)) {
    if (bgB[pair]) {
      intersection += Math.min(bgA[pair], bgB[pair]);
    }
  }

  const total = (a.length - 1) + (b.length - 1);
  return (2 * intersection) / total;
}

/**
 * Evaluates similarity between raw OCR input and an official PIC name
 */
function evaluateCandidateScore(rawClean: string, rawSubstituted: string, officialClean: string): number {
  if (!rawClean || !officialClean) return 0.0;

  // 1. Exact match
  if (rawClean === officialClean) return 1.0;

  // 2. Exact match after OCR digit substitution (e.g. BUD1 SANTOSO -> BUDI SANTOSO, SURY4 -> SURYA)
  if (rawSubstituted === officialClean) return 0.98;

  // 3. Known mechanical stutter / repetition artifacts (e.g. NAZARAR -> NAZAR, VALLEASLEAS -> VALLEAS)
  if (rawClean.startsWith(officialClean) && rawClean.length <= officialClean.length + 4) {
    const extra = rawClean.slice(officialClean.length);
    if (officialClean.endsWith(extra)) {
      return 0.96;
    }
  }

  // 4. Token & prefix matching (e.g. "AGUS S" -> "AGUS")
  const rawTokens = rawClean.split(" ").filter(Boolean);
  const officialTokens = officialClean.split(" ").filter(Boolean);

  if (rawTokens.length > 1 && officialTokens.length === 1 && rawTokens[0] === officialTokens[0]) {
    if (rawTokens[1].length <= 2) {
      return 0.92;
    }
  }
  if (officialTokens.length > 1 && rawTokens.length === 1 && officialTokens[0] === rawTokens[0]) {
    return 0.88;
  }

  // 5. Levenshtein edit distance & character similarity
  const maxLen = Math.max(rawSubstituted.length, officialClean.length);
  const dist = levenshteinDistance(rawSubstituted, officialClean);
  const charSim = 1.0 - dist / maxLen;

  // 6. Bigram similarity
  const bgSim = bigramSimilarity(rawSubstituted, officialClean);

  // 7. Jaro-Winkler similarity
  const jwSim = jaroWinkler(rawSubstituted, officialClean);

  let score = charSim * 0.4 + bgSim * 0.2 + jwSim * 0.4;

  // Boost for 1 character typo (e.g. ROHAIA -> ROHALIA, RIZKI -> RIZKY, ANGI -> ANGGI)
  if (dist === 1) {
    score = Math.max(score, 0.85);
  } else if (dist === 2 && maxLen >= 5) {
    score = Math.max(score, 0.78);
  }

  return Math.min(1.0, score);
}

/**
 * Matches a raw PIC reading against the official locked PIC roster.
 * - If single clear candidate with high confidence: returns official PIC name
 * - If ambiguous (multiple candidates tie): returns original rawPic to avoid wrong guess
 * - If confidence too low: returns original rawPic
 */
export function matchPicToOfficialRoster(
  rawPic: string,
  officialRoster: string[],
  onDetail?: (detail: PicMatchDetail) => void
): string {
  if (!rawPic || !Array.isArray(officialRoster) || officialRoster.length === 0) {
    return rawPic || "";
  }

  let p = rawPic.trim().toUpperCase();
  if (!p) return "";

  // Handle multi-personnel delimiter in single cell: rule says 1 personnel per row
  if (p.includes("/") || p.includes(",") || p.includes("\n")) {
    const parts = p.split(/[\/,\n]+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) {
      p = parts[0];
    }
  }

  const rawClean = cleanAlphaOnly(p);
  const rawSubstituted = normalizeDigitsAndChars(p);

  if (!rawClean) return rawPic;

  // Quick check for exact case-insensitive match
  for (const official of officialRoster) {
    if (cleanAlphaOnly(official) === rawClean) {
      const match = official.toUpperCase();
      if (onDetail) onDetail({ raw: p, matched: match, isCorrected: p !== match, score: 1.0 });
      return match;
    }
  }

  // Score all candidates in the official roster
  const scored = officialRoster.map((official) => {
    const officialClean = cleanAlphaOnly(official);
    const score = evaluateCandidateScore(rawClean, rawSubstituted, officialClean);
    return {
      official: official.toUpperCase(),
      score,
    };
  });

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1];

  // Minimum confidence threshold to consider a match:
  // With closed vocabulary, clear winner with score >= 0.70 is matched directly
  const MIN_MATCH_SCORE = 0.70;

  if (top && top.score >= MIN_MATCH_SCORE) {
    const secondScore = second ? second.score : 0;
    const margin = top.score - secondScore;

    // Ambiguous if top score is not near-perfect and margin is tight
    const isAmbiguous = top.score < 0.95 && margin < 0.08 && secondScore >= 0.65;

    if (!isAmbiguous) {
      if (onDetail) {
        onDetail({
          raw: p,
          matched: top.official,
          isCorrected: p !== top.official,
          score: top.score,
        });
      }
      return top.official;
    }
  }

  // If no confident or unambiguous match, preserve raw transcript
  if (onDetail) {
    onDetail({ raw: p, matched: p, isCorrected: false, score: top ? top.score : 0 });
  }
  return p;
}

