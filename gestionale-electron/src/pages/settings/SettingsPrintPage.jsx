import { useEffect, useState } from "react";
import { Network, Printer, RefreshCw, Usb } from "lucide-react";
import ToastNotifications, { useToastNotifications } from "../../components/common/ToastNotifications";
import {
  getPrintSettings,
  getPrintQueueStatus,
  listSystemPrinters,
  printTestReceipt,
  reprintLastOrder,
  retryFailedPrintJob,
  updatePrintSettings,
} from "../../services/ipc/print.ipc";

const DEFAULT_FORM = {
  mode: "SYSTEM",
  systemPrinterName: "",
  ethernetHost: "",
  ethernetPort: 9100,
  paperWidthMm: 80,
  copies: 1,
  deliveryFeeEuro: "2,00",
  autoCut: true,
  headerLine1: "PIZZERIA",
  headerLine2: "",
  footerText: "Grazie e buon appetito",
  templateAsporto: "",
  templateDomicilioKitchen: "",
  templateDomicilioDelivery: "",
};

const TEMPLATE_DRAFT_STORAGE_KEY = "print-template-drafts-v1";
const TEMPLATE_FIELDS = ["templateAsporto", "templateDomicilioKitchen", "templateDomicilioDelivery"];

function extractTemplateFields(source) {
  const input = source && typeof source === "object" ? source : {};

  return {
    templateAsporto:
      typeof input.templateAsporto === "string" ? input.templateAsporto : "",
    templateDomicilioKitchen:
      typeof input.templateDomicilioKitchen === "string" ? input.templateDomicilioKitchen : "",
    templateDomicilioDelivery:
      typeof input.templateDomicilioDelivery === "string" ? input.templateDomicilioDelivery : "",
  };
}

function loadTemplateDrafts() {
  try {
    const raw = window.localStorage.getItem(TEMPLATE_DRAFT_STORAGE_KEY);

    if (!raw) {
      return extractTemplateFields({});
    }

    const parsed = JSON.parse(raw);
    return extractTemplateFields(parsed);
  } catch {
    return extractTemplateFields({});
  }
}

function saveTemplateDrafts(source) {
  try {
    window.localStorage.setItem(
      TEMPLATE_DRAFT_STORAGE_KEY,
      JSON.stringify(extractTemplateFields(source))
    );
  } catch {
    // Ignore storage failures to keep settings usable.
  }
}

function mergeTemplatesWithDrafts(settingsForm, drafts) {
  const merged = { ...settingsForm };

  for (const field of TEMPLATE_FIELDS) {
    const persistedValue = typeof settingsForm[field] === "string" ? settingsForm[field] : "";
    const draftValue = typeof drafts[field] === "string" ? drafts[field] : "";

    merged[field] = persistedValue.trim() ? persistedValue : draftValue;
  }

  return merged;
}

function formatCentsToEuroInput(cents) {
  return (Number(cents ?? 0) / 100).toFixed(2).replace(".", ",");
}

function parseEuroInputToCents(value, fieldLabel) {
  const raw = String(value ?? "").trim();

  if (!raw) {
    throw new Error(`${fieldLabel} non valido`);
  }

  const normalized = raw.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldLabel} non valido`);
  }

  return Math.round(parsed * 100);
}

function normalizeSettingsForForm(input) {
  return {
    mode: input?.mode === "ETHERNET" ? "ETHERNET" : "SYSTEM",
    systemPrinterName: typeof input?.systemPrinterName === "string" ? input.systemPrinterName : "",
    ethernetHost: typeof input?.ethernetHost === "string" ? input.ethernetHost : "",
    ethernetPort: Number.isInteger(input?.ethernetPort) ? input.ethernetPort : 9100,
    paperWidthMm: Number(input?.paperWidthMm) === 58 ? 58 : 80,
    copies: Number.isInteger(input?.copies) ? Math.min(3, Math.max(1, input.copies)) : 1,
    deliveryFeeEuro: formatCentsToEuroInput(input?.deliveryFeeCents ?? 200),
    autoCut: Boolean(input?.autoCut ?? true),
    headerLine1: typeof input?.headerLine1 === "string" ? input.headerLine1.trim() : "",
    headerLine2: typeof input?.headerLine2 === "string" ? input.headerLine2.trim() : "",
    footerText: typeof input?.footerText === "string" ? input.footerText.trim() : "",
    templateAsporto: typeof input?.templateAsporto === "string" ? input.templateAsporto : "",
    templateDomicilioKitchen:
      typeof input?.templateDomicilioKitchen === "string" ? input.templateDomicilioKitchen : "",
    templateDomicilioDelivery:
      typeof input?.templateDomicilioDelivery === "string" ? input.templateDomicilioDelivery : "",
  };
}

function normalizeAsciiText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n]/g, "")
    .replace(/\r/g, "");
}

function formatEuroLabel(cents) {
  const amount = Number.isFinite(Number(cents)) ? Number(cents) : 0;
  return `${(amount / 100).toFixed(2).replace(".", ",")} EUR`;
}

function safeParseEuroInputToCents(value) {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return 0;
  }

  const normalized = raw.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : 0;
}

function centerText(text, width) {
  const normalized = normalizeAsciiText(text).trim();

  if (!normalized) {
    return "";
  }

  if (normalized.length >= width) {
    return normalized.slice(0, width);
  }

  const leftPadding = Math.floor((width - normalized.length) / 2);
  return `${" ".repeat(leftPadding)}${normalized}`;
}

function fitLabelAmount(label, amount, width) {
  const normalizedLabel = normalizeAsciiText(label).trim();
  const normalizedAmount = normalizeAsciiText(amount).trim();
  const minSpacing = 2;
  const availableLabelWidth = Math.max(8, width - normalizedAmount.length - minSpacing);
  const clippedLabel =
    normalizedLabel.length > availableLabelWidth
      ? `${normalizedLabel.slice(0, Math.max(0, availableLabelWidth - 1))}~`
      : normalizedLabel;

  const spacing = Math.max(minSpacing, width - clippedLabel.length - normalizedAmount.length);
  return `${clippedLabel}${" ".repeat(spacing)}${normalizedAmount}`;
}

function wrapText(text, maxWidth) {
  const normalized = normalizeAsciiText(text).trim();

  if (!normalized) {
    return [];
  }

  const words = normalized.split(/\s+/);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    if (!currentLine) {
      currentLine = word;
      continue;
    }

    if (`${currentLine} ${word}`.length <= maxWidth) {
      currentLine = `${currentLine} ${word}`;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function wrapPreviewLine(line, width) {
  if (line.length <= width) {
    return [line];
  }

  const indentMatch = line.match(/^\s*/);
  const indent = indentMatch ? indentMatch[0] : "";
  const contentWidth = Math.max(8, width - indent.length);
  const wrapped = wrapText(line.trim(), contentWidth);

  if (wrapped.length === 0) {
    return [line.slice(0, width)];
  }

  return wrapped.map((part) => `${indent}${part}`);
}

function renderTemplatePreview(templateText, context, width) {
  const source = normalizeAsciiText(templateText ?? "");

  if (!source.trim()) {
    return "Template vuoto: verra usato il layout standard del sistema.";
  }

  const rendered = source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const value = context[key];
    if (value === undefined || value === null) {
      return "";
    }

    return normalizeAsciiText(String(value));
  });

  const rawLines = rendered.split("\n");
  const lines = [];

  for (const line of rawLines) {
    if (!line.trim()) {
      lines.push("");
      continue;
    }

    lines.push(...wrapPreviewLine(line, width));
  }

  return lines.join("\n").trim() || "Anteprima non disponibile.";
}

function formatDateTimeLabel(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildTemplatePreviewContext(form) {
  const width = Number(form.paperWidthMm) === 58 ? 32 : 48;
  const separator = "-".repeat(width);
  const deliveryFeeCents = safeParseEuroInputToCents(form.deliveryFeeEuro);
  const headerLines = [];

  if (form.headerLine1?.trim()) {
    headerLines.push(centerText(form.headerLine1.trim(), width));
  }

  if (form.headerLine2?.trim()) {
    headerLines.push(centerText(form.headerLine2.trim(), width));
  }

  if (headerLines.length > 0) {
    headerLines.push(separator);
  }

  const footerLines = [];

  if (form.footerText?.trim()) {
    footerLines.push(separator);
    footerLines.push(centerText(form.footerText.trim(), width));
  }

  const pizzaItemsNoPricesBlock = [
    "1x MARGHERITA",
    "    + BUFALA",
    "",
    "2x DIAVOLA",
    "    + OLIVE x2",
    "    - CIPOLLA x2",
    "    Nota: ben cotta",
  ].join("\n");

  const pizzaItemsWithPricesBlock = [
    fitLabelAmount("1x MARGHERITA", formatEuroLabel(700), width),
    fitLabelAmount("    + BUFALA", `+${formatEuroLabel(100)}`, width),
    "",
    fitLabelAmount("2x DIAVOLA", formatEuroLabel(1100), width),
    fitLabelAmount("    + OLIVE x2", `+${formatEuroLabel(200)}`, width),
    fitLabelAmount("    - CIPOLLA x2", `-${formatEuroLabel(100)}`, width),
    "    Nota: ben cotta",
  ].join("\n");

  const pizzasTotalCents = 2000;
  const totalsBlock = [
    separator,
    fitLabelAmount("TOTALE PIZZE", formatEuroLabel(pizzasTotalCents), width),
    fitLabelAmount("CONSEGNA", formatEuroLabel(deliveryFeeCents), width),
    fitLabelAmount("TOTALE COMANDA", formatEuroLabel(pizzasTotalCents + deliveryFeeCents), width),
  ].join("\n");

  return {
    width,
    context: {
      separator,
      headerBlock: headerLines.join("\n"),
      ticketTitleCentered: centerText("COMANDA ANTEPRIMA", width),
      orderNumberLabel: "#123",
      customerLine: "Mario Rossi",
      customerName: "Mario Rossi",
      customerPhone: "3331234567",
      customerAddress: "Via Roma 10, Citta",
      dateLine: "DATA: 15/04/2026",
      timeLine: "ORARIO: 20:30",
      typeLine: fitLabelAmount("Tipo", "DOMICILIO", width),
      pizzaCountLine: centerText("*** PIZZE TOTALI: 3 ***", width),
      pizzaItemsBlock: pizzaItemsNoPricesBlock,
      pizzaItemsNoPricesBlock,
      pizzaItemsWithPricesBlock,
      deliveryContactsBlock: [
        "!!! INDIRIZZO CONSEGNA !!!",
        "VIA ROMA 10, CITTA",
        "!!! TELEFONO !!!",
        "3331234567",
        separator,
      ].join("\n"),
      totalsBlock,
      notesBlock: [separator, "NOTE ORDINE: Suonare al citofono"].join("\n"),
      footerBlock: footerLines.join("\n"),
    },
  };
}

export default function SettingsPrintPage() {
  const { toasts, pushToast, dismissToast } = useToastNotifications();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [printers, setPrinters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [refreshingPrinters, setRefreshingPrinters] = useState(false);
  const [queueStatus, setQueueStatus] = useState({
    processing: false,
    activeJobId: null,
    queuedCount: 0,
    queuedJobs: [],
    recentJobs: [],
  });
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueActionLoading, setQueueActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);

  async function reloadPrinters() {
    setRefreshingPrinters(true);

    try {
      const result = await listSystemPrinters();
      setPrinters(Array.isArray(result) ? result : []);
    } catch (err) {
      setActionError(err);
      pushToast({ type: "error", title: "Errore", description: err.message });
    } finally {
      setRefreshingPrinters(false);
    }
  }

  async function reloadPageData() {
    setLoading(true);
    setActionError(null);

    try {
      const [settingsResult, printersResult] = await Promise.all([
        getPrintSettings(),
        listSystemPrinters(),
      ]);

      const normalized = normalizeSettingsForForm(settingsResult);
      const drafts = loadTemplateDrafts();
      const hydratedForm = mergeTemplatesWithDrafts(normalized, drafts);

      setForm(hydratedForm);
      setPrinters(Array.isArray(printersResult) ? printersResult : []);
      saveTemplateDrafts(hydratedForm);
    } catch (err) {
      const drafts = loadTemplateDrafts();
      setForm((prev) => ({
        ...prev,
        ...drafts,
      }));
      setActionError(err);
      pushToast({ type: "error", title: "Errore", description: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function reloadQueueStatus(options = {}) {
    const { silent = false } = options;

    if (!silent) {
      setQueueLoading(true);
    }

    try {
      const result = await getPrintQueueStatus();
      setQueueStatus({
        processing: Boolean(result?.processing),
        activeJobId: result?.activeJobId ?? null,
        queuedCount: Number(result?.queuedCount ?? 0),
        queuedJobs: Array.isArray(result?.queuedJobs) ? result.queuedJobs : [],
        recentJobs: Array.isArray(result?.recentJobs) ? result.recentJobs : [],
      });
    } catch (err) {
      if (!silent) {
        setActionError(err);
        pushToast({ type: "error", title: "Errore coda stampa", description: err.message });
      }
    } finally {
      if (!silent) {
        setQueueLoading(false);
      }
    }
  }

  useEffect(() => {
    void reloadPageData();
    void reloadQueueStatus();
  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      void reloadQueueStatus({ silent: true });
    }, 5000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  function updateField(field, value) {
    setActionError(null);
    setForm((prev) => {
      const next = {
        ...prev,
        [field]: value,
      };

      if (TEMPLATE_FIELDS.includes(field)) {
        saveTemplateDrafts(next);
      }

      return next;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setActionError(null);

    try {
      const payload = {
        mode: form.mode,
        systemPrinterName: form.systemPrinterName,
        ethernetHost: form.ethernetHost,
        ethernetPort: Number(form.ethernetPort),
        paperWidthMm: Number(form.paperWidthMm),
        copies: Number(form.copies),
        deliveryFeeCents: parseEuroInputToCents(form.deliveryFeeEuro, "Costo consegna"),
        autoCut: Boolean(form.autoCut),
        headerLine1: form.headerLine1,
        headerLine2: form.headerLine2,
        footerText: form.footerText,
        templateAsporto: form.templateAsporto,
        templateDomicilioKitchen: form.templateDomicilioKitchen,
        templateDomicilioDelivery: form.templateDomicilioDelivery,
      };

      const updated = await updatePrintSettings(payload);
      const normalized = normalizeSettingsForForm(updated);
      setForm(normalized);
      saveTemplateDrafts(normalized);
      pushToast({ type: "success", title: "Impostazioni stampa salvate" });
    } catch (err) {
      setActionError(err);
      pushToast({ type: "error", title: "Errore", description: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleTestPrint() {
    setTesting(true);
    setActionError(null);

    try {
      const result = await printTestReceipt();
      pushToast({
        type: "success",
        title: "Stampa test inviata",
        description: `Target: ${result?.target ?? "stampante configurata"}`,
      });
      void reloadQueueStatus();
    } catch (err) {
      setActionError(err);
      pushToast({ type: "error", title: "Stampa test fallita", description: err.message });
    } finally {
      setTesting(false);
    }
  }

  async function handleRetryJob(jobId) {
    setQueueActionLoading(true);
    setActionError(null);

    try {
      const result = await retryFailedPrintJob({ jobId });
      pushToast({
        type: "success",
        title: "Retry completato",
        description: `Target: ${result?.target ?? "stampante configurata"}`,
      });
      await reloadQueueStatus();
    } catch (err) {
      setActionError(err);
      pushToast({ type: "error", title: "Retry stampa fallito", description: err.message });
      await reloadQueueStatus();
    } finally {
      setQueueActionLoading(false);
    }
  }

  async function handleReprintLastOrder() {
    setQueueActionLoading(true);
    setActionError(null);

    try {
      const result = await reprintLastOrder();
      pushToast({
        type: "success",
        title: "Ristampa completata",
        description: `Target: ${result?.target ?? "stampante configurata"}`,
      });
      await reloadQueueStatus();
    } catch (err) {
      setActionError(err);
      pushToast({ type: "error", title: "Ristampa fallita", description: err.message });
      await reloadQueueStatus();
    } finally {
      setQueueActionLoading(false);
    }
  }

  const previewData = buildTemplatePreviewContext(form);
  const previewAsporto = renderTemplatePreview(
    form.templateAsporto,
    previewData.context,
    previewData.width
  );
  const previewDomicilioKitchen = renderTemplatePreview(
    form.templateDomicilioKitchen,
    previewData.context,
    previewData.width
  );
  const previewDomicilioDelivery = renderTemplatePreview(
    form.templateDomicilioDelivery,
    previewData.context,
    previewData.width
  );

  return (
    <div className="space-y-4">
      <ToastNotifications toasts={toasts} onDismiss={dismissToast} />

      <section className="ui-surface rounded-xl p-4">
        <h3 className="text-base font-semibold text-slate-900">Stampa scontrini</h3>
        <p className="mt-1 text-sm text-slate-600">
          Configura la stampante Epson via USB oppure Ethernet ESC/POS.
        </p>
      </section>

      <section className="ui-surface rounded-xl p-4">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm text-slate-700">
              Modalita stampa
              <select
                value={form.mode}
                onChange={(event) => updateField("mode", event.target.value)}
                disabled={loading || saving}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
              >
                <option value="SYSTEM">Sistema / USB (Windows)</option>
                <option value="ETHERNET">Ethernet ESC/POS</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm text-slate-700">
              Copie
              <select
                value={form.copies}
                onChange={(event) => updateField("copies", Number(event.target.value))}
                disabled={loading || saving}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
              >
                <option value={1}>1 copia</option>
                <option value={2}>2 copie</option>
                <option value={3}>3 copie</option>
              </select>
            </label>
          </div>

          {form.mode === "SYSTEM" ? (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Usb size={15} className="text-slate-500" />
                  Stampante di sistema
                </p>
                <button
                  type="button"
                  onClick={() => void reloadPrinters()}
                  disabled={loading || saving || refreshingPrinters}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw size={13} className={refreshingPrinters ? "animate-spin" : ""} />
                  Aggiorna elenco
                </button>
              </div>

              <label className="grid gap-1 text-sm text-slate-700">
                Stampante
                <select
                  value={form.systemPrinterName}
                  onChange={(event) => updateField("systemPrinterName", event.target.value)}
                  disabled={loading || saving}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
                >
                  <option value="">Predefinita di sistema</option>
                  {printers.map((printer) => (
                    <option key={printer.name} value={printer.name}>
                      {printer.isDefault ? "[Predefinita] " : ""}
                      {printer.displayName}
                    </option>
                  ))}
                </select>
              </label>

              <p className="text-xs text-slate-500">
              </p>
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Network size={15} className="text-slate-500" />
                Stampante Ethernet ESC/POS
              </p>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm text-slate-700">
                  Host / IP
                  <input
                    type="text"
                    value={form.ethernetHost}
                    onChange={(event) => updateField("ethernetHost", event.target.value)}
                    disabled={loading || saving}
                    placeholder="Es. 192.168.1.120"
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
                  />
                </label>

                <label className="grid gap-1 text-sm text-slate-700">
                  Porta
                  <input
                    type="number"
                    value={form.ethernetPort}
                    onChange={(event) => updateField("ethernetPort", Number(event.target.value) || 9100)}
                    min={1}
                    max={65535}
                    disabled={loading || saving}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
                  />
                </label>
              </div>

              <p className="text-xs text-slate-500">
                Normalmente la porta è 9100.
              </p>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm text-slate-700">
              Larghezza carta
              <select
                value={form.paperWidthMm}
                onChange={(event) => updateField("paperWidthMm", Number(event.target.value))}
                disabled={loading || saving}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
              >
                <option value={80}>80 mm</option>
                <option value={58}>58 mm</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm text-slate-700">
              Costo consegna
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-500">EUR</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.deliveryFeeEuro}
                  onChange={(event) => updateField("deliveryFeeEuro", event.target.value)}
                  disabled={loading || saving}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-12 pr-3 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
                />
              </div>
            </label>

            <label className="inline-flex items-center gap-2 self-end rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={form.autoCut}
                onChange={(event) => updateField("autoCut", event.target.checked)}
                disabled={loading || saving}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/30"
              />
              Taglio carta automatico (ESC/POS)
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm text-slate-700">
              Intestazione 1 (opzionale)
              <input
                type="text"
                value={form.headerLine1}
                onChange={(event) => updateField("headerLine1", event.target.value)}
                disabled={loading || saving}
                placeholder="Lascia vuoto per non stampare header"
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
              />
            </label>

            <label className="grid gap-1 text-sm text-slate-700">
              Intestazione 2 (opzionale)
              <input
                type="text"
                value={form.headerLine2}
                onChange={(event) => updateField("headerLine2", event.target.value)}
                disabled={loading || saving}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
              />
            </label>
          </div>

          <label className="grid gap-1 text-sm text-slate-700">
            Footer (opzionale)
            <input
              type="text"
              value={form.footerText}
              onChange={(event) => updateField("footerText", event.target.value)}
              disabled={loading || saving}
              placeholder="Lascia vuoto per non stampare footer"
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
            />
          </label>

          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-slate-900">Template avanzato stampa</h4>
              <p className="text-xs text-slate-500">
                Puoi personalizzare completamente il layout usando placeholder tra parentesi graffe.
                Se lasci vuoto un template, verra usato il layout standard.
              </p>
            </div>

            <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 text-xs text-emerald-900">
              <p className="font-semibold">Placeholder disponibili</p>
              <p className="mt-1">
                {"{{headerBlock}} {{ticketTitleCentered}} {{separator}} {{orderNumberLabel}} {{customerLine}} {{customerName}} {{customerPhone}} {{customerAddress}} {{dateLine}} {{timeLine}} {{typeLine}} {{pizzaCountLine}} {{pizzaItemsBlock}} {{pizzaItemsNoPricesBlock}} {{pizzaItemsWithPricesBlock}} {{deliveryContactsBlock}} {{totalsBlock}} {{notesBlock}} {{footerBlock}}"}
              </p>
            </div>

            <label className="grid gap-1 text-sm text-slate-700">
              Template commanda asporto (cucina)
              <textarea
                value={form.templateAsporto}
                onChange={(event) => updateField("templateAsporto", event.target.value)}
                disabled={loading || saving}
                rows={9}
                placeholder={"{{headerBlock}}\n{{ticketTitleCentered}}\n{{separator}}\nNUMERO ORDINE: {{orderNumberLabel}}\n{{dateLine}}\n{{timeLine}}\n{{separator}}\n{{pizzaItemsBlock}}\n{{notesBlock}}\n{{footerBlock}}"}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs leading-5 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
              />
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Anteprima live
                </p>
                <pre className="max-h-48 overflow-auto rounded-md bg-white p-2 font-mono text-[11px] leading-4 text-slate-800 ring-1 ring-slate-900/5">
                  {previewAsporto}
                </pre>
              </div>
            </label>

            <label className="grid gap-1 text-sm text-slate-700">
              Template commanda domicilio (cucina)
              <textarea
                value={form.templateDomicilioKitchen}
                onChange={(event) => updateField("templateDomicilioKitchen", event.target.value)}
                disabled={loading || saving}
                rows={9}
                placeholder={"{{headerBlock}}\n{{ticketTitleCentered}}\n{{separator}}\nNUMERO ORDINE: {{orderNumberLabel}}\n{{customerLine}}\n{{dateLine}}\n{{timeLine}}\n{{separator}}\n{{pizzaItemsBlock}}\n{{notesBlock}}\n{{footerBlock}}"}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs leading-5 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
              />
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Anteprima live
                </p>
                <pre className="max-h-48 overflow-auto rounded-md bg-white p-2 font-mono text-[11px] leading-4 text-slate-800 ring-1 ring-slate-900/5">
                  {previewDomicilioKitchen}
                </pre>
              </div>
            </label>

            <label className="grid gap-1 text-sm text-slate-700">
              Template foglio consegna domicilio (con prezzi)
              <textarea
                value={form.templateDomicilioDelivery}
                onChange={(event) => updateField("templateDomicilioDelivery", event.target.value)}
                disabled={loading || saving}
                rows={11}
                placeholder={"{{headerBlock}}\n{{ticketTitleCentered}}\n{{separator}}\nNUMERO ORDINE: {{orderNumberLabel}}\n{{deliveryContactsBlock}}\n{{customerLine}}\n{{dateLine}}\n{{timeLine}}\n{{typeLine}}\n{{separator}}\n{{pizzaItemsWithPricesBlock}}\n{{totalsBlock}}\n{{notesBlock}}\n{{footerBlock}}"}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs leading-5 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
              />
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Anteprima live
                </p>
                <pre className="max-h-56 overflow-auto rounded-md bg-white p-2 font-mono text-[11px] leading-4 text-slate-800 ring-1 ring-slate-900/5">
                  {previewDomicilioDelivery}
                </pre>
              </div>
            </label>
          </section>

          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">Coda stampa</h4>
                <p className="text-xs text-slate-500">
                  Retry automatico fino a 3 tentativi per job. Qui trovi stato e ultimi errori.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void reloadQueueStatus()}
                  disabled={queueLoading || queueActionLoading || loading || saving}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw size={13} className={queueLoading ? "animate-spin" : ""} />
                  Aggiorna coda
                </button>

                <button
                  type="button"
                  onClick={() => void handleReprintLastOrder()}
                  disabled={queueLoading || queueActionLoading || loading || saving}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Printer size={13} />
                  Ristampa ultimo ordine
                </button>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Stato</p>
                <p className="text-sm font-semibold text-slate-800">
                  {queueStatus.processing ? "In lavorazione" : "Idle"}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">In coda</p>
                <p className="text-sm font-semibold text-slate-800">{queueStatus.queuedCount}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Job attivo</p>
                <p className="truncate text-sm font-semibold text-slate-800">
                  {queueStatus.activeJobId || "-"}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ultimi job</p>
              {queueStatus.recentJobs.length === 0 ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  Nessun job disponibile.
                </p>
              ) : (
                <div className="space-y-2">
                  {queueStatus.recentJobs.slice(0, 8).map((job) => {
                    const isFailed = job.status === "FAILED";
                    const statusStyle = isFailed
                      ? "bg-rose-100 text-rose-700"
                      : (job.status === "COMPLETED" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700");

                    return (
                      <div
                        key={job.id}
                        className="rounded-lg border border-slate-200 bg-white p-3 ring-1 ring-slate-900/5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusStyle}`}>
                              {job.status}
                            </span>
                            <p className="text-xs text-slate-600">
                              #{job.orderDailyNumber ?? "N/D"} · {job.orderType ?? "-"} · tentativi {job.attemptCount}/{job.maxAttempts}
                            </p>
                          </div>
                          <p className="text-xs text-slate-500">{formatDateTimeLabel(job.updatedAt)}</p>
                        </div>

                        <p className="mt-1 text-xs text-slate-600">
                          {job.customerName || "Cliente non specificato"}
                          {job.target ? ` · ${job.target}` : ""}
                        </p>

                        {job.errorMessage ? (
                          <p className="mt-1 rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-700">
                            Errore: {job.errorMessage}
                          </p>
                        ) : null}

                        {isFailed ? (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => void handleRetryJob(job.id)}
                              disabled={queueActionLoading || loading || saving}
                              className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Riprova stampa
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <div className="space-y-1 text-sm">
              {loading && <p className="text-slate-500">Caricamento configurazione stampa...</p>}
              {actionError && <p className="text-rose-600">{actionError.message}</p>}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleTestPrint()}
                disabled={loading || saving || testing}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Printer size={14} />
                {testing ? "Invio test..." : "Stampa test"}
              </button>

              <button
                type="submit"
                disabled={loading || saving}
                className="rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Salvataggio..." : "Salva impostazioni"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
