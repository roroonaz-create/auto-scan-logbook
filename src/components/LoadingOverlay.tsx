import React from "react";
import { Loader2 } from "lucide-react";

interface LoadingOverlayProps {
  modelName: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ modelName }) => {
  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-md p-8 flex items-center justify-center text-center space-y-4">
      <div className="w-10 h-10 rounded border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-800">
        <Loader2 className="w-5 h-5 animate-spin text-slate-700" strokeWidth={1.5} />
      </div>

      <div className="space-y-1 max-w-sm">
        <h3 className="text-sm font-semibold text-slate-900">
          Memindai Lembar Logbook...
        </h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          AI menganalisis baris demi baris secara ortogonal. Teks yang benar-benar terbaca akan ditranskrip, tanpa menebak atau menambahkan data buatan.
        </p>
      </div>

      <div className="text-[11px] font-mono text-slate-400">
        Model: {modelName} &bull; Transkripsi Akurat
      </div>
    </div>
  );
};
