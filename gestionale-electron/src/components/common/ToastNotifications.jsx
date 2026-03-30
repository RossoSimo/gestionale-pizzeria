import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

const DEFAULT_TOAST_DURATION_MS = 3600;

function buildToastVisual(type) {
  if (type === "error") {
    return {
      Icon: AlertCircle,
      iconClassName: "border border-rose-200 bg-rose-50 text-rose-600",
      title: "Operazione non riuscita",
    };
  }

  if (type === "info") {
    return {
      Icon: Info,
      iconClassName: "border border-sky-200 bg-sky-50 text-sky-600",
      title: "Informazione",
    };
  }

  return {
    Icon: CheckCircle2,
    iconClassName: "border border-emerald-200 bg-emerald-50 text-emerald-600",
    title: "Operazione completata",
  };
}

function normalizeToastInput(input, fallbackType = "success") {
  const source =
    input && typeof input === "object"
      ? input
      : {
          description: typeof input === "string" ? input : "",
        };

  const type = source.type === "error" || source.type === "info" ? source.type : fallbackType;
  const visual = buildToastVisual(type);

  return {
    type,
    title: typeof source.title === "string" && source.title.trim() ? source.title.trim() : visual.title,
    description:
      typeof source.description === "string" && source.description.trim()
        ? source.description.trim()
        : "",
    durationMs:
      Number.isFinite(source.durationMs) && source.durationMs > 0
        ? Math.round(source.durationMs)
        : DEFAULT_TOAST_DURATION_MS,
  };
}

export function useToastNotifications() {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());
  const exitTimersRef = useRef(new Map());

  const dismissToast = useCallback((toastId) => {
    setToasts((prev) => 
      prev.map((toast) => (toast.id === toastId ? { ...toast, isExiting: true } : toast))
    );

    const activeTimer = timersRef.current.get(toastId);
    if (activeTimer) {
      clearTimeout(activeTimer);
      timersRef.current.delete(toastId);
    }

    const exitTimer = setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== toastId));
      exitTimersRef.current.delete(toastId);
    }, 400); // match animation duration

    exitTimersRef.current.set(toastId, exitTimer);
  }, []);

  const pushToast = useCallback(
    (input, fallbackType = "success") => {
      const toastData = normalizeToastInput(input, fallbackType);
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      setToasts((prev) => [
        ...prev,
        {
          id,
          isExiting: false,
          ...toastData,
        },
      ]);

      const timeoutHandle = setTimeout(() => {
        dismissToast(id);
      }, toastData.durationMs);

      timersRef.current.set(id, timeoutHandle);

      return id;
    },
    [dismissToast]
  );

  useEffect(() => {
    return () => {
      for (const timeoutHandle of timersRef.current.values()) {
        clearTimeout(timeoutHandle);
      }
      for (const timeoutHandle of exitTimersRef.current.values()) {
        clearTimeout(timeoutHandle);
      }
      timersRef.current.clear();
      exitTimersRef.current.clear();
    };
  }, []);

  return {
    toasts,
    pushToast,
    dismissToast,
  };
}

export default function ToastNotifications({ toasts, onDismiss }) {
  if (!Array.isArray(toasts) || toasts.length === 0) {
    return null;
  }

  return (
    <>
      <style>{`
        @keyframes toast-slide-in {
          0% { opacity: 0; transform: translateX(100%); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes toast-slide-out {
          0% { 
            opacity: 1; 
            transform: scale(1) translateX(0); 
            max-height: 200px;
            margin-bottom: 0.5rem;
          }
          50% { 
            opacity: 0; 
            transform: scale(0.95) translateX(20%); 
            max-height: 200px;
            margin-bottom: 0.5rem;
            padding-top: 1rem;
            padding-bottom: 1rem;
            border-width: 1px;
          }
          100% { 
            opacity: 0; 
            transform: scale(0.95) translateX(20%); 
            max-height: 0;
            margin-bottom: 0;
            padding-top: 0;
            padding-bottom: 0;
            border-width: 0;
          }
        }
        @keyframes toast-progress {
          0% { width: 100%; }
          100% { width: 0%; }
        }
      `}</style>
      <div className="pointer-events-none fixed right-3 top-3 z-[80] flex w-full max-w-md flex-col sm:right-4 sm:top-4">
        {toasts.map((toast) => {
          const visual = buildToastVisual(toast.type);
          const Icon = visual.Icon;

          return (
            <article
              key={toast.id}
              className="pointer-events-auto relative mb-2 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.14)]"
              style={{ 
                animation: toast.isExiting 
                  ? 'toast-slide-out 0.4s ease-in forwards' 
                  : 'toast-slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards' 
              }}
            >
              <div className="pr-7 relative z-10">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${visual.iconClassName}`}>
                    <Icon size={14} />
                  </span>

                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold leading-5 text-slate-900">{toast.title}</p>
                    {toast.description && <p className="text-sm leading-5 text-slate-500">{toast.description}</p>}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="absolute right-2 top-2 z-10 text-slate-400 transition-colors hover:text-slate-600"
                aria-label="Chiudi notifica"
                title="Chiudi"
              >
                <X size={16} />
              </button>

              {/* Progress Bar */}
              <div 
                className={`absolute bottom-0 left-0 h-1 bg-slate-100 ${
                  toast.type === "error" ? "bg-rose-500" :
                  toast.type === "info" ? "bg-sky-500" :
                  "bg-emerald-500"
                }`}
                style={{ 
                  animation: `toast-progress ${toast.durationMs}ms linear forwards`
                }} 
              />
            </article>
          );
        })}
      </div>
    </>
  );
}
