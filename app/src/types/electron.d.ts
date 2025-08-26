export interface IPCResult<T = unknown> { success: boolean; result?: T; error?: string }

declare global {
  interface Window {
    api: {
  saveOrder: (order: unknown) => Promise<IPCResult<unknown>>
  getOrders: () => Promise<IPCResult<unknown[]>>
  clearOrders: () => Promise<IPCResult<void>>
    }
  }
}

export {}
