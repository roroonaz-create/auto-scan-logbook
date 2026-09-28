import { describe, it, expect, beforeEach } from "vitest";
import {
  computeActiveLayer,
  loadDiagnosticState,
  saveDiagnosticState,
} from "./diagnosticPersistence";
import {
  DEFAULT_DIAGNOSTIC_STATE,
  DIAGNOSTIC_STORAGE_KEY,
  PostProcessingLayers,
} from "../types";

class MockStorage implements Storage {
  private store: Record<string, string> = {};

  get length(): number {
    return Object.keys(this.store).length;
  }

  clear(): void {
    this.store = {};
  }

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }

  key(index: number): string | null {
    return Object.keys(this.store)[index] ?? null;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  setItem(key: string, value: string): void {
    this.store[key] = value;
  }
}

describe("Diagnostic Post-Processing State Persistence & Defaults", () => {
  let mockStorage: Storage;

  beforeEach(() => {
    mockStorage = new MockStorage();
  });

  it("1. DEFAULT OPERASIONAL: falls back to full pipeline (all layers 1..8 ON, activeLayer: 8) when empty", () => {
    const loaded = loadDiagnosticState(mockStorage);
    expect(loaded).toEqual({
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
    });
  });

  it("2. DEFAULT OPERASIONAL: falls back to full pipeline when saved state is invalid json or corrupt", () => {
    mockStorage.setItem(DIAGNOSTIC_STORAGE_KEY, "invalid-json{{");
    const loaded = loadDiagnosticState(mockStorage);
    expect(loaded).toEqual(DEFAULT_DIAGNOSTIC_STATE);

    mockStorage.setItem(DIAGNOSTIC_STORAGE_KEY, JSON.stringify({ corrupt: true }));
    const loaded2 = loadDiagnosticState(mockStorage);
    expect(loaded2).toEqual(DEFAULT_DIAGNOSTIC_STATE);
  });

  it("3. PERSIST USER CHANGES: saves and restores custom manual toggle configuration", () => {
    const customLayers: PostProcessingLayers = {
      dataPembanding: true,
      pic: true,
      remark: true,
      ditto: true,
      masterMatch: true,
      timeRecon: false, // user manually switched off
      memory: false,    // user manually switched off
    };

    saveDiagnosticState(customLayers, false, false, mockStorage);

    const savedRaw = mockStorage.getItem(DIAGNOSTIC_STORAGE_KEY);
    expect(savedRaw).toBeDefined();
    const parsed = JSON.parse(savedRaw!);
    expect(parsed.timeRecon).toBe(false);
    expect(parsed.memory).toBe(false);
    expect(parsed.activeLayer).toBe(6);

    const restored = loadDiagnosticState(mockStorage);
    expect(restored.timeRecon).toBe(false);
    expect(restored.memory).toBe(false);
    expect(restored.activeLayer).toBe(6);
  });

  it("4. PURE RAW OCR: correctly persists and restores pureRawOcr state", () => {
    const layers: PostProcessingLayers = {
      dataPembanding: false,
      pic: false,
      remark: false,
      ditto: false,
      masterMatch: false,
      timeRecon: false,
      memory: false,
    };

    saveDiagnosticState(layers, true, false, mockStorage);

    const restored = loadDiagnosticState(mockStorage);
    expect(restored.pureRawOcr).toBe(true);
    expect(restored.activeLayer).toBe(1);
  });

  it("5. BYPASS MEMORY: correctly persists and restores bypassMemory state", () => {
    const fullLayers: PostProcessingLayers = {
      dataPembanding: true,
      pic: true,
      remark: true,
      ditto: true,
      masterMatch: true,
      timeRecon: true,
      memory: true,
    };

    saveDiagnosticState(fullLayers, false, true, mockStorage);

    const restored = loadDiagnosticState(mockStorage);
    expect(restored.bypassMemory).toBe(true);
    expect(restored.memory).toBe(true);
    expect(restored.activeLayer).toBe(8);
  });

  it("6. computeActiveLayer: correctly computes progression stages 1 through 8", () => {
    // Pure Raw OCR
    expect(computeActiveLayer(true, {
      dataPembanding: false, pic: false, remark: false, ditto: false, masterMatch: false, timeRecon: false, memory: false
    })).toBe(1);

    // Stage 2: Data Pembanding
    expect(computeActiveLayer(false, {
      dataPembanding: true, pic: false, remark: false, ditto: false, masterMatch: false, timeRecon: false, memory: false
    })).toBe(2);

    // Stage 3: Ditto
    expect(computeActiveLayer(false, {
      dataPembanding: true, pic: false, remark: false, ditto: true, masterMatch: false, timeRecon: false, memory: false
    })).toBe(3);

    // Stage 4: PIC
    expect(computeActiveLayer(false, {
      dataPembanding: true, pic: true, remark: false, ditto: true, masterMatch: false, timeRecon: false, memory: false
    })).toBe(4);

    // Stage 5: REMARK
    expect(computeActiveLayer(false, {
      dataPembanding: true, pic: true, remark: true, ditto: true, masterMatch: false, timeRecon: false, memory: false
    })).toBe(5);

    // Stage 6: Master Matcher
    expect(computeActiveLayer(false, {
      dataPembanding: true, pic: true, remark: true, ditto: true, masterMatch: true, timeRecon: false, memory: false
    })).toBe(6);

    // Stage 7: Time Reconstruction
    expect(computeActiveLayer(false, {
      dataPembanding: true, pic: true, remark: true, ditto: true, masterMatch: true, timeRecon: true, memory: false
    })).toBe(7);

    // Stage 8: OCR Memory (Full Pipeline)
    expect(computeActiveLayer(false, {
      dataPembanding: true, pic: true, remark: true, ditto: true, masterMatch: true, timeRecon: true, memory: true
    })).toBe(8);
  });
});
