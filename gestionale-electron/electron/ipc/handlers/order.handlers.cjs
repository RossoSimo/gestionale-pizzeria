function toIpcErrorPayload(error) {
  return {
    code: error?.code ?? "INTERNAL_ERROR",
    message: error?.message ?? "Errore interno",
    details: error?.details ?? null,
  };
}

function throwNormalizedIpcError(error) {
  // Renderer receives a consistent, JSON-serializable error shape.
  throw new Error(JSON.stringify(toIpcErrorPayload(error)));
}

function validateListFilters(payload) {
  if (payload == null) {
    return {};
  }

  if (typeof payload !== "object" || Array.isArray(payload)) {
    const error = new Error("Filtri lista ordini non validi");
    error.code = "VALIDATION_ERROR";
    throw error;
  }

  return payload;
}

function registerOrderHandlers(ipcMain, channels, orderService) {
  // Handlers are intentionally thin and delegate domain rules to services.
  ipcMain.handle(channels.ORDERS_LIST, async (_event, filtersPayload) => {
    try {
      const filters = validateListFilters(filtersPayload);
      return await orderService.listOrders(filters);
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });

  ipcMain.handle(channels.ORDERS_CREATE, async (_event, payload) => {
    try {
      return await orderService.createOrder(payload);
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });

  ipcMain.handle(channels.ORDERS_UPDATE, async (_event, payload) => {
    try {
      return await orderService.updateOrder(payload);
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });

  ipcMain.handle(channels.ORDERS_DELETE, async (_event, payload) => {
    try {
      return await orderService.deleteOrder(payload);
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });

  ipcMain.handle(channels.ORDERS_UPDATE_STATUS, async (_event, payload) => {
    try {
      return await orderService.updateOrderStatus(payload);
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });
}

module.exports = { registerOrderHandlers };
