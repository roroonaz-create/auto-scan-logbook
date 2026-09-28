import React, { useState } from "react";
import {
  ShieldAlert,
  Terminal,
  Layers,
  ChevronDown,
  ChevronUp,
  Cpu,
  RefreshCw,
  CheckCircle2,
  XCircle,
  X,
  Settings,
} from "lucide-react";
import { PostProcessingLayers, ScanResponse, OcrEngine } from "../types";

interface DiagnosticControlBarProps {
  isOpen: boolean;
  onClose: () => void;
  pureRawOcr: boolean;
  onTogglePureRawOcr: (val: boolean) => void;
  ignorePersistentMemory: boolean;
  onToggleIgnoreMemory: (val: boolean) => void;
  layers: PostProcessingLayers;
  onLayersChange: (layers: PostProcessingLayers) => void;
  diagnosticLog: ScanResponse["diagnosticLog"] | null;
  hasScanResult: boolean;
  onReapplyLayers: () => void;
  ocrEngine?: OcrEngine;
  onApplyPreset?: (step: number) => void;
}

export const DiagnosticControlBar: React.FC<DiagnosticControlBarProps> = ({
  isOpen,
  onClose,
  pureRawOcr,
  onTogglePureRawOcr,
  ignorePersistentMemory,
  onToggleIgnoreMemory,
  layers,
  onLayersChange,
  diagnosticLog,
  hasScanResult,
  onReapplyLayers,
  ocrEngine = "gemini",
  onApplyPreset,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showLogModal, setShowLogModal] = useState(false);

  // When closed, render nothing to avoid taking any vertical space
  if (!isOpen) {
    return null;
  }

  // Apply one of the 8 ordered presets
  const applyPreset = (step: number) => {
    if (onApplyPreset) {
      onApplyPreset(step);
      return;
    }

    if (step === 1) {
      onTogglePureRawOcr(true);
      onLayersChange({
        dataPembanding: false,
        pic: false,
        remark: false,
        ditto: false,
        masterMatch: false,
        timeRecon: false,
        memory: false,
      });
      return;
    }

    onTogglePureRawOcr(false);
    onLayersChange({
      dataPembanding: step >= 2,
      ditto: step >= 3,
      pic: step >= 4,
      remark: step >= 5,
      masterMatch: step >= 6,
      timeRecon: step >= 7,
      memory: step >= 8,
    });
  };

  const toggleLayer = (layerKey: keyof PostProcessingLayers) => {
    onTogglePureRawOcr(false);
    onLayersChange({
      ...layers,
      [layerKey]: !layers[layerKey],
    });
  };

  return (
    <div className="bg-slate-900 border-b border-slate-800 text-slate-100 px-4 py-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Mode Status Indicator */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  pureRawOcr ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  pureRawOcr ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
            </span>
            <span className="font-semibold text-slate-200">
              {layers.dataPembanding && !layers.pic && !layers.remark && !layers.ditto && !layers.timeRecon && !layers.memory
                ? "DIAGNOSTIC: DATA PEMBANDING ONLY"
                : pureRawOcr
                ? "DIAGNOSTIC MODE: PURE RAW OCR"
                : "DIAGNOSTIC: MODULAR POST-PROCESSING"}
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase border ${
              ocrEngine === "mistral"
                ? "bg-amber-950/80 border-amber-800 text-amber-300"
                : "bg-blue-950/80 border-blue-800 text-blue-300"
            }`}>
              {ocrEngine === "mistral" ? "Engine: Mistral OCR" : "Engine: Gemini"}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-slate-400 font-mono text-[11px]">
            {layers.dataPembanding && !layers.pic && !layers.remark && !layers.ditto && !layers.timeRecon && !layers.memory ? (
              <span className="text-sky-300 bg-sky-950/70 border border-sky-800 px-2 py-0.5 rounded">
                Data Pembanding: ON (6 Karakter) &bull; Kolom Lain: RAW OCR Murni
              </span>
            ) : pureRawOcr ? (
              <span className="text-emerald-400 bg-emerald-950/70 border border-emerald-800 px-2 py-0.5 rounded">
                Memory: OFF &bull; Rules: OFF &bull; Post-Processing: OFF
              </span>
            ) : (
              <span className="text-amber-300 bg-amber-950/70 border border-amber-800 px-2 py-0.5 rounded">
                Layer aktif:{" "}
                {Object.entries(layers)
                  .filter(([, v]) => v)
                  .map(([k]) => k)
                  .join(", ") || "None (Pure)"}
              </span>
            )}
          </div>
        </div>

        {/* Right: Quick Controls & Preset Sequence */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle PURE_RAW_OCR button */}
          <button
            type="button"
            onClick={() => onTogglePureRawOcr(!pureRawOcr)}
            className={`px-2.5 py-1 rounded text-xs font-medium border transition ${
              pureRawOcr
                ? "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 shadow-sm"
                : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
            }`}
            title="Aktifkan/Matikan Mode PURE RAW OCR"
          >
            PURE RAW OCR: {pureRawOcr ? "ON" : "OFF"}
          </button>

          {/* Ignore Memory toggle */}
          <button
            type="button"
            onClick={() => onToggleIgnoreMemory(!ignorePersistentMemory)}
            className={`px-2.5 py-1 rounded text-xs font-medium border transition ${
              ignorePersistentMemory
                ? "bg-indigo-900/60 text-indigo-300 border-indigo-700"
                : "bg-slate-800 text-slate-400 border-slate-700"
            }`}
            title="Abaikan Persistent Memory tanpa menghapus datanya"
          >
            Bypass Memory: {ignorePersistentMemory ? "ON" : "OFF"}
          </button>

          {/* Audit Log Modal Button */}
          {diagnosticLog && (
            <button
              type="button"
              onClick={() => setShowLogModal(true)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title="Lihat Audit Log Request OCR"
            >
              <Terminal className="w-3.5 h-3.5 text-blue-400" />
              <span>Audit Log</span>
            </button>
          )}

          {/* Toggle Expand Details & Layer Controls */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>Uji Layer (1 s.d. 8)</span>
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>

          {/* Close Diagnostics Panel Button */}
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            title="Tutup Panel Diagnostik"
          >
            <X className="w-3.5 h-3.5 text-slate-400" />
            <span>Tutup</span>
          </button>
        </div>
      </div>

      {/* Expandable Layer Diagnostic Toolbar */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-slate-800 space-y-3">
          {/* Preset Buttons 1 to 8 */}
          <div>
            <div className="text-[11px] text-slate-400 mb-1.5 flex items-center justify-between">
              <span>
                <strong>Urutan Isolasi Regression:</strong> Aktifkan komponen satu per satu untuk menemukan layer penyebab masalah:
              </span>
              {hasScanResult && (
                <button
                  type="button"
                  onClick={onReapplyLayers}
                  className="flex items-center gap-1 text-sky-400 hover:text-sky-300 text-[11px] transition"
                  title="Terapkan layer langsung ke hasil raw OCR saat ini"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Update Tabel Instan</span>
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => applyPreset(1)}
                className={`px-2 py-1 rounded text-[11px] font-mono border transition ${
                  pureRawOcr
                    ? "bg-emerald-600 text-white border-emerald-400 font-semibold"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                }`}
              >
                1. RAW OCR Murni
              </button>

              <button
                type="button"
                onClick={() => applyPreset(2)}
                className={`px-2 py-1 rounded text-[11px] font-mono border transition ${
                  !pureRawOcr && layers.dataPembanding && !layers.ditto
                    ? "bg-sky-600 text-white border-sky-400 font-semibold"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                }`}
              >
                2. + Data Pembanding
              </button>

              <button
                type="button"
                onClick={() => applyPreset(3)}
                className={`px-2 py-1 rounded text-[11px] font-mono border transition ${
                  !pureRawOcr && layers.ditto && !layers.pic
                    ? "bg-sky-600 text-white border-sky-400 font-semibold"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                }`}
              >
                3. + Ditto (\")
              </button>

              <button
                type="button"
                onClick={() => applyPreset(4)}
                className={`px-2 py-1 rounded text-[11px] font-mono border transition ${
                  !pureRawOcr && layers.pic && !layers.remark
                    ? "bg-sky-600 text-white border-sky-400 font-semibold"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                }`}
              >
                4. + PIC
              </button>

              <button
                type="button"
                onClick={() => applyPreset(5)}
                className={`px-2 py-1 rounded text-[11px] font-mono border transition ${
                  !pureRawOcr && layers.remark && (!layers.masterMatch || layers.masterMatch === false)
                    ? "bg-sky-600 text-white border-sky-400 font-semibold"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                }`}
              >
                5. + REMARK
              </button>

              <button
                type="button"
                onClick={() => applyPreset(6)}
                className={`px-2 py-1 rounded text-[11px] font-mono border transition ${
                  !pureRawOcr && layers.masterMatch && !layers.timeRecon
                    ? "bg-sky-600 text-white border-sky-400 font-semibold"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                }`}
              >
                6. + Master Matcher
              </button>

              <button
                type="button"
                onClick={() => applyPreset(7)}
                className={`px-2 py-1 rounded text-[11px] font-mono border transition ${
                  !pureRawOcr && layers.timeRecon && !layers.memory
                    ? "bg-sky-600 text-white border-sky-400 font-semibold"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                }`}
              >
                7. + Time Recon
              </button>

              <button
                type="button"
                onClick={() => applyPreset(8)}
                className={`px-2 py-1 rounded text-[11px] font-mono border transition ${
                  !pureRawOcr && layers.memory
                    ? "bg-purple-600 text-white border-purple-400 font-semibold"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                }`}
              >
                8. + OCR Memory
              </button>
            </div>
          </div>

          {/* Individual Granular Toggles */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-[11px] border-t border-slate-800">
            <span className="text-slate-400">Saklar Individual:</span>

            <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-200">
              <input
                type="checkbox"
                checked={!pureRawOcr && layers.dataPembanding}
                onChange={() => toggleLayer("dataPembanding")}
                className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-0"
              />
              <span>Data Pembanding (6 Digit)</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-200">
              <input
                type="checkbox"
                checked={!pureRawOcr && layers.pic}
                onChange={() => toggleLayer("pic")}
                className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-0"
              />
              <span>PIC (Official Roster)</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-200">
              <input
                type="checkbox"
                checked={!pureRawOcr && layers.remark}
                onChange={() => toggleLayer("remark")}
                className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-0"
              />
              <span>REMARK (R → ROLL)</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-200">
              <input
                type="checkbox"
                checked={!pureRawOcr && layers.ditto}
                onChange={() => toggleLayer("ditto")}
                className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-0"
              />
              <span>Ditto (Copy Previous Row)</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-200">
              <input
                type="checkbox"
                checked={!pureRawOcr && layers.masterMatch !== false}
                onChange={() => toggleLayer("masterMatch")}
                className="rounded border-slate-600 bg-slate-800 text-sky-400 focus:ring-0"
              />
              <span className="text-sky-300 font-medium">Master Match (Customer/Model/PN)</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-200">
              <input
                type="checkbox"
                checked={!pureRawOcr && layers.timeRecon}
                onChange={() => toggleLayer("timeRecon")}
                className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-0"
              />
              <span>Time Reconstruction</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-200">
              <input
                type="checkbox"
                checked={!pureRawOcr && layers.memory}
                onChange={() => toggleLayer("memory")}
                className="rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-0"
              />
              <span>OCR Memory (Supporting Evidence)</span>
            </label>
          </div>
        </div>
      )}

      {/* Audit Log Modal */}
      {showLogModal && diagnosticLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 text-slate-100 rounded-lg max-w-2xl w-full p-5 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-sm">Audit Log Request OCR</span>
              </div>
              <button
                type="button"
                onClick={() => setShowLogModal(false)}
                className="text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="py-4 overflow-y-auto space-y-3 font-mono text-xs text-slate-300">
              <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-1.5">
                <div><span className="text-slate-500 font-semibold">OCR ENGINE:</span> <span className="text-amber-400 font-bold uppercase">{diagnosticLog.ocrEngine || ocrEngine}</span></div>
                <div><span className="text-slate-500 font-semibold">MODEL NAME:</span> <span className="text-slate-200">{diagnosticLog.modelName}</span></div>
                {diagnosticLog.mistralDebug && (
                  <>
                    <div><span className="text-slate-500 font-semibold">REQUEST SUCCESS:</span> <span className="text-emerald-400 font-bold">{diagnosticLog.mistralDebug.requestSuccess ? "true" : "false"}</span></div>
                    {diagnosticLog.mistralDebug.originalImage && (
                      <div><span className="text-slate-500 font-semibold">ORIGINAL IMAGE:</span> <span className="text-slate-200 font-bold">{diagnosticLog.mistralDebug.originalImage.width} × {diagnosticLog.mistralDebug.originalImage.height}</span></div>
                    )}
                    {diagnosticLog.mistralDebug.sentImage && (
                      <div><span className="text-slate-500 font-semibold">MISTRAL IMAGE:</span> <span className="text-slate-200 font-bold">{diagnosticLog.mistralDebug.sentImage.width} × {diagnosticLog.mistralDebug.sentImage.height}</span></div>
                    )}
                    <div><span className="text-slate-500 font-semibold">MISTRAL PAGE COUNT:</span> <span className="text-slate-200 font-bold">{diagnosticLog.mistralDebug.pageCount || 1}</span></div>
                    <div><span className="text-slate-500 font-semibold">MISTRAL TABLE COUNT:</span> <span className="text-slate-200 font-bold">{diagnosticLog.mistralDebug.tableCount || 1}</span></div>
                    <div><span className="text-slate-500 font-semibold">RAW RESPONSE LENGTH:</span> <span className="text-slate-200 font-bold">{diagnosticLog.mistralDebug.rawResponseLength}</span></div>
                    <div><span className="text-slate-500 font-semibold">PARSED ROW COUNT:</span> <span className="text-emerald-400 font-bold">{diagnosticLog.mistralDebug.parsedRowCount}</span></div>
                    <div><span className="text-slate-500 font-semibold">FINAL ROW COUNT:</span> <span className="text-emerald-400 font-bold">{diagnosticLog.mistralDebug.finalRowCount || diagnosticLog.mistralDebug.parsedRowCount}</span></div>
                  </>
                )}
                {diagnosticLog.ocrEngine !== "mistral" && (
                  <>
                    <div><span className="text-slate-500 font-semibold">TEMPERATURE:</span> <span className="text-emerald-400 font-bold">{diagnosticLog.temperature}</span></div>
                    <div><span className="text-slate-500 font-semibold">TOP_P:</span> <span className="text-emerald-400 font-bold">{diagnosticLog.topP}</span></div>
                    <div><span className="text-slate-500 font-semibold">SYSTEM INSTRUCTION:</span> <span className="text-slate-300 whitespace-pre-wrap">{diagnosticLog.systemInstruction}</span></div>
                    <div><span className="text-slate-500 font-semibold">CHAT HISTORY LENGTH:</span> <span className="text-emerald-400 font-bold">{diagnosticLog.chatHistoryLength}</span></div>
                    <div><span className="text-slate-500 font-semibold">PREVIOUS OCR RESULTS SENT:</span> <span className="text-emerald-400 font-bold">{diagnosticLog.previousOcrResultsSent}</span></div>
                    <div>
                      <span className="text-slate-500 font-semibold">MEMORY ITEMS SENT:</span>{" "}
                      <span className={diagnosticLog.memoryItemsSent === 0 ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                        {diagnosticLog.memoryItemsSent}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-semibold">MASTER DATA SENT:</span>{" "}
                      <span className={diagnosticLog.masterDataSent === 0 ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                        {diagnosticLog.masterDataSent}
                      </span>
                    </div>
                  </>
                )}
                <div>
                  <span className="text-slate-500 font-semibold">POST PROCESSING ENABLED:</span>{" "}
                  <span className={diagnosticLog.postProcessingEnabled === "OFF" ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                    {diagnosticLog.postProcessingEnabled}
                  </span>
                </div>
                <div><span className="text-slate-500 font-semibold">IMAGE RESOLUTION:</span> {diagnosticLog.imageResolution}</div>
                <div><span className="text-slate-500 font-semibold">IMAGE SIZE:</span> {diagnosticLog.imageSize}</div>
              </div>

              {diagnosticLog.mistralDebug?.rawTablePreview && (
                <div>
                  <div className="text-slate-400 font-semibold mb-1">MISTRAL RAW TABLE CONTENT:</div>
                  <pre className="p-3 rounded bg-slate-950 border border-slate-800 whitespace-pre-wrap text-[11px] text-slate-300 leading-relaxed max-h-60 overflow-y-auto">
                    {diagnosticLog.mistralDebug.rawTablePreview}
                  </pre>
                </div>
              )}

              <div>
                <div className="text-slate-400 font-semibold mb-1">OCR PROMPT:</div>
                <pre className="p-3 rounded bg-slate-950 border border-slate-800 whitespace-pre-wrap text-[11px] text-slate-300 leading-relaxed max-h-60 overflow-y-auto">
                  {diagnosticLog.ocrPrompt}
                </pre>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowLogModal(false)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-white text-xs"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
