import express from "express";
import path from "path";
import sharp from "sharp";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { detectTableStructure } from "./src/utils/tableDetector";
import { matchPicToOfficialRoster } from "./src/utils/picMatcher";
import { normalizeDataPembanding } from "./src/utils/dataPembanding";
import { normalizeRemark } from "./src/utils/remarkParser";
import { resolveDittoMarks } from "./src/utils/dittoResolver";
import { reconstructRowTimes } from "./src/utils/timeReconstructor";
import { callMistralOcr, isPhantomBlankRow } from "./src/utils/mistralOcr";
import { matchMasterRecord } from "./src/utils/masterMatcher";
import { DEFAULT_MASTER_RECORDS, MasterRecord } from "./src/utils/masterCatalog";
import { applyMemorySupportLayer } from "./src/utils/ocrMemory";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

// Lazy initialization of Gemini API client
let aiClient: GoogleGenAI | null = null;
function getAi(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
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

function normalizeSinglePic(val: string, roster: string[], onDetail?: (detail: any) => void): string {
  let p = (val || "").trim().toUpperCase();
  if (!p) return "";
  // Strip leading/trailing punctuation (dots, quotes, dashes)
  p = p.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, "");
  if (!p) return "";

  // Official PIC roster fuzzy matching ("closed vocabulary" - "mendekati langsung tembak")
  return matchPicToOfficialRoster(p, roster, onDetail);
}

function normalizePicToRoster(rawPic: string, roster: string[], onDetail?: (detail: any) => void): string {
  const p = (rawPic || "").trim().toUpperCase();
  if (!p) return "";

  // TIDAK MUNGKIN ADA 2 PERSONIL DALAM SATU BARIS: Ambil 1 nama personil tunggal
  if (p.includes("/") || p.includes(",") || p.includes("\n")) {
    const parts = p.split(/[\/,\n]+/).map((part) => normalizeSinglePic(part, roster, onDetail)).filter(Boolean);
    return parts[0] || "";
  }

  return normalizeSinglePic(p, roster, onDetail);
}

function cleanDataPembanding(rawVal: string): string {
  return normalizeDataPembanding(rawVal);
}

app.post("/api/test-mistral", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const apiKey = (authHeader.replace(/^Bearer\s+/i, "") || req.body?.apiKey || "").trim();
    if (!apiKey) {
      return res.status(400).json({ status: "empty", message: "Mistral API Key belum diisi." });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch("https://api.mistral.ai/v1/models", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.status === 200) {
        return res.json({ status: "connected", message: "Connected" });
      } else if (response.status === 401 || response.status === 403) {
        return res.status(401).json({ status: "invalid", message: "Mistral API Key tidak valid." });
      } else if (response.status === 429) {
        return res.status(429).json({ status: "rate_limit", message: "Mistral API rate limit tercapai." });
      } else {
        return res.status(500).json({ status: "failed", message: "Gagal terhubung ke Mistral API." });
      }
    } catch {
      clearTimeout(timeout);
      return res.status(500).json({ status: "failed", message: "Gagal terhubung ke Mistral API." });
    }
  } catch {
    return res.status(500).json({ status: "failed", message: "Gagal terhubung ke Mistral API." });
  }
});

app.post("/api/scan", async (req, res) => {
  try {
    const {
      base64Data,
      mimeType,
      engine = "gemini",
      model = "gemini-3.8-flash",
      memory,
      picRoster,
      pureRawOcr = true, // DIAGNOSTIC MODE: Default to PURE RAW OCR
      ignorePersistentMemory = true,
      layers,
      enableMemory = false,
      enableNormalization = false,
      enableFieldContext = false,
      imageResolution,
      masterCatalog: clientMasterCatalog,
    } = req.body;
    if (!base64Data || !mimeType) {
      return res.status(400).json({ error: "No image provided" });
    }

    const isPureRawOcr = Boolean(pureRawOcr);
    const shouldIgnoreMemory = isPureRawOcr || Boolean(ignorePersistentMemory);

    const imageBuffer = Buffer.from(base64Data, "base64");
    const tableStructure = await detectTableStructure(imageBuffer);

    // Official locked PIC members (defaults to the 8 official members specified by user)
    const officialPicList: string[] =
      Array.isArray(picRoster) && picRoster.length > 0
        ? picRoster.map((n: string) => String(n).trim().toUpperCase())
        : ["NAZAR", "NENDI", "ANGGI", "HERY", "REDI", "ROHALIA", "GENDHIS", "VALLEAS"];

    // Process Visual Learning Samples (Handwriting crops confirmed by user)
    const visualSamples = (!shouldIgnoreMemory && enableMemory && Array.isArray(memory?.visualSamples))
      ? memory.visualSamples
      : [];
    const validVisualSamples = visualSamples
      .filter((s: any) => s && s.imageCrop && typeof s.imageCrop === "string" && s.imageCrop.includes(","))
      .slice(0, 8); // Top relevant visual handwriting samples

    let visualSamplesPrompt = "";
    if (validVisualSamples.length > 0 && !isPureRawOcr) {
      visualSamplesPrompt = `\n\n========================================================================
SAMPEL PEMBELAJARAN VISUAL TULISAN TANGAN TERKONFIRMASI (VISUAL OCR MEMORY):
========================================================================
Input Gambar 1 adalah DOKUMEN LOGBOOK UTAMA yang wajib diekstrak.
Gambar berikutnya (Gambar 2 s.d. ${validVisualSamples.length + 1}) adalah SAMPEL VISUAL POTONGAN TULISAN TANGAN yang pernah dikoreksi pengguna:
${validVisualSamples.map((s: any, idx: number) => `  - Sampel ${idx + 1} (Gambar ${idx + 2}): Bentuk tulisan tangan terkonfirmasi bernilai "${s.userCorrection}" pada kolom "${s.field}". (Sebelumnya pernah terbaca keliru sebagai "${s.ocrPrediction}", frekuensi konfirmasi: ${s.sampleCount || 1}x).`).join("\n")}

PROTOKOL PENGAMBILAN KEPUTUSAN BERBOBOT (WEIGHTED DECISION EVIDENCE):
1. BUKTI VISUAL DOKUMEN ADALAH SINYAL TERKUAT (PRIMARY SIGNAL):
   - Jika tulisan pada dokumen utama terbaca jelas (OCR Confidence > 80%): GUNAKAN HASIL BACAAN VISUAL ASLI DOKUMEN TERSEBUT!
   - DILARANG melakukan global text replacement (contoh: JANGAN otomatis ubah 'm' menjadi 'n' untuk semua kemunculan 'm').
2. BUKTI MEMORI VISUAL HANYA SEBAGAI SINYAL PENDUKUNG (SUPPORTING SIGNAL):
   - HANYA pertimbangkan sampel memori jika tulisan pada dokumen ambigu, pudar, atau berkeyakinan rendah ([TIDAK_TERBACA]).
   - Jika bentuk fisik guratan tinta pada dokumen SANGAT MIRIP (>80% kemiripan visual) dengan sampel terkonfirmasi: Anda boleh mengadopsi karakter tersebut.
   - Jika bentuk guratan berbeda atau Anda yakin dengan bacaan OCR: TETAP PERTAHANKAN BACAAN OCR ASLI!
3. Catat setiap sel yang dievaluasi dengan visual memory ke dalam array 'debugTraces'.`;
    }

    // Vocabulary reference (for domain terminology only)
    let vocabPrompt = "";
    let vocabItemCount = 0;
    if (!isPureRawOcr && enableFieldContext && !shouldIgnoreMemory && memory?.vocabulary) {
      const { vocabulary } = memory;
      const vocabParts = [];
      if (vocabulary.costumer?.length) vocabParts.push(`Customer: ${vocabulary.costumer.slice(0, 15).join(", ")}`);
      if (vocabulary.model?.length) vocabParts.push(`Model: ${vocabulary.model.slice(0, 20).join(", ")}`);
      if (vocabulary.part_number?.length) vocabParts.push(`Part Number: ${vocabulary.part_number.slice(0, 25).join(", ")}`);
      vocabParts.push(`PIC resmi: ${officialPicList.join(", ")} (Pasangan shift: NENDI-ANGGI, NAZAR-VALLEAS)`);
      vocabItemCount = vocabParts.length;
      vocabPrompt = `\n\n* Kosakata resmi pabrik (hanya sebagai referensi nama valid):\n  ${vocabParts.join("\n  ")}`;
    }

    // ========================================================================
    // OCR SYSTEM INSTRUCTION & PROMPT (STRICT VERBATIM TRANSCRIBER)
    // ========================================================================
    const rawOcrSystemInstruction = `You are a literal, non-generative Optical Character Recognition (OCR) engine.
Your sole function is verbatim visual character transcription of visible ink on the page.
CRITICAL MANDATES:
- Transcribe only what is visibly present in the image.
- Do not complete partial words.
- Do not infer likely terminology from manufacturing or printer context (e.g., if you see "MAINTENANCE", output "MAINTENANCE", NEVER "MAINTENANCE BOX"; if you see "TRANSPORTATION", output "TRANSPORTATION", NEVER "TRANSPORTATION LOCK"; if you see "PAPER SIZE", output "PAPER SIZE", NEVER "PAPER SIZE CASSETTE B"; if you see "CAUTION EA1", output "CAUTION EA1", NEVER "CAUTION EA1 TRANSPORTATION").
- Do not expand abbreviations (e.g., if you see "R45", output "R45", NEVER "ROLL 45").
- Do not use semantic knowledge to repair or elongate text.
- Do not copy values from nearby rows.
- Do not infer values from previous rows.
- Do not infer values from previous scans.
- Do not combine text from multiple cells.
- Do not invent unreadable characters.
- Treat every table cell independently during visual recognition.
- If text is uncertain or unreadable, return empty ("") rather than guessing.
- Preserve exactly what is visually supported.`;

    const rawOcrMinimalPrompt = `Transcribe only what is visibly present in the image.

STRUCTURAL TABLE CONSTRAINTS:
- The image contains an industrial logbook table with EXACTLY ${tableStructure.rowCount} physical data rows.
- Output EXACTLY ${tableStructure.rowCount} row objects in the "rows" array (from physical row 1 down to row ${tableStructure.rowCount}).
- Do NOT merge adjacent physical rows.
- Do NOT split one physical row into multiple objects.
- Do NOT add extra rows.
- Treat every physical row independently.

STRICT COLUMN ISOLATION (ZERO COLUMN BLEEDING):
- tanggal: Date from column 1. If blank/unreadable, return "".
- jam_in: Start time from column 2. If blank/unreadable, return "".
- jam_out: End time from column 3. If blank/unreadable, return "".
- data_pembanding: Serial/lot text strictly from column 4 (labeled "DATA PEMBANDING (/)"). NEVER take numbers from column 2/3 (JAM IN/OUT) or column 7 (PART NUMBER). If blank/unreadable, return "".
- costumer: Customer name strictly from column 5. If blank/unreadable, return "".
- model: Model text strictly from column 6. If blank/unreadable, return "".
- part_number: Part number strictly from column 7. NEVER put part numbers into data_pembanding! If blank/unreadable, return "".
- pic: PIC name strictly from column 8. If blank/unreadable, return "".
- remark: Remark text strictly from column 9. Do not expand abbreviations. If blank/unreadable, return "".
- operator: Operator strictly from column 10. If blank/unreadable, return "".

Preserve exactly what is visually supported. Do not invent or copy text between cells or columns.`;

    const complexPromptStr = `SISTEM VISION OCR LOGBOOK INDUSTRI (RECOGNITION FIRST & ZERO HALLUCINATION):
Anda adalah sistem Optical Character Recognition (OCR) spesialis dokumen logbook tulisan tangan manufaktur presisi tinggi.

PRINSIP UTAMA: TRANSCRIBE EXACTLY WHAT IS VISIBLE IN THE IMAGE
1. PENGAMATAN VISUAL MURNI (RECOGNITION FIRST):
   - Transkrip karakter-per-karakter persis seperti apa yang terlihat pada gambar logbook.
   - Jangan pernah menebak, mengarang, atau memaksakan teks yang tidak tertulis di gambar.
   - Pertahankan ejaan, angka, kode part, tanda hubung, dan tanda baca sesuai tulisan tangan.
   - Jika tulisan benar-benar pudar, terpotong, atau tidak dapat dibaca, gunakan string "[TIDAK_TERBACA]".
   - Jika sel kosong (tidak ada tulisan tangan), kosongkan string ("").

2. SPESIFIKASI FIELD LOGBOOK (STRUKTURAL):
   - TANGGAL: Format DD/MM/YY (contoh: 15/08/26). Jika ada tanda kutip ("), salin dari baris atasnya. Jika kosong, kosongkan ("").
   - JAM_IN & JAM_OUT: Format 24 jam HH:MM (contoh: 08:30). Jika tidak tertulis, kosongkan ("").
   - DATA_PEMBANDING: Nomor serial/lot/dokumen utuh. Jika ada 2 nomor lot pada satu kotak, pisahkan dengan " / " (contoh: "917337 / 917338").
   - COSTUMER: Nama customer (contoh: EPSON, YIMM, PT EPSON, PARAGON, TACL, dsb) sesuai yang tertulis di dokumen.
   - MODEL: Nama model lengkap satu baris penuh tanpa terpotong (contoh: ST. BOTTOM BLUE H/F D26A, SN: X6M7/CH, 2DP, B65).
   - PART_NUMBER: Kode part lengkap satu baris penuh tanpa terpotong (contoh: PT1000007, V6H1970, 1979-00).
   - PIC: Tulis nama 1 personil PIC yang tertulis di gambar per baris.
     Konteks kerja shift: personil biasanya berpasangan (NENDI dengan ANGGI, NAZAR dengan VALLEAS). Roster referensi: ${officialPicList.join(", ")}.
     Jika tulisan PIC terbaca jelas: langsung transkrip nama tersebut (jangan menukar nama orang jika tulisan terbaca).
     Hanya jika tulisan pudar atau ambigu: pertimbangkan konteks pasangan shift atau memori visual terlampir.
   - REMARK: Salin teks catatan lengkap jika ada tulisan tangan (contoh: SS00246NX-A10-PS-MALAY, ACC, WAITING). Jangan memotong teks. Jika kotak bersih tanpa tulisan tangan, kosongkan ("").
   - OPERATOR: Nama operator pelaksana jika tertulis di foto. Jika kosong, kosongkan ("").
   - FORMAT HURUF: Seluruh teks UPPERCASE.${vocabPrompt}${visualSamplesPrompt}`;

    const promptStr = isPureRawOcr ? rawOcrMinimalPrompt : complexPromptStr;

    // Pure RAW Schema: lean and clean, NO debugTraces or candidate fields
    const pureRawSchema = {
      type: Type.OBJECT,
      properties: {
        imageQualityStatus: {
          type: Type.STRING,
          description: "Status: 'valid' or 'rejected'",
        },
        rejectionReason: {
          type: Type.STRING,
          description: "Alasan penolakan jika status 'rejected'. Kosong jika valid.",
        },
        rows: {
          type: Type.ARRAY,
          description: "Array objek baris data yang diekstrak secara visual.",
          items: {
            type: Type.OBJECT,
            properties: {
              tanggal: { type: Type.STRING },
              jam_in: { type: Type.STRING },
              jam_out: { type: Type.STRING },
              data_pembanding: { type: Type.STRING },
              costumer: { type: Type.STRING },
              model: { type: Type.STRING },
              part_number: { type: Type.STRING },
              pic: { type: Type.STRING },
              remark: { type: Type.STRING },
              operator: { type: Type.STRING },
            },
            required: [
              "tanggal",
              "jam_in",
              "jam_out",
              "data_pembanding",
              "costumer",
              "model",
              "part_number",
              "pic",
              "remark",
              "operator",
            ],
          },
        },
      },
      required: ["rows"],
    };

    const complexSchema = {
      type: Type.OBJECT,
      properties: {
        imageQualityStatus: {
          type: Type.STRING,
          description: "Status kualitas gambar: 'valid' jika tabel terbaca, atau 'rejected' jika terlalu buram/gelap/miring/rusak.",
        },
        rejectionReason: {
          type: Type.STRING,
          description: "Alasan penolakan jika status 'rejected'. Kosong jika valid.",
        },
        rows: {
          type: Type.ARRAY,
          description: "Array objek baris data yang diekstrak secara visual.",
          items: {
            type: Type.OBJECT,
            properties: {
              tanggal: { type: Type.STRING },
              jam_in: { type: Type.STRING },
              jam_out: { type: Type.STRING },
              data_pembanding: { type: Type.STRING },
              costumer: { type: Type.STRING },
              model: { type: Type.STRING },
              part_number: { type: Type.STRING },
              pic: { type: Type.STRING },
              remark: { type: Type.STRING },
              operator: { type: Type.STRING },
            },
            required: [
              "tanggal",
              "jam_in",
              "jam_out",
              "data_pembanding",
              "costumer",
              "model",
              "part_number",
              "pic",
              "remark",
              "operator",
            ],
          },
        },
        uncertaintyNotes: {
          type: Type.ARRAY,
          description: "Daftar catatan ketidakpastian untuk sel bertuliskan [TIDAK_TERBACA] atau kurang yakin.",
          items: {
            type: Type.OBJECT,
            properties: {
              row: { type: Type.INTEGER, description: "Nomor baris (1-based index)" },
              field: { type: Type.STRING, description: "Nama kolom" },
              value: { type: Type.STRING, description: "Nilai yang diekstrak atau [TIDAK_TERBACA]" },
              reason: { type: Type.STRING, description: "Alasan singkat (buram, bayangan, coretan miring, dsb)" },
            },
            required: ["row", "field", "value", "reason"],
          },
        },
        debugTraces: {
          type: Type.ARRAY,
          description: "Jejak evaluasi keputusan visual untuk sel ambigu atau yang dibandingkan dengan visual memory.",
          items: {
            type: Type.OBJECT,
            properties: {
              row: { type: Type.INTEGER, description: "Nomor baris (1-based index)" },
              field: { type: Type.STRING, description: "Nama kolom" },
              ocrOriginal: { type: Type.STRING, description: "Prediksi karakter awal OCR" },
              ocrConfidence: { type: Type.STRING, description: "Tingkat confidence OCR (contoh: '65%')" },
              memoryCandidate: { type: Type.STRING, description: "Kandidat dari sampel visual memori jika ada" },
              visualSimilarity: { type: Type.STRING, description: "Estimasi kemiripan visual tulisan tangan (contoh: '92%')" },
              final: { type: Type.STRING, description: "Keputusan karakter/kata akhir" },
              reason: { type: Type.STRING, description: "Alasan berbasis bukti guratan visual vs OCR" },
            },
            required: ["row", "field", "ocrOriginal", "final", "reason"],
          },
        },
        rowBboxes: {
          type: Type.ARRAY,
          description: "Estimasi kotak pembatas baris tabel [ymin, xmin, ymax, xmax] normalisasi 0-1000",
          items: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
          },
        },
      },
      required: ["rows"],
    };

    // Deterministic visual transcription configuration
    // Crucial: thinkingBudget: 0 turns off internal reasoning thoughts that cause semantic completion!
    const config: any = isPureRawOcr
      ? {
          temperature: 0.0,
          topP: 0.0001,
          seed: 42,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
          systemInstruction: rawOcrSystemInstruction,
          responseSchema: pureRawSchema,
        }
      : {
          temperature: 0.0,
          topP: 0.0001,
          seed: 42,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
          responseSchema: complexSchema,
        };

    const contents: any[] = [
      {
        inlineData: {
          mimeType: mimeType,
          data: base64Data,
        },
      },
    ];

    // Only attach visual sample crops if NOT in Pure Raw OCR mode
    if (!isPureRawOcr && !shouldIgnoreMemory && validVisualSamples.length > 0) {
      validVisualSamples.forEach((sample: any) => {
        try {
          const [meta, rawB64] = sample.imageCrop.split(",");
          const sMime = meta.split(";")[0].replace("data:", "") || "image/jpeg";
          contents.push({
            inlineData: {
              mimeType: sMime,
              data: rawB64,
            },
          });
        } catch (err) {
          console.warn("Failed to attach visual sample image crop:", err);
        }
      });
    }

    contents.push(promptStr);

    // ========================================================================
    // STRUCTURED REQUEST LOGGING (EXACT AUDIT TRAIL)
    // ========================================================================
    const approxBytes = Math.round((base64Data.length * 3) / 4);
    const sizeStr = `${(approxBytes / 1024).toFixed(1)} KB`;
    const postProcessingStatus = (layers?.dataPembanding ?? true) && !layers?.pic && !layers?.remark && !layers?.ditto && !layers?.timeRecon && !layers?.memory
      ? "DATA_PEMBANDING_ONLY"
      : isPureRawOcr
      ? "OFF"
      : "MODULAR";

    console.log("====================================================");
    console.log("[RAW OCR REQUEST AUDIT TRAIL]");
    console.log(`MODEL NAME: ${model}`);
    console.log(`TEMPERATURE: 0.0`);
    console.log(`TOP_P: 0.0001`);
    console.log(`SYSTEM INSTRUCTION:\n${isPureRawOcr ? rawOcrSystemInstruction : "NONE"}`);
    console.log(`OCR PROMPT:\n${promptStr}`);
    console.log(`CHAT HISTORY LENGTH: 0`);
    console.log(`PREVIOUS OCR RESULTS SENT: 0`);
    console.log(`MEMORY ITEMS SENT: ${isPureRawOcr || shouldIgnoreMemory ? 0 : (memory?.rules?.length || 0) + validVisualSamples.length}`);
    console.log(`MASTER DATA SENT: ${isPureRawOcr ? 0 : vocabItemCount}`);
    console.log(`POST PROCESSING ENABLED: ${postProcessingStatus}`);
    console.log(`IMAGE RESOLUTION: ${imageResolution || "Original / Native"}`);
    console.log(`IMAGE SIZE: ${sizeStr}`);
    console.log("====================================================");

    let rawParsed: any = {};
    let usedModel = model;
    let mistralDebugInfo: any = null;
    let mistralMarkdown: string = "";

    if (engine === "mistral") {
      const clientOrigW = req.body.imageMeta?.origW || req.body.imageMeta?.originalWidth;
      const clientOrigH = req.body.imageMeta?.origH || req.body.imageMeta?.originalHeight;
      const sharpMeta = await sharp(imageBuffer).metadata();
      const sentW = sharpMeta.width || 0;
      const sentH = sharpMeta.height || 0;

      console.log(`\n====================================================`);
      console.log(`OCR ENGINE: Mistral`);
      console.log(`MODEL: mistral-ocr-latest`);
      console.log(`ORIGINAL IMAGE: width = ${clientOrigW || sentW}, height = ${clientOrigH || sentH}`);
      console.log(`MISTRAL IMAGE: width = ${sentW}, height = ${sentH}`);
      usedModel = "mistral-ocr-latest";

      const clientApiKey = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
      const effectiveMistralKey = clientApiKey || process.env.MISTRAL_API_KEY || "";

      if (!effectiveMistralKey) {
        return res.status(400).json({ error: "Mistral API Key belum diisi." });
      }

      try {
        const mistralResult = await callMistralOcr({
          base64Data,
          mimeType,
          apiKey: effectiveMistralKey,
        });

        usedModel = mistralResult.model;
        mistralMarkdown = mistralResult.rawMarkdown;
        rawParsed = { rows: mistralResult.rows };

        mistralDebugInfo = {
          ocrEngine: "mistral",
          model: mistralResult.model,
          requestSuccess: true,
          rawResponseLength: mistralResult.rawResponseLength,
          pageCount: mistralResult.pageCount,
          tableCount: mistralResult.tableCount,
          parsedRowCount: mistralResult.rows.length,
          finalRowCount: mistralResult.rows.length,
          rawTablePreview: mistralResult.rawMarkdown,
          originalImage: {
            width: clientOrigW || sentW,
            height: clientOrigH || sentH,
          },
          sentImage: {
            width: sentW,
            height: sentH,
          },
        };

        console.log(`REQUEST SUCCESS: true`);
        console.log(`MISTRAL RAW RESPONSE LENGTH: ${mistralResult.rawResponseLength}`);
        console.log(`MISTRAL PAGE COUNT: ${mistralResult.pageCount}`);
        console.log(`MISTRAL TABLE COUNT: ${mistralResult.tableCount}`);
        console.log(`MISTRAL RAW TABLE CONTENT:\n${mistralResult.rawMarkdown.slice(0, 1000)}...`);
        console.log(`PARSED ROW COUNT: ${mistralResult.rows.length}`);
      } catch (mistralErr: any) {
        console.error(`Mistral OCR request failed:`, mistralErr.message);
        console.log(`REQUEST SUCCESS: false`);
        console.log(`ERROR: ${mistralErr.message}`);
        console.log(`====================================================\n`);
        return res.status(400).json({ error: mistralErr.message });
      }
    } else {
      // Standard Gemini OCR Flow
      const ai = getAi();
      let response;
      try {
        response = await ai.models.generateContent({
          model: usedModel,
          contents,
          config,
        });
      } catch (e: any) {
        if (
          e?.status === 503 ||
          e?.status === 404 ||
          e?.message?.includes("NOT_FOUND") ||
          e?.message?.includes("high demand") ||
          e?.message?.includes("UNAVAILABLE") ||
          e?.status === 429
        ) {
          console.warn(`Model ${usedModel} is unavailable (${e?.message}), trying supported fallbacks...`);
          // Supported free-tier models for multimodal table OCR
          const fallbackModels = [
            "gemini-3.8-flash",
            "gemini-2.5-flash",
            "gemini-3.1-flash-lite",
            "gemini-flash-latest",
          ].filter((m) => m !== usedModel);

          let success = false;
          for (const fallbackModel of fallbackModels) {
            try {
              // Brief backoff to let RPM/rate limiter settle
              await new Promise((resolve) => setTimeout(resolve, 800));
              console.log(`Trying fallback model: ${fallbackModel}...`);
              usedModel = fallbackModel;
              response = await ai.models.generateContent({
                model: usedModel,
                contents,
                config,
              });
              success = true;
              break; // Success!
            } catch (err: any) {
              console.warn(`Fallback ${fallbackModel} failed: ${err?.message}`);
            }
          }
          if (!success) {
            const isQuota = e?.status === 429 || e?.message?.includes("RESOURCE_EXHAUSTED") || e?.message?.includes("quota");
            if (isQuota) {
              throw new Error("Batas kuota harian/menit Gemini API tercapai (Rate Limit / Quota Exceeded). Mohon tunggu sekitar 30-60 detik.");
            }
            throw new Error("Semua model AI sedang sibuk (High Demand). Silakan coba beberapa saat lagi.");
          }
        } else {
          throw e;
        }
      }

      const rawText = response.text || "";
      try {
        let cleanedText = rawText.trim();
        if (cleanedText.startsWith("```json")) {
          cleanedText = cleanedText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
        } else if (cleanedText.startsWith("```")) {
          cleanedText = cleanedText.replace(/^```\s*/, "").replace(/\s*```$/, "");
        }
        rawParsed = JSON.parse(cleanedText);
      } catch (parseErr) {
        console.warn("Direct JSON.parse failed, attempting regex extraction...", parseErr);
        const matchObj = rawText.match(/\{[\s\S]*\}/);
        if (matchObj) {
          try {
            rawParsed = JSON.parse(matchObj[0]);
          } catch {
            const matchArr = rawText.match(/\[\s*\{[\s\S]*\}\s*\]/);
            if (matchArr) rawParsed = { rows: JSON.parse(matchArr[0]) };
          }
        }
      }

      // Check if Gemini rejected the photo due to severe blur, extreme skew, or darkness
      if (rawParsed.imageQualityStatus === "rejected") {
        const reason =
          rawParsed.rejectionReason ||
          "Foto terlalu buram, gelap, atau miring untuk dipindai secara andal. Mohon ambil foto ulang dengan pencahayaan terang dan tegak lurus.";
        return res.json({
          status: "rejected",
          rejectionReason: reason,
          data: [],
          rawOcr: [],
          tsv: "",
          uncertaintyNotes: [],
          usedModel,
        });
      }
    }

    // Extract rows array
    let rawRows: any[] = [];
    if (Array.isArray(rawParsed.rows)) {
      rawRows = rawParsed.rows;
    } else if (Array.isArray(rawParsed)) {
      rawRows = rawParsed;
    }

    // Guard: Strip any phantom leading blank row where all fields are empty
    while (rawRows.length > 0 && isPhantomBlankRow(rawRows[0])) {
      console.log("[SERVER] Stripped phantom leading blank row from raw OCR");
      rawRows.shift();
    }

    // ========================================================================
    // 1. PHYSICAL ROW ALIGNMENT (PREVENTS MODEL FROM RUNAWAY ROW HALLUCINATIONS)
    //    One physical row on the image corresponds strictly to one application row
    // ========================================================================
    let alignedRawRows: any[] = [];
    if (engine === "mistral") {
      // For Mistral Document OCR: preserve ALL parsed rows without truncating!
      alignedRawRows = rawRows;
    } else {
      const targetRowCount = Math.max(tableStructure.rowCount, rawRows.length);
      for (let i = 0; i < targetRowCount; i++) {
        if (i < rawRows.length && rawRows[i] && typeof rawRows[i] === "object") {
          alignedRawRows.push(rawRows[i]);
        } else {
          alignedRawRows.push({
            tanggal: "",
            jam_in: "",
            jam_out: "",
            data_pembanding: "",
            costumer: "",
            model: "",
            part_number: "",
            pic: "",
            remark: "",
            operator: "",
          });
        }
      }
    }

    // ========================================================================
    // 2. CAPTURE RAW OCR UNTOUCHED FROM OCR ENGINE (ZERO MUTATION):
    //    If OCR engine reads 0917337 -> 0917337
    //    If OCR engine reads +0815424 -> +0815424 (stored verbatim in raw OCR)
    // ========================================================================
    const rawOcrRows = alignedRawRows.map((row: any) => ({
      tanggal: typeof row.tanggal === "string" ? row.tanggal.trim().toUpperCase() : "",
      jam_in: typeof row.jam_in === "string" ? row.jam_in.trim() : "",
      jam_out: typeof row.jam_out === "string" ? row.jam_out.trim() : "",
      data_pembanding: typeof row.data_pembanding === "string" ? row.data_pembanding.trim().toUpperCase() : "",
      costumer: typeof row.costumer === "string" ? row.costumer.trim().toUpperCase() : "",
      model: typeof row.model === "string" ? row.model.trim().toUpperCase() : "",
      part_number: typeof row.part_number === "string" ? row.part_number.trim().toUpperCase() : "",
      pic: typeof row.pic === "string" ? row.pic.trim().toUpperCase() : "",
      remark: typeof row.remark === "string" ? row.remark.trim().toUpperCase() : "",
      operator: typeof row.operator === "string" ? row.operator.trim().toUpperCase() : "",
    }));

    // ========================================================================
    // ========================================================================
    // 2. MODULAR POST-PROCESSING LAYERS (DETERMINISTIC PIPELINE)
    //    ORDER: RAW OCR -> DATA PEMBANDING -> DITTO -> PIC -> REMARK -> FINAL
    // ========================================================================
    let parsedData = rawOcrRows.map((r: any) => ({ ...r }));
    let timeMetadata: any[] = [];
    const debugTraces: any[] = Array.isArray(rawParsed.debugTraces) ? [...rawParsed.debugTraces] : [];

    const effectiveLayers = layers || {
      dataPembanding: true,
      ditto: true,
      pic: true,
      remark: true,
      masterMatch: true,
      timeRecon: true,
      memory: true,
    };

    // Step 1: Data Pembanding (6-digit normalization & special prefix preservation)
    if (effectiveLayers.dataPembanding) {
      parsedData = parsedData.map((row: any, idx: number) => {
        const rawDp = row.data_pembanding;
        if (rawDp && rawDp !== "[TIDAK_TERBACA]") {
          const normDp = cleanDataPembanding(rawDp);
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
          return { ...row, data_pembanding: normDp };
        }
        return row;
      });
    }

    // Step 2: DITTO mark forward-fill (Column-aware)
    if (effectiveLayers.ditto) {
      parsedData = resolveDittoMarks(
        parsedData,
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

    // Step 3: PIC matching (Official roster lock)
    if (effectiveLayers.pic) {
      parsedData = parsedData.map((row: any, idx: number) => {
        const rawPic = row.pic;
        if (rawPic && rawPic !== "[TIDAK_TERBACA]") {
          let matched = rawPic;
          normalizePicToRoster(rawPic, officialPicList, (detail) => {
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
          return { ...row, pic: matched };
        }
        return row;
      });
    }

    // Step 4: REMARK Roll parser (R. 4.5 -> ROLL 4, ROLL 5, etc.)
    if (effectiveLayers.remark) {
      parsedData = parsedData.map((row: any, idx: number) => {
        const rawRemark = row.remark;
        if (
          rawRemark === "-" ||
          rawRemark === "--" ||
          rawRemark === "NONE" ||
          rawRemark === "KOSONG"
        ) {
          return { ...row, remark: "" };
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
          return { ...row, remark: normRemark };
        }
        return row;
      });
    }

    // Step 5: Customer / Model / Part Number Master Matcher (Unified Record Matcher)
    const masterCatalogToUse: MasterRecord[] =
      Array.isArray(clientMasterCatalog) && clientMasterCatalog.length > 0
        ? clientMasterCatalog
        : DEFAULT_MASTER_RECORDS;

    if (effectiveLayers.masterMatch !== false) {
      parsedData = parsedData.map((row: any, idx: number) => {
        const rawCust = row.costumer || "";
        const rawMod = row.model || "";
        const rawPn = row.part_number || "";

        const match = matchMasterRecord(rawCust, rawMod, rawPn, masterCatalogToUse);

        // Internal Debug Matching Log per row (Section 15)
        console.log(`\n--- MASTER MATCH DEBUG: ROW ${idx + 1} ---`);
        console.log(`RAW CUSTOMER: ${match.rawCustomer}`);
        console.log(`RAW MODEL: ${match.rawModel}`);
        console.log(`RAW PART NUMBER: ${match.rawPartNumber}`);
        if (match.record) {
          console.log(`BEST MASTER: ${match.record.customer} | ${match.record.model} | ${match.record.partNumber}`);
        }
        console.log(`CUSTOMER SCORE: ${Math.round(match.customerScore * 100)}%`);
        console.log(`MODEL SCORE: ${Math.round(match.modelScore * 100)}%`);
        console.log(`PART NUMBER SCORE: ${Math.round(match.partNumberScore * 100)}%`);
        console.log(`COMPOSITE: ${Math.round(match.compositeScore * 100)}%`);
        console.log(`DECISION: ${match.decision}`);

        if (match.matched) {
          if (match.finalCustomer !== rawCust) {
            debugTraces.push({
              row: idx + 1,
              field: "costumer",
              ocrOriginal: rawCust,
              final: match.finalCustomer,
              reason: `Master Record: ${match.matchReason}`,
              correctionSource: "master_catalog",
            });
          }
          if (match.finalModel !== rawMod) {
            debugTraces.push({
              row: idx + 1,
              field: "model",
              ocrOriginal: rawMod,
              final: match.finalModel,
              reason: `Master Record: ${match.matchReason}`,
              correctionSource: "master_catalog",
            });
          }
          if (match.finalPartNumber !== rawPn) {
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
            ...row,
            costumer: match.finalCustomer,
            model: match.finalModel,
            part_number: match.finalPartNumber,
          };
        }

        // Low confidence / No reliable match -> keep raw OCR untouched
        return row;
      });
    }

    // Step 6: Time Sequence Reconstruction
    if (effectiveLayers.timeRecon) {
      const timeRecon = reconstructRowTimes(parsedData);
      parsedData = timeRecon.rows;
      timeMetadata = parsedData.map((_, i) => ({
        jam_in: timeRecon.timeMetadata.jam_in[i],
        jam_out: timeRecon.timeMetadata.jam_out[i],
      }));
    }

    // Step 7: OCR Memory as Supporting Evidence (OFF by default)
    if (effectiveLayers.memory && !shouldIgnoreMemory && memory?.manualCorrections && Array.isArray(memory.manualCorrections) && memory.manualCorrections.length > 0) {
      const memorySupport = applyMemorySupportLayer(
        parsedData,
        rawOcrRows,
        memory.manualCorrections,
        masterCatalogToUse,
        officialPicList,
        new Set(),
        true
      );
      parsedData = memorySupport.rows;
      if (memorySupport.debugTraces.length > 0) {
        debugTraces.push(...memorySupport.debugTraces);
      }
    }

    // Uncertainty notes from AI
    const uncertaintyNotes = Array.isArray(rawParsed.uncertaintyNotes)
      ? rawParsed.uncertaintyNotes.filter((n: any) => n && n.field && n.reason)
      : [];

    // Row Bounding Boxes
    const rowBboxes = Array.isArray(rawParsed.rowBboxes) ? rawParsed.rowBboxes : [];

    // Build TSV
    const tsvHeader = [
      "TANGGAL",
      "JAM_IN",
      "JAM_OUT",
      "DATA_PEMBANDING",
      "COSTUMER",
      "MODEL",
      "PART_NUMBER",
      "PIC",
      "REMARK",
      "OPERATOR",
    ].join("\t");

    const tsvBody = parsedData
      .map((r: any) =>
        [
          r.tanggal || "",
          r.jam_in || "",
          r.jam_out || "",
          r.data_pembanding || "",
          r.costumer || "",
          r.model || "",
          r.part_number || "",
          r.pic || "",
          r.remark || "",
          r.operator || "",
        ].join("\t")
      )
      .join("\n");

    const finalTsv = tsvHeader + "\n" + tsvBody;

    if (engine === "mistral") {
      if (mistralDebugInfo) {
        mistralDebugInfo.finalRowCount = parsedData.length;
      }
      console.log(`FINAL ROW COUNT: ${parsedData.length}`);
      console.log("====================================================");
      console.log("[FIRST ROW INTEGRITY AUDIT]");
      console.log("RAW ROW #1:   ", JSON.stringify(rawRows[0] || null));
      console.log("PARSED ROW #1:", JSON.stringify(alignedRawRows[0] || null));
      console.log("FINAL ROW #1: ", JSON.stringify(parsedData[0] || null));
      console.log("====================================================\n");
    }

    // ========================================================================
    // MANDATORY AUDIT TRAIL LOGGING (TABLE, ROWS, COLUMNS, CROPS, OCR, NORM)
    // ========================================================================
    console.log("====================================================");
    console.log("[TABLE & ROW EXTRACTION AUDIT TRAIL]");
    console.log(`IMAGE WIDTH: ${tableStructure.imageWidth}`);
    console.log(`IMAGE HEIGHT: ${tableStructure.imageHeight}\n`);
    console.log(`DETECTED ROW COUNT: ${tableStructure.rowCount}`);
    console.log(`DETECTED COLUMN COUNT: ${tableStructure.columnCount}\n`);
    console.log("DATA PEMBANDING COLUMN:");
    console.log(`x1: ${tableStructure.dataPembandingColumn.x1}`);
    console.log(`x2: ${tableStructure.dataPembandingColumn.x2}\n`);
    console.log("SETIAP ROW:");
    rawOcrRows.forEach((_, idx) => {
      const rawVal = rawOcrRows[idx]?.data_pembanding || "";
      const normVal = parsedData[idx]?.data_pembanding || "";
      const r = tableStructure.rows[idx];
      if (r) {
        console.log(
          `rowIndex: ${r.rowIndex} | y1: ${r.y1} | y2: ${r.y2} | crop width: ${r.dataPembandingBox.width} | crop height: ${r.dataPembandingBox.height} | raw OCR: "${rawVal}" | normalized value: "${normVal}"`
        );
      } else {
        console.log(
          `rowIndex: ${idx + 1} | raw OCR: "${rawVal}" | normalized value: "${normVal}"`
        );
      }
    });
    console.log("====================================================");

    res.json({
      status: "success",
      ocrEngine: engine,
      mistralDebug: mistralDebugInfo,
      rawMistralMarkdown: mistralMarkdown,
      pureRawOcr: isPureRawOcr,
      rawOcr: rawOcrRows,
      data: parsedData,
      tsv: finalTsv,
      tableStructure,
      uncertaintyNotes,
      debugTraces,
      rowBboxes,
      usedModel,
      timeMetadata,
      diagnosticLog: {
        ocrEngine: engine,
        mistralDebug: mistralDebugInfo,
        modelName: usedModel,
        temperature: 0.0,
        topP: 0.0001,
        systemInstruction: isPureRawOcr ? rawOcrSystemInstruction : "NONE",
        ocrPrompt: promptStr,
        chatHistoryLength: 0,
        previousOcrResultsSent: 0,
        memoryItemsSent: isPureRawOcr || shouldIgnoreMemory ? 0 : (memory?.rules?.length || 0) + validVisualSamples.length,
        masterDataSent: isPureRawOcr ? 0 : vocabItemCount,
        postProcessingEnabled: postProcessingStatus,
        imageResolution: imageResolution || "Original / Native",
        imageSize: sizeStr,
        tableStructureSummary: {
          imageWidth: tableStructure.imageWidth,
          imageHeight: tableStructure.imageHeight,
          rowCount: tableStructure.rowCount,
          columnCount: tableStructure.columnCount,
          dataPembandingColumn: tableStructure.dataPembandingColumn,
        },
      },
    });

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    const errorMessage = error?.message || "";
    if (
      error?.status === 429 ||
      errorMessage.includes("429") ||
      errorMessage.includes("RESOURCE_EXHAUSTED") ||
      errorMessage.includes("quota") ||
      errorMessage.includes("Quota")
    ) {
      res.status(429).json({
        error: "Batas permintaan (Rate Limit / Quota) tercapai. Mohon tunggu 30-60 detik sebelum memindai ulang.",
      });
    } else if (error?.status === 503 || errorMessage.includes("high demand") || errorMessage.includes("UNAVAILABLE")) {
      res.status(503).json({ error: "Layanan AI sedang sibuk (High Demand). Mohon coba lagi dalam beberapa saat." });
    } else {
      res.status(500).json({ error: "Gagal memindai gambar. " + errorMessage });
    }
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
