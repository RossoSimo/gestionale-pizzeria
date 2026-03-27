import { callBridge } from "./client";

// Reads products with optional category/search/pagination filters.
export function listProducts(filters) {
  return callBridge("listProducts", filters);
}

// Creates a product in local catalog.
export function createProduct(payload) {
  return callBridge("createProduct", payload);
}

// Updates an existing product and bumps version for sync.
export function updateProduct(payload) {
  return callBridge("updateProduct", payload);
}

// Soft-deletes a product from operational catalog.
export function deleteProduct(payload) {
  return callBridge("deleteProduct", payload);
}
