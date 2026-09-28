import React from "react";
import { X, Check } from "lucide-react";

interface ExcelGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExcelGuideModal: React.FC<ExcelGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const columns = [
    { col: "A", name: "Tanggal", rule: "Dikosongkan saat disalin (Tab)", note: "Mempermudah penataan manual di Excel", isSpecial: true },
    { col: "B", name: "Jam In", rule: 'Dipisahkan tanda titik dua ":"', note: "Contoh: 08:30 (Bukan titik .)", isSpecial: false },
    { col: "C", name: "Jam Out", rule: 'Dipisahkan tanda titik dua ":"', note: "Contoh: 16:45 (Bukan titik .)", isSpecial: false },
    { col: "D", name: "Data Pembanding", rule: "Tanpa spasi & tanpa kode 250/260", note: "Awalan angka 0 dan kode dibersihkan. Jika ada 2 angka digabung dengan '/'", isSpecial: false },
    { col: "E", name: "Costumer", rule: "Huruf kapital rapi", note: "Contoh: YIMM LB, ADM-KAP", isSpecial: false },
    { col: "F", name: "Model", rule: "Sesuai standar part", note: "Contoh: B65, 2DP", isSpecial: false },
    { col: "G", name: "Part Number", rule: "Nomor part lengkap", note: "Otomatis diisi baris atas jika ada ditto mark", isSpecial: false },
    { col: "H", name: "PIC", rule: "Nama PIC", note: "Otomatis dicocokkan ke daftar PIC resmi", isSpecial: false },
    { col: "I", name: "K1 (Kosong 1)", rule: "Kolom Kosong", note: "Jarak 1 kolom kosong sebelum Remark", isSpecial: true },
    { col: "J", name: "K2 (Kosong 2)", rule: "Kolom Kosong", note: "Jarak 2 kolom kosong sebelum Remark", isSpecial: true },
    { col: "K", name: "Remark", rule: "Format ROLL", note: "R / R.1 otomatis menjadi ROLL / ROLL 1", isSpecial: false },
    { col: "L", name: "Operator", rule: "Nama Operator", note: "Disalin rapi di kolom terakhir", isSpecial: false },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-md max-w-2xl w-full shadow-lg border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-slate-900">
              Panduan Struktur Format TSV & Excel
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-3 text-xs">
          <div className="bg-slate-50 border border-slate-200 rounded p-3 text-slate-700 leading-relaxed">
            <strong>Aturan Format Salin Excel:</strong> Saat tombol <strong>"Salin TSV / Excel"</strong> diklik, format teks menggunakan pemisah tab (TSV) dengan kolom Tanggal dikosongkan, menyalin Jam In hingga PIC, menambahkan 2 kolom jeda kosong (K1 & K2), lalu menyalin Remark dan Operator.
          </div>

          <div className="border border-slate-200 rounded overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[11px]">
                <tr>
                  <th className="px-3 py-1.5 w-12 text-center">Kolom</th>
                  <th className="px-3 py-1.5">Nama Data</th>
                  <th className="px-3 py-1.5">Perlakuan Khusus</th>
                  <th className="px-3 py-1.5">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {columns.map((item, idx) => (
                  <tr
                    key={idx}
                    className={item.isSpecial ? "bg-amber-50/50" : "hover:bg-slate-50"}
                  >
                    <td className="px-3 py-1.5 text-center font-mono font-bold text-slate-600">
                      {item.col}
                    </td>
                    <td className="px-3 py-1.5 font-medium text-slate-900">
                      {item.name}
                    </td>
                    <td className="px-3 py-1.5 text-slate-700">
                      <span className="flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-600 shrink-0" strokeWidth={1.5} />
                        {item.rule}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-slate-500">
                      {item.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-200 flex justify-end">
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
