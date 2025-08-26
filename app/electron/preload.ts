// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
			saveOrder: async (order: unknown) => {
				return await ipcRenderer.invoke('db:saveOrder', order)
	},
	getOrders: async () => {
		return await ipcRenderer.invoke('db:getOrders')
	},
	clearOrders: async () => {
		return await ipcRenderer.invoke('db:clearOrders')
	}
})
