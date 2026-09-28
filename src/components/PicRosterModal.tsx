import React, { useState, useEffect } from "react";
import {
  Lock,
  Unlock,
  Plus,
  Trash2,
  RotateCcw,
  X,
  Check,
} from "lucide-react";
import { DEFAULT_LOCKED_PICS } from "../constants";

interface PicRosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  lockedPics?: string[];
  currentRoster?: string[];
  isLocked: boolean;
  onUpdateRoster: (newList: string[], locked: boolean) => void;
  onTriggerToast: (type: "info" | "error" | "success", title: string, message: string) => void;
}

export const PicRosterModal: React.FC<PicRosterModalProps> = ({
  isOpen,
  onClose,
  lockedPics,
  currentRoster,
  isLocked,
  onUpdateRoster,
  onTriggerToast,
}) => {
  const initialList = lockedPics || currentRoster || DEFAULT_LOCKED_PICS;
  const [newMemberName, setNewMemberName] = useState("");
  const [localIsLocked, setLocalIsLocked] = useState(isLocked);
  const [activeList, setActiveList] = useState<string[]>(initialList);

  useEffect(() => {
    if (isOpen) {
      const current = lockedPics || currentRoster || DEFAULT_LOCKED_PICS;
      setActiveList(current);
      setLocalIsLocked(isLocked);
      setNewMemberName("");
    }
  }, [isOpen, lockedPics, currentRoster, isLocked]);

  if (!isOpen) return null;

  const handleToggleLock = () => {
    const nextLockState = !localIsLocked;
    setLocalIsLocked(nextLockState);
    onUpdateRoster(activeList, nextLockState);
    if (nextLockState) {
      onTriggerToast(
        "success",
        "Daftar PIC Dikunci",
        `Daftar ${activeList.length} personil resmi terkunci. Sistem mencocokkan ejaan PIC ke personil ini.`
      );
    } else {
      onTriggerToast(
        "info",
        "Kunci Dibuka",
        "Mode pengeditan aktif. Anda dapat menambah atau menghapus personil."
      );
    }
  };

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) return;

    const formatted = newMemberName.trim().toUpperCase();
    if (activeList.includes(formatted)) {
      onTriggerToast("info", "Sudah Terdaftar", `Nama "${formatted}" sudah ada dalam daftar.`);
      return;
    }

    const updated = [...activeList, formatted];
    setActiveList(updated);
    setNewMemberName("");
    onUpdateRoster(updated, localIsLocked);
    onTriggerToast("success", "Anggota Ditambahkan", `"${formatted}" berhasil ditambahkan.`);
  };

  const handleRemoveMember = (name: string) => {
    if (activeList.length <= 1) {
      onTriggerToast("error", "Tidak Dapat Dihapus", "Minimal harus ada 1 personil dalam daftar PIC.");
      return;
    }
    const updated = activeList.filter((n) => n !== name);
    setActiveList(updated);
    onUpdateRoster(updated, localIsLocked);
    onTriggerToast("info", "Anggota Dihapus", `"${name}" dihapus dari daftar PIC.`);
  };

  const handleResetDefault = () => {
    if (window.confirm("Kembalikan daftar PIC ke personil resmi bawaan?")) {
      setActiveList(DEFAULT_LOCKED_PICS);
      setLocalIsLocked(true);
      onUpdateRoster(DEFAULT_LOCKED_PICS, true);
      onTriggerToast(
        "success",
        "Daftar Bawaan Dipulihkan",
        "Personil resmi bawaan telah dikunci kembali."
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-md max-w-xl w-full shadow-lg border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-slate-900">
              Daftar Anggota PIC Resmi
            </span>
            <span className="text-xs text-slate-500 font-mono">
              ({activeList.length} personil)
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-4 text-xs">
          {/* Status Lock Bar */}
          <div className="p-3 rounded border border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="font-medium text-slate-800 flex items-center gap-1.5">
                {localIsLocked ? (
                  <>
                    <Lock className="w-3.5 h-3.5 text-slate-700" strokeWidth={1.5} />
                    <span>Status: Terkunci</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-3.5 h-3.5 text-amber-600" strokeWidth={1.5} />
                    <span>Status: Kunci Terbuka (Dapat Diedit)</span>
                  </>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Nama yang terbaca akan dicocokkan secara ketat ke daftar ini untuk mencegah salah ketik.
              </p>
            </div>

            <button
              type="button"
              onClick={handleToggleLock}
              className={`px-3 py-1.5 rounded text-xs font-medium border transition ${
                localIsLocked
                  ? "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                  : "bg-blue-700 border-blue-700 text-white hover:bg-blue-800"
              }`}
            >
              {localIsLocked ? "Buka Kunci" : "Kunci Daftar"}
            </button>
          </div>

          {/* Add member form if unlocked */}
          {!localIsLocked && (
            <form onSubmit={handleAddMember} className="flex gap-2">
              <input
                type="text"
                placeholder="Nama personil baru (misal: VALLEAS)..."
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                className="flex-1 px-2.5 py-1.5 rounded border border-slate-300 uppercase font-mono text-xs focus:outline-none focus:border-slate-500"
              />
              <button
                type="submit"
                disabled={!newMemberName.trim()}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded font-medium text-xs flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span>Tambah</span>
              </button>
            </form>
          )}

          {/* Members Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-slate-600">
              <span className="font-medium">Personil Terdaftar:</span>
              <button
                type="button"
                onClick={handleResetDefault}
                className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" strokeWidth={1.5} />
                <span>Reset ke Standar</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {activeList.map((name) => (
                <div
                  key={name}
                  className="p-2 rounded border border-slate-200 bg-white flex items-center justify-between gap-1 text-xs"
                >
                  <span className="font-mono font-medium text-slate-800 truncate">
                    {name}
                  </span>
                  {!localIsLocked && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(name)}
                      className="text-slate-400 hover:text-red-600 p-0.5"
                    >
                      <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              ))}
            </div>
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
