import { callBridge } from "./client";

export function listCustomers(filters) {
  return callBridge("listCustomers", filters);
}

export function createCustomer(payload) {
  return callBridge("createCustomer", payload);
}

export function updateCustomer(payload) {
  return callBridge("updateCustomer", payload);
}

export function deleteCustomer(payload) {
  return callBridge("deleteCustomer", payload);
}
