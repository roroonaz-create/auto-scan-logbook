import React from "react";
import { ConfidenceLevel } from "../types";
import { CheckCircle2, AlertCircle, AlertTriangle } from "lucide-react";

interface ConfidenceBadgeProps {
  level?: ConfidenceLevel;
  fieldName: string;
}

export const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({ level = "high", fieldName }) => {
  if (level === "high") {
    return (
      <span
        className="inline-flex items-center ml-1.5 opacity-40 group-hover/cell:opacity-90 transition-opacity select-none"
        title={`Tingkat Keyakinan AI: TINGGI (Format & pola ${fieldName} valid)`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
      </span>
    );
  }

  if (level === "medium") {
    return (
      <span
        className="inline-flex items-center gap-0.5 ml-1.5 px-1 py-0.2 text-[9px] font-sans font-bold tracking-tight text-amber-300 bg-amber-500/20 border border-amber-500/40 rounded select-none cursor-help shrink-0 shadow-sm"
        title={`Perhatian: Tingkat keyakinan AI SEDANG pada ${fieldName}. Silakan cek kesesuaian dengan foto logbook.`}
      >
        <AlertCircle className="w-2.5 h-2.5 text-amber-400" />
        <span>Cek</span>
      </span>
    );
  }

  // Low confidence
  return (
    <span
      className="inline-flex items-center gap-0.5 ml-1.5 px-1 py-0.2 text-[9px] font-sans font-extrabold tracking-tight text-red-200 bg-red-600/30 border border-red-500/60 rounded select-none cursor-help shrink-0 shadow-sm animate-pulse"
      title={`Peringatan: Tingkat keyakinan AI RENDAH pada ${fieldName}. Tulisan tangan mungkin buram atau tidak baku. Disarankan teliti kembali.`}
    >
      <AlertTriangle className="w-2.5 h-2.5 text-red-400" />
      <span>Ragu</span>
    </span>
  );
};
