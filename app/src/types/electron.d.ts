import { MenuRow, IngredientRow, CategoryRow, CustomerRow, OrderRow } from './db'

export interface IPCResult<T = unknown> { success: boolean; result?: T; error?: string }

declare global {
  interface Window {
    api: {
      saveOrder: (order: unknown) => Promise<IPCResult<unknown>>
      getOrders: () => Promise<IPCResult<OrderRow[]>>
      clearOrders: () => Promise<IPCResult<void>>
      getMenu: () => Promise<IPCResult<MenuRow[]>>
      getIngredients: () => Promise<IPCResult<IngredientRow[]>>
      getCategories: () => Promise<IPCResult<CategoryRow[]>>
  getCustomers: () => Promise<IPCResult<CustomerRow[]>>
      getAppPath: () => Promise<IPCResult<string>>
  // customers
  createCustomer: (data: { name: string; phone?: string; address?: string }) => Promise<IPCResult<CustomerRow>>
  updateCustomer: (data: { id: string; name: string; phone?: string; address?: string }) => Promise<IPCResult<CustomerRow>>
  deleteCustomer: (id: string) => Promise<IPCResult<void>>
  // ingredients
  createIngredient: (data: { name: string; add_price?: number }) => Promise<IPCResult<IngredientRow>>
  updateIngredient: (data: { id: string; name: string; add_price?: number }) => Promise<IPCResult<IngredientRow>>
  deleteIngredient: (id: string) => Promise<IPCResult<void>>
  // menu
  createMenu: (data: { name: string; description?: string; price?: number; categoryId?: string | null; image?: string | null; ingredients?: string[] }) => Promise<IPCResult<MenuRow>>
  updateMenu: (data: { id: string; name: string; description?: string; price?: number; categoryId?: string | null; image?: string | null; ingredients?: string[] }) => Promise<IPCResult<MenuRow>>
  deleteMenu: (id: string) => Promise<IPCResult<void>>
    }
  }
}

export {}
