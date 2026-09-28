import React from "react";
import { Lock, Unlock, Sliders, HelpCircle, FileText, Database, Settings, ChevronDown, ChevronUp } from "lucide-react";
import { ThemeConfig } from "../themes";
import { OcrEngine } from "../types";

interface NavbarProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  activeModel: string;
  quotaPercent: number;
  memoryRuleCount: number;
  onOpenMemoryModal: () => void;
  onOpenFormatGuide: () => void;
  themeConfig: ThemeConfig;
  onOpenThemeModal?: () => void;
  lockedPicCount: number;
  isPicLocked: boolean;
  onOpenPicRosterModal: () => void;
  masterCatalogCount?: number;
  onOpenMasterCatalogModal?: () => void;
  ocrEngine?: OcrEngine;
  memoryActive?: boolean;
  isDiagnosticsOpen?: boolean;
  onToggleDiagnostics?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  memoryRuleCount,
  onOpenMemoryModal,
  onOpenFormatGuide,
  lockedPicCount,
  isPicLocked,
  onOpenPicRosterModal,
  masterCatalogCount = 0,
  onOpenMasterCatalogModal,
  ocrEngine = "gemini",
  memoryActive = true,
  isDiagnosticsOpen = false,
  onToggleDiagnostics,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 h-13 px-5 flex items-center justify-between gap-4 sticky top-0 z-30 select-none">
      {/* Brand & Desktop App Title */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-7 h-7 rounded border border-slate-300 bg-slate-900 text-white flex items-center justify-center">
          <FileText className="w-4 h-4 text-slate-100" strokeWidth={1.5} />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-sm text-slate-900 tracking-tight">
            Auto-Scan Logbook
          </span>
          <span className="text-xs text-slate-400 font-normal">
            &bull; Ekstraksi Tulisan Tangan ke TSV
          </span>
        </div>
      </div>

      {/* Center Calm Operational Statement */}
      <div className="hidden xl:flex items-center text-xs text-slate-500 font-normal truncate max-w-xl">
        <span>
          Hasil scan hanya mengambil teks yang benar-benar terlihat; bagian tidak terbaca ditandai, bukan ditebak.
        </span>
      </div>

      {/* Right Desktop Toolbar Controls */}
      <div className="flex items-center gap-1.5 shrink-0 text-xs">
        {/* Compact Normal View Status Indicator */}
        <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700 select-none">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
            <span className="font-semibold text-slate-800">
              {ocrEngine === "mistral" ? "Mistral OCR" : "Gemini"}
            </span>
            <span className="text-[11px] text-slate-500 font-normal">● Ready</span>
          </div>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${memoryActive ? "bg-purple-600" : "bg-slate-400"} inline-block`} />
            <span className="text-slate-700">Memory</span>
            <span className="text-[11px] text-slate-500 font-normal">
              ● {memoryActive ? "On" : "Off"}
            </span>
          </div>
        </div>

        {/* Master Catalog (Customer + Model + Part Number) */}
        {onOpenMasterCatalogModal && (
          <button
            id="btn-nav-master-catalog"
            type="button"
            onClick={onOpenMasterCatalogModal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition"
            title="Kelola Master Data Resmi (Customer, Model, Part Number)"
          >
            <Database className="w-3.5 h-3.5 text-sky-600" strokeWidth={1.5} />
            <span>Master Data ({masterCatalogCount})</span>
          </button>
        )}

        {/* Locked PIC Roster */}
        <button
          id="btn-nav-pic-roster"
          type="button"
          onClick={onOpenPicRosterModal}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition"
          title="Kelola & Kunci Daftar Anggota PIC Resmi"
        >
          {isPicLocked ? (
            <Lock className="w-3.5 h-3.5 text-slate-600" strokeWidth={1.5} />
          ) : (
            <Unlock className="w-3.5 h-3.5 text-amber-600" strokeWidth={1.5} />
          )}
          <span>PIC ({lockedPicCount})</span>
        </button>

        {/* AI Memory Rules */}
        <button
          id="btn-nav-ai-memory"
          type="button"
          onClick={onOpenMemoryModal}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition"
          title="Aturan Koreksi Memori AI"
        >
          <Sliders className="w-3.5 h-3.5 text-slate-600" strokeWidth={1.5} />
          <span>Memori ({memoryRuleCount})</span>
        </button>

        {/* Format Guide */}
        <button
          id="btn-nav-format-guide"
          type="button"
          onClick={onOpenFormatGuide}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition"
          title="Panduan Format Logbook TSV"
        >
          <HelpCircle className="w-3.5 h-3.5 text-slate-500" strokeWidth={1.5} />
          <span>Panduan Format</span>
        </button>

        {/* Diagnostics Utility Button */}
        {onToggleDiagnostics && (
          <button
            id="btn-nav-diagnostics"
            type="button"
            onClick={onToggleDiagnostics}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-medium transition ${
              isDiagnosticsOpen
                ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200"
            }`}
            title="Buka / Tutup Panel Diagnostik Modular Post-Processing"
          >
            <Settings className="w-3.5 h-3.5 text-slate-500" strokeWidth={1.5} />
            <span>Diagnostics</span>
            {isDiagnosticsOpen ? (
              <ChevronUp className="w-3 h-3 text-slate-400" />
            ) : (
              <ChevronDown className="w-3 h-3 text-slate-400" />
            )}
          </button>
        )}
      </div>
    </header>
  );
};
