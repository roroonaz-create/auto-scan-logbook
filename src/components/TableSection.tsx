import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Download,
  Copy,
  Check,
  Search,
  Plus,
  Trash2,
  Table as TableIcon,
  Code,
  AlertTriangle,
  FileSpreadsheet,
  Maximize2,
  Minimize2,
  Info,
  X,
} from "lucide-react";
import { ParsedData, CellDiff, RowConfidence, UncertaintyNote } from "../types";
import { ThemeConfig } from "../themes";

interface TableCellInputProps {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  minWidthCh?: number;
  hasCorrection?: boolean;
}

const TableCellInput: React.FC<TableCellInputProps> = React.memo(({
  value,
  onChange,
  className = "",
  minWidthCh = 10,
  hasCorrection = false,
}) => {
  const [localVal, setLocalVal] = useState(value);
  const isFocusedRef = useRef(false);

  // Sync external changes (e.g. from new scan or batch update) when user is not actively editing
  useEffect(() => {
    if (!isFocusedRef.current) {
      setLocalVal(value);
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setLocalVal(next);
    onChange(next);
  };

  const handleFocus = () => {
    isFocusedRef.current = true;
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = false;
    onChange(e.target.value);
  };

  return (
    <div className="relative w-full group/cell">
      <input
        type="text"
        value={localVal}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={{ minWidth: `${Math.max((localVal || "").length + 2, minWidthCh)}ch` }}
        className={className}
      />
      {hasCorrection && (
        <span
          className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500 pointer-events-none"
          title="Koreksi manual tersimpan"
        />
      )}
    </div>
  );
});

interface TableSectionProps {
  scanResult: ParsedData[];
  rawAiResult: ParsedData[] | null;
  tsvString?: string;
  uncertaintyNotes?: UncertaintyNote[];
  imageQualityStatus?: "valid" | "rejected";
  rejectionReason?: string;
  confidences?: RowConfidence[];
  editedDiffList: CellDiff[];
  autoCorrectedCount: number;
  availablePics?: string[];
  availableRemarks?: string[];
  availableModels?: string[];
  themeConfig: ThemeConfig;
  tableFontSize?: "sm" | "base" | "lg";
  lockedPics?: string[];
  isPicLocked?: boolean;
  isExpanded?: boolean;
  debugTracesCount?: number;
  onOpenDebugModal?: () => void;
  onToggleExpand?: () => void;
  onOpenPicRosterModal?: () => void;
  onCellEdit: (rowIndex: number, field: keyof ParsedData, value: string) => void;
  onBatchUpdate?: (rowIndices: number[], updates: Partial<ParsedData>) => void;
  onBatchDelete?: (rowIndices: number[]) => void;
  onAddRow: () => void;
  onDeleteRow: (rowIndex: number) => void;
  onCopyExcel: () => void;
  onSaveMemory: () => void;
  onOpenMemoryModal: () => void;
  onOpenFormatGuide: () => void;
  onOpenThemeModal?: () => void;
}

export const TableSection: React.FC<TableSectionProps> = ({
  scanResult,
  rawAiResult,
  tsvString: initialTsvString,
  uncertaintyNotes = [],
  imageQualityStatus = "valid",
  rejectionReason = "",
  editedDiffList,
  availablePics = [],
  lockedPics = [],
  isPicLocked = true,
  isExpanded = false,
  debugTracesCount,
  onOpenDebugModal,
  onToggleExpand,
  onCellEdit,
  onBatchUpdate,
  onBatchDelete,
  onAddRow,
  onDeleteRow,
  onCopyExcel,
  onSaveMemory,
}) => {
  const [activeTab, setActiveTab] = useState<"table" | "tsv">("table");
  const [searchQuery, setSearchQuery] = useState("");
  const [hasCopiedTsv, setHasCopiedTsv] = useState(false);
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [batchPic, setBatchPic] = useState("");
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);

  // Compute live TSV string from current scanResult (including user edits)
  const currentTsvString = useMemo(() => {
    const headers = [
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
    ];
    const rows = scanResult.map((r) =>
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
    );
    return [headers.join("\t"), ...rows].join("\n");
  }, [scanResult]);

  // Handle Download TSV File
  const handleDownloadTsv = () => {
    const blob = new Blob([currentTsvString], {
      type: "text/tab-separated-values;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute("download", `logbook_scan_${dateStr}.tsv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Handle Copy TSV
  const handleCopyTsvText = () => {
    navigator.clipboard.writeText(currentTsvString).then(() => {
      setHasCopiedTsv(true);
      setTimeout(() => setHasCopiedTsv(false), 2500);
    });
  };

  // Unique PICs list
  const allPicOptions = useMemo(() => {
    const list = lockedPics.length > 0 ? lockedPics : availablePics;
    const set = new Set<string>(list.map((p) => p.trim().toUpperCase()));
    scanResult.forEach((row) => row.pic && set.add(row.pic.trim().toUpperCase()));
    return Array.from(set).filter(Boolean);
  }, [lockedPics, availablePics, scanResult]);

  // Filtered rows for search
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) {
      return scanResult.map((item, originalIndex) => ({ item, originalIndex }));
    }
    const q = searchQuery.toLowerCase();
    return scanResult
      .map((item, originalIndex) => ({ item, originalIndex }))
      .filter(({ item }) =>
        Object.values(item).some((val) => String(val).toLowerCase().includes(q))
      );
  }, [scanResult, searchQuery]);

  // Selection handlers
  const isAllFilteredSelected = useMemo(() => {
    if (filteredRows.length === 0) return false;
    return filteredRows.every(({ originalIndex }) => selectedIndices.has(originalIndex));
  }, [filteredRows, selectedIndices]);

  const toggleSelectRow = (idx: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    if (isAllFilteredSelected) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(filteredRows.map((r) => r.originalIndex)));
    }
  };

  const handleApplyBatchPic = () => {
    if (selectedIndices.size === 0 || !batchPic.trim()) return;
    const cleanPic = batchPic.trim().toUpperCase();
    if (onBatchUpdate) {
      onBatchUpdate(Array.from(selectedIndices), { pic: cleanPic });
    } else {
      selectedIndices.forEach((idx) => onCellEdit(idx, "pic", cleanPic));
    }
    setBatchPic("");
  };

  const handleClearBatchRemarks = () => {
    if (selectedIndices.size === 0) return;
    if (onBatchUpdate) {
      onBatchUpdate(Array.from(selectedIndices), { remark: "" });
    } else {
      selectedIndices.forEach((idx) => onCellEdit(idx, "remark", ""));
    }
  };

  const handleConfirmBatchDelete = () => {
    if (selectedIndices.size === 0) return;
    const indicesToDelete: number[] = Array.from(selectedIndices);
    if (onBatchDelete) {
      onBatchDelete(indicesToDelete);
    } else {
      indicesToDelete.sort((a: number, b: number) => b - a).forEach((idx: number) => onDeleteRow(idx));
    }
    setSelectedIndices(new Set());
    setShowBatchDeleteConfirm(false);
  };

  const isCellDiff = (originalIndex: number, field: keyof ParsedData) => {
    if (!rawAiResult || !rawAiResult[originalIndex]) return false;
    const oldVal = String(rawAiResult[originalIndex][field] || "").trim().toUpperCase();
    const newVal = String(scanResult[originalIndex]?.[field] || "").trim().toUpperCase();
    return oldVal !== newVal && newVal !== "";
  };

  // If rejected by Gemini, display clear rejection notice
  if (imageQualityStatus === "rejected") {
    return (
      <div className="flex flex-col h-full bg-white border border-amber-300 rounded-md p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" strokeWidth={1.5} />
          <div className="space-y-1">
            <h3 className="font-semibold text-sm text-slate-900">
              Foto Logbook Memerlukan Pengambilan Ulang
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {rejectionReason ||
                "Foto terdeteksi buram atau tidak cukup jelas untuk dibaca secara akurat. Sistem tidak menebak teks yang tidak terlihat."}
            </p>
          </div>
        </div>

        <div className="border border-slate-200 bg-slate-50 rounded p-3 text-xs text-slate-600 space-y-1">
          <p className="font-semibold text-slate-800">Petunjuk Pengambilan Gambar:</p>
          <ul className="list-disc list-inside space-y-0.5 pl-1 text-slate-600">
            <li>Pastikan cahaya cukup dan hindari bayangan menutupi tulisan.</li>
            <li>Posisikan kamera tegak lurus sejajar di atas kertas.</li>
            <li>Gunakan rotasi (-90° / +90°) pada panel kiri jika gambar miring.</li>
          </ul>
        </div>
      </div>
    );
  }

  // Empty state if no scan result yet
  if (scanResult.length === 0) {
    return (
      <div className="flex flex-col h-full bg-white border border-slate-200 rounded-md overflow-hidden shadow-2xs">
        <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-slate-900 tracking-tight">
              LOGBOOK TSV
            </span>
            <span className="text-[11px] font-mono text-slate-400 font-normal">
              0 baris
            </span>
          </div>

          {onToggleExpand && (
            <button
              id="btn-toggle-expand-table-empty"
              type="button"
              onClick={onToggleExpand}
              className="px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs transition inline-flex items-center gap-1.5 shadow-2xs"
              title={isExpanded ? "Tampilkan Panel Foto Logbook" : "Perlebar Tabel ke Layar Penuh"}
            >
              {isExpanded ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-slate-500" strokeWidth={1.5} />
                  <span>Tampilkan Foto</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-slate-500" strokeWidth={1.5} />
                  <span>Perlebar Tabel</span>
                </>
              )}
            </button>
          )}
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500 space-y-1.5 select-none">
          <FileSpreadsheet className="w-7 h-7 text-slate-400 stroke-1" />
          <p className="text-xs font-semibold text-slate-700">Belum ada data logbook</p>
          <p className="text-[11px] text-slate-500 max-w-sm">
            Upload gambar pada panel kiri lalu klik <span className="font-semibold text-slate-700">Scan Data Sekarang</span>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-md overflow-hidden shadow-2xs">
      {/* Primary Top Header & Export Toolbar */}
      <div className="px-3.5 py-2 bg-slate-50/90 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
        {/* Left: Title, Row Counter & Segmented View Switcher */}
        <div className="flex items-center gap-2.5">
          <span className="font-bold text-xs text-slate-900 tracking-tight">
            LOGBOOK TSV
          </span>
          <span className="px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700 font-mono text-[11px] font-semibold">
            {scanResult.length} baris
          </span>

          {/* Segmented View Tab Switcher */}
          <div className="flex items-center border border-slate-200 rounded bg-white p-0.5 text-xs shadow-2xs">
            <button
              id="tab-view-table"
              type="button"
              onClick={() => setActiveTab("table")}
              className={`px-2 py-0.5 rounded text-xs transition ${
                activeTab === "table"
                  ? "bg-slate-900 text-white font-medium"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <TableIcon className="w-3 h-3 inline mr-1" strokeWidth={1.5} />
              <span>Tabel</span>
            </button>
            <button
              id="tab-view-tsv"
              type="button"
              onClick={() => setActiveTab("tsv")}
              className={`px-2 py-0.5 rounded text-xs transition ${
                activeTab === "tsv"
                  ? "bg-slate-900 text-white font-medium"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Code className="w-3 h-3 inline mr-1" strokeWidth={1.5} />
              <span>TSV</span>
            </button>
          </div>
        </div>

        {/* Right: Debug, Fullscreen Toggle, and Grouped Export Actions */}
        <div className="flex items-center gap-1.5 text-xs">
          {onOpenDebugModal && (
            <button
              id="btn-open-debug-log"
              type="button"
              onClick={onOpenDebugModal}
              className="px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition inline-flex items-center gap-1.5 text-[11px]"
              title="Lihat Log Evaluasi Keputusan OCR & Memori Visual"
            >
              <Info className="w-3.5 h-3.5 text-slate-500" strokeWidth={1.5} />
              <span className="hidden sm:inline">Debug</span>
              <span>({debugTracesCount || 0})</span>
            </button>
          )}

          {onToggleExpand && (
            <button
              id="btn-toggle-expand-table"
              type="button"
              onClick={onToggleExpand}
              className="px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition inline-flex items-center gap-1.5 text-xs"
              title={isExpanded ? "Tampilkan Panel Foto Logbook" : "Perlebar Tabel ke Layar Penuh"}
            >
              {isExpanded ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-slate-600" strokeWidth={1.5} />
                  <span className="hidden md:inline">Tampilkan Foto</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-slate-600" strokeWidth={1.5} />
                  <span className="hidden md:inline">Perlebar</span>
                </>
              )}
            </button>
          )}

          {/* Grouped Export Buttons */}
          <div className="flex items-center gap-1 pl-1 border-l border-slate-200">
            <button
              id="btn-download-tsv-file"
              type="button"
              onClick={handleDownloadTsv}
              className="px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition inline-flex items-center gap-1.5 text-xs font-medium"
              title="Unduh file format .TSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" strokeWidth={1.5} />
              <span>Unduh .TSV</span>
            </button>

            <button
              id="btn-copy-tsv-excel"
              type="button"
              onClick={() => {
                onCopyExcel();
                setHasCopiedTsv(true);
                setTimeout(() => setHasCopiedTsv(false), 2500);
              }}
              className="px-3 py-1 rounded bg-blue-700 hover:bg-blue-800 text-white font-semibold transition inline-flex items-center gap-1.5 text-xs shadow-xs"
              title="Salin data tabular ke clipboard untuk Excel"
            >
              {hasCopiedTsv ? (
                <>
                  <Check className="w-3.5 h-3.5 text-white" strokeWidth={1.5} />
                  <span>Tersalin!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-white" strokeWidth={1.5} />
                  <span>Salin TSV / Excel</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* TSV Monospace Text View */}
        {activeTab === "tsv" && (
          <div className="flex-1 flex flex-col p-3 overflow-hidden bg-slate-900 text-slate-100">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs">
              <span className="font-mono text-slate-400">Preview Teks Tab-Separated Values</span>
              <button
                type="button"
                onClick={handleCopyTsvText}
                className="text-xs text-blue-400 hover:text-blue-300 font-medium inline-flex items-center gap-1"
              >
                {hasCopiedTsv ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{hasCopiedTsv ? "Tersalin!" : "Salin Semua"}</span>
              </button>
            </div>
            <pre className="flex-1 font-mono text-xs leading-relaxed p-2 overflow-auto whitespace-pre selection:bg-blue-800 selection:text-white">
              {currentTsvString}
            </pre>
          </div>
        )}

        {/* Interactive Editable Table View */}
        {activeTab === "table" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Secondary Controls Bar: Search, Bulk Edit, Add Row, Save Corrections */}
            <div className="px-3.5 py-1.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
              {/* Search input with reset icon */}
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 pointer-events-none" strokeWidth={1.5} />
                <input
                  type="text"
                  placeholder="Cari dalam tabel..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded pl-7 pr-7 py-1 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 focus:bg-white w-48 sm:w-56 transition-all duration-150"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 text-slate-400 hover:text-slate-600"
                    title="Bersihkan pencarian"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Table Action Buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsBulkMode(!isBulkMode);
                    if (isBulkMode) setSelectedIndices(new Set());
                  }}
                  className={`px-2.5 py-1 rounded border text-xs font-medium transition ${
                    isBulkMode
                      ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span>Bulk Edit {selectedIndices.size > 0 ? `(${selectedIndices.size})` : ""}</span>
                </button>

                <button
                  type="button"
                  onClick={onAddRow}
                  className="px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium transition inline-flex items-center gap-1 text-xs"
                >
                  <Plus className="w-3.5 h-3.5 text-slate-600" strokeWidth={1.5} />
                  <span>Tambah Baris</span>
                </button>

                {/* Simpan Koreksi: Prominent when edits exist, subtle disabled state when 0 */}
                <button
                  type="button"
                  onClick={onSaveMemory}
                  disabled={editedDiffList.length === 0}
                  className={`px-3 py-1 rounded text-xs font-semibold transition ${
                    editedDiffList.length > 0
                      ? "bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
                      : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                  }`}
                  title={
                    editedDiffList.length > 0
                      ? "Simpan koreksi manual ke memori pembelajaran OCR"
                      : "Belum ada koreksi sel manual pada tabel"
                  }
                >
                  Simpan Koreksi {editedDiffList.length > 0 ? `(${editedDiffList.length})` : ""}
                </button>
              </div>
            </div>

            {/* Bulk Actions Bar */}
            {isBulkMode && (
              <div className="px-3.5 py-1.5 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isAllFilteredSelected}
                    onChange={handleSelectAllFiltered}
                    className="w-3.5 h-3.5 rounded text-slate-900 cursor-pointer"
                  />
                  <span className="font-medium text-slate-700">
                    {selectedIndices.size > 0
                      ? `${selectedIndices.size} baris dipilih`
                      : "Pilih semua"}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    list="bulk-pic-list"
                    placeholder="Ganti PIC..."
                    value={batchPic}
                    onChange={(e) => setBatchPic(e.target.value)}
                    className="bg-white border border-slate-300 rounded px-2 py-1 text-xs uppercase font-mono w-28"
                  />
                  <datalist id="bulk-pic-list">
                    {allPicOptions.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                  <button
                    type="button"
                    onClick={handleApplyBatchPic}
                    disabled={selectedIndices.size === 0 || !batchPic.trim()}
                    className="py-1 px-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded font-medium text-xs"
                  >
                    Set PIC
                  </button>

                  <button
                    type="button"
                    onClick={handleClearBatchRemarks}
                    disabled={selectedIndices.size === 0}
                    className="py-1 px-2 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-700 rounded font-medium text-xs"
                  >
                    Kosongkan Remark
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowBatchDeleteConfirm(true)}
                    disabled={selectedIndices.size === 0}
                    className="py-1 px-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded font-medium text-xs"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            )}

            {/* Scrollable Table Viewport with full horizontal and vertical scroll + sticky header */}
            <div className="flex-1 overflow-x-auto overflow-y-auto bg-white min-w-0">
              <table className="w-max min-w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 font-semibold uppercase tracking-wider text-[11px] sticky top-0 z-20 select-none whitespace-nowrap shadow-2xs">
                  <tr>
                    {isBulkMode && (
                      <th className="p-2 w-10 text-center bg-slate-100 sticky left-0 z-30 shrink-0 whitespace-nowrap border-r border-slate-200">
                        <input
                          type="checkbox"
                          checked={isAllFilteredSelected}
                          onChange={handleSelectAllFiltered}
                          className="w-3.5 h-3.5 rounded text-slate-900 cursor-pointer"
                        />
                      </th>
                    )}
                    <th className={`p-2 w-12 min-w-[48px] text-center bg-slate-100 shrink-0 whitespace-nowrap border-r border-slate-200 ${
                      isBulkMode ? "sticky left-10 z-30" : "sticky left-0 z-30"
                    }`}>
                      No
                    </th>
                    <th className="p-2 w-28 min-w-[105px] bg-slate-100 whitespace-nowrap">Tanggal</th>
                    <th className="p-2 w-20 min-w-[75px] bg-slate-100 whitespace-nowrap">Jam In</th>
                    <th className="p-2 w-20 min-w-[75px] bg-slate-100 whitespace-nowrap">Jam Out</th>
                    <th className="p-2 w-36 min-w-[140px] bg-slate-100 text-slate-900 font-bold whitespace-nowrap">Data Pembanding (/)</th>
                    <th className="p-2 w-32 min-w-[125px] bg-slate-100 whitespace-nowrap">Customer</th>
                    <th className="p-2 w-64 min-w-[240px] bg-slate-100 whitespace-nowrap">Model</th>
                    <th className="p-2 w-44 min-w-[165px] bg-slate-100 whitespace-nowrap">Part Number</th>
                    <th className="p-2 w-32 min-w-[125px] bg-slate-100 whitespace-nowrap">PIC</th>
                    <th className="p-2 w-48 min-w-[180px] bg-slate-100 whitespace-nowrap">Remark</th>
                    <th className="p-2 w-28 min-w-[110px] bg-slate-100 whitespace-nowrap">Operator</th>
                    <th className="p-2 text-center w-10 min-w-[36px] bg-slate-100 shrink-0 whitespace-nowrap"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-slate-900 text-xs">
                  {filteredRows.map(({ item, originalIndex }, displayIdx) => {
                    const isSelected = selectedIndices.has(originalIndex);
                    return (
                      <tr
                        key={originalIndex}
                        className={`h-9 transition-colors group ${
                          isSelected ? "bg-blue-50/70" : "hover:bg-slate-50/80"
                        }`}
                      >
                        {isBulkMode && (
                          <td className="p-1.5 text-center shrink-0 whitespace-nowrap sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectRow(originalIndex)}
                              className="w-3.5 h-3.5 rounded text-slate-900 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className={`p-1.5 text-center text-slate-400 font-sans text-[11px] shrink-0 whitespace-nowrap bg-white group-hover:bg-slate-50 border-r border-slate-200 ${
                          isBulkMode ? "sticky left-10 z-10" : "sticky left-0 z-10"
                        }`}>
                          {displayIdx + 1}
                        </td>
                        <td className="p-1 whitespace-nowrap">
                          <TableCellInput
                            value={item.tanggal}
                            onChange={(val) => onCellEdit(originalIndex, "tanggal", val)}
                            minWidthCh={11}
                            hasCorrection={isCellDiff(originalIndex, "tanggal")}
                            className={`w-full px-2 py-1 bg-transparent rounded-sm hover:bg-slate-100/80 focus:bg-white focus:ring-1.5 focus:ring-blue-600 focus:outline-none focus:shadow-xs transition-colors whitespace-nowrap font-mono text-xs text-slate-900 border border-transparent focus:border-blue-600 ${
                              isCellDiff(originalIndex, "tanggal") ? "bg-amber-50/80 text-amber-950 font-semibold" : ""
                            }`}
                          />
                        </td>
                        <td className="p-1 whitespace-nowrap">
                          <TableCellInput
                            value={item.jam_in}
                            onChange={(val) => onCellEdit(originalIndex, "jam_in", val)}
                            minWidthCh={8}
                            hasCorrection={isCellDiff(originalIndex, "jam_in")}
                            className={`w-full px-2 py-1 bg-transparent rounded-sm hover:bg-slate-100/80 focus:bg-white focus:ring-1.5 focus:ring-blue-600 focus:outline-none focus:shadow-xs transition-colors whitespace-nowrap font-mono text-xs text-slate-900 border border-transparent focus:border-blue-600 ${
                              isCellDiff(originalIndex, "jam_in") ? "bg-amber-50/80 text-amber-950 font-semibold" : ""
                            }`}
                          />
                        </td>
                        <td className="p-1 whitespace-nowrap">
                          <TableCellInput
                            value={item.jam_out}
                            onChange={(val) => onCellEdit(originalIndex, "jam_out", val)}
                            minWidthCh={8}
                            hasCorrection={isCellDiff(originalIndex, "jam_out")}
                            className={`w-full px-2 py-1 bg-transparent rounded-sm hover:bg-slate-100/80 focus:bg-white focus:ring-1.5 focus:ring-blue-600 focus:outline-none focus:shadow-xs transition-colors whitespace-nowrap font-mono text-xs text-slate-900 border border-transparent focus:border-blue-600 ${
                              isCellDiff(originalIndex, "jam_out") ? "bg-amber-50/80 text-amber-950 font-semibold" : ""
                            }`}
                          />
                        </td>
                        <td className="p-1 whitespace-nowrap">
                          <TableCellInput
                            value={item.data_pembanding}
                            onChange={(val) => onCellEdit(originalIndex, "data_pembanding", val)}
                            minWidthCh={18}
                            hasCorrection={isCellDiff(originalIndex, "data_pembanding")}
                            className={`w-full px-2 py-1 bg-transparent rounded-sm hover:bg-slate-100/80 focus:bg-white focus:ring-1.5 focus:ring-blue-600 focus:outline-none focus:shadow-xs transition-colors whitespace-nowrap font-mono text-xs border border-transparent focus:border-blue-600 font-bold ${
                              isCellDiff(originalIndex, "data_pembanding")
                                ? "bg-amber-50/80 text-amber-950"
                                : "text-slate-900"
                            }`}
                          />
                        </td>
                        <td className="p-1 whitespace-nowrap">
                          <TableCellInput
                            value={item.costumer}
                            onChange={(val) => onCellEdit(originalIndex, "costumer", val)}
                            minWidthCh={13}
                            hasCorrection={isCellDiff(originalIndex, "costumer")}
                            className={`w-full px-2 py-1 bg-transparent rounded-sm hover:bg-slate-100/80 focus:bg-white focus:ring-1.5 focus:ring-blue-600 focus:outline-none focus:shadow-xs transition-colors whitespace-nowrap font-mono text-xs text-slate-900 border border-transparent focus:border-blue-600 ${
                              isCellDiff(originalIndex, "costumer") ? "bg-amber-50/80 text-amber-950 font-semibold" : ""
                            }`}
                          />
                        </td>
                        <td className="p-1 whitespace-nowrap">
                          <TableCellInput
                            value={item.model}
                            onChange={(val) => onCellEdit(originalIndex, "model", val)}
                            minWidthCh={24}
                            hasCorrection={isCellDiff(originalIndex, "model")}
                            className={`w-full px-2 py-1 bg-transparent rounded-sm hover:bg-slate-100/80 focus:bg-white focus:ring-1.5 focus:ring-blue-600 focus:outline-none focus:shadow-xs transition-colors whitespace-nowrap font-mono text-xs text-slate-900 border border-transparent focus:border-blue-600 ${
                              isCellDiff(originalIndex, "model") ? "bg-amber-50/80 text-amber-950 font-semibold" : ""
                            }`}
                          />
                        </td>
                        <td className="p-1 whitespace-nowrap">
                          <TableCellInput
                            value={item.part_number}
                            onChange={(val) => onCellEdit(originalIndex, "part_number", val)}
                            minWidthCh={16}
                            hasCorrection={isCellDiff(originalIndex, "part_number")}
                            className={`w-full px-2 py-1 bg-transparent rounded-sm hover:bg-slate-100/80 focus:bg-white focus:ring-1.5 focus:ring-blue-600 focus:outline-none focus:shadow-xs transition-colors whitespace-nowrap font-mono text-xs text-slate-900 border border-transparent focus:border-blue-600 ${
                              isCellDiff(originalIndex, "part_number") ? "bg-amber-50/80 text-amber-950 font-semibold" : ""
                            }`}
                          />
                        </td>
                        <td className="p-1 whitespace-nowrap">
                          <TableCellInput
                            value={item.pic}
                            onChange={(val) => onCellEdit(originalIndex, "pic", val)}
                            minWidthCh={13}
                            hasCorrection={isCellDiff(originalIndex, "pic")}
                            className={`w-full px-2 py-1 bg-transparent rounded-sm hover:bg-slate-100/80 focus:bg-white focus:ring-1.5 focus:ring-blue-600 focus:outline-none focus:shadow-xs transition-colors whitespace-nowrap font-mono text-xs border border-transparent focus:border-blue-600 font-medium ${
                              isCellDiff(originalIndex, "pic") ? "bg-amber-50/80 text-amber-950" : "text-slate-900"
                            }`}
                          />
                        </td>
                        <td className="p-1 whitespace-nowrap">
                          <TableCellInput
                            value={item.remark}
                            onChange={(val) => onCellEdit(originalIndex, "remark", val)}
                            minWidthCh={24}
                            hasCorrection={isCellDiff(originalIndex, "remark")}
                            className={`w-full px-2 py-1 bg-transparent rounded-sm hover:bg-slate-100/80 focus:bg-white focus:ring-1.5 focus:ring-blue-600 focus:outline-none focus:shadow-xs transition-colors whitespace-nowrap font-mono text-xs text-slate-900 border border-transparent focus:border-blue-600 ${
                              isCellDiff(originalIndex, "remark") ? "bg-amber-50/80 text-amber-950 font-semibold" : ""
                            }`}
                          />
                        </td>
                        <td className="p-1 whitespace-nowrap">
                          <TableCellInput
                            value={item.operator}
                            onChange={(val) => onCellEdit(originalIndex, "operator", val)}
                            minWidthCh={12}
                            hasCorrection={isCellDiff(originalIndex, "operator")}
                            className={`w-full px-2 py-1 bg-transparent rounded-sm hover:bg-slate-100/80 focus:bg-white focus:ring-1.5 focus:ring-blue-600 focus:outline-none focus:shadow-xs transition-colors whitespace-nowrap font-mono text-xs text-slate-900 border border-transparent focus:border-blue-600 ${
                              isCellDiff(originalIndex, "operator") ? "bg-amber-50/80 text-amber-950 font-semibold" : ""
                            }`}
                          />
                        </td>
                        <td className="p-1 text-center shrink-0 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onDeleteRow(originalIndex)}
                            className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-slate-100 transition"
                            title="Hapus Baris"
                          >
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Uncertainty Notes Bar if exists */}
            {uncertaintyNotes && uncertaintyNotes.length > 0 && (
              <div
                id="section-uncertainty-notes"
                className="p-3 bg-amber-50 border-t border-amber-200 text-xs shrink-0 max-h-36 overflow-auto"
              >
                <div className="flex items-center gap-1.5 font-semibold text-amber-950 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" strokeWidth={1.5} />
                  <span>Catatan Keraguan Visual ({uncertaintyNotes.length} sel)</span>
                </div>
                <div className="space-y-1 text-slate-700">
                  {uncertaintyNotes.map((note, idx) => (
                    <div key={idx} className="flex items-baseline gap-2 text-[11px]">
                      <span className="font-mono text-amber-900 font-medium">Brs #{note.row} [{note.field}]:</span>
                      <span className="font-mono text-slate-800">{note.value || "[Kosong]"}</span>
                      <span className="text-slate-500 italic">&bull; {note.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Batch Delete Confirmation Modal */}
      {showBatchDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded max-w-sm w-full p-5 space-y-3 shadow-lg border border-slate-200">
            <h4 className="font-semibold text-slate-900 text-sm">Hapus Baris Terpilih?</h4>
            <p className="text-xs text-slate-600">
              Apakah Anda yakin ingin menghapus {selectedIndices.size} baris yang dipilih dari tabel hasil scan?
            </p>
            <div className="flex justify-end gap-2 pt-2 text-xs">
              <button
                type="button"
                onClick={() => setShowBatchDeleteConfirm(false)}
                className="px-3 py-1.5 rounded border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmBatchDelete}
                className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white font-medium"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
