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

function registerPrintHandlers(ipcMain, channels, printService) {
  ipcMain.handle(channels.PRINT_SETTINGS_GET, async () => {
    try {
      return await printService.getSettings();
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });

  ipcMain.handle(channels.PRINT_SETTINGS_UPDATE, async (_event, payload) => {
    try {
      return await printService.updateSettings(payload);
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });

  ipcMain.handle(channels.PRINT_SYSTEM_PRINTERS_LIST, async (event) => {
    try {
      return await printService.listSystemPrinters(event.sender);
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });

  ipcMain.handle(channels.PRINT_QUEUE_STATUS, async () => {
    try {
      return await printService.getQueueStatus();
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });

  ipcMain.handle(channels.PRINT_RETRY_FAILED, async (_event, payload) => {
    try {
      return await printService.retryFailedJob(payload);
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });

  ipcMain.handle(channels.PRINT_REPRINT_LAST, async () => {
    try {
      return await printService.reprintLastOrder();
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });

  ipcMain.handle(channels.PRINT_ORDER, async (_event, payload) => {
    try {
      return await printService.printOrder(payload);
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });

  ipcMain.handle(channels.PRINT_TEST_RECEIPT, async () => {
    try {
      return await printService.printTestReceipt();
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });
}

module.exports = { registerPrintHandlers };
