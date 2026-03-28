import { callBridge } from "./client";

export function getAppSettings() {
  return callBridge("getAppSettings");
}

export function updateAppSettings(payload) {
  return callBridge("updateAppSettings", payload);
}
