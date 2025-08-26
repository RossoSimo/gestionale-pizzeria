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
,
	getMenu: async () => {
		return await ipcRenderer.invoke('db:getMenu')
	},
	getCategories: async () => {
		return await ipcRenderer.invoke('db:getCategories')
	},
	getIngredients: async () => {
		return await ipcRenderer.invoke('db:getIngredients')
	},
	getCustomers: async () => {
		return await ipcRenderer.invoke('db:getCustomers')
	}
	,
	getAppPath: async () => {
		return await ipcRenderer.invoke('app:getAppPath')
	}
,
	// customers
	createCustomer: async (data: any) => { return await ipcRenderer.invoke('db:createCustomer', data) },
	updateCustomer: async (data: any) => { return await ipcRenderer.invoke('db:updateCustomer', data) },
	deleteCustomer: async (id: string) => { return await ipcRenderer.invoke('db:deleteCustomer', id) },
	// ingredients
	createIngredient: async (data: any) => { return await ipcRenderer.invoke('db:createIngredient', data) },
	updateIngredient: async (data: any) => { return await ipcRenderer.invoke('db:updateIngredient', data) },
	deleteIngredient: async (id: string) => { return await ipcRenderer.invoke('db:deleteIngredient', id) },
	// menu
	createMenu: async (data: any) => { return await ipcRenderer.invoke('db:createMenu', data) },
	updateMenu: async (data: any) => { return await ipcRenderer.invoke('db:updateMenu', data) },
	deleteMenu: async (id: string) => { return await ipcRenderer.invoke('db:deleteMenu', id) },
})
