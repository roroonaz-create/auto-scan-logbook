import React, { useRef, useState, useEffect } from "react";
import {
  RotateCcw,
  RotateCw,
  Crop as CropIcon,
  Trash2,
  Maximize2,
  Sliders,
  Play,
  Loader2,
  Camera,
  FolderOpen,
  Check,
} from "lucide-react";
import { processLogbookImage, PreprocessResult } from "../utils/imagePreprocess";
import { OcrEngine } from "../types";
import { MistralKeySettings } from "./MistralKeySettings";

interface UploadSectionProps {
  imagePreview: string | null;
  base64Data: string | null;
  isLoading: boolean;
  ocrEngine?: OcrEngine;
  onOcrEngineChange?: (engine: OcrEngine) => void;
  onFileSelected: (file: File) => void;
  onProcessedImageReady: (result: PreprocessResult) => void;
  onScan: () => void;
  onClearImage: () => void;
  onTriggerToast: (type: "info" | "error" | "success", title: string, message: string) => void;
}

export const UploadSection: React.FC<UploadSectionProps> = ({
  imagePreview,
  base64Data,
  isLoading,
  ocrEngine = "gemini",
  onOcrEngineChange,
  onFileSelected,
  onProcessedImageReady,
  onScan,
  onClearImage,
  onTriggerToast,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreenPreview, setIsFullscreenPreview] = useState(false);

  // Preprocessing controls state
  const [rawSource, setRawSource] = useState<string | null>(null);
  const [rotation, setRotation] = useState<number>(0);
  const [autoEnhance, setAutoEnhance] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [showCropPanel, setShowCropPanel] = useState<boolean>(false);

  // Crop percentage margins: Top, Bottom, Left, Right
  const [cropMargins, setCropMargins] = useState({ top: 0, bottom: 0, left: 0, right: 0 });

  // Image metadata
  const [imageMeta, setImageMeta] = useState<{
    origW: number;
    origH: number;
    finalW: number;
    finalH: number;
  } | null>(null);

  // Listen to global Ctrl+V for screenshot pasting
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            handleNewFile(file);
            onTriggerToast(
              "success",
              "Gambar Ditempel",
              "Tangkapan layar dari clipboard berhasil dimuat."
            );
          }
          break;
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [onTriggerToast]);

  // Handle incoming file and initiate preprocessing
  const handleNewFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      onTriggerToast("error", "Format Tidak Sesuai", "Harap unggah file gambar (JPG, PNG, atau WEBP).");
      return;
    }

    onFileSelected(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setRawSource(dataUrl);
      setRotation(0);
      setCropMargins({ top: 0, bottom: 0, left: 0, right: 0 });
      applyPreprocessing(dataUrl, 0, autoEnhance, { top: 0, bottom: 0, left: 0, right: 0 });
    };
    reader.readAsDataURL(file);
  };

  // Re-run preprocessing when transformations change
  const applyPreprocessing = async (
    source: string,
    rot: number,
    enhance: boolean,
    crop: { top: number; bottom: number; left: number; right: number }
  ) => {
    setIsProcessing(true);
    try {
      const cropW = Math.max(10, 100 - crop.left - crop.right);
      const cropH = Math.max(10, 100 - crop.top - crop.bottom);
      const hasCrop = crop.top > 0 || crop.bottom > 0 || crop.left > 0 || crop.right > 0;

      const result = await processLogbookImage(source, {
        rotation: rot,
        autoContrast: enhance,
        sharpen: enhance,
        minResolution: 1500,
        crop: hasCrop
          ? {
              x: crop.left,
              y: crop.top,
              width: cropW,
              height: cropH,
              isPercent: true,
            }
          : null,
      });

      setImageMeta({
        origW: result.originalWidth,
        origH: result.originalHeight,
        finalW: result.finalWidth,
        finalH: result.finalHeight,
      });

      onProcessedImageReady(result);
    } catch (err: any) {
      console.error("Gagal melakukan preprocessing gambar:", err);
      onTriggerToast("error", "Gagal Memproses Gambar", err?.message || "Terjadi kesalahan saat memproses gambar.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRotate = (delta: number) => {
    if (!rawSource) return;
    const newRot = ((rotation + delta) % 360 + 360) % 360;
    setRotation(newRot);
    applyPreprocessing(rawSource, newRot, autoEnhance, cropMargins);
  };

  const handleToggleEnhance = () => {
    if (!rawSource) return;
    const newEnhance = !autoEnhance;
    setAutoEnhance(newEnhance);
    applyPreprocessing(rawSource, rotation, newEnhance, cropMargins);
  };

  const handleCropChange = (field: keyof typeof cropMargins, val: number) => {
    if (!rawSource) return;
    const clamped = Math.max(0, Math.min(45, val));
    const newMargins = { ...cropMargins, [field]: clamped };
    setCropMargins(newMargins);
    applyPreprocessing(rawSource, rotation, autoEnhance, newMargins);
  };

  const handleResetCrop = () => {
    if (!rawSource) return;
    const zeroMargins = { top: 0, bottom: 0, left: 0, right: 0 };
    setCropMargins(zeroMargins);
    applyPreprocessing(rawSource, rotation, autoEnhance, zeroMargins);
  };

  const handleResetAll = () => {
    setRawSource(null);
    setRotation(0);
    setCropMargins({ top: 0, bottom: 0, left: 0, right: 0 });
    setShowCropPanel(false);
    setImageMeta(null);
    onClearImage();
  };

  // Drag & Drop handlers
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleNewFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-md overflow-hidden">
      {/* Panel Top Toolbar */}
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-xs text-slate-800 uppercase tracking-wider">
            Lembar Logbook
          </span>
          {imageMeta && (
            <span className="text-[11px] font-mono text-slate-500">
              ({imageMeta.finalW} &times; {imageMeta.finalH}px)
            </span>
          )}
        </div>

        {/* Action Toolbar on Image View */}
        {imagePreview ? (
          <div className="flex items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => handleRotate(-90)}
              disabled={isProcessing}
              className="p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition"
              title="Putar -90°"
            >
              <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => handleRotate(90)}
              disabled={isProcessing}
              className="p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition"
              title="Putar +90°"
            >
              <RotateCw className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>

            <button
              type="button"
              onClick={() => setShowCropPanel(!showCropPanel)}
              className={`px-2 py-1 rounded border text-xs font-medium transition ${
                showCropPanel || cropMargins.top > 0 || cropMargins.bottom > 0
                  ? "bg-slate-200 border-slate-300 text-slate-900"
                  : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
              }`}
              title="Sesuaikan potongan tepi"
            >
              <CropIcon className="w-3.5 h-3.5 inline mr-1" strokeWidth={1.5} />
              <span>Crop</span>
            </button>

            <button
              type="button"
              onClick={handleToggleEnhance}
              disabled={isProcessing}
              className={`px-2 py-1 rounded border text-xs font-medium transition ${
                autoEnhance
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
              }`}
              title="Tingkatkan kontras otomatis & ketajaman tinta"
            >
              <span>Kontras</span>
            </button>

            <button
              type="button"
              onClick={() => setIsFullscreenPreview(true)}
              className="p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition"
              title="Lihat ukuran penuh"
            >
              <Maximize2 className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>

            <button
              type="button"
              onClick={handleResetAll}
              className="px-2 py-1 rounded border border-slate-200 bg-white hover:bg-red-50 hover:text-red-700 text-slate-600 transition"
              title="Ganti foto dengan file lain"
            >
              <Trash2 className="w-3.5 h-3.5 inline mr-1" strokeWidth={1.5} />
              <span>Ganti</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <span>Tekan Ctrl+V untuk paste</span>
          </div>
        )}
      </div>

      {/* Crop Controls Bar (if expanded) */}
      {showCropPanel && imagePreview && (
        <div className="p-3 bg-slate-50 border-b border-slate-200 text-xs space-y-2 shrink-0">
          <div className="flex items-center justify-between text-slate-700 font-medium">
            <span className="flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-slate-600" strokeWidth={1.5} />
              Potong Tepi Dokumen (%)
            </span>
            <button
              type="button"
              onClick={handleResetCrop}
              className="text-slate-500 hover:text-red-600 underline"
            >
              Reset
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div>
              <span className="text-slate-500 block text-[11px]">Atas: {cropMargins.top}%</span>
              <input
                type="range"
                min="0"
                max="40"
                value={cropMargins.top}
                onChange={(e) => handleCropChange("top", Number(e.target.value))}
                className="w-full accent-slate-800 cursor-pointer"
              />
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Bawah: {cropMargins.bottom}%</span>
              <input
                type="range"
                min="0"
                max="40"
                value={cropMargins.bottom}
                onChange={(e) => handleCropChange("bottom", Number(e.target.value))}
                className="w-full accent-slate-800 cursor-pointer"
              />
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Kiri: {cropMargins.left}%</span>
              <input
                type="range"
                min="0"
                max="40"
                value={cropMargins.left}
                onChange={(e) => handleCropChange("left", Number(e.target.value))}
                className="w-full accent-slate-800 cursor-pointer"
              />
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Kanan: {cropMargins.right}%</span>
              <input
                type="range"
                min="0"
                max="40"
                value={cropMargins.right}
                onChange={(e) => handleCropChange("right", Number(e.target.value))}
                className="w-full accent-slate-800 cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Panel Content Area */}
      <div className="flex-1 flex flex-col p-3 overflow-hidden bg-slate-100/50 min-h-[380px]">
        {!imagePreview ? (
          /* Quiet Solid Upload Box */
          <div
            id="dropzone-upload-area"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex-1 border rounded bg-white p-6 flex flex-col items-center justify-center text-center cursor-pointer transition select-none ${
              isDragging
                ? "border-blue-600 bg-blue-50/30"
                : "border-slate-300 hover:border-slate-400 hover:bg-slate-50/50"
            }`}
          >
            <div className="max-w-xs space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-800">
                  {isDragging ? "Lepaskan file di sini" : "Pilih file gambar logbook atau seret ke sini"}
                </p>
                <p className="text-xs text-slate-500">
                  Mendukung JPG, PNG, atau WEBP.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="px-3 py-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition inline-flex items-center gap-1.5"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-slate-600" strokeWidth={1.5} />
                  <span>Pilih File</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    cameraInputRef.current?.click();
                  }}
                  className="px-3 py-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition inline-flex items-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5 text-slate-600" strokeWidth={1.5} />
                  <span>Kamera</span>
                </button>
              </div>

              <p className="text-[11px] text-slate-400 font-mono pt-1">
                Atau tekan <kbd className="px-1 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 font-sans">Ctrl+V</kbd> untuk tempel gambar
              </p>
            </div>
          </div>
        ) : (
          /* Active Image Viewport */
          <div className="relative flex-1 rounded border border-slate-200 bg-slate-900/5 overflow-hidden flex items-center justify-center">
            {isProcessing && (
              <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-xs flex items-center justify-center gap-2 text-slate-800 text-xs font-medium">
                <Loader2 className="w-4 h-4 animate-spin text-slate-700" strokeWidth={1.5} />
                <span>Memproses citra...</span>
              </div>
            )}
            <img
              src={imagePreview}
              alt="Lembar Logbook"
              className="w-full h-full max-h-[580px] object-contain"
            />
          </div>
        )}

        <input
          id="input-file-logbook"
          type="file"
          accept="image/*"
          className="hidden"
          ref={fileInputRef}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleNewFile(file);
          }}
        />
        <input
          id="input-camera-logbook"
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          ref={cameraInputRef}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleNewFile(file);
          }}
        />
      </div>

      {/* Bottom Toolbar & Scan Action */}
      <div className="p-3 bg-white border-t border-slate-200 flex flex-col gap-2.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          {/* OCR Engine Segmented Control */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded border border-slate-200 text-xs">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider pl-1.5 pr-0.5">
              Engine:
            </span>
            <button
              id="btn-engine-gemini"
              type="button"
              onClick={() => onOcrEngineChange?.("gemini")}
              className={`px-2.5 py-1 rounded text-xs transition ${
                ocrEngine === "gemini"
                  ? "bg-white text-blue-700 shadow-xs border border-slate-200 font-semibold"
                  : "text-slate-600 hover:text-slate-900 font-normal"
              }`}
            >
              Gemini
            </button>
            <button
              id="btn-engine-mistral"
              type="button"
              onClick={() => onOcrEngineChange?.("mistral")}
              className={`px-2.5 py-1 rounded text-xs transition ${
                ocrEngine === "mistral"
                  ? "bg-white text-amber-600 shadow-xs border border-slate-200 font-semibold"
                  : "text-slate-600 hover:text-slate-900 font-normal"
              }`}
            >
              Mistral OCR
            </button>
          </div>

          <div className="text-[11px] text-slate-500 truncate hidden sm:block">
            {ocrEngine === "mistral" ? (
              <span className="text-amber-700 font-medium">Mistral Document AI</span>
            ) : (
              <span className="text-blue-700 font-medium">Gemini Multimodal</span>
            )}
          </div>
        </div>

        {/* Mistral API Configuration Section */}
        {ocrEngine === "mistral" && (
          <div className="pt-0.5">
            <MistralKeySettings />
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500 truncate">
            {imagePreview ? (
              <span className="flex items-center gap-1.5 text-slate-600">
                <Check className="w-3.5 h-3.5 text-emerald-600" strokeWidth={1.5} />
                <span>Gambar siap</span>
              </span>
            ) : (
              <span>Menunggu foto logbook</span>
            )}
          </div>

          {/* Primary Action Button: "Scan Data Sekarang" (Toolbar Style) */}
          <button
            id="btn-trigger-scan"
            type="button"
            onClick={onScan}
            disabled={!base64Data || isLoading || isProcessing}
            className={`px-4 py-2 rounded text-xs font-semibold flex items-center gap-2 transition ${
              !base64Data || isLoading || isProcessing
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : ocrEngine === "mistral"
                ? "bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-xs"
                : "bg-blue-700 hover:bg-blue-800 active:bg-blue-900 text-white shadow-xs"
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" strokeWidth={1.5} />
                <span>Memindai ({ocrEngine === "mistral" ? "Mistral" : "Gemini"})...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Scan {ocrEngine === "mistral" ? "Mistral OCR" : "Data Sekarang"}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Fullscreen Lightbox Modal */}
      {isFullscreenPreview && imagePreview && (
        <div className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-5xl flex justify-between items-center text-white mb-2">
            <span className="text-xs font-medium">Tampilan Ukuran Penuh Lembar Logbook</span>
            <button
              onClick={() => setIsFullscreenPreview(false)}
              className="text-slate-300 hover:text-white px-2 py-1 rounded text-xs border border-slate-700 hover:border-slate-500"
            >
              Tutup
            </button>
          </div>
          <div className="w-full max-w-5xl max-h-[85vh] flex items-center justify-center overflow-auto rounded bg-slate-950 p-2 border border-slate-800">
            <img
              src={imagePreview}
              alt="Fullscreen Preview"
              className="max-w-full max-h-[80vh] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};
