const { contextBridge, ipcRenderer } = require("electron");
const channels = require("./ipc/channels.cjs");

contextBridge.exposeInMainWorld("electronAPI", {
  getAppVersion: () => ipcRenderer.invoke(channels.APP_GET_VERSION),
  getAppSettings: () => ipcRenderer.invoke(channels.APP_SETTINGS_GET),
  updateAppSettings: (payload) => ipcRenderer.invoke(channels.APP_SETTINGS_UPDATE, payload),
  ping: () => ipcRenderer.invoke(channels.HEALTH_PING),
  listOrders: (filters) => ipcRenderer.invoke(channels.ORDERS_LIST, filters),
  createOrder: (payload) => ipcRenderer.invoke(channels.ORDERS_CREATE, payload),
  updateOrder: (payload) => ipcRenderer.invoke(channels.ORDERS_UPDATE, payload),
  deleteOrder: (payload) => ipcRenderer.invoke(channels.ORDERS_DELETE, payload),
  updateOrderStatus: (payload) => ipcRenderer.invoke(channels.ORDERS_UPDATE_STATUS, payload),
  listCustomers: (filters) => ipcRenderer.invoke(channels.CUSTOMERS_LIST, filters),
  createCustomer: (payload) => ipcRenderer.invoke(channels.CUSTOMERS_CREATE, payload),
  updateCustomer: (payload) => ipcRenderer.invoke(channels.CUSTOMERS_UPDATE, payload),
  deleteCustomer: (payload) => ipcRenderer.invoke(channels.CUSTOMERS_DELETE, payload),
  listProducts: (filters) => ipcRenderer.invoke(channels.PRODUCTS_LIST, filters),
  createProduct: (payload) => ipcRenderer.invoke(channels.PRODUCTS_CREATE, payload),
  updateProduct: (payload) => ipcRenderer.invoke(channels.PRODUCTS_UPDATE, payload),
  deleteProduct: (payload) => ipcRenderer.invoke(channels.PRODUCTS_DELETE, payload),
  listIngredients: (filters) => ipcRenderer.invoke(channels.INGREDIENTS_LIST, filters),
  createIngredient: (payload) => ipcRenderer.invoke(channels.INGREDIENTS_CREATE, payload),
  updateIngredient: (payload) => ipcRenderer.invoke(channels.INGREDIENTS_UPDATE, payload),
  deleteIngredient: (payload) => ipcRenderer.invoke(channels.INGREDIENTS_DELETE, payload),
});
