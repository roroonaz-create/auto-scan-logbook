import { ParsedData, RowConfidence, ConfidenceLevel, AiMemory } from "../types";
import { DEFAULT_LOCKED_PICS } from "../constants";

/**
 * Validates and assesses confidence for each field of an extracted logbook row.
 * Evaluates visual plausibility, format matching, dictionary validation, and length heuristics.
 */
export function evaluateRowConfidence(
  row: ParsedData,
  vocab?: AiMemory["vocabulary"]
): RowConfidence {
  const conf: RowConfidence = {};

  // 1. Tanggal: DD/MM/YY
  if (!row.tanggal || row.tanggal.trim() === "") {
    conf.tanggal = "high"; // Tanggal is allowed to be empty
  } else {
    const dRegex = /^\d{1,2}\/\d{1,2}\/\d{2}$/;
    if (dRegex.test(row.tanggal)) {
      conf.tanggal = "high";
    } else if (row.tanggal.includes("/")) {
      conf.tanggal = "medium";
    } else {
      conf.tanggal = "low";
    }
  }

  // 2. Jam In: HH:MM
  if (!row.jam_in || row.jam_in.trim() === "") {
    conf.jam_in = "high"; // Jam can be blank in handwritten sheets
  } else {
    const timeRegex = /^([01]?\d|2[0-3]):[0-5]\d$/;
    if (timeRegex.test(row.jam_in)) {
      conf.jam_in = "high";
    } else if (row.jam_in.includes(":")) {
      const [hStr, mStr] = row.jam_in.split(":");
      const h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10);
      if (!isNaN(h) && !isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        conf.jam_in = "medium";
      } else {
        conf.jam_in = "low";
      }
    } else {
      conf.jam_in = "low";
    }
  }

  // 3. Jam Out: HH:MM
  if (!row.jam_out || row.jam_out.trim() === "") {
    conf.jam_out = "high";
  } else {
    const timeRegex = /^([01]?\d|2[0-3]):[0-5]\d$/;
    if (timeRegex.test(row.jam_out)) {
      conf.jam_out = "high";
    } else if (row.jam_out.includes(":")) {
      const [hStr, mStr] = row.jam_out.split(":");
      const h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10);
      if (!isNaN(h) && !isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        conf.jam_out = "medium";
      } else {
        conf.jam_out = "low";
      }
    } else {
      conf.jam_out = "low";
    }
  }

  // 4. Data Pembanding: typically numeric lot/serial like 917337, 509666, SRWO9518509519 or 2 numbers with slash like "917337 / 917338"
  if (!row.data_pembanding || row.data_pembanding.trim() === "") {
    conf.data_pembanding = "low"; // Data pembanding is core, usually present
  } else {
    const dp = row.data_pembanding.trim().toUpperCase();
    const hasNumbers = /\d/.test(dp);
    if (dp.includes("/")) {
      const parts = dp.split("/").map((s) => s.trim());
      const allValid = parts.length >= 2 && parts.every((p) => /\d/.test(p) && p.length >= 3);
      if (allValid) {
        conf.data_pembanding = "high";
      } else {
        conf.data_pembanding = "medium";
      }
    } else if (/^\d{5,10}$/.test(dp)) {
      // Clean 5-10 digit numbers: very high certainty
      conf.data_pembanding = "high";
    } else if (hasNumbers && dp.length >= 4) {
      conf.data_pembanding = "high";
    } else if (hasNumbers && dp.length < 4) {
      conf.data_pembanding = "medium"; // unusually short
    } else {
      conf.data_pembanding = "low";
    }
  }

  // 5. Costumer
  if (!row.costumer || row.costumer.trim() === "") {
    conf.costumer = "medium";
  } else {
    const cust = row.costumer.trim().toUpperCase();
    const knownCusts = vocab?.costumer || [
      "EPSON", "YIMM", "PARAGON", "TACL", "COSMETIC", "ADM-KAP", "ADM-SAP", "HPM", "SIM", "MMKI"
    ];
    const isKnown = knownCusts.some(k => cust.includes(k) || k.includes(cust));
    if (isKnown) {
      conf.costumer = "high";
    } else if (cust.length >= 3) {
      conf.costumer = "medium";
    } else {
      conf.costumer = "low";
    }
  }

  // 6. Model
  if (!row.model || row.model.trim() === "") {
    conf.model = "medium";
  } else {
    const mod = row.model.trim().toUpperCase();
    const knownModels = vocab?.model || [
      "SN:", "LB", "EPSON", "YAMAHA", "B65", "2DP", "B8R", "B74", "D26A", "D03B", "RECYCLE", "US NAME PLATE"
    ];
    const isKnown = knownModels.some(k => mod.includes(k));
    if (isKnown || mod.length >= 4) {
      conf.model = "high";
    } else if (mod.length >= 2) {
      conf.model = "medium";
    } else {
      conf.model = "low";
    }
  }

  // 7. Part Number
  if (!row.part_number || row.part_number.trim() === "") {
    conf.part_number = "medium";
  } else {
    const pn = row.part_number.trim().toUpperCase();
    // Typical pattern: contains alphanumeric with hyphen or length >= 6
    const hasAlpha = /[A-Z]/.test(pn);
    const hasNum = /\d/.test(pn);
    const hasHyphen = pn.includes("-");

    if ((hasAlpha && hasNum && pn.length >= 6) || (hasHyphen && pn.length >= 5)) {
      conf.part_number = "high";
    } else if (pn.length >= 4) {
      conf.part_number = "medium";
    } else {
      conf.part_number = "low";
    }
  }

  // 8. PIC (Person In Charge)
  if (!row.pic || row.pic.trim() === "") {
    conf.pic = "low"; // PIC is almost always recorded in the factory logbook
  } else {
    const pic = row.pic.trim().toUpperCase();
    const officialPics =
      vocab?.pic && vocab.pic.length > 0 ? vocab.pic : DEFAULT_LOCKED_PICS;
    if (officialPics.includes(pic)) {
      conf.pic = "high";
    } else if (officialPics.some((op) => op.startsWith(pic) || pic.startsWith(op))) {
      conf.pic = "medium";
    } else {
      conf.pic = "low"; // Not in the official locked PIC list
    }
  }

  // 9. Remark
  if (!row.remark || row.remark.trim() === "") {
    conf.remark = "high"; // Blank remarks are completely expected and normal
  } else {
    const rem = row.remark.trim().toUpperCase();
    if (rem === "ROLL") {
      // Standalone "ROLL" without number is suspicious / hallucination
      conf.remark = "medium";
    } else if (rem === "-" || rem === "--" || rem.length <= 2) {
      conf.remark = "low"; // Stray character or mark
    } else {
      const validRemarks = [
        "ROLL 1", "ROLL 2", "ROLL 3", "ROLL 4", "ACC", "WAITING", "SAMPLE", "MASS PRO", "TRIAL", "130/5"
      ];
      if (validRemarks.some(vr => rem === vr || rem.includes(vr))) {
        conf.remark = "high";
      } else {
        conf.remark = "medium";
      }
    }
  }

  // 10. Operator
  if (!row.operator || row.operator.trim() === "") {
    conf.operator = "high"; // Operator is optional
  } else {
    const op = row.operator.trim().toUpperCase();
    if (op.length >= 3) {
      conf.operator = "high";
    } else {
      conf.operator = "medium";
    }
  }

  return conf;
}

export function evaluateAllRowsConfidence(
  rows: ParsedData[],
  serverConfidences?: RowConfidence[],
  vocab?: AiMemory["vocabulary"]
): RowConfidence[] {
  return rows.map((row, idx) => {
    const heuristic = evaluateRowConfidence(row, vocab);
    const server = serverConfidences && serverConfidences[idx];
    if (!server) return heuristic;

    // Merge: if server flagged low, prioritize server
    const merged: RowConfidence = { ...heuristic };
    (Object.keys(heuristic) as Array<keyof ParsedData>).forEach((field) => {
      if (server[field]) {
        // If server provided confidence, use the lowest of the two
        const sLevel = server[field]!;
        const hLevel = heuristic[field] || "high";
        if (sLevel === "low" || hLevel === "low") {
          merged[field] = "low";
        } else if (sLevel === "medium" || hLevel === "medium") {
          merged[field] = "medium";
        } else {
          merged[field] = "high";
        }
      }
    });

    return merged;
  });
}
