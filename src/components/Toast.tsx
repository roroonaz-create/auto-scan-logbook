import React from "react";
import { Check, AlertCircle, Info, X } from "lucide-react";
import { ToastMessage } from "../types";

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        const isSuccess = toast.type === "success";
        const isError = toast.type === "error";

        return (
          <div
            key={toast.id}
            id={`toast-${toast.id}`}
            className={`pointer-events-auto flex items-start gap-2.5 p-3 rounded shadow-md border text-xs transition select-none ${
              isSuccess
                ? "bg-slate-900 text-white border-slate-800"
                : isError
                ? "bg-red-900 text-white border-red-800"
                : "bg-slate-900 text-white border-slate-800"
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {isSuccess && <Check className="w-4 h-4 text-emerald-400" strokeWidth={1.5} />}
              {isError && <AlertCircle className="w-4 h-4 text-red-400" strokeWidth={1.5} />}
              {!isSuccess && !isError && <Info className="w-4 h-4 text-slate-300" strokeWidth={1.5} />}
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-white">
                {toast.title}
              </h4>
              <p className="text-slate-300 mt-0.5 whitespace-pre-line text-[11px]">
                {toast.message}
              </p>
            </div>

            <button
              id={`dismiss-toast-${toast.id}`}
              onClick={() => onDismiss(toast.id)}
              className="text-slate-400 hover:text-white p-0.5 rounded shrink-0"
              title="Tutup"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
