import { ParsedData } from "../types";

export interface MistralOcrResult {
  success: boolean;
  model: string;
  rawResponseLength: number;
  pageCount: number;
  tableCount: number;
  rawMarkdown: string;
  rawMistralResponse: any;
  rows: ParsedData[];
  error?: string;
}

export function isPhantomBlankRow(r: any): boolean {
  if (!r || typeof r !== "object") return true;
  const fields = [
    r.tanggal,
    r.jam_in,
    r.jam_out,
    r.data_pembanding,
    r.costumer,
    r.model,
    r.part_number,
    r.pic,
    r.remark,
    r.operator,
  ];
  return fields.every(
    (v) => !v || !String(v).trim() || String(v).trim() === "-" || String(v).trim() === "--"
  );
}

function cleanCell(c: string): string {
  return (c || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/[\u00a0\u200b]/g, " ")
    .trim();
}

function getCells(line: string): string[] {
  let trimmed = line;
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map(cleanCell);
}

function isSeparatorRow(cells: string[]): boolean {
  if (cells.length === 0) return true;
  return cells.every((c) => !c || /^:?-+:?$/.test(c));
}

function isHeaderRow(cells: string[]): boolean {
  const joined = cells.map((c) => c.toLowerCase()).join(" ");
  const headerKeywords = [
    "tanggal",
    "tgl",
    "date",
    "pembanding",
    "costumer",
    "customer",
    "part number",
    "part_number",
    "pic",
    "remark",
    "keterangan",
    "operator",
  ];
  const matchCount = headerKeywords.filter((k) => joined.includes(k)).length;
  return (
    matchCount >= 2 ||
    ((joined.includes("tanggal") || joined.includes("tgl") || joined.includes("date")) &&
      (joined.includes("jam") || joined.includes("data") || joined.includes("no"))) ||
    (joined.includes("pembanding") && (joined.includes("customer") || joined.includes("costumer")))
  );
}

function isSubHeaderRow(cells: string[]): boolean {
  const nonBlank = cells.filter((c) => c && c.trim() && c.trim() !== "-");
  if (nonBlank.length === 0) return true;
  const subKeywords = /^(?:in|out|start|end|jam\s*in|jam\s*out|ok|ng|hasil|result|judgement|\(?\d+\)?|[a-z]|\(\/ \)|\(\/\))$/i;
  return nonBlank.every((c) => subKeywords.test(c.trim()));
}

function buildColMap(cells: string[]): Record<keyof ParsedData, number> {
  const colMap: Record<keyof ParsedData, number> = {
    tanggal: -1,
    jam_in: -1,
    jam_out: -1,
    data_pembanding: -1,
    costumer: -1,
    model: -1,
    part_number: -1,
    pic: -1,
    remark: -1,
    operator: -1,
  };

  const headers = cells.map((c) => c.toLowerCase());
  headers.forEach((h, idx) => {
    if (h.includes("tanggal") || h.includes("date") || h === "tgl") {
      colMap.tanggal = idx;
    } else if (h.includes("jam in") || h.includes("jam_in") || h === "in" || h.includes("start")) {
      colMap.jam_in = idx;
    } else if (h.includes("jam out") || h.includes("jam_out") || h === "out" || h.includes("end")) {
      colMap.jam_out = idx;
    } else if (h.includes("jam") || h.includes("time") || h.includes("waktu")) {
      if (colMap.jam_in === -1) colMap.jam_in = idx;
      else if (colMap.jam_out === -1) colMap.jam_out = idx;
    } else if (h.includes("pembanding") || h.includes("data pembanding") || h.includes("perbandingan")) {
      colMap.data_pembanding = idx;
    } else if (colMap.data_pembanding === -1 && h.includes("data")) {
      colMap.data_pembanding = idx;
    } else if (h.includes("costumer") || h.includes("customer") || h.includes("cust") || h.includes("pelanggan")) {
      colMap.costumer = idx;
    } else if (h.includes("model") || h.includes("tipe") || h.includes("type")) {
      colMap.model = idx;
    } else if (h.includes("part") || h.includes("part number") || h.includes("part_number") || h.includes("no part")) {
      colMap.part_number = idx;
    } else if (h.includes("pic") || h.includes("inspector") || h.includes("petugas")) {
      colMap.pic = idx;
    } else if (h.includes("remark") || h.includes("keterangan") || h.includes("catatan") || h.includes("note")) {
      colMap.remark = idx;
    } else if (h.includes("hasil") || h.includes("result") || h.includes("judgement")) {
      if (colMap.remark === -1) colMap.remark = idx;
    } else if (h.includes("operator") || h.includes("op")) {
      colMap.operator = idx;
    }
  });
  return colMap;
}

/**
 * Parses markdown table or lines from Mistral OCR output into raw ParsedData rows.
 * Preserves literal characters, ditto marks ("), and raw lot codes without semantic modification.
 * Full page extraction: does not stop at empty rows, does not discard incomplete rows,
 * and iterates through all tables/pages.
 */
export function parseMistralMarkdownTable(markdownText: string): ParsedData[] {
  if (!markdownText) return [];

  const text = markdownText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawLines = text.split("\n").map((l) => l.trim());

  // Filter lines that have at least 2 pipes (markdown table row)
  const tableLines = rawLines.filter((l) => (l.match(/\|/g) || []).length >= 2);

  if (tableLines.length >= 2) {
    let currentColMap: Record<keyof ParsedData, number> | null = null;
    const parsedRows: ParsedData[] = [];

    for (let i = 0; i < tableLines.length; i++) {
      const line = tableLines[i];
      const cells = getCells(line);

      // Skip table separator rows (|---|---|...)
      if (isSeparatorRow(cells)) {
        continue;
      }

      // Check if this line is a header row (or repeated header in multi-section tables)
      if (isHeaderRow(cells)) {
        currentColMap = buildColMap(cells);
        continue;
      }

      // If next line is a separator row and we don't have a map yet, this might be a header
      if (!currentColMap && i + 1 < tableLines.length && isSeparatorRow(getCells(tableLines[i + 1]))) {
        currentColMap = buildColMap(cells);
        continue;
      }

      // Do not treat document titles or lines prior to the header row as data rows
      if (!currentColMap) {
        continue;
      }

      // Check if this line is a subheader row (e.g. IN | OUT or (1) | (2)...)
      if (isSubHeaderRow(cells)) {
        cells.forEach((c, idx) => {
          const lower = c.toLowerCase();
          if (lower === "in" || lower.includes("jam in") || lower.includes("start")) {
            currentColMap!.jam_in = idx;
          } else if (lower === "out" || lower.includes("jam out") || lower.includes("end")) {
            currentColMap!.jam_out = idx;
          }
        });
        continue;
      }

      // This is a data row. Extract all available cells verbatim.
      // Missing cells or partial rows are preserved as empty strings, never dropped.
      if (currentColMap && currentColMap.data_pembanding >= 0) {
        parsedRows.push({
          tanggal: currentColMap.tanggal >= 0 ? (cells[currentColMap.tanggal] || "") : "",
          jam_in: currentColMap.jam_in >= 0 ? (cells[currentColMap.jam_in] || "") : "",
          jam_out: currentColMap.jam_out >= 0 ? (cells[currentColMap.jam_out] || "") : "",
          data_pembanding: currentColMap.data_pembanding >= 0 ? (cells[currentColMap.data_pembanding] || "") : "",
          costumer: currentColMap.costumer >= 0 ? (cells[currentColMap.costumer] || "") : "",
          model: currentColMap.model >= 0 ? (cells[currentColMap.model] || "") : "",
          part_number: currentColMap.part_number >= 0 ? (cells[currentColMap.part_number] || "") : "",
          pic: currentColMap.pic >= 0 ? (cells[currentColMap.pic] || "") : "",
          remark: currentColMap.remark >= 0 ? (cells[currentColMap.remark] || "") : "",
          operator: currentColMap.operator >= 0 ? (cells[currentColMap.operator] || "") : "",
        });
      } else {
        // Positional fallback (if col 0 is 'NO' row index, offset by 1)
        const offset = cells.length >= 11 ? 1 : 0;
        parsedRows.push({
          tanggal: cells[offset] || "",
          jam_in: cells[offset + 1] || "",
          jam_out: cells[offset + 2] || "",
          data_pembanding: cells[offset + 3] || "",
          costumer: cells[offset + 4] || "",
          model: cells[offset + 5] || "",
          part_number: cells[offset + 6] || "",
          pic: cells[offset + 7] || "",
          remark: cells[offset + 8] || "",
          operator: cells[offset + 9] || "",
        });
      }
    }

    // Strip phantom leading blank rows (rows before first data row where all fields are completely blank)
    while (parsedRows.length > 0 && isPhantomBlankRow(parsedRows[0])) {
      console.log("[MISTRAL PARSER] Stripped phantom leading blank row at index 0");
      parsedRows.shift();
    }

    if (parsedRows.length > 0) {
      console.log("[MISTRAL PARSER] First physical data row (Row 1):", JSON.stringify(parsedRows[0]));
      return parsedRows;
    }
  }

  // Fallback 1: HTML tables (<tr ...> <td ...>)
  if (text.includes("<tr") && (text.includes("<td") || text.includes("<th"))) {
    const trMatches = text.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    if (trMatches && trMatches.length >= 2) {
      const htmlRows: ParsedData[] = [];
      let isFirst = true;
      for (const tr of trMatches) {
        const cellMatches = tr.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi);
        if (!cellMatches) continue;
        const cells = cellMatches.map((c) =>
          cleanCell(c.replace(/<[^>]+>/g, ""))
        );

        const isHeader = isHeaderRow(cells);
        if (isHeader || isSeparatorRow(cells) || isSubHeaderRow(cells)) {
          isFirst = false;
          continue; // skip header / subheader
        }

        if (isFirst) {
          isFirst = false;
          if (cells.some((c) => c.toLowerCase().includes("tanggal") || c.toLowerCase().includes("pembanding"))) {
            continue;
          }
        }

        const offset = cells.length >= 11 ? 1 : 0;
        htmlRows.push({
          tanggal: cells[offset] || "",
          jam_in: cells[offset + 1] || "",
          jam_out: cells[offset + 2] || "",
          data_pembanding: cells[offset + 3] || "",
          costumer: cells[offset + 4] || "",
          model: cells[offset + 5] || "",
          part_number: cells[offset + 6] || "",
          pic: cells[offset + 7] || "",
          remark: cells[offset + 8] || "",
          operator: cells[offset + 9] || "",
        });
      }
      while (htmlRows.length > 0 && isPhantomBlankRow(htmlRows[0])) {
        htmlRows.shift();
      }
      if (htmlRows.length > 0) return htmlRows;
    }
  }

  // Fallback 2: line-by-line tab-separated or structured lines
  const nonTableLines = rawLines.filter((l) => l && !l.startsWith("#") && !l.startsWith("---"));
  const fallback2Rows: ParsedData[] = [];
  for (const line of nonTableLines) {
    const tokens = line.split("\t").map((t) => t.trim());
    if (isHeaderRow(tokens) || isSubHeaderRow(tokens)) continue;
    fallback2Rows.push({
      tanggal: tokens[0] || "",
      jam_in: tokens[1] || "",
      jam_out: tokens[2] || "",
      data_pembanding: tokens[3] || "",
      costumer: tokens[4] || "",
      model: tokens[5] || "",
      part_number: tokens[6] || "",
      pic: tokens[7] || "",
      remark: tokens[8] || "",
      operator: tokens[9] || "",
    });
  }
  while (fallback2Rows.length > 0 && isPhantomBlankRow(fallback2Rows[0])) {
    fallback2Rows.shift();
  }
  return fallback2Rows;
}

/**
 * Calls Mistral Document AI OCR API
 */
export async function callMistralOcr(options: {
  base64Data: string;
  mimeType: string;
  apiKey?: string;
  timeoutMs?: number;
}): Promise<MistralOcrResult> {
  const apiKey = options.apiKey || process.env.MISTRAL_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error("Mistral API Key belum diisi.");
  }

  const model = "mistral-ocr-latest";
  const dataUri = options.base64Data.startsWith("data:")
    ? options.base64Data
    : `data:${options.mimeType || "image/jpeg"};base64,${options.base64Data}`;

  const payload = {
    model,
    document: {
      type: "image_url",
      image_url: dataUri,
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || 120000);

  try {
    const response = await fetch("https://api.mistral.ai/v1/ocr", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("Mistral API Key tidak valid.");
      }
      if (response.status === 429) {
        throw new Error("Mistral API rate limit tercapai.");
      }
      throw new Error("Gagal terhubung ke Mistral API.");
    }

    const json = await response.json();
    let fullMarkdown = "";

    const pages = Array.isArray(json?.pages) ? json.pages : [];
    const pageCount = pages.length || (json?.markdown ? 1 : 0);

    let tablesCount = 0;
    if (pages.length > 0) {
      pages.forEach((p: any) => {
        if (p?.markdown) {
          fullMarkdown += (fullMarkdown ? "\n\n" : "") + p.markdown;
        }
        if (Array.isArray(p?.tables)) {
          tablesCount += p.tables.length;
          p.tables.forEach((t: any) => {
            const tableContent = t?.markdown || t?.content || "";
            if (tableContent && !fullMarkdown.includes(tableContent)) {
              fullMarkdown += "\n\n" + tableContent;
            }
          });
        }
      });
    } else if (typeof json?.markdown === "string") {
      fullMarkdown = json.markdown;
    }

    // Estimate table count from markdown if not from json.pages[].tables
    if (tablesCount === 0 && fullMarkdown) {
      const separatorMatches = fullMarkdown.match(/\|[\s-:]+\|[\s-:]+\|/g);
      tablesCount = separatorMatches ? separatorMatches.length : (fullMarkdown.includes("|") ? 1 : 0);
    }

    const rows = parseMistralMarkdownTable(fullMarkdown);

    return {
      success: true,
      model,
      rawResponseLength: fullMarkdown.length,
      pageCount,
      tableCount: Math.max(1, tablesCount),
      rawMarkdown: fullMarkdown,
      rawMistralResponse: json,
      rows,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error("Gagal terhubung ke Mistral API.");
    }
    if (
      err.message === "Mistral API Key belum diisi." ||
      err.message === "Mistral API Key tidak valid." ||
      err.message === "Mistral API rate limit tercapai."
    ) {
      throw err;
    }
    throw new Error("Gagal terhubung ke Mistral API.");
  }
}
