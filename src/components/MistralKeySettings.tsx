import React, { useState, useEffect } from "react";
import {
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Trash2,
  Save,
  Settings,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const STORAGE_KEY = "mistral_api_key";

type ConnectionStatus =
  | "not_configured"
  | "configured"
  | "testing"
  | "connected"
  | "invalid"
  | "rate_limited"
  | "failed";

export const MistralKeySettings: React.FC = () => {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>("not_configured");
  const [feedbackMessage, setFeedbackMessage] = useState<string>("");
  const [isTesting, setIsTesting] = useState(false);

  // Collapsed by default as requested
  const [showMistralSettings, setShowMistralSettings] = useState(false);

  // Initialize from localStorage on mount (DO NOT auto-test on load)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && saved.trim()) {
        setApiKey(saved.trim());
        setStatus("configured");
      } else {
        setStatus("not_configured");
      }
    } catch {
      setStatus("not_configured");
    }
  }, []);

  const handleSave = () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      handleClear();
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, trimmed);
      setApiKey(trimmed);
      setStatus("configured");
      setFeedbackMessage("API Key tersimpan.");

      // Optional auto-collapse on successful save
      setTimeout(() => {
        setFeedbackMessage("");
        setShowMistralSettings(false);
      }, 1000);
    } catch {
      setFeedbackMessage("Gagal menyimpan ke penyimpanan lokal.");
    }
  };

  const handleClear = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setApiKey("");
    setShowKey(false);
    setStatus("not_configured");
    setFeedbackMessage("");
  };

  const handleToggleShow = () => {
    setShowKey((prev) => !prev);
  };

  const handleTestConnection = async () => {
    const keyToTest = apiKey.trim() || (localStorage.getItem(STORAGE_KEY) || "").trim();
    if (!keyToTest) {
      setStatus("not_configured");
      setFeedbackMessage("Mistral API Key belum diisi.");
      return;
    }

    setIsTesting(true);
    setStatus("testing");
    setFeedbackMessage("");

    try {
      const res = await fetch("/api/test-mistral", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${keyToTest}`,
        },
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 200 && data.status === "connected") {
        setStatus("connected");
        setFeedbackMessage("Koneksi berhasil terhubung.");
        // Optional auto-collapse on successful connection
        setTimeout(() => {
          setShowMistralSettings(false);
        }, 1000);
      } else if (res.status === 401 || res.status === 403 || data.status === "invalid") {
        setStatus("invalid");
        setFeedbackMessage("Mistral API Key tidak valid.");
      } else if (res.status === 429 || data.status === "rate_limit") {
        setStatus("rate_limited");
        setFeedbackMessage("Mistral API rate limit tercapai.");
      } else {
        setStatus("failed");
        setFeedbackMessage("Gagal terhubung ke Mistral API.");
      }
    } catch {
      setStatus("failed");
      setFeedbackMessage("Gagal terhubung ke Mistral API.");
    } finally {
      setIsTesting(false);
    }
  };

  // Status Badge for Expanded Header
  const renderStatusBadge = () => {
    switch (status) {
      case "connected":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Connected</span>
          </span>
        );
      case "configured":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
            <Key className="w-3 h-3 text-amber-600" />
            <span>Configured</span>
          </span>
        );
      case "testing":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 animate-pulse">
            <RefreshCw className="w-3 h-3 animate-spin text-blue-600" />
            <span>Testing...</span>
          </span>
        );
      case "invalid":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-600" />
            <span>Invalid Key</span>
          </span>
        );
      case "rate_limited":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
            <AlertCircle className="w-3 h-3 text-amber-600" />
            <span>Rate Limited</span>
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">
            <XCircle className="w-3 h-3 text-red-600" />
            <span>Failed</span>
          </span>
        );
      case "not_configured":
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
            <span>Not Configured</span>
          </span>
        );
    }
  };

  // Compact Status Indicator for Collapsed State
  const renderCompactStatus = () => {
    switch (status) {
      case "connected":
        return (
          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
            <span>Connected</span>
          </span>
        );
      case "configured":
        return (
          <span className="inline-flex items-center gap-1.5 font-medium text-amber-700">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
            <span>Configured</span>
          </span>
        );
      case "testing":
        return (
          <span className="inline-flex items-center gap-1.5 font-medium text-blue-700 animate-pulse">
            <RefreshCw className="w-2.5 h-2.5 animate-spin text-blue-600 shrink-0" />
            <span>Testing...</span>
          </span>
        );
      case "invalid":
        return (
          <span className="inline-flex items-center gap-1.5 font-medium text-rose-700">
            <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>
            <span>Invalid Key</span>
          </span>
        );
      case "rate_limited":
        return (
          <span className="inline-flex items-center gap-1.5 font-medium text-amber-700">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
            <span>Rate Limited</span>
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1.5 font-medium text-red-700">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0"></span>
            <span>Failed</span>
          </span>
        );
      case "not_configured":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 font-normal text-slate-500">
            <span className="w-2 h-2 rounded-full border border-slate-400 shrink-0"></span>
            <span>Not configured</span>
          </span>
        );
    }
  };

  // 1. COLLAPSED VIEW (Default): Compact header with status and toggle icon
  if (!showMistralSettings) {
    return (
      <div
        id="mistral-settings-collapsed-bar"
        className="rounded border border-slate-200 bg-slate-50/70 hover:bg-slate-100/80 transition text-xs select-none shadow-2xs"
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => setShowMistralSettings(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              setShowMistralSettings(true);
            }
          }}
          className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 cursor-pointer"
          title="Klik untuk membuka konfigurasi Mistral API"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-slate-800 shrink-0 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-amber-600" />
              <span>Mistral OCR</span>
            </span>
            <span className="text-slate-300 select-none">|</span>
            <div className="flex items-center gap-1.5 truncate">
              {renderCompactStatus()}
            </div>
          </div>

          <div className="flex items-center gap-1 text-slate-400 hover:text-slate-700 shrink-0 pl-1">
            <Settings className="w-3.5 h-3.5" />
            <ChevronDown className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>
    );
  }

  // 2. EXPANDED VIEW: Configuration Panel
  return (
    <div
      id="mistral-settings-expanded-panel"
      className="p-2.5 rounded border border-amber-200/80 bg-amber-50/40 text-xs space-y-2 select-none shadow-2xs"
    >
      {/* Header: Title + Status + Close Chevron */}
      <div className="flex items-center justify-between gap-2 border-b border-amber-200/60 pb-1.5">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setShowMistralSettings(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              setShowMistralSettings(false);
            }
          }}
          className="font-semibold text-slate-800 flex items-center gap-1.5 cursor-pointer hover:text-amber-800 transition"
          title="Klik untuk menyembunyikan konfigurasi Mistral API"
        >
          <Key className="w-3.5 h-3.5 text-amber-600" />
          <span>Mistral API</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div>{renderStatusBadge()}</div>
          <button
            id="btn-mistral-collapse"
            type="button"
            onClick={() => setShowMistralSettings(false)}
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-amber-100/50 transition"
            title="Tutup pengaturan"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Input Field */}
      <div>
        <label
          htmlFor="mistral-api-key-input"
          className="block text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-1"
        >
          API Key
        </label>
        <div className="relative">
          <input
            id="mistral-api-key-input"
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setFeedbackMessage("");
            }}
            placeholder={status !== "not_configured" && !showKey ? "••••••••••••••••" : "Masukkan Mistral API Key..."}
            autoComplete="off"
            spellCheck={false}
            className="w-full font-mono text-xs px-2.5 py-1.5 rounded border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 text-slate-900 placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Button Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-1.5">
          <button
            id="btn-mistral-show-toggle"
            type="button"
            onClick={handleToggleShow}
            disabled={!apiKey}
            className="flex items-center gap-1 px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
            title={showKey ? "Sembunyikan API Key" : "Tampilkan API Key sementara"}
          >
            {showKey ? (
              <>
                <EyeOff className="w-3 h-3 text-slate-500" />
                <span>Hide</span>
              </>
            ) : (
              <>
                <Eye className="w-3 h-3 text-slate-500" />
                <span>Show</span>
              </>
            )}
          </button>

          <button
            id="btn-mistral-test-connection"
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting || !apiKey.trim()}
            className="flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
            title="Uji koneksi ke Mistral API"
          >
            <RefreshCw className={`w-3 h-3 text-slate-500 ${isTesting ? "animate-spin" : ""}`} />
            <span>{isTesting ? "Testing..." : "Test Connection"}</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            id="btn-mistral-save-key"
            type="button"
            onClick={handleSave}
            disabled={!apiKey.trim()}
            className="flex items-center gap-1 px-3 py-1 rounded bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
            title="Simpan API Key ke penyimpanan browser lokal (localStorage)"
          >
            <Save className="w-3 h-3" />
            <span>Save</span>
          </button>

          <button
            id="btn-mistral-clear-key"
            type="button"
            onClick={handleClear}
            disabled={!apiKey && status === "not_configured"}
            className="flex items-center gap-1 px-2 py-1 rounded border border-slate-200 bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 text-slate-600 text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
            title="Hapus API Key dari localStorage"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {feedbackMessage && (
        <div
          className={`text-[11px] font-medium pt-0.5 ${
            status === "invalid" || status === "failed"
              ? "text-rose-700"
              : status === "rate_limited"
              ? "text-amber-800"
              : status === "connected"
              ? "text-emerald-700"
              : "text-slate-600"
          }`}
        >
          {feedbackMessage}
        </div>
      )}
    </div>
  );
};
