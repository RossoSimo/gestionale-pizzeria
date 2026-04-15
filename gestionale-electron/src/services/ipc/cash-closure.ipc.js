import { callBridge } from "./client";

export function listCashClosures(payload) {
  return callBridge("listCashClosures", payload);
}

export function createCashClosure(payload) {
  return callBridge("createCashClosure", payload);
}
