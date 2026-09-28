export type ConfidenceLevel = "high" | "medium" | "low";

export interface ParsedData {
  tanggal: string;
  jam_in: string;
  jam_out: string;
  data_pembanding: string;
  costumer: string;
  model: string;
  part_number: string;
  pic: string;
  remark: string;
  operator: string;
}

export interface RowConfidence {
  tanggal?: ConfidenceLevel;
  jam_in?: ConfidenceLevel;
  jam_out?: ConfidenceLevel;
  data_pembanding?: ConfidenceLevel;
  costumer?: ConfidenceLevel;
  model?: ConfidenceLevel;
  part_number?: ConfidenceLevel;
  pic?: ConfidenceLevel;
  remark?: ConfidenceLevel;
  operator?: ConfidenceLevel;
}

export interface CorrectionRule {
  id: string;
  field: keyof ParsedData;
  wrong: string;
  correct: string;
  createdAt?: number;
  usageCount?: number;
}

export interface VisualCorrectionSample {
  id: string;
  field: keyof ParsedData;
  ocrPrediction: string;
  userCorrection: string;
  imageCrop?: string; // Base64 data URL thumbnail of the handwriting
  bbox?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000
  contextBefore?: string;
  contextAfter?: string;
  ocrConfidence?: number;
  sampleCount: number; // Frequency of confirmation
  createdAt: number;
  lastUsedAt?: number;
}

export interface DecisionDebugTrace {
  row: number; // 1-based row index
  field: string;
  ocrOriginal: string;
  ocrConfidence?: string | number;
  memoryCandidate?: string;
  visualSimilarity?: string | number;
  memoryConfidence?: string | number;
  contextConfidence?: string | number;
  final: string;
  reason: string;
  correctionSource?: string;
}

import { OcrMemoryEntry } from "./utils/ocrMemory";

export interface AiMemory {
  rules: CorrectionRule[];
  vocabulary: {
    costumer: string[];
    model: string[];
    pic: string[];
    remark: string[];
    operator: string[];
  };
  visualSamples?: VisualCorrectionSample[];
  manualCorrections?: OcrMemoryEntry[];
  totalLearnedCount?: number;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
}

export interface CellDiff {
  rowIndex: number;
  field: keyof ParsedData;
  oldVal: string;
  newVal: string;
}

export interface UncertaintyNote {
  row: number; // 1-based row index
  field: string;
  value: string;
  reason: string;
}

export type TimeSource = "ocr" | "estimated" | "manual";

export interface TimeMetadata {
  rawScannedTime: string | null;
  finalTime: string;
  timeSource: TimeSource;
}

export interface RowTimeMetadata {
  jam_in?: TimeMetadata;
  jam_out?: TimeMetadata;
}

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
}

export interface DetectedRow {
  rowIndex: number;
  y1: number;
  y2: number;
  height: number;
  dataPembandingBox: BoundingBox;
}

export interface TableStructureResult {
  imageWidth: number;
  imageHeight: number;
  tableBox: BoundingBox;
  rowCount: number;
  columnCount: number;
  dataPembandingColumn: {
    x1: number;
    x2: number;
    width: number;
  };
  rows: DetectedRow[];
}

export type OcrEngine = "gemini" | "mistral";

export interface MistralDebugInfo {
  ocrEngine: "mistral";
  model: string;
  requestSuccess: boolean;
  rawResponseLength: number;
  parsedRowCount: number;
  pageCount?: number;
  tableCount?: number;
  finalRowCount?: number;
  rawTablePreview?: string;
  originalImage?: { width: number; height: number };
  sentImage?: { width: number; height: number };
  error?: string;
}

export interface ScanResponse {
  status: "success" | "rejected";
  rejectionReason?: string;
  data: ParsedData[];
  rawOcr?: ParsedData[];
  ocrEngine?: OcrEngine;
  mistralDebug?: MistralDebugInfo;
  rawMistralMarkdown?: string;
  tsv?: string;
  pureRawOcr?: boolean;
  tableStructure?: TableStructureResult;
  uncertaintyNotes?: UncertaintyNote[];
  debugTraces?: DecisionDebugTrace[];
  rowBboxes?: [number, number, number, number][];
  usedModel?: string;
  timeMetadata?: RowTimeMetadata[];
  confidences?: RowConfidence[];
  diagnosticLog?: {
    ocrEngine?: OcrEngine;
    mistralDebug?: MistralDebugInfo;
    modelName: string;
    temperature: number;
    topP: number;
    systemInstruction: string;
    ocrPrompt: string;
    chatHistoryLength: number;
    previousOcrResultsSent: number;
    memoryItemsSent: number;
    masterDataSent: number;
    postProcessingEnabled: string;
    imageResolution: string;
    imageSize: string;
    tableStructureSummary?: {
      imageWidth: number;
      imageHeight: number;
      rowCount: number;
      columnCount: number;
      dataPembandingColumn: {
        x1: number;
        x2: number;
        width: number;
      };
    };
  };
}

export interface PostProcessingLayers {
  dataPembanding: boolean;
  pic: boolean;
  remark: boolean;
  ditto: boolean;
  timeRecon: boolean;
  masterMatch?: boolean;
  memory: boolean;
}

export const DIAGNOSTIC_STORAGE_KEY = "diagnostic_postprocessing_state";
export const OCR_ENGINE_STORAGE_KEY = "preferred_ocr_engine";

export interface DiagnosticPersistentState {
  dataPembanding: boolean;
  pic: boolean;
  remark: boolean;
  ditto: boolean;
  masterMatch: boolean;
  timeRecon: boolean;
  memory: boolean;
  activeLayer: number;
  pureRawOcr: boolean;
  bypassMemory: boolean;
}

export const DEFAULT_DIAGNOSTIC_STATE: DiagnosticPersistentState = {
  dataPembanding: true,
  pic: true,
  remark: true,
  ditto: true,
  masterMatch: true,
  timeRecon: true,
  memory: true,
  activeLayer: 8,
  pureRawOcr: false,
  bypassMemory: false,
};

