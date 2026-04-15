import { callBridge } from "./client";

export function getPrintSettings() {
  return callBridge("getPrintSettings");
}

export function updatePrintSettings(payload) {
  return callBridge("updatePrintSettings", payload);
}

export function listSystemPrinters() {
  return callBridge("listSystemPrinters");
}

export function getPrintQueueStatus() {
  return callBridge("getPrintQueueStatus");
}

export function retryFailedPrintJob(payload) {
  return callBridge("retryFailedPrintJob", payload);
}

export function reprintLastOrder() {
  return callBridge("reprintLastOrder");
}

export function printOrder(payload) {
  return callBridge("printOrder", payload);
}

export function printTestReceipt() {
  return callBridge("printTestReceipt");
}
