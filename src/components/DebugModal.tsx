import React, { useState } from "react";
import { X, Search, FileSpreadsheet, Eye, Info } from "lucide-react";
import { DecisionDebugTrace } from "../types";

interface DebugModalProps {
  isOpen: boolean;
  onClose: () => void;
  debugTraces: DecisionDebugTrace[];
}

export const DebugModal: React.FC<DebugModalProps> = ({
  isOpen,
  onClose,
  debugTraces,
}) => {
  const [search, setSearch] = useState("");
  const [filterField, setFilterField] = useState("all");

  if (!isOpen) return null;

  const filtered = debugTraces.filter((trace) => {
    const matchSearch =
      !search.trim() ||
      trace.field.toLowerCase().includes(search.toLowerCase()) ||
      trace.ocrOriginal.toLowerCase().includes(search.toLowerCase()) ||
      trace.final.toLowerCase().includes(search.toLowerCase()) ||
      trace.reason.toLowerCase().includes(search.toLowerCase());
    const matchField = filterField === "all" || trace.field.toLowerCase() === filterField.toLowerCase();
    return matchSearch && matchField;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-md max-w-4xl w-full shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-slate-900">
              Debug Log Evaluasi Visual & OCR
            </span>
            <span className="text-xs text-slate-500 font-mono">
              ({debugTraces.length} catatan keputusan)
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Subheader description */}
        <div className="px-5 py-2.5 bg-blue-50/60 border-b border-blue-100 text-[11px] text-blue-900 flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span>
            Melacak keputusan OCR: membandingkan bacaan OCR awal, kandidat memori visual, estimasi kemiripan guratan, dan alasan penetapan teks akhir.
          </span>
        </div>

        {/* Filter bar */}
        <div className="p-3 border-b border-slate-200 bg-white flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari keputusan, kata, atau alasan..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-slate-400 text-xs"
            />
          </div>

          <select
            value={filterField}
            onChange={(e) => setFilterField(e.target.value)}
            className="px-2.5 py-1.5 rounded border border-slate-200 bg-slate-50 text-slate-700 outline-none text-xs"
          >
            <option value="all">Semua Kolom</option>
            <option value="model">Model</option>
            <option value="costumer">Costumer</option>
            <option value="part_number">Part Number</option>
            <option value="pic">PIC</option>
            <option value="remark">Remark</option>
            <option value="operator">Operator</option>
            <option value="data_pembanding">Data Pembanding</option>
          </select>
        </div>

        {/* Table list */}
        <div className="p-4 overflow-y-auto flex-1 text-xs">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400 space-y-2">
              <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="font-medium text-slate-600">Tidak ada catatan debug yang cocok</p>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                {debugTraces.length === 0
                  ? "Seluruh teks pada scan ini dibaca 100% langsung dari visual gambar tanpa ada ambiguitas atau intervensi memori."
                  : "Ubah kata kunci pencarian atau filter kolom."}
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold text-[11px]">
                    <th className="py-2 px-3 w-14">Baris</th>
                    <th className="py-2 px-3 w-28">Kolom</th>
                    <th className="py-2 px-3 w-28">OCR Awal</th>
                    <th className="py-2 px-3 w-28 text-emerald-800">Keputusan Akhir</th>
                    <th className="py-2 px-3 w-36">Sumber / Rule</th>
                    <th className="py-2 px-3">Alasan / Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {filtered.map((trace, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition">
                      <td className="py-2 px-3 text-slate-500">{trace.row}</td>
                      <td className="py-2 px-3 font-semibold uppercase text-slate-700">{trace.field}</td>
                      <td className="py-2 px-3 text-slate-800 bg-slate-50/50">{trace.ocrOriginal || "-"}</td>
                      <td className="py-2 px-3 font-bold text-emerald-700 bg-emerald-50/40">{trace.final}</td>
                      <td className="py-2 px-3 font-sans">
                        {trace.correctionSource ? (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200">
                            {trace.correctionSource}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">-</span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-sans text-slate-600 leading-tight">{trace.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-[11px] text-slate-500">
          <span>Prinsip: Bukti Visual Dokumen &gt; OCR Engine &gt; Visual Memory Candidate</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-medium"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
