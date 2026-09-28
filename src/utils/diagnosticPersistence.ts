import {
  PostProcessingLayers,
  DiagnosticPersistentState,
  DIAGNOSTIC_STORAGE_KEY,
  DEFAULT_DIAGNOSTIC_STATE,
} from "../types";

/**
 * Computes active diagnostic layer number (1 to 8):
 * 1. RAW OCR Murni
 * 2. Data Pembanding
 * 3. Ditto
 * 4. PIC
 * 5. REMARK
 * 6. Master Matcher
 * 7. Time Reconstruction
 * 8. OCR Memory (Full Pipeline)
 */
export function computeActiveLayer(pureRawOcr: boolean, layers: PostProcessingLayers): number {
  if (pureRawOcr) return 1;
  if (layers.memory) return 8;
  if (layers.timeRecon) return 7;
  if (layers.masterMatch !== false) return 6;
  if (layers.remark) return 5;
  if (layers.pic) return 4;
  if (layers.ditto) return 3;
  if (layers.dataPembanding) return 2;
  return 1;
}

/**
 * Loads persisted diagnostic state from localStorage or falls back to FULL PIPELINE default (all 1..8 ON).
 */
export function loadDiagnosticState(storage?: Storage): DiagnosticPersistentState {
  const store = storage || (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!store) {
    return DEFAULT_DIAGNOSTIC_STATE;
  }
  try {
    const saved = store.getItem(DIAGNOSTIC_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        typeof parsed.dataPembanding === "boolean" &&
        typeof parsed.pic === "boolean" &&
        typeof parsed.remark === "boolean" &&
        typeof parsed.ditto === "boolean" &&
        typeof parsed.timeRecon === "boolean" &&
        typeof parsed.memory === "boolean"
      ) {
        const masterMatch = typeof parsed.masterMatch === "boolean" ? parsed.masterMatch : true;
        const pureRawOcr = typeof parsed.pureRawOcr === "boolean" ? parsed.pureRawOcr : false;
        const bypassMemory = typeof parsed.bypassMemory === "boolean" ? parsed.bypassMemory : false;
        const layers: PostProcessingLayers = {
          dataPembanding: parsed.dataPembanding,
          pic: parsed.pic,
          remark: parsed.remark,
          ditto: parsed.ditto,
          masterMatch,
          timeRecon: parsed.timeRecon,
          memory: parsed.memory,
        };
        const activeLayer = typeof parsed.activeLayer === "number" ? parsed.activeLayer : computeActiveLayer(pureRawOcr, layers);
        return {
          dataPembanding: parsed.dataPembanding,
          pic: parsed.pic,
          remark: parsed.remark,
          ditto: parsed.ditto,
          masterMatch,
          timeRecon: parsed.timeRecon,
          memory: parsed.memory,
          activeLayer,
          pureRawOcr,
          bypassMemory,
        };
      }
    }
  } catch (e) {
    console.error("Failed to load diagnostic state from localStorage", e);
  }
  return DEFAULT_DIAGNOSTIC_STATE;
}

/**
 * Persists current diagnostic state to localStorage.
 */
export function saveDiagnosticState(
  layers: PostProcessingLayers,
  pureRawOcr: boolean,
  bypassMemory: boolean,
  storage?: Storage
): DiagnosticPersistentState {
  const state: DiagnosticPersistentState = {
    dataPembanding: layers.dataPembanding,
    pic: layers.pic,
    remark: layers.remark,
    ditto: layers.ditto,
    masterMatch: layers.masterMatch !== false,
    timeRecon: layers.timeRecon,
    memory: layers.memory,
    activeLayer: computeActiveLayer(pureRawOcr, layers),
    pureRawOcr,
    bypassMemory,
  };
  const store = storage || (typeof window !== "undefined" ? window.localStorage : undefined);
  if (store) {
    try {
      store.setItem(DIAGNOSTIC_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("Failed to save diagnostic state to localStorage", e);
    }
  }
  return state;
}
