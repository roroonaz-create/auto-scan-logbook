import React from "react";
import {
  X,
  Type,
  ShieldCheck,
  Volume2,
  VolumeX,
} from "lucide-react";
import { soundManager } from "../utils/audio";

interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme?: string;
  onSelectTheme?: (themeId: any) => void;
  tableFontSize: "sm" | "base" | "lg";
  onChangeFontSize: (size: "sm" | "base" | "lg") => void;
  soundEnabled: boolean;
  onToggleSound: (enabled: boolean) => void;
}

export const ThemeModal: React.FC<ThemeModalProps> = ({
  isOpen,
  onClose,
  tableFontSize,
  onChangeFontSize,
  soundEnabled,
  onToggleSound,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl max-w-lg w-full flex flex-col overflow-hidden text-slate-800">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
              <Type className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-800 tracking-tight">
                Pengaturan Keterbacaan Font
              </h3>
              <p className="text-xs text-slate-500">
                Optimasi ketajaman angka & suara notifikasi
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 text-sm">
          {/* Slashed Zero Info */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" />
              <span>Font JetBrains Mono: Slashed Zero Aktif</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Tabel menggunakan font monospaced dengan fitur <strong>Ø (Slashed Zero)</strong> sehingga angka 0 (nol) memiliki garis diagonal tegas dan tidak akan tertukar dengan angka 8 (delapan).
            </p>
          </div>

          {/* Font Size Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block">
              Ukuran Teks Tabel:
            </label>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {(["sm", "base", "lg"] as const).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => onChangeFontSize(sz)}
                  className={`py-2 px-3 rounded-lg border font-semibold transition ${
                    tableFontSize === sz
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {sz === "sm" ? "Kecil (11px)" : sz === "base" ? "Sedang (13px)" : "Besar (15px)"}
                </button>
              ))}
            </div>
          </div>

          {/* Audio sound effects */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2.5">
              {soundEnabled ? (
                <Volume2 className="w-4 h-4 text-indigo-600" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-400" />
              )}
              <div>
                <span className="text-xs font-semibold text-slate-700 block">
                  Efek Suara Interaksi
                </span>
                <span className="text-[11px] text-slate-500">
                  Bunyi saat scan selesai & tombol ditekan
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onToggleSound(!soundEnabled);
                soundManager.playClick();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                soundEnabled
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {soundEnabled ? "Aktif" : "Nonaktif"}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};
