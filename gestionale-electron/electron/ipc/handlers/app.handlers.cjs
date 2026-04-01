function registerAppHandlers(ipcMain, channels, app, services = {}) {
  const cloudHealthService = services.cloudHealthService;

  ipcMain.handle(channels.APP_GET_VERSION, async () => app.getVersion());

  ipcMain.handle(channels.HEALTH_PING, async () => {
    if (!cloudHealthService || typeof cloudHealthService.pingCloud !== "function") {
      return {
        ok: false,
        ts: Date.now(),
        cloud: {
          ok: false,
          error: "CLOUD_HEALTH_SERVICE_UNAVAILABLE",
        },
      };
    }

    const cloud = await cloudHealthService.pingCloud();

    return {
      ok: cloud.ok === true,
      ts: Date.now(),
      cloud,
    };
  });
}

module.exports = { registerAppHandlers };
