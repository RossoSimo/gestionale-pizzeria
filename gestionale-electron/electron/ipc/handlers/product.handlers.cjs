function toIpcErrorPayload(error) {
  return {
    code: error?.code ?? "INTERNAL_ERROR",
    message: error?.message ?? "Errore interno",
    details: error?.details ?? null,
  };
}

function throwNormalizedIpcError(error) {
  throw new Error(JSON.stringify(toIpcErrorPayload(error)));
}

function validateProductFilters(payload) {
  if (payload == null) {
    return {};
  }

  if (typeof payload !== "object" || Array.isArray(payload)) {
    const error = new Error("Filtri prodotti non validi");
    error.code = "VALIDATION_ERROR";
    throw error;
  }

  return payload;
}

function registerProductHandlers(ipcMain, channels, productService) {
  ipcMain.handle(channels.PRODUCTS_LIST, async (_event, payload) => {
    try {
      const filters = validateProductFilters(payload);
      return await productService.listProducts(filters);
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });

  ipcMain.handle(channels.PRODUCTS_CREATE, async (_event, payload) => {
    try {
      return await productService.createProduct(payload);
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });

  ipcMain.handle(channels.PRODUCTS_UPDATE, async (_event, payload) => {
    try {
      return await productService.updateProduct(payload);
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });

  ipcMain.handle(channels.PRODUCTS_DELETE, async (_event, payload) => {
    try {
      return await productService.deleteProduct(payload);
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });
}

module.exports = { registerProductHandlers };
