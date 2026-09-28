import { CorrectionRule } from "./types";

export const STORAGE_KEY = "logbook_ai_memory_v2";
export const LOCKED_PIC_STORAGE_KEY = "logbook_locked_pic_roster_v2";
export const MASTER_CATALOG_STORAGE_KEY = "logbook_master_catalog_v1";

// Official locked PIC members as explicitly specified by user:
// NAZAR, NENDI, ANGGI, HERY, REDI, ROHALIA, GENDHIS, VALLEAS
export const DEFAULT_LOCKED_PICS: string[] = [
  "NAZAR",
  "NENDI",
  "ANGGI",
  "HERY",
  "REDI",
  "ROHALIA",
  "GENDHIS",
  "VALLEAS",
];

// Memory correction rules should NOT overwrite OCR visual readings:
export const DEFAULT_RULES: CorrectionRule[] = [];

export const DEFAULT_VOCABULARY = {
  costumer: ["EPSON", "YIMM", "PT EPSON", "PT YIMM", "YIMM LB", "YIMM WJ", "ADM-KAP", "ADM-SAP", "HPM", "SIM", "MMKI"],
  model: ["SN:", "LB", "EPSON", "YAMAHA", "B65", "2DP", "B8R", "B74", "D26A", "D03B"],
  pic: DEFAULT_LOCKED_PICS,
  remark: ["ROLL 1", "ROLL 2", "ROLL 3", "ROLL 4", "ACC", "WAITING", "130/5", "SAMPLE", "MASS PRO", "TRIAL"],
  operator: ["RUDI", "AHMAD", "FARCHAN", "FEBRI", "FIKRI", "OPERATOR 1", "OPERATOR 2"],
};

export const AVAILABLE_MODELS = [
  { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", badge: "Default Cepat & Cerdas", recommended: true },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", badge: "Cepat & Stabil", recommended: false },
  { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite", badge: "Hemat Kuota & Ringan", recommended: false },
  { id: "gemini-flash-latest", name: "Gemini Flash Latest", badge: "Versi Terkini", recommended: false },
  { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview", badge: "Pro / Paid Key", recommended: false },
];
