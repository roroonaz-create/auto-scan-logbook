import React, { useState, useMemo } from "react";
import { Database, Plus, Trash2, Search, X, Check, RefreshCw } from "lucide-react";
import { MasterRecord, DEFAULT_MASTER_RECORDS } from "../utils/masterCatalog";

interface MasterCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  masterCatalog: MasterRecord[];
  onUpdateMasterCatalog: (newCatalog: MasterRecord[]) => void;
}

export const MasterCatalogModal: React.FC<MasterCatalogModalProps> = ({
  isOpen,
  onClose,
  masterCatalog,
  onUpdateMasterCatalog,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [newCustomer, setNewCustomer] = useState("");
  const [newModel, setNewModel] = useState("");
  const [newPartNumber, setNewPartNumber] = useState("");
  const [showAddSuccess, setShowAddSuccess] = useState(false);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return masterCatalog;
    const q = searchQuery.toLowerCase();
    return masterCatalog.filter(
      (m) =>
        m.customer.toLowerCase().includes(q) ||
        m.model.toLowerCase().includes(q) ||
        m.partNumber.toLowerCase().includes(q)
    );
  }, [masterCatalog, searchQuery]);

  if (!isOpen) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomer.trim() || !newModel.trim() || !newPartNumber.trim()) return;

    const newRecord: MasterRecord = {
      id: `custom-${Date.now()}`,
      customer: newCustomer.trim().toUpperCase(),
      model: newModel.trim().toUpperCase(),
      partNumber: newPartNumber.trim().toUpperCase(),
    };

    onUpdateMasterCatalog([newRecord, ...masterCatalog]);
    setNewCustomer("");
    setNewModel("");
    setNewPartNumber("");
    setShowAddSuccess(true);
    setTimeout(() => setShowAddSuccess(false), 2000);
  };

  const handleDelete = (id: string) => {
    onUpdateMasterCatalog(masterCatalog.filter((r) => r.id !== id));
  };

  const handleResetToDefault = () => {
    if (window.confirm("Kembalikan master catalog ke daftar bawaan standar?")) {
      onUpdateMasterCatalog(DEFAULT_MASTER_RECORDS);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white border border-slate-200 text-slate-800 rounded-lg max-w-2xl w-full p-5 shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-sky-600" />
            <div>
              <h2 className="font-semibold text-sm text-slate-900">
                Master Data: Customer &bull; Model &bull; Part Number
              </h2>
              <p className="text-[11px] text-slate-500">
                Data referensi resmi logbook. Part Number menjadi anchor berkekuatan tinggi (50%), Model (35%), dan Customer (15%).
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
            title="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Tambah Record Baru */}
        <form onSubmit={handleAdd} className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-md">
          <div className="text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-2">
            Tambah Record Master Resmi
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] text-slate-500 font-medium mb-0.5">
                CUSTOMER
              </label>
              <input
                type="text"
                value={newCustomer}
                onChange={(e) => setNewCustomer(e.target.value)}
                placeholder="Misal: NIKKO SHOKAI"
                className="w-full px-2.5 py-1.5 rounded border border-slate-200 text-xs font-mono uppercase bg-white focus:outline-none focus:border-sky-500"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 font-medium mb-0.5">
                MODEL
              </label>
              <input
                type="text"
                value={newModel}
                onChange={(e) => setNewModel(e.target.value)}
                placeholder="Misal: PACKAGE LABEL LC521TM"
                className="w-full px-2.5 py-1.5 rounded border border-slate-200 text-xs font-mono uppercase bg-white focus:outline-none focus:border-sky-500"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 font-medium mb-0.5">
                PART NUMBER
              </label>
              <input
                type="text"
                value={newPartNumber}
                onChange={(e) => setNewPartNumber(e.target.value)}
                placeholder="Misal: D026BU001"
                className="w-full px-2.5 py-1.5 rounded border border-slate-200 text-xs font-mono uppercase bg-white focus:outline-none focus:border-sky-500"
                required
              />
            </div>
          </div>

          <div className="mt-2.5 flex items-center justify-between">
            <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
              {showAddSuccess && (
                <>
                  <Check className="w-3.5 h-3.5" /> Berhasil ditambahkan ke master!
                </>
              )}
            </span>
            <button
              type="submit"
              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-medium flex items-center gap-1.5 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Record</span>
            </button>
          </div>
        </form>

        {/* Filter and Count */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari Customer, Model, atau Part Number..."
              className="w-full pl-8 pr-3 py-1.5 rounded border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:border-slate-400"
            />
          </div>
          <button
            type="button"
            onClick={handleResetToDefault}
            className="px-2.5 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 text-[11px] flex items-center gap-1 transition"
            title="Reset ke master records bawaan"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Reset Bawaan</span>
          </button>
        </div>

        {/* List of records */}
        <div className="mt-3 border border-slate-200 rounded-md overflow-hidden flex-1 overflow-y-auto max-h-[350px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold sticky top-0">
              <tr>
                <th className="py-2 px-3 w-10 text-slate-500">No</th>
                <th className="py-2 px-3 w-32">Customer</th>
                <th className="py-2 px-3">Model</th>
                <th className="py-2 px-3 w-32">Part Number</th>
                <th className="py-2 px-2 w-10 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {filtered.map((item, idx) => (
                <tr key={item.id} className="hover:bg-slate-50 transition">
                  <td className="py-2 px-3 text-slate-400">{idx + 1}</td>
                  <td className="py-2 px-3 font-semibold text-slate-800">{item.customer}</td>
                  <td className="py-2 px-3 text-slate-700">{item.model}</td>
                  <td className="py-2 px-3 font-bold text-sky-800 bg-sky-50/50">{item.partNumber}</td>
                  <td className="py-2 px-2 text-center">
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="text-slate-400 hover:text-red-600 p-1 transition"
                      title="Hapus record"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                    Tidak ada record master yang cocok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Total: {masterCatalog.length} master record</span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs transition"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};
