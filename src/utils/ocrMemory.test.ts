import { describe, it, expect } from "vitest";
import {
  OcrMemoryEntry,
  recordManualCorrection,
  retrieveMemoryCandidate,
  applyMemorySupportLayer,
  computeMemoryConfidence,
} from "./ocrMemory";
import { DEFAULT_MASTER_RECORDS } from "./masterCatalog";
import { ParsedData } from "../types";

describe("OCR Memory as Supporting Evidence", () => {
  const sampleRoster = ["NAZAR", "NENDI", "ANGGI", "HERY", "REDI", "ROHALIA", "GENDHIS", "VALLEAS"];

  it("TEST A: should learn from user correction on MODEL and support matching on future scan", () => {
    let memory: OcrMemoryEntry[] = [];

    // User corrects raw "PACKAGE LABEL LC521TN" to "PACKAGE LABEL LC521TM"
    const { updatedEntries } = recordManualCorrection(memory, {
      field: "model",
      rawOCRValue: "PACKAGE LABEL LC521TN",
      manualCorrectedValue: "PACKAGE LABEL LC521TM",
      rowContext: { customer: "EPSON" },
    });
    memory = updatedEntries;

    expect(memory.length).toBe(1);
    expect(memory[0].sampleCount).toBe(1);

    // Repeated confirmation increases sample count & confidence
    const secondCorrection = recordManualCorrection(memory, {
      field: "model",
      rawOCRValue: "PACKAGE LABEL LC521TN",
      manualCorrectedValue: "PACKAGE LABEL LC521TM",
      rowContext: { customer: "EPSON" },
    });
    memory = secondCorrection.updatedEntries;
    expect(memory.length).toBe(1); // Deduplicated!
    expect(memory[0].sampleCount).toBe(2);
    expect(memory[0].confidence).toBeGreaterThan(0.80);

    // Next scan: raw OCR produces "PACKAGE LABEL LC521TN"
    const rows: ParsedData[] = [
      {
        tanggal: "2026-09-24",
        jam_in: "08:00",
        jam_out: "09:00",
        data_pembanding: "123456",
        costumer: "EPSON",
        model: "PACKAGE LABEL LC521TN",
        part_number: "",
        pic: "NAZAR",
        remark: "ROLL 1",
        operator: "RUDI",
      },
    ];

    const rawRows = JSON.parse(JSON.stringify(rows));

    const { rows: finalRows, debugTraces } = applyMemorySupportLayer(
      rows,
      rawRows,
      memory,
      DEFAULT_MASTER_RECORDS,
      sampleRoster,
      new Set(),
      true // enabled
    );

    // Memory acts as supporting evidence to match official master model LC521TM
    expect(finalRows[0].model).toBe("PACKAGE LABEL LC521TM");
    expect(debugTraces.length).toBe(1);
    expect(debugTraces[0].field).toBe("model");
    expect(debugTraces[0].reason).toContain("master + high-confidence memory support");
  });

  it("TEST B: should NOT force memory on different visual/text patterns", () => {
    let memory: OcrMemoryEntry[] = [];
    const { updatedEntries } = recordManualCorrection(memory, {
      field: "model",
      rawOCRValue: "LC521TN",
      manualCorrectedValue: "LC521TM",
      rowContext: { customer: "EPSON" },
    });
    memory = updatedEntries;

    // Scan with completely different model
    const rows: ParsedData[] = [
      {
        tanggal: "2026-09-24",
        jam_in: "08:00",
        jam_out: "09:00",
        data_pembanding: "123456",
        costumer: "EPSON",
        model: "LC427XLY",
        part_number: "",
        pic: "NAZAR",
        remark: "ROLL 1",
        operator: "RUDI",
      },
    ];

    const rawRows = JSON.parse(JSON.stringify(rows));

    const { rows: finalRows } = applyMemorySupportLayer(
      rows,
      rawRows,
      memory,
      DEFAULT_MASTER_RECORDS,
      sampleRoster,
      new Set(),
      true
    );

    expect(finalRows[0].model).toBe("LC427XLY");
  });

  it("TEST C & D: Empty memory or Memory OFF preserves baseline 100% untouched", () => {
    const rows: ParsedData[] = [
      {
        tanggal: "2026-09-24",
        jam_in: "08:00",
        jam_out: "09:00",
        data_pembanding: "123456",
        costumer: "EPSON",
        model: "PACKAGE LABEL LC521TN",
        part_number: "2195000",
        pic: "ROHAIA",
        remark: "ROLL 1",
        operator: "RUDI",
      },
    ];

    const rawRows = JSON.parse(JSON.stringify(rows));

    // Empty memory
    const resultEmpty = applyMemorySupportLayer(
      rows,
      rawRows,
      [],
      DEFAULT_MASTER_RECORDS,
      sampleRoster,
      new Set(),
      true
    );
    expect(resultEmpty.rows).toEqual(rows);

    // Memory OFF
    const resultOff = applyMemorySupportLayer(
      rows,
      rawRows,
      [
        {
          id: "m1",
          field: "model",
          rawOCRValue: "PACKAGE LABEL LC521TN",
          manualCorrectedValue: "PACKAGE LABEL LC521TM",
          rowContext: {},
          sampleCount: 5,
          conflictCount: 0,
          confidence: 0.95,
          createdAt: 0,
          lastSeen: 0,
        },
      ],
      DEFAULT_MASTER_RECORDS,
      sampleRoster,
      new Set(),
      false // OFF
    );
    expect(resultOff.rows).toEqual(rows);
  });

  it("TEST E: Low confidence memory does NOT alter result", () => {
    const memory: OcrMemoryEntry[] = [
      {
        id: "m-low",
        field: "model",
        rawOCRValue: "XYZ-1234",
        manualCorrectedValue: "PACKAGE LABEL LC521TM",
        rowContext: {},
        sampleCount: 1,
        conflictCount: 0,
        confidence: 0.60, // Below threshold (< 0.75)
        createdAt: 0,
        lastSeen: 0,
      },
    ];

    const rows: ParsedData[] = [
      {
        tanggal: "2026-09-24",
        jam_in: "08:00",
        jam_out: "09:00",
        data_pembanding: "123456",
        costumer: "EPSON",
        model: "XYZ-1235",
        part_number: "",
        pic: "NAZAR",
        remark: "ROLL 1",
        operator: "RUDI",
      },
    ];

    const { rows: finalRows } = applyMemorySupportLayer(
      rows,
      rows,
      memory,
      DEFAULT_MASTER_RECORDS,
      sampleRoster,
      new Set(),
      true
    );

    expect(finalRows[0].model).toBe("XYZ-1235");
  });

  it("TEST F: Master exact match wins over conflicting memory suggestion", () => {
    // Memory suggests LC521TM for model, but row already has an exact master match from Part Number 2195000 (which belongs to LC521TM or another master)
    const masterRecord = DEFAULT_MASTER_RECORDS[0]; // e.g. Customer: EPSON, Model: ..., PartNumber: ...
    const rows: ParsedData[] = [
      {
        tanggal: "2026-09-24",
        jam_in: "08:00",
        jam_out: "09:00",
        data_pembanding: "123456",
        costumer: masterRecord.customer,
        model: masterRecord.model,
        part_number: masterRecord.partNumber,
        pic: "NAZAR",
        remark: "ROLL 1",
        operator: "RUDI",
      },
    ];

    // Contradictory memory entry
    const memory: OcrMemoryEntry[] = [
      {
        id: "m-diff",
        field: "model",
        rawOCRValue: masterRecord.model,
        manualCorrectedValue: "WRONG_NON_EXISTENT_MODEL",
        rowContext: {},
        sampleCount: 3,
        conflictCount: 0,
        confidence: 0.90,
        createdAt: 0,
        lastSeen: 0,
      },
    ];

    const { rows: finalRows } = applyMemorySupportLayer(
      rows,
      rows,
      memory,
      DEFAULT_MASTER_RECORDS,
      sampleRoster,
      new Set(),
      true
    );

    // Master record is preserved!
    expect(finalRows[0].model).toBe(masterRecord.model);
  });

  it("Field Isolation: Model correction NEVER affects PIC, Customer, or Part Number", () => {
    const memory: OcrMemoryEntry[] = [
      {
        id: "m1",
        field: "model",
        rawOCRValue: "ROHALIA",
        manualCorrectedValue: "ROHANI",
        rowContext: {},
        sampleCount: 5,
        conflictCount: 0,
        confidence: 0.95,
        createdAt: 0,
        lastSeen: 0,
      },
    ];

    const candidate = retrieveMemoryCandidate("pic", "ROHALIA", {}, memory);
    expect(candidate.hasCandidate).toBe(false); // Model memory cannot be used for PIC!
  });

  it("PIC closed vocabulary: Memory can only support names in official roster", () => {
    const memoryOfficial: OcrMemoryEntry[] = [
      {
        id: "m-pic-official",
        field: "pic",
        rawOCRValue: "ROHA1IA",
        manualCorrectedValue: "ROHALIA",
        rowContext: {},
        sampleCount: 3,
        conflictCount: 0,
        confidence: 0.92,
        createdAt: 0,
        lastSeen: 0,
      },
    ];

    const rows: ParsedData[] = [
      {
        tanggal: "2026-09-24",
        jam_in: "08:00",
        jam_out: "09:00",
        data_pembanding: "123456",
        costumer: "EPSON",
        model: "TEST",
        part_number: "",
        pic: "ROHA1IA",
        remark: "ROLL 1",
        operator: "RUDI",
      },
    ];

    const { rows: finalRows } = applyMemorySupportLayer(
      rows,
      rows,
      memoryOfficial,
      DEFAULT_MASTER_RECORDS,
      sampleRoster, // sampleRoster contains ROHALIA
      new Set(),
      true
    );

    expect(finalRows[0].pic).toBe("ROHALIA");

    // Unofficial memory candidate is rejected:
    const memoryUnofficial: OcrMemoryEntry[] = [
      {
        id: "m-pic-unofficial",
        field: "pic",
        rawOCRValue: "BAMB1",
        manualCorrectedValue: "BAMBANG_UNOFFICIAL",
        rowContext: {},
        sampleCount: 5,
        conflictCount: 0,
        confidence: 0.95,
        createdAt: 0,
        lastSeen: 0,
      },
    ];

    const rowsUnofficial: ParsedData[] = [
      {
        tanggal: "2026-09-24",
        jam_in: "08:00",
        jam_out: "09:00",
        data_pembanding: "123456",
        costumer: "EPSON",
        model: "TEST",
        part_number: "",
        pic: "BAMB1",
        remark: "ROLL 1",
        operator: "RUDI",
      },
    ];

    const { rows: finalRowsUnofficial } = applyMemorySupportLayer(
      rowsUnofficial,
      rowsUnofficial,
      memoryUnofficial,
      DEFAULT_MASTER_RECORDS,
      sampleRoster, // does NOT contain BAMBANG_UNOFFICIAL
      new Set(),
      true
    );

    // Kept raw/baseline because candidate is not in official roster!
    expect(finalRowsUnofficial[0].pic).toBe("BAMB1");
  });

  it("Conflicts: Conflicting user corrections reduce confidence and are not applied", () => {
    let memory: OcrMemoryEntry[] = [];
    // User 1 corrected "NANI" to "NANA"
    const step1 = recordManualCorrection(memory, {
      field: "operator",
      rawOCRValue: "NANI",
      manualCorrectedValue: "NANA",
      rowContext: {},
    });
    memory = step1.updatedEntries;

    // Later, user corrected similar visual "NANI" to "NURI"
    const step2 = recordManualCorrection(memory, {
      field: "operator",
      rawOCRValue: "NANI",
      manualCorrectedValue: "NURI",
      rowContext: {},
    });
    memory = step2.updatedEntries;

    // Both entries have conflictCount > 0, confidence < 0.50
    expect(memory[0].conflictCount).toBeGreaterThan(0);
    const retrieval = retrieveMemoryCandidate("operator", "NANI", {}, memory);
    expect(retrieval.isConflict).toBe(true);
    expect(retrieval.hasCandidate).toBe(false);
  });

  it("User Manual Edit Priority: Never overwrite a cell manually edited by user", () => {
    const memory: OcrMemoryEntry[] = [
      {
        id: "m-model",
        field: "model",
        rawOCRValue: "PACKAGE LABEL LC521TN",
        manualCorrectedValue: "PACKAGE LABEL LC521TM",
        rowContext: {},
        sampleCount: 5,
        conflictCount: 0,
        confidence: 0.95,
        createdAt: 0,
        lastSeen: 0,
      },
    ];

    const rows: ParsedData[] = [
      {
        tanggal: "2026-09-24",
        jam_in: "08:00",
        jam_out: "09:00",
        data_pembanding: "123456",
        costumer: "EPSON",
        model: "MY_MANUAL_MODEL",
        part_number: "",
        pic: "NAZAR",
        remark: "ROLL 1",
        operator: "RUDI",
      },
    ];

    const manualEditedKeys = new Set(["0:model"]);

    const { rows: finalRows } = applyMemorySupportLayer(
      rows,
      rows,
      memory,
      DEFAULT_MASTER_RECORDS,
      sampleRoster,
      manualEditedKeys,
      true
    );

    expect(finalRows[0].model).toBe("MY_MANUAL_MODEL");
  });
});
