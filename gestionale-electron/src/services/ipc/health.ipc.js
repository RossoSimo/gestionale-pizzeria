import { callBridge } from "./client";

export function pingHealth() {
  return callBridge("ping");
}
