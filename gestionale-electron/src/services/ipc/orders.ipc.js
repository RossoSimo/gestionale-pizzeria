import { callBridge } from "./client";

// Reads orders with optional server-side filters (status/date/pagination).
export function listOrders(filters) {
  return callBridge("listOrders", filters);
}

// Creates a new order on local DB through main-process IPC.
export function createOrder(payload) {
  return callBridge("createOrder", payload);
}

export function updateOrder(payload) {
  return callBridge("updateOrder", payload);
}

export function deleteOrder(payload) {
  return callBridge("deleteOrder", payload);
}

// Applies a workflow status transition to an existing order.
export function updateOrderStatus(payload) {
  return callBridge("updateOrderStatus", payload);
}
