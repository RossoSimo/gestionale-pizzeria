import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import path from 'node:path';
import { PrismaClient } from '@prisma/client'
import started from 'electron-squirrel-startup';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Remove the default application menu (File/Edit/View...) for a kiosk/touch-friendly UI
  Menu.setApplicationMenu(null);

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
const prisma = new PrismaClient()

app.on('ready', createWindow);

// IPC handlers: expose minimal DB operations to renderer via preload bridge
ipcMain.handle('db:saveOrder', async (_, order) => {
  try {
    const created = await prisma.order.create({ data: {
      id: order.id,
      createdAt: new Date(order.createdAt),
  date: order.date ? new Date(order.date) : new Date(),
      customerName: order.customerName,
      customerId: order.customerId ?? null,
      time: order.time,
      isDelivery: !!order.isDelivery,
      phone: order.phone ?? null,
      address: order.address ?? null,
      notes: order.notes ?? null,
      items: JSON.stringify(order.items || []),
      subtotal: order.subtotal || 0,
    } })
    return { success: true, result: created }
  } catch (e) {
    console.error('ipc db:saveOrder error', e)
    return { success: false, error: String(e) }
  }
})

ipcMain.handle('db:getOrders', async () => {
  try {
    const rows = await prisma.order.findMany({ orderBy: { createdAt: 'desc' } })
  const normalized = rows.map(r => ({ ...r, items: JSON.parse(String(r.items)), date: r.date }))
    return { success: true, result: normalized }
  } catch (e) {
    console.error('ipc db:getOrders error', e)
    return { success: false, error: String(e), result: [] }
  }
})

ipcMain.handle('db:clearOrders', async () => {
  try {
    await prisma.order.deleteMany()
    return { success: true }
  } catch (e) {
    console.error('ipc db:clearOrders error', e)
    return { success: false, error: String(e) }
  }
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
