import React, { useState, useEffect, useMemo } from "react";
import { Navbar } from "./components/Navbar";
import { UploadSection } from "./components/UploadSection";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { TableSection } from "./components/TableSection";
import { MemoryModal } from "./components/MemoryModal";
import { ExcelGuideModal } from "./components/ExcelGuideModal";
import { PicRosterModal } from "./components/PicRosterModal";
import { DebugModal } from "./components/DebugModal";
import { MasterCatalogModal } from "./components/MasterCatalogModal";
import { ToastContainer } from "./components/Toast";
import { DiagnosticControlBar } from "./components/DiagnosticControlBar";
import {
  ParsedData,
  AiMemory,
  ToastMessage,
  CellDiff,
  RowConfidence,
  UncertaintyNote,
  DecisionDebugTrace,
  VisualCorrectionSample,
  RowTimeMetadata,
  PostProcessingLayers,
  ScanResponse,
  OcrEngine,
  DiagnosticPersistentState,
  DIAGNOSTIC_STORAGE_KEY,
  OCR_ENGINE_STORAGE_KEY,
  DEFAULT_DIAGNOSTIC_STATE,
} from "./types";
import {
  STORAGE_KEY,
  DEFAULT_RULES,
  DEFAULT_VOCABULARY,
  DEFAULT_LOCKED_PICS,
  LOCKED_PIC_STORAGE_KEY,
  MASTER_CATALOG_STORAGE_KEY,
} from "./constants";
import { CLEAN_THEME } from "./themes";
import { soundManager } from "./utils/audio";
import { evaluateAllRowsConfidence } from "./utils/confidence";
import { PreprocessResult } from "./utils/imagePreprocess";
import { matchPicToOfficialRoster } from "./utils/picMatcher";
import { normalizeDataPembanding } from "./utils/dataPembanding";
import { normalizeRemark } from "./utils/remarkParser";
import { resolveDittoMarks } from "./utils/dittoResolver";
import { reconstructRowTimes } from "./utils/timeReconstructor";
import { isPhantomBlankRow } from "./utils/mistralOcr";
import { matchMasterRecord } from "./utils/masterMatcher";
import { DEFAULT_MASTER_RECORDS, MasterRecord } from "./utils/masterCatalog";
import { applyMemorySupportLayer, recordManualCorrection, OcrMemoryEntry } from "./utils/ocrMemory";
import {
  computeActiveLayer,
  loadDiagnosticState,
  saveDiagnosticState,
} from "./utils/diagnosticPersistence";

/**
 * Modular post-processing applicator for step-by-step diagnostic isolation.
 * Pipeline Order:
 * 1. Data Pembanding normalizer
 * 2. DITTO forward-fill
 * 3. Official PIC matching
 * 4. REMARK Roll parser
 * 5. Customer / Model / Part Number Master Matcher
 * 6. Time Sequence Reconstruction
 * 7. OCR Memory as Supporting Evidence (OFF by default)
 */
function applyModularLayersClient(
  rawRows: ParsedData[],
  layers: PostProcessingLayers,
  officialPics: string[],
  memoryRules?: any[],
  masterCatalog: MasterRecord[] = DEFAULT_MASTER_RECORDS,
  manualEditedKeys?: Set<string>,
  manualCorrections?: OcrMemoryEntry[]
): { rows: ParsedData[]; timeMeta: RowTimeMetadata[]; debugTraces: DecisionDebugTrace[] } {
  let rows = rawRows.map((r) => ({ ...r }));
  const debugTraces: DecisionDebugTrace[] = [];

  // Step 1: Data Pembanding (6-digit normalization)
  if (layers.dataPembanding) {
    rows = rows.map((r, idx) => {
      const rawDp = r.data_pembanding ? r.data_pembanding.trim() : "";
      if (rawDp && rawDp !== "[TIDAK_TERBACA]") {
        const normDp = normalizeDataPembanding(rawDp);
        if (normDp !== rawDp) {
          debugTraces.push({
            row: idx + 1,
            field: "data_pembanding",
            ocrOriginal: rawDp,
            final: normDp,
            reason: "Data Pembanding normalized",
            correctionSource: "data_pembanding_normalizer",
          });
        }
        return { ...r, data_pembanding: normDp };
      }
      return r;
    });
  }

  // Step 2: DITTO mark (") forward-fill (Column-aware)
  if (layers.ditto) {
    rows = resolveDittoMarks(
      rows,
      ["tanggal", "costumer", "model", "part_number", "pic", "operator", "remark"],
      (trace) => {
        debugTraces.push({
          row: trace.rowIndex,
          field: trace.field,
          ocrOriginal: trace.rawVal,
          final: trace.resolvedVal,
          reason: `Ditto mark forward-filled from previous row (${trace.resolvedVal})`,
          correctionSource: "ditto_previous_row",
        });
      }
    );
  }

  // Step 3: PIC matching (Official roster)
  if (layers.pic) {
    rows = rows.map((r, idx) => {
      const rawPic = r.pic ? r.pic.trim() : "";
      if (rawPic && rawPic !== "[TIDAK_TERBACA]") {
        let matched = rawPic;
        normalizePicClient(rawPic, officialPics, (detail) => {
          matched = detail.matched;
          if (detail.isCorrected) {
            debugTraces.push({
              row: idx + 1,
              field: "pic",
              ocrOriginal: detail.raw,
              final: detail.matched,
              reason: `Matched to official PIC roster (${detail.matched})`,
              correctionSource: "official_pic",
            });
          }
        });
        return { ...r, pic: matched };
      }
      return r;
    });
  }

  // Step 4: REMARK (R. 4.5 -> ROLL 4, ROLL 5, etc.)
  if (layers.remark) {
    rows = rows.map((r, idx) => {
      const rawRemark = r.remark ? r.remark.trim() : "";
      if (
        rawRemark === "-" ||
        rawRemark === "--" ||
        rawRemark === "NONE" ||
        rawRemark === "KOSONG"
      ) {
        return { ...r, remark: "" };
      }
      if (rawRemark && rawRemark !== "[TIDAK_TERBACA]") {
        const normRemark = normalizeRemark(rawRemark);
        if (normRemark !== rawRemark) {
          debugTraces.push({
            row: idx + 1,
            field: "remark",
            ocrOriginal: rawRemark,
            final: normRemark,
            reason: `Roll format normalized to ${normRemark}`,
            correctionSource: "remark_rule",
          });
        }
        return { ...r, remark: normRemark };
      }
      return r;
    });
  }

  // Step 5: Customer / Model / Part Number Master Matcher (Unified Record Matcher)
  if (layers.masterMatch !== false) {
    rows = rows.map((r, idx) => {
      const rawCust = r.costumer || "";
      const rawMod = r.model || "";
      const rawPn = r.part_number || "";

      // Check if user manually edited these fields (MANUAL > MASTER MATCH > RAW OCR)
      const isCustManual = manualEditedKeys?.has(`${idx}:costumer`);
      const isModManual = manualEditedKeys?.has(`${idx}:model`);
      const isPnManual = manualEditedKeys?.has(`${idx}:part_number`);

      const match = matchMasterRecord(rawCust, rawMod, rawPn, masterCatalog);

      // Section 15 Debug Log
      console.log(`[CLIENT MASTER MATCH] Row ${idx + 1}: RAW [${rawCust} | ${rawMod} | ${rawPn}] -> BEST [${match.record?.customer || "-"} | ${match.record?.model || "-"} | ${match.record?.partNumber || "-"}] Score: ${Math.round(match.compositeScore * 100)}% Decision: ${match.decision}`);

      if (match.matched) {
        if (!isCustManual && match.finalCustomer !== rawCust) {
          debugTraces.push({
            row: idx + 1,
            field: "costumer",
            ocrOriginal: rawCust,
            final: match.finalCustomer,
            reason: `Master Record: ${match.matchReason}`,
            correctionSource: "master_catalog",
          });
        }
        if (!isModManual && match.finalModel !== rawMod) {
          debugTraces.push({
            row: idx + 1,
            field: "model",
            ocrOriginal: rawMod,
            final: match.finalModel,
            reason: `Master Record: ${match.matchReason}`,
            correctionSource: "master_catalog",
          });
        }
        if (!isPnManual && match.finalPartNumber !== rawPn) {
          debugTraces.push({
            row: idx + 1,
            field: "part_number",
            ocrOriginal: rawPn,
            final: match.finalPartNumber,
            reason: `Master Record: ${match.matchReason}`,
            correctionSource: "master_catalog",
          });
        }

        return {
          ...r,
          costumer: isCustManual ? r.costumer : match.finalCustomer,
          model: isModManual ? r.model : match.finalModel,
          part_number: isPnManual ? r.part_number : match.finalPartNumber,
        };
      }

      // No reliable match -> keep raw OCR untouched
      return r;
    });
  }

  // Step 6: Time Sequence Reconstruction
  let timeMeta: RowTimeMetadata[] = [];
  if (layers.timeRecon) {
    const timeRecon = reconstructRowTimes(rows);
    rows = timeRecon.rows;
    timeMeta = rows.map((_, i) => ({
      jam_in: timeRecon.timeMetadata.jam_in[i],
      jam_out: timeRecon.timeMetadata.jam_out[i],
    }));
  }

  // Step 7: OCR Memory as Supporting Evidence (OFF by default)
  if (layers.memory && manualCorrections && manualCorrections.length > 0) {
    const memorySupport = applyMemorySupportLayer(
      rows,
      rawRows,
      manualCorrections,
      masterCatalog,
      officialPics,
      manualEditedKeys || new Set(),
      true
    );
    rows = memorySupport.rows;
    if (memorySupport.debugTraces.length > 0) {
      debugTraces.push(...memorySupport.debugTraces);
    }
  }

  return { rows, timeMeta, debugTraces };
}


/**
 * Extracts a high-contrast thumbnail crop of the specific cell handwriting
 * from the uploaded image for Visual OCR Few-Shot Learning.
 */
async function cropCellHandwritingSnippet(
  base64Image: string,
  rowIndex: number,
  totalRows: number,
  field: keyof ParsedData,
  bbox?: [number, number, number, number]
): Promise<string> {
  return new Promise((resolve) => {
    if (!base64Image) return resolve("");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const imgW = img.naturalWidth || img.width;
        const imgH = img.naturalHeight || img.height;

        let ymin = 0;
        let xmin = 0;
        let ymax = 1000;
        let xmax = 1000;

        if (bbox && bbox.length === 4) {
          [ymin, xmin, ymax, xmax] = bbox;
        } else {
          const tableTopY = 0.12;
          const tableBottomY = 0.92;
          const safeTotal = Math.max(1, totalRows);
          const rowH = (tableBottomY - tableTopY) / safeTotal;
          ymin = Math.round((tableTopY + rowIndex * rowH) * 1000);
          ymax = Math.round((tableTopY + (rowIndex + 1) * rowH) * 1000);
          xmin = 40;
          xmax = 960;
        }

        let sy = Math.max(0, (ymin / 1000) * imgH);
        let sx = Math.max(0, (xmin / 1000) * imgW);
        let sHeight = Math.max(12, ((ymax - ymin) / 1000) * imgH);
        let sWidth = Math.max(24, ((xmax - xmin) / 1000) * imgW);

        // Approximate horizontal column bounds
        const colRatios: Record<string, [number, number]> = {
          tanggal: [0.00, 0.09],
          jam_in: [0.09, 0.15],
          jam_out: [0.15, 0.21],
          data_pembanding: [0.21, 0.33],
          costumer: [0.33, 0.44],
          model: [0.44, 0.60],
          part_number: [0.60, 0.74],
          pic: [0.74, 0.85],
          remark: [0.85, 0.95],
          operator: [0.95, 1.00],
        };

        const ratio = colRatios[field as string];
        if (ratio) {
          const colX = sx + sWidth * ratio[0];
          const colW = sWidth * (ratio[1] - ratio[0]);
          sx = colX;
          sWidth = colW;
        }

        const canvas = document.createElement("canvas");
        const maxW = 180;
        const maxH = 65;
        const scale = Math.min(1, maxW / sWidth, maxH / sHeight);
        canvas.width = Math.max(30, Math.round(sWidth * scale));
        canvas.height = Math.max(20, Math.round(sHeight * scale));

        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve("");
        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      } catch (err) {
        resolve("");
      }
    };
    img.onerror = () => resolve("");
    img.src = base64Image;
  });
}

function normalizeSinglePicClient(val: string, roster: string[], onDetail?: (detail: any) => void): string {
  let p = (val || "").trim().toUpperCase();
  if (!p) return "";
  p = p.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, "");
  if (!p) return "";

  // Official PIC roster fuzzy matching ("closed vocabulary" - "mendekati langsung tembak")
  return matchPicToOfficialRoster(p, roster, onDetail);
}

function normalizePicClient(val: string, roster: string[], onDetail?: (detail: any) => void): string {
  const p = (val || "").trim().toUpperCase();
  if (!p) return "";
  // TIDAK MUNGKIN ADA 2 PERSONIL DALAM SATU BARIS: Ambil 1 nama personil tunggal
  if (p.includes("/") || p.includes(",") || p.includes("\n")) {
    const parts = p.split(/[\/,\n]+/).map((part) => normalizeSinglePicClient(part, roster, onDetail)).filter(Boolean);
    return parts[0] || "";
  }
  return normalizeSinglePicClient(p, roster, onDetail);
}

function cleanDataPembandingClient(rawVal: string): string {
  return normalizeDataPembanding(rawVal);
}

export default function App() {
  const themeConfig = CLEAN_THEME;

  // Image Upload & Preprocess State
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [base64Data, setBase64Data] = useState<string | null>(null);
  const [imageMeta, setImageMeta] = useState<{ origW: number; origH: number; finalW: number; finalH: number } | null>(null);

  // AI & Processing State (Persisted independently of diagnostic layers)
  const [ocrEngine, setOcrEngine] = useState<OcrEngine>(() => {
    try {
      const saved = localStorage.getItem(OCR_ENGINE_STORAGE_KEY);
      if (saved === "mistral" || saved === "gemini") {
        return saved;
      }
    } catch (e) {
      console.error("Failed to load OCR engine from localStorage", e);
    }
    return "gemini";
  });

  const handleOcrEngineChange = (engine: OcrEngine) => {
    setOcrEngine(engine);
    try {
      localStorage.setItem(OCR_ENGINE_STORAGE_KEY, engine);
    } catch (e) {
      console.error("Failed to save OCR engine to localStorage", e);
    }
  };

  const [selectedModel, setSelectedModel] = useState("gemini-3.8-flash");
  const [activeModel, setActiveModel] = useState("gemini-3.8-flash");
  const [isLoading, setIsLoading] = useState(false);
  const [scanResult, setScanResult] = useState<ParsedData[] | null>(null);
  const [rawAiResult, setRawAiResult] = useState<ParsedData[] | null>(null);
  const [confidences, setConfidences] = useState<RowConfidence[]>([]);
  const [autoCorrectedCount, setAutoCorrectedCount] = useState(0);

  // Structured Scan Response states
  const [tsvString, setTsvString] = useState<string>("");
  const [uncertaintyNotes, setUncertaintyNotes] = useState<UncertaintyNote[]>([]);
  const [imageQualityStatus, setImageQualityStatus] = useState<"valid" | "rejected">("valid");
  const [rejectionReason, setRejectionReason] = useState<string>("");

  // Visual OCR Learning & Multimodal Decision Debug Traces
  const [debugTraces, setDebugTraces] = useState<DecisionDebugTrace[]>([]);
  const [detectedRowBboxes, setDetectedRowBboxes] = useState<[number, number, number, number][]>([]);
  const [isDebugModalOpen, setIsDebugModalOpen] = useState(false);
  const [timeMetadata, setTimeMetadata] = useState<RowTimeMetadata[]>([]);

  // Diagnostic Mode States (Initialized from persistent state or operational default: FULL PIPELINE 1..8 ON)
  const [initialDiagnosticState] = useState<DiagnosticPersistentState>(() => loadDiagnosticState());
  const [pureRawOcr, setPureRawOcr] = useState<boolean>(initialDiagnosticState.pureRawOcr);
  const [ignorePersistentMemory, setIgnorePersistentMemory] = useState<boolean>(initialDiagnosticState.bypassMemory);
  const [activeLayers, setActiveLayers] = useState<PostProcessingLayers>({
    dataPembanding: initialDiagnosticState.dataPembanding,
    ditto: initialDiagnosticState.ditto,
    pic: initialDiagnosticState.pic,
    remark: initialDiagnosticState.remark,
    masterMatch: initialDiagnosticState.masterMatch,
    timeRecon: initialDiagnosticState.timeRecon,
    memory: initialDiagnosticState.memory,
  });
  const [diagnosticLog, setDiagnosticLog] = useState<ScanResponse["diagnosticLog"] | null>(null);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false); // Default collapsed as requested

  // Manual edited cells tracker to enforce MANUAL > MASTER MATCH > RAW OCR
  const [manualEditedKeys, setManualEditedKeys] = useState<Set<string>>(new Set());

  // Master Catalog State (Customer + Model + Part Number reference records)
  const [masterCatalog, setMasterCatalog] = useState<MasterRecord[]>(() => {
    try {
      const saved = localStorage.getItem(MASTER_CATALOG_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error("Failed to load master catalog from localStorage", e);
    }
    return DEFAULT_MASTER_RECORDS;
  });

  // Rate Limit / Quota simulation
  const [scanCount, setScanCount] = useState(0);

  const quotaPercent = Math.max(0, 100 - scanCount * 6.66);

  // AI Continuous Learning Memory State
  const [memory, setMemory] = useState<AiMemory>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.rules && parsed.vocabulary) {
          const cleanRules = (parsed.rules || [])
            .filter((r: any) => {
              const w = String(r.wrong || "").trim().toUpperCase();
              const c = String(r.correct || "").trim().toUpperCase();
              if (r.field === "remark") {
                if (c === "ROLL" && (w === "" || w === "-" || w === "R" || w === "R/R" || w === " "))
                  return false;
              }
              if (r.field === "pic") {
                if (w === "NAZAR" && (c === "NAZARAR" || c === "NAZARR")) return false;
                if (c === "NAZARAR" || c === "NAZARR") return false;
              }
              return true;
            })
            .map((r: any) => {
              if (r.field === "pic" && String(r.wrong || "").trim().toUpperCase() === "NAZARAR") {
                return { ...r, correct: "NAZAR" };
              }
              return r;
            });
          const cleanVocab = {
            ...parsed.vocabulary,
            remark: (parsed.vocabulary?.remark || []).filter(
              (rem: string) => rem.trim().toUpperCase() !== "ROLL"
            ),
          };
          return {
            ...parsed,
            rules: cleanRules,
            vocabulary: cleanVocab,
            visualSamples: Array.isArray(parsed.visualSamples) ? parsed.visualSamples : [],
            manualCorrections: Array.isArray(parsed.manualCorrections) ? parsed.manualCorrections : [],
          };
        }
      }
    } catch (e) {
      console.error("Failed to load memory from localStorage", e);
    }
    return {
      rules: DEFAULT_RULES,
      vocabulary: DEFAULT_VOCABULARY,
      visualSamples: [],
      manualCorrections: [],
      totalLearnedCount: DEFAULT_RULES.length,
    };
  });

  // Locked PIC Roster State
  const [lockedPics, setLockedPics] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(LOCKED_PIC_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((n: string) => String(n).trim().toUpperCase());
        }
      }
    } catch (e) {
      console.error("Failed to load locked PIC roster", e);
    }
    return DEFAULT_LOCKED_PICS;
  });

  const [isPicRosterLocked, setIsPicRosterLocked] = useState<boolean>(() => {
    return localStorage.getItem("logbook_pic_roster_is_locked") !== "false";
  });

  const [isPicRosterModalOpen, setIsPicRosterModalOpen] = useState(false);

  const handleUpdatePicRoster = (newList: string[], locked: boolean) => {
    setLockedPics(newList);
    setIsPicRosterLocked(locked);
    try {
      localStorage.setItem(LOCKED_PIC_STORAGE_KEY, JSON.stringify(newList));
      localStorage.setItem("logbook_pic_roster_is_locked", String(locked));
    } catch (e) {
      console.error("Failed to save locked PIC roster", e);
    }

    setMemory((prev) => {
      const updated = {
        ...prev,
        vocabulary: {
          ...prev.vocabulary,
          pic: newList,
        },
      };
      saveMemoryToStorage(updated);
      return updated;
    });
  };

  // Modals Visibility State
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
  const [isFormatGuideOpen, setIsFormatGuideOpen] = useState(false);
  const [isTableExpanded, setIsTableExpanded] = useState(false);
  const [isMasterCatalogModalOpen, setIsMasterCatalogModalOpen] = useState(false);

  // Update Master Catalog Handler
  const handleUpdateMasterCatalog = (newCatalog: MasterRecord[]) => {
    setMasterCatalog(newCatalog);
    try {
      localStorage.setItem(MASTER_CATALOG_STORAGE_KEY, JSON.stringify(newCatalog));
    } catch (e) {
      console.error("Failed to save master catalog to localStorage", e);
    }
  };

  // Toast Notification System
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: "info" | "error" | "success", title: string, message: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      removeToast(id);
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Save memory to LocalStorage
  const saveMemoryToStorage = (updated: AiMemory) => {
    setMemory(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to save memory to localStorage", e);
    }
  };

  // Preprocessed image received from UploadSection
  const handleProcessedImageReady = (result: PreprocessResult) => {
    setImagePreview(result.processedDataUrl);
    setMimeType(result.mimeType);
    setBase64Data(result.base64Data);
    setImageMeta({
      origW: result.originalWidth,
      origH: result.originalHeight,
      finalW: result.finalWidth,
      finalH: result.finalHeight,
    });
  };

  const handleClearImage = () => {
    setImagePreview(null);
    setMimeType(null);
    setBase64Data(null);
    setImageMeta(null);
    setScanResult(null);
    setRawAiResult(null);
    setImageQualityStatus("valid");
    setRejectionReason("");
    setTsvString("");
    setUncertaintyNotes([]);
  };

  // Layer Change & Diagnostic Handlers (with persistence of manual changes)
  const handleLayersChange = (newLayers: PostProcessingLayers) => {
    setActiveLayers(newLayers);
    saveDiagnosticState(newLayers, pureRawOcr, ignorePersistentMemory);
    if (rawAiResult && rawAiResult.length > 0) {
      const { rows, timeMeta, debugTraces: newTraces } = applyModularLayersClient(
        rawAiResult,
        newLayers,
        lockedPics,
        ignorePersistentMemory ? undefined : memory.rules,
        masterCatalog,
        manualEditedKeys,
        ignorePersistentMemory ? [] : memory.manualCorrections
      );
      setScanResult(rows);
      setTimeMetadata(timeMeta);
      setDebugTraces(newTraces);
      const tsvH = "TANGGAL\tJAM_IN\tJAM_OUT\tDATA_PEMBANDING\tCOSTUMER\tMODEL\tPART_NUMBER\tPIC\tREMARK\tOPERATOR";
      const tsvB = rows.map((r) => [r.tanggal, r.jam_in, r.jam_out, r.data_pembanding, r.costumer, r.model, r.part_number, r.pic, r.remark, r.operator].join("\t")).join("\n");
      setTsvString(tsvH + "\n" + tsvB);
    }
  };

  const handleTogglePureRawOcr = (val: boolean) => {
    setPureRawOcr(val);
    saveDiagnosticState(activeLayers, val, ignorePersistentMemory);
    if (val) {
      // Revert table directly to rawAiResult untouched
      if (rawAiResult && rawAiResult.length > 0) {
        setScanResult(rawAiResult);
        setTimeMetadata([]);
        setDebugTraces([]);
        const tsvH = "TANGGAL\tJAM_IN\tJAM_OUT\tDATA_PEMBANDING\tCOSTUMER\tMODEL\tPART_NUMBER\tPIC\tREMARK\tOPERATOR";
        const tsvB = rawAiResult.map((r) => [r.tanggal, r.jam_in, r.jam_out, r.data_pembanding, r.costumer, r.model, r.part_number, r.pic, r.remark, r.operator].join("\t")).join("\n");
        setTsvString(tsvH + "\n" + tsvB);
      }
    } else {
      if (rawAiResult && rawAiResult.length > 0) {
        const { rows, timeMeta, debugTraces: newTraces } = applyModularLayersClient(
          rawAiResult,
          activeLayers,
          lockedPics,
          ignorePersistentMemory ? undefined : memory.rules,
          masterCatalog,
          manualEditedKeys,
          ignorePersistentMemory ? [] : memory.manualCorrections
        );
        setScanResult(rows);
        setTimeMetadata(timeMeta);
        setDebugTraces(newTraces);
        const tsvH = "TANGGAL\tJAM_IN\tJAM_OUT\tDATA_PEMBANDING\tCOSTUMER\tMODEL\tPART_NUMBER\tPIC\tREMARK\tOPERATOR";
        const tsvB = rows.map((r) => [r.tanggal, r.jam_in, r.jam_out, r.data_pembanding, r.costumer, r.model, r.part_number, r.pic, r.remark, r.operator].join("\t")).join("\n");
        setTsvString(tsvH + "\n" + tsvB);
      }
    }
  };

  const handleToggleIgnoreMemory = (val: boolean) => {
    setIgnorePersistentMemory(val);
    saveDiagnosticState(activeLayers, pureRawOcr, val);
    if (rawAiResult && rawAiResult.length > 0 && !pureRawOcr) {
      const { rows, timeMeta, debugTraces: newTraces } = applyModularLayersClient(
        rawAiResult,
        activeLayers,
        lockedPics,
        val ? undefined : memory.rules,
        masterCatalog,
        manualEditedKeys,
        val ? [] : memory.manualCorrections
      );
      setScanResult(rows);
      setTimeMetadata(timeMeta);
      setDebugTraces(newTraces);
      const tsvH = "TANGGAL\tJAM_IN\tJAM_OUT\tDATA_PEMBANDING\tCOSTUMER\tMODEL\tPART_NUMBER\tPIC\tREMARK\tOPERATOR";
      const tsvB = rows.map((r) => [r.tanggal, r.jam_in, r.jam_out, r.data_pembanding, r.costumer, r.model, r.part_number, r.pic, r.remark, r.operator].join("\t")).join("\n");
      setTsvString(tsvH + "\n" + tsvB);
    }
  };

  const handleApplyPreset = (step: number) => {
    const isPure = step === 1;
    const nextLayers: PostProcessingLayers = {
      dataPembanding: step >= 2,
      ditto: step >= 3,
      pic: step >= 4,
      remark: step >= 5,
      masterMatch: step >= 6,
      timeRecon: step >= 7,
      memory: step >= 8,
    };
    setPureRawOcr(isPure);
    setActiveLayers(nextLayers);
    saveDiagnosticState(nextLayers, isPure, ignorePersistentMemory);

    if (rawAiResult && rawAiResult.length > 0) {
      if (isPure) {
        setScanResult(rawAiResult);
        setTimeMetadata([]);
        setDebugTraces([]);
        const tsvH = "TANGGAL\tJAM_IN\tJAM_OUT\tDATA_PEMBANDING\tCOSTUMER\tMODEL\tPART_NUMBER\tPIC\tREMARK\tOPERATOR";
        const tsvB = rawAiResult.map((r) => [r.tanggal, r.jam_in, r.jam_out, r.data_pembanding, r.costumer, r.model, r.part_number, r.pic, r.remark, r.operator].join("\t")).join("\n");
        setTsvString(tsvH + "\n" + tsvB);
      } else {
        const { rows, timeMeta, debugTraces: newTraces } = applyModularLayersClient(
          rawAiResult,
          nextLayers,
          lockedPics,
          ignorePersistentMemory ? undefined : memory.rules,
          masterCatalog,
          manualEditedKeys,
          ignorePersistentMemory ? [] : memory.manualCorrections
        );
        setScanResult(rows);
        setTimeMetadata(timeMeta);
        setDebugTraces(newTraces);
        const tsvH = "TANGGAL\tJAM_IN\tJAM_OUT\tDATA_PEMBANDING\tCOSTUMER\tMODEL\tPART_NUMBER\tPIC\tREMARK\tOPERATOR";
        const tsvB = rows.map((r) => [r.tanggal, r.jam_in, r.jam_out, r.data_pembanding, r.costumer, r.model, r.part_number, r.pic, r.remark, r.operator].join("\t")).join("\n");
        setTsvString(tsvH + "\n" + tsvB);
      }
    }
  };

  const handleReapplyLayers = () => {
    if (rawAiResult && rawAiResult.length > 0) {
      if (pureRawOcr) {
        setScanResult(rawAiResult);
        setTimeMetadata([]);
        setDebugTraces([]);
      } else {
        const { rows, timeMeta, debugTraces: newTraces } = applyModularLayersClient(
          rawAiResult,
          activeLayers,
          lockedPics,
          ignorePersistentMemory ? undefined : memory.rules,
          masterCatalog,
          manualEditedKeys,
          ignorePersistentMemory ? [] : memory.manualCorrections
        );
        setScanResult(rows);
        setTimeMetadata(timeMeta);
        setDebugTraces(newTraces);
        const tsvH = "TANGGAL\tJAM_IN\tJAM_OUT\tDATA_PEMBANDING\tCOSTUMER\tMODEL\tPART_NUMBER\tPIC\tREMARK\tOPERATOR";
        const tsvB = rows.map((r) => [r.tanggal, r.jam_in, r.jam_out, r.data_pembanding, r.costumer, r.model, r.part_number, r.pic, r.remark, r.operator].join("\t")).join("\n");
        setTsvString(tsvH + "\n" + tsvB);
      }
      soundManager.playClick();
      addToast("info", "Tabel Diperbarui", "Hasil tabel disinkronkan dengan konfigurasi layer aktif.");
    }
  };

  // Main Scan Execution
  const handleScan = async () => {
    if (!base64Data || !mimeType) {
      addToast("error", "Belum Ada Foto", "Silakan unggah foto lembar logbook terlebih dahulu.");
      return;
    }

    if (ocrEngine === "mistral") {
      const apiKey = localStorage.getItem("mistral_api_key");
      if (!apiKey || !apiKey.trim()) {
        addToast("error", "Mistral API", "Mistral API Key belum diisi.");
        return;
      }
    }

    setIsLoading(true);
    setScanResult(null);
    setRawAiResult(null);
    setImageQualityStatus("valid");
    setRejectionReason("");
    setTsvString("");
    setUncertaintyNotes([]);
    setAutoCorrectedCount(0);
    soundManager.playClick();

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (ocrEngine === "mistral") {
        const apiKey = localStorage.getItem("mistral_api_key");
        if (apiKey && apiKey.trim()) {
          headers["Authorization"] = `Bearer ${apiKey.trim()}`;
        }
      }

      const response = await fetch("/api/scan", {
        method: "POST",
        headers,
        body: JSON.stringify({
          base64Data,
          mimeType,
          imageMeta,
          engine: ocrEngine,
          model: selectedModel,
          picRoster: isPicRosterLocked ? lockedPics : undefined,
          pureRawOcr,
          ignorePersistentMemory,
          layers: pureRawOcr ? undefined : activeLayers,
          enableMemory: !pureRawOcr && !ignorePersistentMemory,
          enableNormalization: !pureRawOcr,
          enableFieldContext: !pureRawOcr && !ignorePersistentMemory,
          masterCatalog,
          memory: (pureRawOcr || ignorePersistentMemory) ? undefined : {
            rules: memory.rules,
            vocabulary: memory.vocabulary,
            visualSamples: memory.visualSamples || [],
          },
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Gagal memindai (Kode: ${response.status})`);
      }

      const resData: ScanResponse = await response.json();
      setActiveModel(resData.usedModel || selectedModel);
      setDiagnosticLog(resData.diagnosticLog || null);

      // Handle Rejection from Gemini (photo too blurry/dark/tilted)
      if (resData.status === "rejected") {
        setImageQualityStatus("rejected");
        setRejectionReason(
          resData.rejectionReason ||
            "Foto terdeteksi buram atau tidak cukup jelas untuk dibaca secara akurat."
        );
        soundManager.playClick();
        addToast(
          "error",
          "Foto Ditolak untuk Scan",
          resData.rejectionReason || "Foto terlalu buram atau miring. Silakan ambil foto ulang."
        );
        return;
      }

      // Success flow
      setImageQualityStatus("valid");
      setRejectionReason("");
      setUncertaintyNotes(resData.uncertaintyNotes || []);
      setDebugTraces(resData.debugTraces || []);
      setDetectedRowBboxes(resData.rowBboxes || []);

      // Reset manual edited keys on fresh scan
      setManualEditedKeys(new Set());

      // 1. CAPTURE UNALTERED RAW OCR FROM ENGINE
      let rawRowsFromBackend: ParsedData[] = (resData.rawOcr || resData.data || []).map((rawRow: any) => ({
        tanggal: String(rawRow.tanggal || "").trim(),
        jam_in: String(rawRow.jam_in || "").trim(),
        jam_out: String(rawRow.jam_out || "").trim(),
        data_pembanding: String(rawRow.data_pembanding || "").trim(),
        costumer: String(rawRow.costumer || "").trim(),
        model: String(rawRow.model || "").trim(),
        part_number: String(rawRow.part_number || "").trim(),
        pic: String(rawRow.pic || "").trim(),
        remark: String(rawRow.remark || "").trim(),
        operator: String(rawRow.operator || "").trim(),
      }));

      // Guard: Ensure no leading phantom blank row at index 0
      while (rawRowsFromBackend.length > 0 && isPhantomBlankRow(rawRowsFromBackend[0])) {
        console.log("[CLIENT] Stripped phantom leading blank row at index 0");
        rawRowsFromBackend.shift();
      }

      // Store unaltered raw OCR for exact comparison & zero mutation baseline
      setRawAiResult(rawRowsFromBackend);

      // 2. APPLY MODULAR POST-PROCESSING LAYERS (DETERMINISTIC PIPELINE)
      // Pipeline: RAW OCR -> DATA PEMBANDING -> DITTO -> PIC -> REMARK -> MASTER MATCH -> FINAL
      const { rows, timeMeta, debugTraces: clientTraces } = applyModularLayersClient(
        rawRowsFromBackend,
        activeLayers,
        lockedPics,
        ignorePersistentMemory ? undefined : memory.rules,
        masterCatalog,
        new Set(),
        ignorePersistentMemory ? [] : memory.manualCorrections
      );
      setScanResult(rows);
      setTimeMetadata(timeMeta);
      setDebugTraces(resData.debugTraces && resData.debugTraces.length > 0 ? resData.debugTraces : clientTraces);

      const tsvH = "TANGGAL\tJAM_IN\tJAM_OUT\tDATA_PEMBANDING\tCOSTUMER\tMODEL\tPART_NUMBER\tPIC\tREMARK\tOPERATOR";
      const tsvB = rows.map((r) => [r.tanggal, r.jam_in, r.jam_out, r.data_pembanding, r.costumer, r.model, r.part_number, r.pic, r.remark, r.operator].join("\t")).join("\n");
      setTsvString(tsvH + "\n" + tsvB);

      // Count normalized data_pembanding cells
      const normalizedCount = rows.filter((r, idx) => r.data_pembanding !== rawRowsFromBackend[idx]?.data_pembanding).length;
      setAutoCorrectedCount(normalizedCount);

      const calculatedConfidences = evaluateAllRowsConfidence(
        rows,
        resData.confidences || undefined,
        memory.vocabulary
      );
      setConfidences(calculatedConfidences);

      setScanCount((prev) => prev + 1);
      soundManager.playChime();

      const isDataPembandingOnly = activeLayers.dataPembanding && !activeLayers.pic && !activeLayers.remark && !activeLayers.ditto && !activeLayers.timeRecon && !activeLayers.memory;
      addToast(
        "success",
        isDataPembandingOnly
          ? "Scan Selesai: Layer Data Pembanding Aktif"
          : "Scan Logbook Berhasil",
        isDataPembandingOnly
          ? `Berhasil mengekstrak ${rawRowsFromBackend.length} baris (Data Pembanding dinormalisasi 6 digit, semua kolom lain murni raw OCR).`
          : `Berhasil mengekstrak ${rawRowsFromBackend.length} baris.`
      );
    } catch (error: any) {
      addToast(
        "error",
        "Gagal Memindai",
        error.message || "Terjadi kesalahan saat memproses gambar logbook."
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Editable Table Cell Handler - PRESERVE EXACT USER INPUT WHILE EDITING
  const handleCellEdit = (rowIndex: number, field: keyof ParsedData, val: string) => {
    // Record that this cell was manually edited by user (MANUAL > MASTER MATCH > RAW OCR)
    setManualEditedKeys((prev) => {
      const next = new Set(prev);
      next.add(`${rowIndex}:${field}`);
      return next;
    });

    setScanResult((prev) => {
      if (!prev) return prev;
      const copy = [...prev];
      // Manual editing is the absolute source of truth.
      // Store exact character-by-character string. NO trim(), NO re-normalization during typing!
      copy[rowIndex] = { ...copy[rowIndex], [field]: val };
      return copy;
    });

    if (field === "jam_in" || field === "jam_out") {
      setTimeMetadata((prev) => {
        const copy = [...prev];
        const rowMeta = copy[rowIndex] || {};
        copy[rowIndex] = {
          ...rowMeta,
          [field]: {
            rawScannedTime: rowMeta[field]?.rawScannedTime || null,
            finalTime: val,
            timeSource: "manual" as const,
          },
        };
        return copy;
      });
    }
  };

  // Add / Delete Row
  const handleAddRow = () => {
    soundManager.playClick();
    const emptyRow: ParsedData = {
      tanggal: scanResult && scanResult[0] ? scanResult[0].tanggal : "",
      jam_in: "",
      jam_out: "",
      data_pembanding: "",
      costumer: scanResult && scanResult[0] ? scanResult[0].costumer : "",
      model: scanResult && scanResult[0] ? scanResult[0].model : "",
      part_number: "",
      pic: scanResult && scanResult[0] ? scanResult[0].pic : lockedPics[0] || "",
      remark: "",
      operator: scanResult && scanResult[0] ? scanResult[0].operator : "",
    };
    setScanResult((prev) => (prev ? [...prev, emptyRow] : [emptyRow]));
    addToast("info", "Baris Ditambahkan", "Satu baris baru berhasil ditambahkan di akhir tabel.");
  };

  const handleDeleteRow = (rowIndex: number) => {
    soundManager.playClick();
    setScanResult((prev) => (prev ? prev.filter((_, idx) => idx !== rowIndex) : null));
    addToast("info", "Baris Dihapus", `Baris ke-${rowIndex + 1} berhasil dihapus.`);
  };

  // Batch update & batch delete for Bulk Edit mode
  const handleBatchUpdate = (rowIndices: number[], updates: Partial<ParsedData>) => {
    if (rowIndices.length === 0) return;
    soundManager.playClick();

    const sanitizedUpdates = { ...updates };
    if (sanitizedUpdates.data_pembanding) {
      sanitizedUpdates.data_pembanding = cleanDataPembandingClient(sanitizedUpdates.data_pembanding);
    }
    if (sanitizedUpdates.pic && isPicRosterLocked) {
      sanitizedUpdates.pic = normalizePicClient(sanitizedUpdates.pic, lockedPics);
    }

    setScanResult((prev) => {
      if (!prev) return prev;
      const copy = [...prev];
      rowIndices.forEach((idx) => {
        if (copy[idx]) {
          copy[idx] = { ...copy[idx], ...sanitizedUpdates };
        }
      });
      return copy;
    });

    const fieldNames = Object.keys(sanitizedUpdates)
      .map((k) => k.toUpperCase())
      .join(", ");
    addToast(
      "success",
      "Bulk Edit Berhasil",
      `Berhasil memperbarui kolom ${fieldNames} pada ${rowIndices.length} baris terpilih.`
    );
  };

  const handleBatchDelete = (rowIndices: number[]) => {
    if (rowIndices.length === 0) return;
    soundManager.playClick();
    const indexSet = new Set(rowIndices);
    setScanResult((prev) => {
      if (!prev) return prev;
      return prev.filter((_, idx) => !indexSet.has(idx));
    });
    addToast(
      "info",
      "Baris Dihapus",
      `${rowIndices.length} baris terpilih berhasil dihapus dari tabel.`
    );
  };

  // Tracking Edited Cells against Raw AI Result
  // Strictly filter for cells MANUALLY edited by user (Auto-corrections are NEVER counted as user feedback!)
  const editedDiffList: CellDiff[] = useMemo(() => {
    if (!scanResult || !rawAiResult) return [];
    const diffs: CellDiff[] = [];
    // Deterministic fields (data_pembanding, jam_in, jam_out, remark) are excluded from learning
    const fields: (keyof ParsedData)[] = [
      "costumer",
      "model",
      "part_number",
      "pic",
      "operator",
    ];

    scanResult.forEach((row, rIdx) => {
      const rawRow = rawAiResult[rIdx];
      if (!rawRow) return;
      fields.forEach((f) => {
        // Crucial: Only consider cells where user explicitly made a manual edit
        if (!manualEditedKeys.has(`${rIdx}:${f}`)) return;

        const oVal = String(rawRow[f] || "").trim().toUpperCase();
        const nVal = String(row[f] || "").trim().toUpperCase();
        if (oVal !== nVal && nVal !== "") {
          diffs.push({ rowIndex: rIdx, field: f, oldVal: oVal, newVal: nVal });
        }
      });
    });
    return diffs;
  }, [scanResult, rawAiResult, manualEditedKeys]);

  // Learn and Save Corrections into Memory (Visual Evidence + Safe Deduplicated Store)
  const learnAndSaveCorrections = async (showAlert: boolean = true) => {
    if (!scanResult || !rawAiResult) return 0;

    // Diagnostic Mode Guard: Never pollute or mutate memory when in PURE RAW OCR or Bypass Memory mode
    if (pureRawOcr || ignorePersistentMemory) {
      if (showAlert) {
        addToast(
          "info",
          "Bypass Memory Aktif",
          "Perekaman ke Memori dinonaktifkan selama mode PURE RAW OCR atau Bypass Memory aktif."
        );
      }
      return 0;
    }

    let learnedCount = 0;
    const currentRules = [...memory.rules];
    const currentVocab = { ...memory.vocabulary };
    const currentVisualSamples = Array.isArray(memory.visualSamples) ? [...memory.visualSamples] : [];
    let currentManualCorrections = Array.isArray(memory.manualCorrections) ? [...memory.manualCorrections] : [];

    for (const diff of editedDiffList) {
      const { field, oldVal, newVal, rowIndex } = diff;
      if (!oldVal || !newVal || oldVal === newVal) continue;

      if (field === "pic") {
        if (oldVal === "NAZAR" && (newVal === "NAZARAR" || newVal === "NAZARR")) continue;
        if (newVal === "NAZARAR" || newVal === "NAZARR") continue;
      }

      // 1. Vocabulary expansion
      const vocabKey = field as keyof typeof currentVocab;
      if (currentVocab[vocabKey] && !currentVocab[vocabKey].includes(newVal)) {
        currentVocab[vocabKey] = [newVal, ...currentVocab[vocabKey]].slice(0, 50);
      }

      // 2. Crop handwriting snippet from the image
      let imageCrop = "";
      const rowBbox = detectedRowBboxes[rowIndex];
      if (imagePreview) {
        try {
          imageCrop = await cropCellHandwritingSnippet(
            imagePreview,
            rowIndex,
            scanResult.length,
            field,
            rowBbox
          );
        } catch (e) {
          console.warn("Could not crop cell handwriting snippet:", e);
        }
      }

      // 3. Evidence-Based OCR Memory (Field-Aware, Confidence-Weighted)
      const targetRow = scanResult[rowIndex];
      const { updatedEntries } = recordManualCorrection(currentManualCorrections, {
        field,
        rawOCRValue: oldVal,
        postProcessedValue: targetRow[field],
        manualCorrectedValue: newVal,
        rowContext: {
          customer: targetRow.costumer,
          model: targetRow.model,
          partNumber: targetRow.part_number,
          pic: targetRow.pic,
          operator: targetRow.operator,
        },
        imageCrop,
        bbox: rowBbox,
      });
      currentManualCorrections = updatedEntries;
      learnedCount++;

      // 4. Visual Samples: increment sampleCount if pattern already exists or create new
      const existingVisualIdx = currentVisualSamples.findIndex(
        (s) => s.field === field && s.ocrPrediction === oldVal && s.userCorrection === newVal
      );

      if (existingVisualIdx >= 0) {
        currentVisualSamples[existingVisualIdx] = {
          ...currentVisualSamples[existingVisualIdx],
          sampleCount: (currentVisualSamples[existingVisualIdx].sampleCount || 1) + 1,
          lastUsedAt: Date.now(),
          imageCrop: imageCrop || currentVisualSamples[existingVisualIdx].imageCrop,
          bbox: rowBbox || currentVisualSamples[existingVisualIdx].bbox,
        };
      } else {
        currentVisualSamples.unshift({
          id: `vsample-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          field,
          ocrPrediction: oldVal,
          userCorrection: newVal,
          imageCrop,
          bbox: rowBbox,
          sampleCount: 1,
          createdAt: Date.now(),
          lastUsedAt: Date.now(),
        });
      }
    }

    if (learnedCount > 0) {
      const updatedMem: AiMemory = {
        rules: currentRules,
        vocabulary: currentVocab,
        visualSamples: currentVisualSamples.slice(0, 50),
        manualCorrections: currentManualCorrections.slice(0, 100),
        totalLearnedCount: (memory.totalLearnedCount || 0) + learnedCount,
      };
      saveMemoryToStorage(updatedMem);
      setRawAiResult(JSON.parse(JSON.stringify(scanResult)));
      setManualEditedKeys(new Set()); // Reset manual flags after saving to memory
      soundManager.playChime();

      if (showAlert) {
        addToast(
          "success",
          "Memori Koreksi Diperbarui",
          `${learnedCount} koreksi manual berhasil disimpan sebagai bukti pendukung untuk scan berikutnya.`
        );
      }
      return learnedCount;
    } else {
      if (showAlert) {
        addToast(
          "info",
          "Tidak Ada Koreksi Manual Baru",
          "Belum ada sel yang diedit secara manual untuk disimpan ke memori."
        );
      }
      return 0;
    }
  };

  // Copy to Excel with exact TSV spacing format
  const copyTableToExcel = () => {
    if (!scanResult || scanResult.length === 0) {
      addToast("error", "Data Kosong", "Tidak ada data yang dapat disalin.");
      return;
    }

    void learnAndSaveCorrections(false);

    const rows = scanResult.map((item) => {
      return [
        "", // Kolom Tanggal dikosongkan untuk template Excel pengguna
        item.jam_in || "",
        item.jam_out || "",
        item.data_pembanding || "",
        item.costumer || "",
        item.model || "",
        item.part_number || "",
        item.pic || "",
        "", // Kosong 1
        "", // Kosong 2
        item.remark || "",
        item.operator || "",
      ].join("\t");
    });

    const tsvContent = rows.join("\n");

    const notifySuccess = () => {
      soundManager.playChime();
      addToast(
        "success",
        "Berhasil Disalin ke Clipboard!",
        `${scanResult.length} baris siap dipaste langsung ke Excel (Ctrl+V). Kolom tanggal telah disesuaikan.`
      );
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(tsvContent)
        .then(notifySuccess)
        .catch(() => {
          // Fallback
          const ta = document.createElement("textarea");
          ta.value = tsvContent;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          notifySuccess();
        });
    } else {
      const ta = document.createElement("textarea");
      ta.value = tsvContent;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      notifySuccess();
    }
  };

  const handleResetDefaultMemory = () => {
    if (window.confirm("Apakah Anda yakin ingin menghapus memori pembelajaran koreksi OCR? (Master catalog, PIC resmi, dan setelan aplikasi tidak akan terhapus).")) {
      const resetMem: AiMemory = {
        rules: DEFAULT_RULES,
        vocabulary: DEFAULT_VOCABULARY,
        visualSamples: [],
        manualCorrections: [],
        totalLearnedCount: 0,
      };
      saveMemoryToStorage(resetMem);
      addToast("info", "Memori Koreksi Direset", "Memori pembelajaran OCR telah dibersihkan. Master catalog dan PIC resmi tetap aman.");
    }
  };

  return (
    <div className="flex flex-col min-h-screen w-full bg-slate-100 text-slate-900 antialiased selection:bg-slate-700 selection:text-white">
      {/* Top Navbar Toolbar */}
      <Navbar
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        activeModel={activeModel}
        quotaPercent={quotaPercent}
        memoryRuleCount={memory.rules.length}
        onOpenMemoryModal={() => setIsMemoryModalOpen(true)}
        onOpenFormatGuide={() => setIsFormatGuideOpen(true)}
        themeConfig={themeConfig}
        lockedPicCount={lockedPics.length}
        isPicLocked={isPicRosterLocked}
        onOpenPicRosterModal={() => setIsPicRosterModalOpen(true)}
        masterCatalogCount={masterCatalog.length}
        onOpenMasterCatalogModal={() => setIsMasterCatalogModalOpen(true)}
        ocrEngine={ocrEngine}
        memoryActive={!pureRawOcr && !ignorePersistentMemory && activeLayers.memory}
        isDiagnosticsOpen={isDiagnosticsOpen}
        onToggleDiagnostics={() => setIsDiagnosticsOpen((prev) => !prev)}
      />

      {/* Diagnostic Baseline & Modular Layer Isolation Bar (Hidden by default, zero vertical space when closed) */}
      <DiagnosticControlBar
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
        pureRawOcr={pureRawOcr}
        onTogglePureRawOcr={handleTogglePureRawOcr}
        ignorePersistentMemory={ignorePersistentMemory}
        onToggleIgnoreMemory={handleToggleIgnoreMemory}
        layers={activeLayers}
        onLayersChange={handleLayersChange}
        diagnosticLog={diagnosticLog}
        hasScanResult={Boolean(rawAiResult && rawAiResult.length > 0)}
        onReapplyLayers={handleReapplyLayers}
        ocrEngine={ocrEngine}
        onApplyPreset={handleApplyPreset}
      />

      {/* Main Desktop Workspace: Side-by-Side Left Panel (Upload & Preprocessing) and Right Panel (TSV & Table Results) */}
      <main className="w-full max-w-full px-4 lg:px-6 py-3 flex-1 flex flex-col min-h-0">
        <div className="flex-1 grid grid-cols-12 gap-4 items-stretch min-h-[640px]">
          {/* Panel Kiri (Lembar Logbook: Upload & Preview) */}
          {!isTableExpanded && (
            <div className="col-span-12 lg:col-span-4 xl:col-span-3 2xl:col-span-3 flex flex-col h-full min-w-0 transition-all duration-200">
              <UploadSection
                imagePreview={imagePreview}
                base64Data={base64Data}
                isLoading={isLoading}
                ocrEngine={ocrEngine}
                onOcrEngineChange={handleOcrEngineChange}
                onFileSelected={() => {}}
                onProcessedImageReady={handleProcessedImageReady}
                onScan={handleScan}
                onClearImage={handleClearImage}
                onTriggerToast={addToast}
              />
            </div>
          )}

          {/* Panel Kanan (Hasil Ekstraksi TSV & Tabel Interaktif: Diberi Ruang Maksimal) */}
          <div
            className={`col-span-12 flex flex-col h-full min-w-0 transition-all duration-200 ${
              isTableExpanded
                ? "lg:col-span-12"
                : "lg:col-span-8 xl:col-span-9 2xl:col-span-9"
            }`}
          >
            {isLoading ? (
              <LoadingOverlay modelName={ocrEngine === "mistral" ? "Mistral Document AI OCR (mistral-ocr-latest)" : selectedModel} />
            ) : (
              <TableSection
                scanResult={scanResult || []}
                rawAiResult={rawAiResult}
                tsvString={tsvString}
                uncertaintyNotes={uncertaintyNotes}
                imageQualityStatus={imageQualityStatus}
                rejectionReason={rejectionReason}
                confidences={confidences}
                editedDiffList={editedDiffList}
                autoCorrectedCount={autoCorrectedCount}
                availablePics={lockedPics}
                availableRemarks={memory.vocabulary?.remark || []}
                lockedPics={lockedPics}
                isPicLocked={isPicRosterLocked}
                themeConfig={themeConfig}
                isExpanded={isTableExpanded}
                debugTracesCount={debugTraces.length}
                onOpenDebugModal={() => setIsDebugModalOpen(true)}
                onToggleExpand={() => setIsTableExpanded((prev) => !prev)}
                onOpenPicRosterModal={() => setIsPicRosterModalOpen(true)}
                onCellEdit={handleCellEdit}
                onBatchUpdate={handleBatchUpdate}
                onBatchDelete={handleBatchDelete}
                onAddRow={handleAddRow}
                onDeleteRow={handleDeleteRow}
                onCopyExcel={copyTableToExcel}
                onSaveMemory={() => learnAndSaveCorrections(true)}
                onOpenMemoryModal={() => setIsMemoryModalOpen(true)}
                onOpenFormatGuide={() => setIsFormatGuideOpen(true)}
              />
            )}
          </div>
        </div>
      </main>

      {/* Single-line Quiet Desktop Footer */}
      <footer className="border-t border-slate-200 bg-white px-5 py-2.5 text-xs text-slate-500 shrink-0">
        <div className="w-full max-w-full flex items-center justify-between gap-4">
          <p>Auto-Scan Logbook &bull; Ekstraksi presisi tulisan tangan &bull; Format TSV untuk Microsoft Excel & Google Sheets</p>
          <p className="font-mono text-[11px] text-slate-400">Model: {selectedModel} &bull; Anti-Halusinasi</p>
        </div>
      </footer>

      {/* Modals & Overlays */}
      <MemoryModal
        isOpen={isMemoryModalOpen}
        memory={memory}
        onClose={() => setIsMemoryModalOpen(false)}
        onSaveMemory={saveMemoryToStorage}
        onResetDefault={handleResetDefaultMemory}
        onTriggerToast={addToast}
        onOpenPicRosterModal={() => setIsPicRosterModalOpen(true)}
      />

      <DebugModal
        isOpen={isDebugModalOpen}
        onClose={() => setIsDebugModalOpen(false)}
        debugTraces={debugTraces}
      />

      <PicRosterModal
        isOpen={isPicRosterModalOpen}
        onClose={() => setIsPicRosterModalOpen(false)}
        currentRoster={lockedPics}
        isLocked={isPicRosterLocked}
        onUpdateRoster={handleUpdatePicRoster}
        onTriggerToast={addToast}
      />

      <ExcelGuideModal
        isOpen={isFormatGuideOpen}
        onClose={() => setIsFormatGuideOpen(false)}
      />

      <MasterCatalogModal
        isOpen={isMasterCatalogModalOpen}
        onClose={() => setIsMasterCatalogModalOpen(false)}
        masterCatalog={masterCatalog}
        onUpdateMasterCatalog={handleUpdateMasterCatalog}
      />

      {/* Toast Notification Container */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
