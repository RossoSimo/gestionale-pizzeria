const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const channels = require("./ipc/channels.cjs");
const { registerAppHandlers } = require("./ipc/handlers/app.handlers.cjs");
const { registerOrderHandlers } = require("./ipc/handlers/order.handlers.cjs");
const { registerCustomerHandlers } = require("./ipc/handlers/customer.handlers.cjs");
const { registerProductHandlers } = require("./ipc/handlers/product.handlers.cjs");
const { registerIngredientHandlers } = require("./ipc/handlers/ingredient.handlers.cjs");
const { registerAppSettingsHandlers } = require("./ipc/handlers/app-settings.handlers.cjs");
const { createOrderRepository } = require("./db/repositories/order.repository.cjs");
const { createCustomerRepository } = require("./db/repositories/customer.repository.cjs");
const { createProductRepository } = require("./db/repositories/product.repository.cjs");
const { createIngredientRepository } = require("./db/repositories/ingredient.repository.cjs");
const { createAppSettingsRepository } = require("./db/repositories/app-settings.repository.cjs");
const { createOrderService } = require("./services/order.service.cjs");
const { createCustomerService } = require("./services/customer.service.cjs");
const { createProductService } = require("./services/product.service.cjs");
const { createIngredientService } = require("./services/ingredient.service.cjs");
const { createAppSettingsService } = require("./services/app-settings.service.cjs");
const { createCloudHealthService } = require("./services/cloud-health.service.cjs");
const { getDbClient, disconnectDb } = require("./db/client.cjs");

const isDev = !app.isPackaged;

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 980,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // Keep preload capable of requiring local CommonJS modules (IPC channels/contracts).
      sandbox: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
    return;
  }

  win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

app.whenReady().then(() => {
  const dbClient = getDbClient();
  const orderRepository = createOrderRepository(dbClient);
  const customerRepository = createCustomerRepository(dbClient);
  const productRepository = createProductRepository(dbClient);
  const ingredientRepository = createIngredientRepository(dbClient);
  const appSettingsRepository = createAppSettingsRepository(dbClient);
  const orderService = createOrderService(orderRepository);
  const customerService = createCustomerService(customerRepository);
  const productService = createProductService(productRepository);
  const ingredientService = createIngredientService(ingredientRepository);
  const appSettingsService = createAppSettingsService(appSettingsRepository);
  const cloudHealthService = createCloudHealthService();

  registerAppHandlers(ipcMain, channels, app, { cloudHealthService });
  registerOrderHandlers(ipcMain, channels, orderService);
  registerCustomerHandlers(ipcMain, channels, customerService);
  registerProductHandlers(ipcMain, channels, productService);
  registerIngredientHandlers(ipcMain, channels, ingredientService);
  registerAppSettingsHandlers(ipcMain, channels, appSettingsService);

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}).catch((error) => {
  // Avoid unhandled rejections during startup (DB/init errors, IPC wiring, etc.).
  console.error("Electron startup failed:", error);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void disconnectDb();
});
