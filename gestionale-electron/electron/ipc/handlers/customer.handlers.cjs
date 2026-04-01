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

function validateCustomerFilters(payload) {
  if (payload == null) {
    return {};
  }

  if (typeof payload !== "object" || Array.isArray(payload)) {
    const error = new Error("Filtri clienti non validi");
    error.code = "VALIDATION_ERROR";
    throw error;
  }

  return payload;
}

function registerCustomerHandlers(ipcMain, channels, customerService) {
  ipcMain.handle(channels.CUSTOMERS_LIST, async (_event, payload) => {
    try {
      const filters = validateCustomerFilters(payload);
      return await customerService.listCustomers(filters);
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });

  ipcMain.handle(channels.CUSTOMERS_CREATE, async (_event, payload) => {
    try {
      return await customerService.createCustomer(payload);
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });

  ipcMain.handle(channels.CUSTOMERS_UPDATE, async (_event, payload) => {
    try {
      return await customerService.updateCustomer(payload);
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });

  ipcMain.handle(channels.CUSTOMERS_DELETE, async (_event, payload) => {
    try {
      return await customerService.deleteCustomer(payload);
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });

  ipcMain.handle(channels.CUSTOMERS_UPDATE_COORDINATES, async (_event, payload) => {
    try {
      return await customerService.updateCustomerCoordinates(payload);
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });
}

module.exports = { registerCustomerHandlers };
