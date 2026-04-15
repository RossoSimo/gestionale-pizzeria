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

function registerCashClosureHandlers(ipcMain, channels, cashClosureService) {
  ipcMain.handle(channels.CASH_CLOSURE_LIST, async (_event, payload) => {
    try {
      return await cashClosureService.listClosures(payload);
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });

  ipcMain.handle(channels.CASH_CLOSURE_CREATE, async (_event, payload) => {
    try {
      return await cashClosureService.createClosure(payload);
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });
}

module.exports = { registerCashClosureHandlers };
