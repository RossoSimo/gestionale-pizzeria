const fs = require("node:fs/promises");
const net = require("node:net");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const PRINT_MODE_SYSTEM = "SYSTEM";
const PRINT_MODE_ETHERNET = "ETHERNET";
const PIZZA_FAMILY_CATEGORY_KEYS = new Set(["PIZZA", "PIZZA_STAGIONALI", "PIZZA_SPECIALI"]);

const PAPER_WIDTH_MM_58 = 58;
const PAPER_WIDTH_MM_80 = 80;
const PRINT_MAX_ATTEMPTS = 3;
const PRINT_HISTORY_LIMIT = 40;

const PRINT_JOB_STATUS = {
  QUEUED: "QUEUED",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
};

const DEFAULT_PRINT_SETTINGS = {
  mode: PRINT_MODE_SYSTEM,
  systemPrinterName: "",
  ethernetHost: "",
  ethernetPort: 9100,
  paperWidthMm: PAPER_WIDTH_MM_80,
  copies: 1,
  deliveryFeeCents: 200,
  autoCut: true,
  headerLine1: "Chicco Di Grano",
  headerLine2: "",
  footerText: "Grazie e buon appetito",
  templateAsporto: "",
  templateDomicilioKitchen: "",
  templateDomicilioDelivery: "",
};

function buildValidationError(message, details) {
  const error = new Error(message);
  error.code = "VALIDATION_ERROR";
  error.details = details ?? null;
  return error;
}

function toPositiveInt(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const rounded = Math.trunc(parsed);
  return rounded > 0 ? rounded : fallback;
}

function toNonNegativeInt(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const rounded = Math.trunc(parsed);
  return rounded >= 0 ? rounded : fallback;
}

function normalizeAsciiText(value) {
  const source = typeof value === "string" ? value : String(value ?? "");

  return source
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n]/g, "")
    .replace(/\r/g, "");
}

function normalizePrintSettings(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};

  const mode = source.mode === PRINT_MODE_ETHERNET ? PRINT_MODE_ETHERNET : PRINT_MODE_SYSTEM;

  const paperWidthMm = Number(source.paperWidthMm) === PAPER_WIDTH_MM_58
    ? PAPER_WIDTH_MM_58
    : PAPER_WIDTH_MM_80;

  const copies = Math.min(3, Math.max(1, toPositiveInt(source.copies, 1)));
  const ethernetPort = Math.min(65535, Math.max(1, toPositiveInt(source.ethernetPort, 9100)));
  const deliveryFeeCents = Math.min(2000, Math.max(0, toNonNegativeInt(source.deliveryFeeCents, 200)));

  return {
    mode,
    systemPrinterName:
      typeof source.systemPrinterName === "string" ? source.systemPrinterName.trim() : "",
    ethernetHost:
      typeof source.ethernetHost === "string" ? source.ethernetHost.trim() : "",
    ethernetPort,
    paperWidthMm,
    copies,
    deliveryFeeCents,
    autoCut: Boolean(source.autoCut ?? true),
    headerLine1:
      typeof source.headerLine1 === "string"
        ? source.headerLine1.trim().slice(0, 40)
        : DEFAULT_PRINT_SETTINGS.headerLine1,
    headerLine2:
      typeof source.headerLine2 === "string" ? source.headerLine2.trim().slice(0, 40) : "",
    footerText:
      typeof source.footerText === "string"
        ? source.footerText.trim().slice(0, 100)
        : DEFAULT_PRINT_SETTINGS.footerText,
    templateAsporto:
      typeof source.templateAsporto === "string"
        ? source.templateAsporto.slice(0, 8000)
        : "",
    templateDomicilioKitchen:
      typeof source.templateDomicilioKitchen === "string"
        ? source.templateDomicilioKitchen.slice(0, 8000)
        : "",
    templateDomicilioDelivery:
      typeof source.templateDomicilioDelivery === "string"
        ? source.templateDomicilioDelivery.slice(0, 8000)
        : "",
  };
}

function formatEuroLabel(cents) {
  const amount = Number.isFinite(Number(cents)) ? Number(cents) : 0;
  return `${(amount / 100).toFixed(2).replace(".", ",")} EUR`;
}

function formatModifierPriceLabel(cents) {
  const value = Number.isFinite(Number(cents)) ? Number(cents) : 0;

  if (value > 0) {
    return `+${formatEuroLabel(value)}`;
  }

  if (value < 0) {
    return `-${formatEuroLabel(Math.abs(value))}`;
  }

  return formatEuroLabel(0);
}

function formatDateTimeLabel(value) {
  if (!value) {
    return "Non specificato";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Non specificato";
  }

  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateOnlyLabel(value) {
  if (!value) {
    return "Non specificata";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Non specificata";
  }

  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTimeOnlyLabel(value) {
  if (!value) {
    return "Non specificato";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Non specificato";
  }

  return date.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildOrderNotValidError() {
  const error = new Error("Ordine non valido per la stampa");
  error.code = "PRINT_ORDER_INVALID";
  return error;
}

function normalizePrintableOrder(input) {
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input.order && typeof input.order === "object" ? input.order : input)
      : null;

  if (!source) {
    throw buildOrderNotValidError();
  }

  const items = Array.isArray(source.items) ? source.items : [];

  if (items.length === 0) {
    throw buildOrderNotValidError();
  }

  const normalizedItems = items.map((item) => {
    const modifiers = Array.isArray(item?.modifiers) ? item.modifiers : [];

    return {
      productName:
        typeof item?.productName === "string" && item.productName.trim()
          ? item.productName.trim()
          : (typeof item?.product?.name === "string" && item.product.name.trim()
            ? item.product.name.trim()
            : "Prodotto"),
      quantity: Math.max(1, toPositiveInt(item?.quantity, 1)),
      productCategory:
        typeof item?.productCategory === "string" && item.productCategory.trim()
          ? item.productCategory.trim()
          : (typeof item?.product?.category === "string" && item.product.category.trim()
            ? item.product.category.trim()
            : (typeof item?.category === "string" ? item.category.trim() : "")),
      unitPriceCents: Number.isFinite(Number(item?.unitPriceCents)) ? Number(item.unitPriceCents) : 0,
      notes: typeof item?.notes === "string" ? item.notes.trim() : "",
      modifiers: modifiers.map((modifier) => ({
        ingredientId:
          typeof modifier?.ingredientId === "string" ? modifier.ingredientId : "",
        ingredientName:
          typeof modifier?.ingredientName === "string" && modifier.ingredientName.trim()
            ? modifier.ingredientName.trim()
            : (typeof modifier?.ingredient?.name === "string" && modifier.ingredient.name.trim()
              ? modifier.ingredient.name.trim()
              : "Ingrediente"),
        action: modifier?.action === "RIMUOVI" ? "RIMUOVI" : "AGGIUNGI",
        priceAppliedCents: Number.isFinite(Number(modifier?.priceAppliedCents))
          ? Number(modifier.priceAppliedCents)
          : 0,
      })),
    };
  });

  return {
    id: source.id ?? "",
    dailyNumber: source.dailyNumber,
    type: typeof source.type === "string" ? source.type : "ASPORTO",
    status: typeof source.status === "string" ? source.status : "CONFERMATO",
    expectedAt: source.expectedAt ?? null,
    businessDate: source.businessDate ?? null,
    totalAmountCents: Number.isFinite(Number(source.totalAmountCents))
      ? Number(source.totalAmountCents)
      : normalizedItems.reduce((sum, item) => {
        const modifierPerUnit = item.modifiers.reduce((acc, modifier) => acc + modifier.priceAppliedCents, 0);
        return sum + item.quantity * (item.unitPriceCents + modifierPerUnit);
      }, 0),
    notes: typeof source.notes === "string" ? source.notes.trim() : "",
    customer: {
      name: source.customer?.name ?? "Banco",
      phone: source.customer?.phone ?? "",
      address: source.customer?.address ?? "",
    },
    items: normalizedItems,
  };
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

function isPizzaItem(item) {
  const rawCategory =
    typeof item?.productCategory === "string" ? item.productCategory.trim().toUpperCase() : "";

  // If category metadata is unavailable, keep item visible to avoid hidden rows.
  if (!rawCategory) {
    return true;
  }

  return PIZZA_FAMILY_CATEGORY_KEYS.has(rawCategory);
}

function computeItemTotalCents(item) {
  const modifiersPerUnit = item.modifiers.reduce((sum, modifier) => sum + modifier.priceAppliedCents, 0);
  return item.quantity * (item.unitPriceCents + modifiersPerUnit);
}

function appendWrappedLine(lines, text, width) {
  const wrapped = wrapText(text, width);

  if (wrapped.length === 0) {
    return;
  }

  lines.push(...wrapped);
}

function appendItemLines(lines, items, width, includePrices) {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const baseLineTotal = item.quantity * item.unitPriceCents;
    const baseLabel = `${item.quantity}x ${item.productName.toUpperCase()}`;

    if (includePrices) {
      lines.push(fitLabelAmount(baseLabel, formatEuroLabel(baseLineTotal), width));
    } else {
      appendWrappedLine(lines, baseLabel, width);
    }

    for (const modifier of item.modifiers) {
      const prefix = modifier.action === "RIMUOVI" ? "-" : "+";
      const modifierTotalForRow = modifier.priceAppliedCents * item.quantity;
      const quantitySuffix = item.quantity > 1 ? ` x${item.quantity}` : "";
      const modifierLabel = `    ${prefix} ${modifier.ingredientName}${quantitySuffix}`;

      if (includePrices) {
        lines.push(fitLabelAmount(modifierLabel, formatModifierPriceLabel(modifierTotalForRow), width));
      } else {
        appendWrappedLine(lines, modifierLabel, width);
      }
    }

    if (item.notes) {
      appendWrappedLine(lines, `    Nota: ${item.notes}`, width);
    }

    if (index < items.length - 1) {
      lines.push("");
    }
  }
}

function linesToBlock(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return "";
  }

  return lines.join("\n");
}

function buildTemplateContext(order, settings, options = {}) {
  const {
    ticketTitle = "COMANDA",
    includePrices = false,
    includeDeliveryContacts = false,
    timeLabel = "ORARIO",
    deliveryFeeCents = 0,
  } = options;

  const width = settings.paperWidthMm === PAPER_WIDTH_MM_58 ? 32 : 48;
  const separator = "-".repeat(width);
  const pizzaItems = order.items.filter(isPizzaItem);
  const totalPizzas = pizzaItems.reduce((sum, item) => sum + item.quantity, 0);
  const pizzasTotalAmountCents = pizzaItems.reduce((sum, item) => sum + computeItemTotalCents(item), 0);
  const configuredDeliveryFeeCents = Math.max(0, Number(deliveryFeeCents) || 0);
  const effectiveDeliveryFeeCents = order.type === "DOMICILIO" ? configuredDeliveryFeeCents : 0;
  const totalWithDeliveryCents = pizzasTotalAmountCents + effectiveDeliveryFeeCents;

  const headerLines = [];

  if (settings.headerLine1) {
    headerLines.push(centerText(settings.headerLine1, width));
  }

  if (settings.headerLine2) {
    headerLines.push(centerText(settings.headerLine2, width));
  }

  if (settings.headerLine1 || settings.headerLine2) {
    headerLines.push(separator);
  }

  const deliveryContactLines = [];

  if (includeDeliveryContacts) {
    if (order.customer?.address) {
      deliveryContactLines.push("!!! INDIRIZZO CONSEGNA !!!");
      appendWrappedLine(deliveryContactLines, String(order.customer.address).toUpperCase(), width);
    }

    if (order.customer?.phone) {
      deliveryContactLines.push("!!! TELEFONO !!!");
      appendWrappedLine(deliveryContactLines, String(order.customer.phone).toUpperCase(), width);
    }

    if (deliveryContactLines.length > 0) {
      deliveryContactLines.push(separator);
    }
  }

  const itemLinesNoPrices = [];
  const itemLinesWithPrices = [];

  if (pizzaItems.length === 0) {
    itemLinesNoPrices.push("Nessuna pizza in comanda.");
    itemLinesWithPrices.push("Nessuna pizza in comanda.");
  } else {
    appendItemLines(itemLinesNoPrices, pizzaItems, width, false);
    appendItemLines(itemLinesWithPrices, pizzaItems, width, true);
  }

  const totalsLines = [];

  if (includePrices) {
    totalsLines.push(separator);
    totalsLines.push(fitLabelAmount("TOTALE PIZZE", formatEuroLabel(pizzasTotalAmountCents), width));

    if (effectiveDeliveryFeeCents > 0) {
      totalsLines.push(fitLabelAmount("CONSEGNA", formatEuroLabel(effectiveDeliveryFeeCents), width));
    }

    totalsLines.push(fitLabelAmount("TOTALE COMANDA", formatEuroLabel(totalWithDeliveryCents), width));
  }

  const notesLines = [];

  if (order.notes) {
    notesLines.push(separator);
    appendWrappedLine(notesLines, `NOTE ORDINE: ${order.notes}`, width);
  }

  const footerLines = [];

  if (settings.footerText) {
    footerLines.push(separator);
    footerLines.push(centerText(settings.footerText, width));
  }

  const orderNumberLabel = order.dailyNumber ? `#${order.dailyNumber}` : "N/D";
  const dateLabel = formatDateOnlyLabel(order.businessDate ?? order.expectedAt);
  const timeValue = formatTimeOnlyLabel(order.expectedAt);

  return {
    width,
    separator,
    ticketTitle,
    ticketTitleCentered: centerText(ticketTitle, width),
    orderNumberLabel,
    customerName: order.customer?.name || "",
    customerPhone: order.customer?.phone || "",
    customerAddress: order.customer?.address || "",
    dateLabel,
    timeLabel,
    timeValue,
    orderType: order.type,
    orderStatus: order.status,
    totalPizzas,
    pizzasTotalEuro: formatEuroLabel(pizzasTotalAmountCents),
    deliveryFeeEuro: formatEuroLabel(effectiveDeliveryFeeCents),
    totalComandaEuro: formatEuroLabel(totalWithDeliveryCents),
    headerBlock: linesToBlock(headerLines),
    deliveryContactsBlock: linesToBlock(deliveryContactLines),
    customerLine: order.customer?.name ? `${order.customer.name}` : "",
    dateLine: `DATA: ${dateLabel}`,
    timeLine: `${timeLabel}: ${timeValue}`,
    typeLine: fitLabelAmount("Tipo", order.type, width),
    pizzaCountLine: centerText(`*** PIZZE TOTALI: ${totalPizzas} ***`, width),
    pizzaItemsBlock: linesToBlock(includePrices ? itemLinesWithPrices : itemLinesNoPrices),
    pizzaItemsWithPricesBlock: linesToBlock(itemLinesWithPrices),
    pizzaItemsNoPricesBlock: linesToBlock(itemLinesNoPrices),
    totalsBlock: linesToBlock(totalsLines),
    notesBlock: linesToBlock(notesLines),
    footerBlock: linesToBlock(footerLines),
  };
}

function renderTemplate(templateText, context) {
  if (typeof templateText !== "string" || !templateText.trim()) {
    return "";
  }

  const source = normalizeAsciiText(templateText);

  return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const value = context[key];

    if (value === undefined || value === null) {
      return "";
    }

    return normalizeAsciiText(String(value));
  });
}

function wrapTemplateLine(line, width) {
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

function buildLinesFromRenderedTemplate(renderedTemplate, width) {
  if (!renderedTemplate) {
    return [];
  }

  const rawLines = renderedTemplate.split("\n");
  const lines = [];

  for (const rawLine of rawLines) {
    if (!rawLine.trim()) {
      lines.push("");
      continue;
    }

    lines.push(...wrapTemplateLine(rawLine, width));
  }

  while (lines.length > 0 && !lines[0].trim()) {
    lines.shift();
  }

  while (lines.length > 0 && !lines[lines.length - 1].trim()) {
    lines.pop();
  }

  return lines;
}

function buildComandaLines(order, settings, options = {}) {
  const {
    ticketTitle = "COMANDA",
    includePrices = false,
    includeDeliveryContacts = false,
    timeLabel = "ORARIO",
    deliveryFeeCents = 0,
    templateText = "",
  } = options;

  const width = settings.paperWidthMm === PAPER_WIDTH_MM_58 ? 32 : 48;
  const separator = "-".repeat(width);
  const lines = [];
  const pizzaItems = order.items.filter(isPizzaItem);
  const totalPizzas = pizzaItems.reduce((sum, item) => sum + item.quantity, 0);
  const pizzasTotalAmountCents = pizzaItems.reduce((sum, item) => sum + computeItemTotalCents(item), 0);
  const configuredDeliveryFeeCents = Math.max(0, Number(deliveryFeeCents) || 0);
  const effectiveDeliveryFeeCents = order.type === "DOMICILIO" ? configuredDeliveryFeeCents : 0;
  const totalWithDeliveryCents = pizzasTotalAmountCents + effectiveDeliveryFeeCents;

  if (templateText && templateText.trim()) {
    const templateContext = buildTemplateContext(order, settings, {
      ticketTitle,
      includePrices,
      includeDeliveryContacts,
      timeLabel,
      deliveryFeeCents,
    });
    const renderedTemplate = renderTemplate(templateText, templateContext);
    const customLines = buildLinesFromRenderedTemplate(renderedTemplate, width);

    if (customLines.length > 0) {
      return customLines;
    }
  }

  if (settings.headerLine1) {
    lines.push(centerText(settings.headerLine1, width));
  }

  if (settings.headerLine2) {
    lines.push(centerText(settings.headerLine2, width));
  }

  if (settings.headerLine1 || settings.headerLine2) {
    lines.push(separator);
  }
  lines.push(centerText(ticketTitle, width));
  lines.push(separator);

  const orderNumberLabel = order.dailyNumber ? `#${order.dailyNumber}` : "N/D";
  lines.push(`NUMERO ORDINE: ${orderNumberLabel}`);

  if (includeDeliveryContacts) {
    if (order.customer?.address) {
      lines.push("!!! INDIRIZZO CONSEGNA !!!");
      appendWrappedLine(lines, String(order.customer.address).toUpperCase(), width);
    }

    if (order.customer?.phone) {
      lines.push("!!! TELEFONO !!!");
      appendWrappedLine(lines, String(order.customer.phone).toUpperCase(), width);
    }

    lines.push(separator);
  }

  if (order.customer?.name) {
    appendWrappedLine(lines, `${order.customer.name}`, width);
  }

  lines.push(`DATA: ${formatDateOnlyLabel(order.businessDate ?? order.expectedAt)}`);
  lines.push(`${timeLabel}: ${formatTimeOnlyLabel(order.expectedAt)}`);
  lines.push(fitLabelAmount("Tipo", order.type, width));

  lines.push(separator);
  lines.push(centerText(`*** PIZZE TOTALI: ${totalPizzas} ***`, width));
  lines.push(separator);

  if (pizzaItems.length === 0) {
    lines.push("Nessuna pizza in comanda.");
  } else {
    appendItemLines(lines, pizzaItems, width, includePrices);
  }

  if (includePrices) {
    lines.push(separator);
    lines.push(fitLabelAmount("TOTALE PIZZE", formatEuroLabel(pizzasTotalAmountCents), width));

    if (effectiveDeliveryFeeCents > 0) {
      lines.push(fitLabelAmount("CONSEGNA", formatEuroLabel(effectiveDeliveryFeeCents), width));
    }

    lines.push(fitLabelAmount("TOTALE COMANDA", formatEuroLabel(totalWithDeliveryCents), width));
  }

  if (order.notes) {
    lines.push(separator);
    appendWrappedLine(lines, `NOTE ORDINE: ${order.notes}`, width);
  }

  if (settings.footerText) {
    lines.push(separator);
    lines.push(centerText(settings.footerText, width));
  }

  return lines.filter((line) => typeof line === "string");
}

function buildKitchenComandaLines(order, settings) {
  const templateText =
    order.type === "DOMICILIO" ? settings.templateDomicilioKitchen : settings.templateAsporto;

  return buildComandaLines(order, settings, {
    ticketTitle: "COMANDA PIZZERIA",
    includePrices: false,
    includeDeliveryContacts: false,
    timeLabel: "ORARIO PREPARAZIONE",
    templateText,
  });
}

function buildDeliveryComandaLines(order, settings) {
  return buildComandaLines(order, settings, {
    ticketTitle: "COMANDA CONSEGNA",
    includePrices: true,
    includeDeliveryContacts: true,
    timeLabel: "ORARIO CONSEGNA",
    deliveryFeeCents: settings.deliveryFeeCents,
    templateText: settings.templateDomicilioDelivery,
  });
}

function buildEscPosBuffer(lines, settings) {
  const chunks = [];

  chunks.push(Buffer.from([0x1b, 0x40]));
  chunks.push(Buffer.from([0x1b, 0x61, 0x01]));

  const bodyText = `${lines.join("\n")}\n\n`;
  chunks.push(Buffer.from(normalizeAsciiText(bodyText), "ascii"));

  chunks.push(Buffer.from([0x1b, 0x64, 0x02]));

  if (settings.autoCut) {
    chunks.push(Buffer.from([0x1d, 0x56, 0x00]));
  }

  return Buffer.concat(chunks);
}

function buildReceiptHtml(lines, settings) {
  const content = normalizeAsciiText(lines.join("\n"));
  const escapedContent = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const paperWidthPx = settings.paperWidthMm === PAPER_WIDTH_MM_58 ? 220 : 300;

  return `<!DOCTYPE html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <title>Comanda</title>
    <style>
      :root { color-scheme: light; }
      html, body {
        margin: 0;
        padding: 0;
        background: white;
      }
      body {
        font-family: "Courier New", monospace;
      }
      .receipt {
        width: ${paperWidthPx}px;
        padding: 8px;
        margin: 0 auto;
        white-space: pre;
        line-height: 1.35;
        font-size: 12px;
        color: #0f172a;
      }
    </style>
  </head>
  <body>
    <pre class="receipt">${escapedContent}</pre>
  </body>
</html>`;
}

async function printViaSystemPrinter(BrowserWindow, settings, lines) {
  const printWindow = new BrowserWindow({
    show: false,
    width: 420,
    height: 720,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const html = buildReceiptHtml(lines, settings);
  const targetUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

  try {
    await printWindow.loadURL(targetUrl);

    await new Promise((resolve, reject) => {
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        reject(new Error("Timeout stampa sistema"));
      }, 10000);

      printWindow.webContents.print(
        {
          silent: true,
          deviceName: settings.systemPrinterName || undefined,
          copies: settings.copies,
          printBackground: true,
          margins: {
            marginType: "none",
          },
        },
        (success, failureReason) => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(timeoutId);

          if (!success) {
            reject(new Error(failureReason || "Stampa sistema fallita"));
            return;
          }

          resolve();
        }
      );
    });
  } finally {
    if (!printWindow.isDestroyed()) {
      printWindow.close();
    }
  }
}

async function printViaEthernet(settings, escPosData) {
  if (!settings.ethernetHost) {
    throw buildValidationError("Host stampante Ethernet mancante", {
      field: "ethernetHost",
    });
  }

  await new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const finalizeError = (error) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      reject(error);
    };

    socket.setTimeout(5000);

    socket.once("error", (error) => {
      finalizeError(new Error(`Errore stampa Ethernet: ${error.message}`));
    });

    socket.once("timeout", () => {
      finalizeError(new Error("Timeout connessione stampante Ethernet"));
    });

    socket.connect(settings.ethernetPort, settings.ethernetHost, () => {
      socket.write(escPosData, (writeError) => {
        if (writeError) {
          finalizeError(new Error(`Invio ESC/POS fallito: ${writeError.message}`));
          return;
        }

        socket.end();
      });
    });

    socket.once("close", () => {
      if (settled) {
        return;
      }

      settled = true;
      resolve();
    });
  });
}

async function printLines(BrowserWindow, settings, lines) {
  if (settings.mode === PRINT_MODE_ETHERNET) {
    const escPosData = buildEscPosBuffer(lines, settings);

    for (let index = 0; index < settings.copies; index += 1) {
      await printViaEthernet(settings, escPosData);
    }

    return;
  }

  await printViaSystemPrinter(BrowserWindow, settings, lines);
}

function buildPrintResult(settings) {
  if (settings.mode === PRINT_MODE_ETHERNET) {
    return {
      mode: settings.mode,
      target: `${settings.ethernetHost}:${settings.ethernetPort}`,
    };
  }

  return {
    mode: settings.mode,
    target: settings.systemPrinterName || "DEFAULT_SYSTEM_PRINTER",
  };
}

function safeClonePayload(payload) {
  try {
    return JSON.parse(JSON.stringify(payload));
  } catch {
    return payload;
  }
}

function createDeferred() {
  let resolve;
  let reject;

  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function buildJobPublicSnapshot(job) {
  return {
    id: job.id,
    source: job.source,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    orderDailyNumber: job.orderDailyNumber,
    orderType: job.orderType,
    customerName: job.customerName,
    documentsPrinted: job.documentsPrinted,
    target: job.target,
    errorMessage: job.errorMessage,
    errorHistory: Array.isArray(job.errorHistory) ? [...job.errorHistory] : [],
  };
}

function createPrintService({ app, BrowserWindow }) {
  if (!app || typeof app.getPath !== "function") {
    throw new Error("app non valido in createPrintService");
  }

  if (!BrowserWindow) {
    throw new Error("BrowserWindow non disponibile in createPrintService");
  }

  const settingsFilePath = path.join(app.getPath("userData"), "printer-settings.json");
  const queue = [];
  const recentJobs = [];
  let processing = false;
  let activeJobId = null;
  let lastSuccessfulPrintPayload = null;

  async function readSettings() {
    try {
      const raw = await fs.readFile(settingsFilePath, "utf8");
      const parsed = JSON.parse(raw);
      return normalizePrintSettings({ ...DEFAULT_PRINT_SETTINGS, ...parsed });
    } catch (error) {
      if (error && error.code !== "ENOENT") {
        console.error("Unable to read printer settings:", error);
      }

      return { ...DEFAULT_PRINT_SETTINGS };
    }
  }

  async function writeSettings(settings) {
    const normalized = normalizePrintSettings(settings);

    await fs.mkdir(path.dirname(settingsFilePath), { recursive: true });
    await fs.writeFile(settingsFilePath, JSON.stringify(normalized, null, 2), "utf8");

    return normalized;
  }

  function recordRecentJob(job) {
    recentJobs.unshift(job);

    if (recentJobs.length > PRINT_HISTORY_LIMIT) {
      recentJobs.length = PRINT_HISTORY_LIMIT;
    }
  }

  async function executePrintPayload(payload) {
    const settings = await readSettings();
    const order = normalizePrintableOrder(payload);
    const kitchenLines = buildKitchenComandaLines(order, settings);
    const linesToPrint = [kitchenLines];

    if (order.type === "DOMICILIO") {
      linesToPrint.push(buildDeliveryComandaLines(order, settings));
    }

    for (const lines of linesToPrint) {
      await printLines(BrowserWindow, settings, lines);
    }

    return {
      result: {
        ok: true,
        ...buildPrintResult(settings),
        documentsPrinted: linesToPrint.length,
      },
      summary: {
        orderDailyNumber: order.dailyNumber ?? null,
        orderType: order.type ?? "ASPORTO",
        customerName: order.customer?.name ?? "",
      },
    };
  }

  function createQueueJob(payload, source) {
    const deferred = createDeferred();
    const now = new Date().toISOString();

    return {
      id: randomUUID(),
      source,
      payload: safeClonePayload(payload),
      status: PRINT_JOB_STATUS.QUEUED,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      attemptCount: 0,
      maxAttempts: PRINT_MAX_ATTEMPTS,
      orderDailyNumber: null,
      orderType: null,
      customerName: "",
      documentsPrinted: 0,
      target: "",
      errorMessage: "",
      errorHistory: [],
      deferred,
    };
  }

  async function processQueue() {
    if (processing) {
      return;
    }

    processing = true;

    try {
      while (queue.length > 0) {
        const job = queue.shift();
        activeJobId = job.id;
        job.status = PRINT_JOB_STATUS.PROCESSING;
        job.updatedAt = new Date().toISOString();

        let lastError = null;

        for (let attempt = 1; attempt <= job.maxAttempts; attempt += 1) {
          job.attemptCount = attempt;
          job.updatedAt = new Date().toISOString();

          try {
            const { result, summary } = await executePrintPayload(job.payload);
            job.status = PRINT_JOB_STATUS.COMPLETED;
            job.updatedAt = new Date().toISOString();
            job.completedAt = job.updatedAt;
            job.documentsPrinted = result.documentsPrinted;
            job.target = result.target;
            job.orderDailyNumber = summary.orderDailyNumber;
            job.orderType = summary.orderType;
            job.customerName = summary.customerName;
            job.errorMessage = "";
            lastSuccessfulPrintPayload = safeClonePayload(job.payload);

            recordRecentJob(job);
            job.deferred.resolve(result);
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            const message = error?.message ?? "Errore stampa sconosciuto";

            job.errorMessage = message;
            job.updatedAt = new Date().toISOString();
            job.errorHistory.push({
              attempt,
              at: job.updatedAt,
              message,
            });
          }
        }

        if (lastError) {
          job.status = PRINT_JOB_STATUS.FAILED;
          job.completedAt = new Date().toISOString();
          job.updatedAt = job.completedAt;
          recordRecentJob(job);
          job.deferred.reject(lastError);
        }

        activeJobId = null;
      }
    } finally {
      activeJobId = null;
      processing = false;
    }
  }

  function enqueuePrintJob(payload, source) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw buildValidationError("Payload ordine non valido per la coda stampa");
    }

    const job = createQueueJob(payload, source);
    queue.push(job);
    void processQueue();
    return job.deferred.promise;
  }

  function buildQueueStatus() {
    const queuedJobs = queue.map((job) => buildJobPublicSnapshot(job));
    const recent = recentJobs.map((job) => buildJobPublicSnapshot(job));

    return {
      processing,
      activeJobId,
      queuedCount: queue.length,
      queuedJobs,
      recentJobs: recent,
    };
  }

  return {
    async getSettings() {
      return readSettings();
    },

    async updateSettings(payload) {
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw buildValidationError("Payload impostazioni stampa non valido");
      }

      const current = await readSettings();
      const merged = {
        ...current,
        ...payload,
      };

      return writeSettings(merged);
    },

    async listSystemPrinters(webContents) {
      if (!webContents || typeof webContents.getPrintersAsync !== "function") {
        return [];
      }

      const printers = await webContents.getPrintersAsync();

      return printers
        .map((printer) => ({
          name: printer.name,
          displayName: printer.displayName || printer.name,
          description: printer.description || "",
          isDefault: printer.isDefault === true,
          status: Number.isInteger(printer.status) ? printer.status : 0,
        }))
        .sort((a, b) => {
          if (a.isDefault && !b.isDefault) {
            return -1;
          }

          if (!a.isDefault && b.isDefault) {
            return 1;
          }

          return a.displayName.localeCompare(b.displayName, "it-IT");
        });
    },

    async getQueueStatus() {
      return buildQueueStatus();
    },

    async retryFailedJob(payload) {
      const jobId = typeof payload?.jobId === "string" ? payload.jobId.trim() : "";

      if (!jobId) {
        throw buildValidationError("jobId non valido per retry stampa", {
          field: "jobId",
        });
      }

      const failedJob = recentJobs.find((job) => job.id === jobId && job.status === PRINT_JOB_STATUS.FAILED);

      if (!failedJob) {
        throw buildValidationError("Job fallito non trovato", {
          jobId,
        });
      }

      return enqueuePrintJob(failedJob.payload, "RETRY");
    },

    async reprintLastOrder() {
      if (!lastSuccessfulPrintPayload) {
        throw buildValidationError("Nessun ordine precedente disponibile per la ristampa");
      }

      return enqueuePrintJob(lastSuccessfulPrintPayload, "REPRINT");
    },

    async printOrder(payload) {
      return enqueuePrintJob(payload, "ORDER");
    },

    async printTestReceipt() {
      const now = new Date();

      return enqueuePrintJob({
        id: "test",
        dailyNumber: 999,
        type: "DOMICILIO",
        status: "CONFERMATO",
        expectedAt: now.toISOString(),
        totalAmountCents: 1800,
        notes: "Stampa test da impostazioni",
        customer: {
          name: "Cliente test",
          phone: "3331234567",
          address: "Via Roma 10, Citta",
        },
        items: [
          {
            productName: "Margherita",
            quantity: 1,
            productCategory: "PIZZA",
            unitPriceCents: 700,
            notes: "",
            modifiers: [],
          },
          {
            productName: "Diavola",
            quantity: 1,
            productCategory: "PIZZA",
            unitPriceCents: 550,
            notes: "",
            modifiers: [
              {
                ingredientName: "Olive",
                action: "AGGIUNGI",
                priceAppliedCents: 100,
              },
            ],
          },
          {
            productName: "Coca Cola",
            quantity: 1,
            productCategory: "BEVANDA",
            unitPriceCents: 250,
            notes: "",
            modifiers: [],
          },
        ],
      }, "TEST");
    },
  };
}

module.exports = {
  createPrintService,
  DEFAULT_PRINT_SETTINGS,
  PRINT_MODE_SYSTEM,
  PRINT_MODE_ETHERNET,
};
