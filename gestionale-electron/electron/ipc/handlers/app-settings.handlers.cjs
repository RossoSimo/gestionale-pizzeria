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

function registerAppSettingsHandlers(ipcMain, channels, appSettingsService) {
  ipcMain.handle(channels.APP_SETTINGS_GET, async () => {
    try {
      return await appSettingsService.getSettings();
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });

  ipcMain.handle(channels.APP_SETTINGS_UPDATE, async (_event, payload) => {
    try {
      return await appSettingsService.updateSettings(payload);
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });
}

module.exports = { registerAppSettingsHandlers };
