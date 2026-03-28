const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const channels = require("./ipc/channels.cjs");
const { registerAppHandlers } = require("./ipc/handlers/app.handlers.cjs");
const { registerOrderHandlers } = require("./ipc/handlers/order.handlers.cjs");
const { registerProductHandlers } = require("./ipc/handlers/product.handlers.cjs");
const { registerIngredientHandlers } = require("./ipc/handlers/ingredient.handlers.cjs");
const { createOrderRepository } = require("./db/repositories/order.repository.cjs");
const { createProductRepository } = require("./db/repositories/product.repository.cjs");
const { createIngredientRepository } = require("./db/repositories/ingredient.repository.cjs");
const { createOrderService } = require("./services/order.service.cjs");
const { createProductService } = require("./services/product.service.cjs");
const { createIngredientService } = require("./services/ingredient.service.cjs");
const { getDbClient, disconnectDb } = require("./db/client.cjs");

const isDev = !app.isPackaged;

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
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
  const productRepository = createProductRepository(dbClient);
  const ingredientRepository = createIngredientRepository(dbClient);
  const orderService = createOrderService(orderRepository);
  const productService = createProductService(productRepository);
  const ingredientService = createIngredientService(ingredientRepository);

  registerAppHandlers(ipcMain, channels, app);
  registerOrderHandlers(ipcMain, channels, orderService);
  registerProductHandlers(ipcMain, channels, productService);
  registerIngredientHandlers(ipcMain, channels, ingredientService);

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
