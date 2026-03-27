function registerAppHandlers(ipcMain, channels, app) {
  ipcMain.handle(channels.APP_GET_VERSION, async () => app.getVersion());
  ipcMain.handle(channels.HEALTH_PING, async () => ({ ok: true, ts: Date.now() }));
}

module.exports = { registerAppHandlers };
