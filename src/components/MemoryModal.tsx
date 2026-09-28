import React, { useState, useMemo } from "react";
import {
  X,
  Search,
  Plus,
  Trash2,
  ArrowRight,
  Download,
  Upload,
  RotateCcw,
} from "lucide-react";
import { AiMemory, ParsedData } from "../types";

interface MemoryModalProps {
  isOpen: boolean;
  memory: AiMemory;
  onClose: () => void;
  onSaveMemory: (newMemory: AiMemory) => void;
  onResetDefault: () => void;
  onTriggerToast: (type: "info" | "error" | "success", title: string, message: string) => void;
  onOpenPicRosterModal?: () => void;
}

export const MemoryModal: React.FC<MemoryModalProps> = ({
  isOpen,
  memory,
  onClose,
  onSaveMemory,
  onResetDefault,
  onTriggerToast,
}) => {
  const [activeTab, setActiveTab] = useState<"evidence" | "visual" | "rules" | "add" | "vocab" | "backup">("evidence");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterField, setFilterField] = useState<string>("all");

  // Form State for Manual Rule
  const [newField, setNewField] = useState<keyof ParsedData>("model");
  const [newWrong, setNewWrong] = useState("");
  const [newCorrect, setNewCorrect] = useState("");

  // Vocabulary Form State
  const [vocabCategory, setVocabCategory] = useState<keyof AiMemory["vocabulary"]>("model");
  const [newVocabWord, setNewVocabWord] = useState("");

  // Filtered Manual Evidence Corrections
  const filteredManualCorrections = useMemo(() => {
    const list = memory.manualCorrections || [];
    return list.filter((item) => {
      const matchSearch =
        !searchQuery.trim() ||
        item.rawOCRValue.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.manualCorrectedValue.toLowerCase().includes(searchQuery.toLowerCase());
      const matchField = filterField === "all" || item.field === filterField;
      return matchSearch && matchField;
    });
  }, [memory.manualCorrections, searchQuery, filterField]);

  // Filtered Rules
  const filteredRules = useMemo(() => {
    return memory.rules.filter((rule) => {
      const matchSearch =
        !searchQuery.trim() ||
        rule.wrong.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rule.correct.toLowerCase().includes(searchQuery.toLowerCase());
      const matchField = filterField === "all" || rule.field === filterField;
      return matchSearch && matchField;
    });
  }, [memory.rules, searchQuery, filterField]);

  // Filtered Visual Learning Samples
  const filteredVisualSamples = useMemo(() => {
    const samples = memory.visualSamples || [];
    return samples.filter((sample) => {
      const matchSearch =
        !searchQuery.trim() ||
        sample.ocrPrediction.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sample.userCorrection.toLowerCase().includes(searchQuery.toLowerCase());
      const matchField = filterField === "all" || sample.field === filterField;
      return matchSearch && matchField;
    });
  }, [memory.visualSamples, searchQuery, filterField]);

  if (!isOpen) return null;

  const handleDeleteRule = (id: string) => {
    const updated = {
      ...memory,
      rules: memory.rules.filter((r) => r.id !== id),
    };
    onSaveMemory(updated);
    onTriggerToast("info", "Aturan Dihapus", "Aturan koreksi berhasil dihapus dari memori.");
  };

  const handleDeleteVisualSample = (id: string) => {
    const updated = {
      ...memory,
      visualSamples: (memory.visualSamples || []).filter((s) => s.id !== id),
    };
    onSaveMemory(updated);
    onTriggerToast("info", "Sampel Dihapus", "Sampel pola visual tulisan tangan berhasil dihapus dari memori.");
  };

  const handleDeleteManualCorrection = (id: string) => {
    const updated = {
      ...memory,
      manualCorrections: (memory.manualCorrections || []).filter((m) => m.id !== id),
    };
    onSaveMemory(updated);
    onTriggerToast("info", "Koreksi Dihapus", "Entri bukti koreksi manual berhasil dihapus dari memori.");
  };

  const handleAddManualRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWrong.trim() || !newCorrect.trim()) return;

    const wrongUpper = newWrong.trim().toUpperCase();
    const correctUpper = newCorrect.trim().toUpperCase();

    const existingIdx = memory.rules.findIndex(
      (r) => r.field === newField && r.wrong.toUpperCase() === wrongUpper
    );

    let updatedRules = [...memory.rules];
    if (existingIdx >= 0) {
      updatedRules[existingIdx] = {
        ...updatedRules[existingIdx],
        correct: correctUpper,
        createdAt: Date.now(),
      };
    } else {
      updatedRules.unshift({
        id: `rule-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        field: newField,
        wrong: wrongUpper,
        correct: correctUpper,
        createdAt: Date.now(),
        usageCount: 1,
      });
    }

    // Also register in vocabulary
    const updatedVocab = { ...memory.vocabulary };
    const vKey = newField as keyof typeof updatedVocab;
    if (updatedVocab[vKey] && !updatedVocab[vKey].includes(correctUpper)) {
      updatedVocab[vKey] = [correctUpper, ...updatedVocab[vKey]];
    }

    onSaveMemory({
      ...memory,
      rules: updatedRules,
      vocabulary: updatedVocab,
      totalLearnedCount: (memory.totalLearnedCount || 0) + 1,
    });

    setNewWrong("");
    setNewCorrect("");
    setActiveTab("rules");
    onTriggerToast(
      "success",
      "Aturan Ditambahkan",
      `"${wrongUpper}" otomatis diganti ke "${correctUpper}" pada kolom ${newField.toUpperCase()}.`
    );
  };

  const handleAddVocabWord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVocabWord.trim()) return;

    const word = newVocabWord.trim().toUpperCase();
    const currentList = memory.vocabulary[vocabCategory] || [];
    if (currentList.includes(word)) {
      onTriggerToast("info", "Sudah Terdaftar", `"${word}" sudah ada dalam daftar.`);
      return;
    }

    const updatedVocab = {
      ...memory.vocabulary,
      [vocabCategory]: [word, ...currentList],
    };

    onSaveMemory({
      ...memory,
      vocabulary: updatedVocab,
    });

    setNewVocabWord("");
    onTriggerToast("success", "Kosakata Ditambahkan", `"${word}" ditambahkan ke kategori ${vocabCategory.toUpperCase()}.`);
  };

  const handleDeleteVocabWord = (category: keyof AiMemory["vocabulary"], word: string) => {
    const currentList = memory.vocabulary[category] || [];
    const updatedVocab = {
      ...memory.vocabulary,
      [category]: currentList.filter((w) => w !== word),
    };
    onSaveMemory({
      ...memory,
      vocabulary: updatedVocab,
    });
  };

  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(memory, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `ai_logbook_memory_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    onTriggerToast("success", "Ekspor Berhasil", "File cadangan memori telah diunduh.");
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        if (parsed.rules && parsed.vocabulary) {
          onSaveMemory(parsed);
          onTriggerToast("success", "Impor Berhasil", `Berhasil memuat ${parsed.rules.length} aturan.`);
        } else {
          throw new Error("Format JSON tidak valid");
        }
      } catch (err) {
        onTriggerToast("error", "Gagal Membaca File", "File yang diimpor tidak sesuai format cadangan.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-md max-w-2xl w-full shadow-lg border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-slate-900">
              Memori Koreksi OCR (Supporting Evidence)
            </span>
            <span className="text-xs text-slate-500 font-mono">
              ({(memory.manualCorrections?.length || 0) + memory.rules.length} entri)
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-white px-5 gap-4 text-xs font-medium text-slate-600">
          <button
            onClick={() => setActiveTab("evidence")}
            className={`py-2 border-b-2 transition ${
              activeTab === "evidence"
                ? "border-blue-700 text-blue-700 font-semibold"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            Bukti Koreksi Manual ({memory.manualCorrections?.length || 0})
          </button>

          <button
            onClick={() => setActiveTab("visual")}
            className={`py-2 border-b-2 transition ${
              activeTab === "visual"
                ? "border-blue-700 text-blue-700 font-semibold"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            Sampel Visual Tulisan ({memory.visualSamples?.length || 0})
          </button>

          <button
            onClick={() => setActiveTab("rules")}
            className={`py-2 border-b-2 transition ${
              activeTab === "rules"
                ? "border-blue-700 text-blue-700 font-semibold"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            Daftar Aturan ({memory.rules.length})
          </button>

          <button
            onClick={() => setActiveTab("add")}
            className={`py-2 border-b-2 transition ${
              activeTab === "add"
                ? "border-blue-700 text-blue-700 font-semibold"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            Tambah Aturan
          </button>

          <button
            onClick={() => setActiveTab("vocab")}
            className={`py-2 border-b-2 transition ${
              activeTab === "vocab"
                ? "border-blue-700 text-blue-700 font-semibold"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            Kosakata Valid
          </button>

          <button
            onClick={() => setActiveTab("backup")}
            className={`py-2 border-b-2 transition ${
              activeTab === "backup"
                ? "border-blue-700 text-blue-700 font-semibold"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            Cadangan & Reset
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 text-xs">
          {/* TAB 0: EVIDENCE-BASED MANUAL CORRECTIONS */}
          {activeTab === "evidence" && (
            <div className="flex flex-col gap-3">
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded text-blue-900 leading-relaxed text-[11px]">
                <p className="font-semibold text-blue-950 mb-0.5">Prinsip Supporting Evidence:</p>
                Memori hanya belajar dari koreksi manual yang Anda simpan. Nilai ini menjadi bukti pendukung berbobot confidence saat menghadapi ambiguitas OCR, bukan aturan penggantian global. Master catalog dan baseline tetap menjadi prioritas utama.
              </div>

              {/* Search & Filter Bar */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" strokeWidth={1.5} />
                  <input
                    type="text"
                    placeholder="Cari teks awal atau nilai koreksi..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
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
                  <option value="operator">Operator</option>
                </select>
              </div>

              {/* Manual Corrections List */}
              {filteredManualCorrections.length === 0 ? (
                <div className="text-center py-10 text-slate-400 space-y-1.5">
                  <p className="font-medium text-slate-600">Belum ada rekaman bukti koreksi manual</p>
                  <p className="text-[11px] text-slate-400 max-w-md mx-auto">
                    Koreksi sel pada tabel secara manual lalu klik &quot;Simpan Koreksi&quot;. Sistem otomatis menyimpannya sebagai kandidat pendukung untuk scan mendatang.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-[380px] overflow-y-auto pr-1">
                  {filteredManualCorrections.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded border border-slate-200 bg-white hover:bg-slate-50/70 transition flex items-center justify-between gap-3 shadow-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {item.imageCrop ? (
                          <div className="w-16 h-10 border border-slate-200 rounded overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
                            <img src={item.imageCrop} alt="Crop" className="w-full h-full object-contain" />
                          </div>
                        ) : null}

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-bold uppercase">
                              {item.field}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono font-semibold">
                              {item.sampleCount}x dikonfirmasi
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono font-semibold">
                              {Math.round(item.confidence * 100)}% Confidence
                            </span>
                            {item.conflictCount > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-mono">
                                Ada Konflik ({item.conflictCount})
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs font-mono">
                            <span className="text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded line-through">
                              {item.rawOCRValue}
                            </span>
                            <span className="text-slate-400">→</span>
                            <span className="font-bold text-emerald-700 bg-emerald-50/60 px-1.5 py-0.5 rounded">
                              {item.manualCorrectedValue}
                            </span>
                          </div>

                          {item.rowContext?.customer || item.rowContext?.model ? (
                            <p className="text-[10px] text-slate-400">
                              Konteks: {item.rowContext.customer ? `Customer: ${item.rowContext.customer}` : ""} {item.rowContext.model ? `Model: ${item.rowContext.model}` : ""}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteManualCorrection(item.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition shrink-0"
                        title="Hapus entri memori ini"
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 1: VISUAL SAMPLES (VISUAL OCR LEARNING MEMORY) */}
          {activeTab === "visual" && (
            <div className="flex flex-col gap-3">
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded text-blue-900 leading-relaxed text-[11px]">
                <p className="font-semibold text-blue-950 mb-0.5">Mekanisme Pembelajaran Visual OCR:</p>
                Sistem mempelajari potongan gambar guratan tulisan tangan dari koreksi Anda. Saat scan baru dilakukan, AI hanya merujuk pada sampel ini jika bentuk fisik tulisan serupa, sehingga <strong>TIDAK AKAN</strong> mengubah huruf secara membabi buta.
              </div>

              {/* Search & Filter Bar */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" strokeWidth={1.5} />
                  <input
                    type="text"
                    placeholder="Cari karakter atau tulisan tangan..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
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

              {/* Visual Samples Grid/List */}
              {filteredVisualSamples.length === 0 ? (
                <div className="text-center py-10 text-slate-400 space-y-1.5">
                  <p className="font-medium text-slate-600">Belum ada sampel visual tulisan tangan</p>
                  <p className="text-[11px] text-slate-400 max-w-md mx-auto">
                    Koreksi sel pada tabel hasil scan, lalu klik &quot;Simpan Koreksi ke Memori&quot;. Sistem otomatis merekam potongan visual tulisan tangan asli Anda.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {filteredVisualSamples.map((sample) => (
                    <div
                      key={sample.id}
                      className="p-2.5 rounded border border-slate-200 bg-white hover:bg-slate-50 transition flex flex-col gap-2 shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold uppercase">
                            {sample.field}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Dikonfirmasi {sample.sampleCount || 1}x
                          </span>
                        </div>

                        <button
                          onClick={() => handleDeleteVisualSample(sample.id)}
                          className="text-slate-400 hover:text-red-600 p-1 rounded transition"
                          title="Hapus sampel visual"
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </button>
                      </div>

                      {/* Visual Crop Image Preview */}
                      <div className="flex items-center gap-3">
                        {sample.imageCrop ? (
                          <div className="w-28 h-12 rounded bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                            <img
                              src={sample.imageCrop}
                              alt="Handwriting crop"
                              className="w-full h-full object-contain filter contrast-125"
                            />
                          </div>
                        ) : (
                          <div className="w-28 h-12 rounded bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] text-slate-400 shrink-0">
                            Pola Visual
                          </div>
                        )}

                        <div className="flex flex-col text-xs font-mono">
                          <div className="flex items-center gap-1.5">
                            <span className="line-through text-red-500 font-medium">
                              {sample.ocrPrediction}
                            </span>
                            <ArrowRight className="w-3 h-3 text-slate-400" strokeWidth={1.5} />
                            <span className="text-emerald-700 font-bold">
                              {sample.userCorrection}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-sans mt-0.5">
                            Pola guratan tulisan tangan
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* TAB 1: RULES LIST */}
          {activeTab === "rules" && (
            <div className="flex flex-col gap-3">
              {/* Search & Filter Bar */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" strokeWidth={1.5} />
                  <input
                    type="text"
                    placeholder="Cari kata salah atau benar..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
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

              {/* Rules List Container */}
              {filteredRules.length === 0 ? (
                <div className="text-center py-8 text-slate-400 space-y-1">
                  <p className="font-medium text-slate-600">Tidak ada aturan yang sesuai</p>
                  <p className="text-[11px] text-slate-400">
                    Tambahkan aturan penggantian kata untuk teks yang sering salah terdeteksi.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 max-h-[360px] overflow-y-auto">
                  {filteredRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex items-center justify-between p-2 rounded border border-slate-200 bg-white hover:bg-slate-50 transition text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold uppercase">
                          {rule.field}
                        </span>

                        <span className="line-through text-red-600 font-mono">
                          {rule.wrong}
                        </span>

                        <ArrowRight className="w-3 h-3 text-slate-400" strokeWidth={1.5} />

                        <span className="text-emerald-700 font-mono font-medium">
                          {rule.correct}
                        </span>
                      </div>

                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="text-slate-400 hover:text-red-600 p-1 rounded"
                        title="Hapus aturan"
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ADD MANUAL RULE */}
          {activeTab === "add" && (
            <form onSubmit={handleAddManualRule} className="flex flex-col gap-3">
              <div className="bg-slate-50 border border-slate-200 p-3 rounded text-slate-600 leading-relaxed text-xs">
                Tambahkan teks yang sering salah dibaca oleh OCR agar otomatis diganti ke teks yang benar.
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Kolom Target:
                </label>
                <select
                  value={newField}
                  onChange={(e) => setNewField(e.target.value as keyof ParsedData)}
                  className="w-full p-2 rounded border border-slate-200 bg-slate-50 uppercase text-slate-800 text-xs"
                >
                  <option value="model">MODEL (Contoh: B65, 2DP)</option>
                  <option value="costumer">COSTUMER (Contoh: YIMM LB, HPM)</option>
                  <option value="part_number">PART NUMBER</option>
                  <option value="pic">PIC</option>
                  <option value="remark">REMARK (Contoh: ROLL 1)</option>
                  <option value="operator">OPERATOR</option>
                  <option value="data_pembanding">DATA PEMBANDING</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Teks Salah / Variasi Salah:
                </label>
                <input
                  type="text"
                  placeholder="Misal: R.1 atau YIMM LH"
                  value={newWrong}
                  onChange={(e) => setNewWrong(e.target.value)}
                  className="w-full p-2 rounded border border-slate-200 uppercase font-mono text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Ganti Menjadi Teks yang Benar:
                </label>
                <input
                  type="text"
                  placeholder="Misal: ROLL 1 atau YIMM LB"
                  value={newCorrect}
                  onChange={(e) => setNewCorrect(e.target.value)}
                  className="w-full p-2 rounded border border-slate-200 uppercase font-mono text-xs font-semibold text-emerald-800"
                  required
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded font-medium text-xs transition"
                >
                  Simpan Aturan ke Memori
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: VOCABULARY */}
          {activeTab === "vocab" && (
            <div className="flex flex-col gap-3">
              <form onSubmit={handleAddVocabWord} className="flex gap-2">
                <select
                  value={vocabCategory}
                  onChange={(e) => setVocabCategory(e.target.value as keyof AiMemory["vocabulary"])}
                  className="px-2.5 py-1.5 rounded border border-slate-200 bg-slate-50 uppercase text-xs"
                >
                  <option value="costumer">Costumer</option>
                  <option value="model">Model</option>
                  <option value="pic">PIC</option>
                  <option value="remark">Remark</option>
                  <option value="operator">Operator</option>
                </select>

                <input
                  type="text"
                  placeholder="Kata resmi baru..."
                  value={newVocabWord}
                  onChange={(e) => setNewVocabWord(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 rounded border border-slate-200 uppercase text-xs"
                />

                <button
                  type="submit"
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded font-medium text-xs shrink-0"
                >
                  Tambah
                </button>
              </form>

              <div className="grid grid-cols-2 gap-2">
                {(["costumer", "model", "pic", "remark", "operator"] as (keyof AiMemory["vocabulary"])[]).map(
                  (cat) => (
                    <div key={cat} className="p-3 bg-slate-50 rounded border border-slate-200 text-xs">
                      <div className="font-semibold text-slate-700 mb-1.5 uppercase text-[11px] flex justify-between">
                        <span>{cat}</span>
                        <span className="text-slate-400 font-normal">
                          {(memory.vocabulary[cat] || []).length} kata
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(memory.vocabulary[cat] || []).map((word, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 bg-white border border-slate-200 px-1.5 py-0.5 rounded text-[11px] font-mono text-slate-700"
                          >
                            <span>{word}</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteVocabWord(cat, word)}
                              className="text-slate-400 hover:text-red-600"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* TAB 4: BACKUP & RESTORE */}
          {activeTab === "backup" && (
            <div className="flex flex-col gap-3">
              <div className="p-3 bg-slate-50 rounded border border-slate-200 flex items-center justify-between gap-4">
                <div>
                  <h4 className="font-medium text-slate-800">Unduh Cadangan Memori (JSON)</h4>
                  <p className="text-slate-500 text-[11px]">
                    Simpan semua aturan koreksi dan kamus kata ke file lokal.
                  </p>
                </div>
                <button
                  onClick={handleExportJson}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded font-medium text-xs shrink-0"
                >
                  <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span>Unduh File</span>
                </button>
              </div>

              <div className="p-3 bg-slate-50 rounded border border-slate-200 flex items-center justify-between gap-4">
                <div>
                  <h4 className="font-medium text-slate-800">Pulihkan dari File Cadangan</h4>
                  <p className="text-slate-500 text-[11px]">
                    Muat kembali aturan memori dari file JSON yang pernah Anda unduh.
                  </p>
                </div>
                <label className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded font-medium text-xs shrink-0 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span>Pilih File</span>
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleImportJson}
                  />
                </label>
              </div>

              <div className="p-3 bg-red-50/50 rounded border border-red-200 flex items-center justify-between gap-4 mt-2">
                <div>
                  <h4 className="font-medium text-red-900">Reset ke Pengaturan Bawaan</h4>
                  <p className="text-red-700 text-[11px]">
                    Hapus aturan koreksi tambahan dan kembalikan ke set standar.
                  </p>
                </div>
                <button
                  onClick={onResetDefault}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded font-medium text-xs shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span>Reset Bawaan</span>
                </button>
              </div>
            </div>
          )}
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
