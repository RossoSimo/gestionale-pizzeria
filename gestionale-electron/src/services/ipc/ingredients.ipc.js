import { callBridge } from "./client";

export function listIngredients(filters) {
  return callBridge("listIngredients", filters);
}

export function createIngredient(payload) {
  return callBridge("createIngredient", payload);
}

export function updateIngredient(payload) {
  return callBridge("updateIngredient", payload);
}

export function deleteIngredient(payload) {
  return callBridge("deleteIngredient", payload);
}
