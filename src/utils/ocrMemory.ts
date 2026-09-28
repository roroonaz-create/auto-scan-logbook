/**
 * OCR Manual Correction Memory as Supporting Evidence
 * 
 * CORE PRINCIPLES:
 * 1. NEVER global text replacement (No "m -> n" global replacement).
 * 2. Learns ONLY from verified USER MANUAL CORRECTIONS (when clicking "Simpan Koreksi").
 *    Automatic corrections (Data Pembanding, PIC matcher, Ditto, Remark parser, Master matcher)
 *    are NEVER treated as user feedback.
 * 3. Field-Aware: Memory is strictly bound to its specific fieldName.
 * 4. Priority Hierarchy:
 *    MANUAL EDIT > STRONG MASTER MATCH > STRONG OCR EVIDENCE > MEMORY SUGGESTION
 * 5. Master Fields (Customer, Model, Part Number):
 *    Memory NEVER overrides a strong master match. Memory only acts as supporting evidence
 *    to boost master candidates if OCR was ambiguous or slightly distorted.
 *    Final value ALWAYS comes from official master record.
 * 6. PIC Field:
 *    Closed vocabulary. Final PIC must always come from the official PIC roster.
 * 7. Deterministic Rules:
 *    Data Pembanding (6 digits), Remark ROLL, Ditto marks are DETERMINISTIC and NEVER touched.
 * 8. Conflicts:
 *    If conflicting corrections exist for similar visual patterns, confidence drops and
 *    both are considered ambiguous. Baseline/master is used.
 * 9. Safe Default:
 *    When Memory is OFF, result is 100% identical to baseline.
 */

import { ParsedData, DecisionDebugTrace } from "../types";
import { MasterRecord } from "./masterCatalog";
import { normalizePartNumberForComparison } from "./masterMatcher";

export interface OcrMemoryEntry {
  id: string;
  field: keyof ParsedData;
  rawOCRValue: string;
  postProcessedValue?: string;
  manualCorrectedValue: string;
  rowContext: {
    customer?: string;
    model?: string;
    partNumber?: string;
    pic?: string;
    operator?: string;
  };
  imageCrop?: string; // Base64 thumbnail data URL of the specific cell handwriting
  bbox?: [number, number, number, number]; // [ymin, xmin, ymax, xmax]
  sampleCount: number; // Frequency of user confirmation
  conflictCount: number; // Number of conflicting user corrections
  confidence: number; // 0.0 - 1.0
  createdAt: number;
  lastSeen: number;
  isLegacy?: boolean;
}

export interface MemoryRetrievalResult {
  hasCandidate: boolean;
  candidateValue: string;
  confidence: number;
  sampleCount: number;
  matchReason: string;
  isConflict: boolean;
  matchedEntry?: OcrMemoryEntry;
}

/**
 * Standard Levenshtein distance
 */
function levenshteinDist(a: string, b: string): number {
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
export function stringSimilarity(a: string, b: string): number {
  const s1 = (a || "").trim().toUpperCase();
  const s2 = (b || "").trim().toUpperCase();
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDist(s1, s2);
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * Normalizes common OCR confusion characters for handwriting comparison
 * O ↔ 0, I ↔ 1, L ↔ 1, S ↔ 5, B ↔ 8, Z ↔ 2
 */
function normalizeConfusionChars(s: string): string {
  return (s || "")
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/S/g, "5")
    .replace(/B/g, "8")
    .replace(/Z/g, "2");
}

/**
 * Calculates OCR-aware pattern similarity between two raw OCR strings [0..1]
 */
export function ocrPatternSimilarity(a: string, b: string): number {
  const s1 = (a || "").trim().toUpperCase();
  const s2 = (b || "").trim().toUpperCase();
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const baseSim = stringSimilarity(s1, s2);
  const confSim = stringSimilarity(normalizeConfusionChars(s1), normalizeConfusionChars(s2));

  return Math.max(baseSim, confSim * 0.95);
}

/**
 * Computes memory confidence score based on sample count, conflict count, text similarity, and context match
 */
export function computeMemoryConfidence(
  sampleCount: number,
  conflictCount: number = 0,
  similarity: number = 1.0,
  contextMatch: boolean = false
): number {
  // If there are conflicting corrections for similar patterns, penalize heavily
  if (conflictCount > 0) {
    return Math.min(0.45, 0.45 * similarity);
  }

  // Base confidence based on sample count (repeats reinforce confidence)
  let base = 0.70;
  if (sampleCount >= 2) base = 0.83;
  if (sampleCount >= 3) base = 0.92;
  if (sampleCount >= 5) base = 0.96;

  // Context bonus
  if (contextMatch) {
    base = Math.min(0.98, base + 0.05);
  }

  return Number((base * similarity).toFixed(3));
}

/**
 * Finds matching memory candidates for a given field and raw OCR value
 */
export function retrieveMemoryCandidate(
  field: keyof ParsedData,
  rawVal: string,
  rowContext: { customer?: string; model?: string; partNumber?: string; pic?: string },
  memoryEntries: OcrMemoryEntry[]
): MemoryRetrievalResult {
  const emptyResult: MemoryRetrievalResult = {
    hasCandidate: false,
    candidateValue: "",
    confidence: 0,
    sampleCount: 0,
    matchReason: "no reliable candidate",
    isConflict: false,
  };

  if (!rawVal || !memoryEntries || memoryEntries.length === 0) {
    return emptyResult;
  }

  const cleanRaw = rawVal.trim().toUpperCase();
  if (!cleanRaw) return emptyResult;

  // 1. Filter entries strictly for THIS field (field-aware)
  const fieldEntries = memoryEntries.filter((e) => e.field === field);
  if (fieldEntries.length === 0) return emptyResult;

  // 2. Score entries based on similarity to raw OCR
  interface ScoredCandidate {
    entry: OcrMemoryEntry;
    similarity: number;
    contextMatch: boolean;
    confidence: number;
  }

  const scored: ScoredCandidate[] = [];

  for (const entry of fieldEntries) {
    const entryRaw = (entry.rawOCRValue || "").trim().toUpperCase();
    const sim = ocrPatternSimilarity(cleanRaw, entryRaw);

    // Require high similarity threshold (minimum 0.75) to be considered
    if (sim < 0.75) continue;

    const contextMatch = Boolean(
      (rowContext.customer && entry.rowContext?.customer && stringSimilarity(rowContext.customer, entry.rowContext.customer) > 0.8) ||
      (rowContext.model && entry.rowContext?.model && stringSimilarity(rowContext.model, entry.rowContext.model) > 0.8) ||
      (rowContext.partNumber && entry.rowContext?.partNumber && normalizePartNumberForComparison(rowContext.partNumber) === normalizePartNumberForComparison(entry.rowContext.partNumber || ""))
    );

    const conf = computeMemoryConfidence(entry.sampleCount, entry.conflictCount, sim, contextMatch);
    scored.push({ entry, similarity: sim, contextMatch, confidence: conf });
  }

  if (scored.length === 0) return emptyResult;

  // Sort descending by confidence
  scored.sort((a, b) => b.confidence - a.confidence);

  const top = scored[0];

  // 3. Detect conflicts: if there are other candidates with high similarity pointing to DIFFERENT corrected values
  const conflicting = scored.filter(
    (c) =>
      c.entry.manualCorrectedValue.trim().toUpperCase() !== top.entry.manualCorrectedValue.trim().toUpperCase() &&
      c.similarity >= 0.85
  );

  if (conflicting.length > 0) {
    return {
      hasCandidate: false,
      candidateValue: "",
      confidence: 0.40,
      sampleCount: top.entry.sampleCount,
      matchReason: `Ambiguous conflict detected (${top.entry.manualCorrectedValue} vs ${conflicting[0].entry.manualCorrectedValue})`,
      isConflict: true,
      matchedEntry: top.entry,
    };
  }

  // Minimum confidence threshold to provide candidate (0.75)
  if (top.confidence < 0.75) {
    return {
      hasCandidate: false,
      candidateValue: top.entry.manualCorrectedValue,
      confidence: top.confidence,
      sampleCount: top.entry.sampleCount,
      matchReason: `Low memory confidence (${Math.round(top.confidence * 100)}% < 75%)`,
      isConflict: false,
      matchedEntry: top.entry,
    };
  }

  return {
    hasCandidate: true,
    candidateValue: top.entry.manualCorrectedValue,
    confidence: top.confidence,
    sampleCount: top.entry.sampleCount,
    matchReason: `Confirmed user correction pattern (${top.entry.sampleCount}x confirmed, ${Math.round(top.confidence * 100)}% confidence)`,
    isConflict: false,
    matchedEntry: top.entry,
  };
}

/**
 * Records a new user manual correction into memory.
 * Handles deduplication, sample count increment, and conflict detection.
 */
export function recordManualCorrection(
  existingEntries: OcrMemoryEntry[],
  correction: {
    field: keyof ParsedData;
    rawOCRValue: string;
    postProcessedValue?: string;
    manualCorrectedValue: string;
    rowContext: { customer?: string; model?: string; partNumber?: string; pic?: string; operator?: string };
    imageCrop?: string;
    bbox?: [number, number, number, number];
  }
): { updatedEntries: OcrMemoryEntry[]; isNew: boolean } {
  const { field, rawOCRValue, postProcessedValue, manualCorrectedValue, rowContext, imageCrop, bbox } = correction;
  const cleanRaw = (rawOCRValue || "").trim().toUpperCase();
  const cleanCorrected = (manualCorrectedValue || "").trim().toUpperCase();

  // Guard: invalid or identical values are not corrections
  if (!cleanRaw || !cleanCorrected || cleanRaw === cleanCorrected) {
    return { updatedEntries: existingEntries, isNew: false };
  }

  // Deterministic fields should NOT be recorded into memory
  if (field === "data_pembanding") {
    return { updatedEntries: existingEntries, isNew: false };
  }

  const entriesCopy = [...existingEntries];

  // Check for existing identical pattern: same field AND same manual correction AND similar raw
  const existingIdx = entriesCopy.findIndex((e) => {
    if (e.field !== field) return false;
    const sameCorrected = e.manualCorrectedValue.trim().toUpperCase() === cleanCorrected;
    const similarRaw = ocrPatternSimilarity(e.rawOCRValue, cleanRaw) >= 0.90;
    return sameCorrected && similarRaw;
  });

  if (existingIdx >= 0) {
    const existing = entriesCopy[existingIdx];
    const newCount = existing.sampleCount + 1;
    entriesCopy[existingIdx] = {
      ...existing,
      sampleCount: newCount,
      lastSeen: Date.now(),
      confidence: computeMemoryConfidence(newCount, existing.conflictCount, 1.0, true),
      imageCrop: imageCrop || existing.imageCrop,
      bbox: bbox || existing.bbox,
      rowContext: { ...existing.rowContext, ...rowContext },
    };
    return { updatedEntries: entriesCopy, isNew: false };
  }

  // Check for conflict: same field AND similar raw, but DIFFERENT manual correction
  let conflictCount = 0;
  entriesCopy.forEach((e, i) => {
    if (e.field === field) {
      const diffCorrected = e.manualCorrectedValue.trim().toUpperCase() !== cleanCorrected;
      const similarRaw = ocrPatternSimilarity(e.rawOCRValue, cleanRaw) >= 0.88;
      if (diffCorrected && similarRaw) {
        conflictCount++;
        entriesCopy[i] = {
          ...e,
          conflictCount: (e.conflictCount || 0) + 1,
          confidence: computeMemoryConfidence(e.sampleCount, (e.conflictCount || 0) + 1, 1.0, false),
        };
      }
    }
  });

  // Create new entry
  const newEntry: OcrMemoryEntry = {
    id: `mem-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    field,
    rawOCRValue: cleanRaw,
    postProcessedValue: postProcessedValue ? postProcessedValue.trim().toUpperCase() : undefined,
    manualCorrectedValue: cleanCorrected,
    rowContext,
    imageCrop,
    bbox,
    sampleCount: 1,
    conflictCount,
    confidence: computeMemoryConfidence(1, conflictCount, 1.0, false),
    createdAt: Date.now(),
    lastSeen: Date.now(),
  };

  // Prepend new entry, capping at 100 entries to prevent localStorage bloat
  const updatedEntries = [newEntry, ...entriesCopy].slice(0, 100);
  return { updatedEntries, isNew: true };
}

/**
 * Applies Memory as Supporting Evidence on rows after deterministic rules and master matching.
 * Pipeline Step:
 * RAW OCR -> DETERMINISTIC RULES -> MASTER MATCHING -> MEMORY SUPPORT -> FINAL TABLE
 * 
 * Strict hierarchy:
 * MANUAL EDIT > STRONG MASTER MATCH > STRONG OCR EVIDENCE > MEMORY SUGGESTION
 */
export function applyMemorySupportLayer(
  currentRows: ParsedData[],
  rawAiRows: ParsedData[],
  memoryEntries: OcrMemoryEntry[],
  masterCatalog: MasterRecord[],
  officialPics: string[],
  manualEditedKeys: Set<string> = new Set(),
  enabled: boolean = false
): { rows: ParsedData[]; debugTraces: DecisionDebugTrace[] } {
  // If memory layer is disabled, return untouched rows immediately (Safe default / Zero regression)
  if (!enabled || !memoryEntries || memoryEntries.length === 0) {
    return { rows: currentRows, debugTraces: [] };
  }

  const debugTraces: DecisionDebugTrace[] = [];
  const rows = currentRows.map((row, rIdx) => {
    const rawRow = rawAiRows[rIdx] || row;
    const updated = { ...row };

    const rowContext = {
      customer: updated.costumer,
      model: updated.model,
      partNumber: updated.part_number,
      pic: updated.pic,
      operator: updated.operator,
    };

    // 1. MASTER FIELDS: Model, Part Number, Customer
    // Memory NEVER overrides an exact or strong master record.
    // Memory only acts as supporting evidence to boost candidates when OCR had slight distortion.
    const masterFields: (keyof ParsedData)[] = ["model", "part_number", "costumer"];
    for (const f of masterFields) {
      const isManual = manualEditedKeys.has(`${rIdx}:${f}`);
      if (isManual) continue; // Manual edit is highest priority

      const rawVal = rawRow[f] || "";
      const baselineVal = updated[f] || "";
      if (!rawVal) continue;

      const memResult = retrieveMemoryCandidate(f, rawVal, rowContext, memoryEntries);

      if (memResult.hasCandidate && memResult.confidence >= 0.75 && !memResult.isConflict) {
        // Verify if memory candidate corresponds to an official record in masterCatalog
        const candidateVal = memResult.candidateValue.trim().toUpperCase();
        const matchingMaster = masterCatalog.find((rec) => {
          if (f === "model") return rec.model.trim().toUpperCase() === candidateVal;
          if (f === "part_number") return normalizePartNumberForComparison(rec.partNumber) === normalizePartNumberForComparison(candidateVal);
          if (f === "costumer") return rec.customer.trim().toUpperCase() === candidateVal;
          return false;
        });

        if (matchingMaster) {
          const officialVal =
            f === "model" ? matchingMaster.model :
            f === "part_number" ? matchingMaster.partNumber :
            matchingMaster.customer;

          if (baselineVal !== officialVal) {
            updated[f] = officialVal;
            debugTraces.push({
              row: rIdx + 1,
              field: f,
              ocrOriginal: rawVal,
              memoryCandidate: memResult.candidateValue,
              memoryConfidence: memResult.confidence,
              final: officialVal,
              reason: `master + high-confidence memory support (${Math.round(memResult.confidence * 100)}%)`,
              correctionSource: "memory_support",
            });
          }
        }
      }
    }

    // 2. PIC FIELD: Closed official vocabulary
    // Final PIC MUST always come from officialPics roster.
    {
      const f: keyof ParsedData = "pic";
      const isManual = manualEditedKeys.has(`${rIdx}:${f}`);
      if (!isManual) {
        const rawVal = rawRow[f] || "";
        const baselineVal = updated[f] || "";

        if (rawVal) {
          const memResult = retrieveMemoryCandidate(f, rawVal, rowContext, memoryEntries);
          if (memResult.hasCandidate && memResult.confidence >= 0.75 && !memResult.isConflict) {
            const candidate = memResult.candidateValue.trim().toUpperCase();
            // Verify candidate is in official roster
            const officialMatch = officialPics.find(
              (p) => p.trim().toUpperCase() === candidate
            );

            if (officialMatch && baselineVal !== officialMatch) {
              updated[f] = officialMatch;
              debugTraces.push({
                row: rIdx + 1,
                field: f,
                ocrOriginal: rawVal,
                memoryCandidate: memResult.candidateValue,
                memoryConfidence: memResult.confidence,
                final: officialMatch,
                reason: `official roster + memory support (${Math.round(memResult.confidence * 100)}%)`,
                correctionSource: "memory_support",
              });
            }
          }
        }
      }
    }

    // 3. FREE TEXT FIELD: Operator
    {
      const f: keyof ParsedData = "operator";
      const isManual = manualEditedKeys.has(`${rIdx}:${f}`);
      if (!isManual) {
        const rawVal = rawRow[f] || "";
        const baselineVal = updated[f] || "";

        if (rawVal) {
          const memResult = retrieveMemoryCandidate(f, rawVal, rowContext, memoryEntries);
          // High threshold for free text: 0.85
          if (memResult.hasCandidate && memResult.confidence >= 0.85 && !memResult.isConflict) {
            const candidate = memResult.candidateValue.trim().toUpperCase();
            if (baselineVal !== candidate) {
              updated[f] = candidate;
              debugTraces.push({
                row: rIdx + 1,
                field: f,
                ocrOriginal: rawVal,
                memoryCandidate: memResult.candidateValue,
                memoryConfidence: memResult.confidence,
                final: candidate,
                reason: `high-confidence memory support (${Math.round(memResult.confidence * 100)}%)`,
                correctionSource: "memory_support",
              });
            }
          }
        }
      }
    }

    // Deterministic fields: data_pembanding, jam_in, jam_out, remark (ROLL) are untouched by memory.
    return updated;
  });

  return { rows, debugTraces };
}
