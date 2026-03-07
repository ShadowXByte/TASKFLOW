interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  busy: boolean;
  darkMode: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  busy,
  darkMode,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 p-4" style={{ zIndex: 9999 }}>
      <div
        className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${
          darkMode ? "border-white/20 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-900"
        }`}
        style={{ zIndex: 10000 }}
      >
        <h3 className="text-lg font-bold">{title}</h3>
        <p className={`mt-2 text-sm ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
          {message}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              darkMode
                ? "bg-slate-700 text-slate-100 hover:bg-slate-600 disabled:opacity-50"
                : "bg-slate-200 text-slate-700 hover:bg-slate-300 disabled:opacity-50"
            }`}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "Deleting..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
