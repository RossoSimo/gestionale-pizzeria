import { PrismaClient } from '@prisma/client'
import type { Order } from '../data/types'

const prisma = new PrismaClient()

export async function saveOrder(order: Order) {
  try {
    const created = await prisma.order.create({ data: {
      id: order.id,
      createdAt: new Date(order.createdAt),
      customerName: order.customerName,
      customerId: order.customerId,
      time: order.time,
      isDelivery: !!order.isDelivery,
      phone: order.phone ?? null,
      address: order.address ?? null,
      notes: order.notes ?? null,
      items: JSON.stringify(order.items || []),
      subtotal: order.subtotal || 0,
    } })
    return created
  } catch (e) {
    console.error('saveOrder error', e)
    throw e
  }
}

export async function getOrders() {
  try {
  const rows = await prisma.order.findMany({ orderBy: { createdAt: 'desc' } })
  type Row = { id: string; createdAt: Date | string; items: string }
  return rows.map((r: Row) => ({ ...r, items: JSON.parse(String(r.items)) }))
  } catch (e) {
    console.error('getOrders error', e)
    return []
  }
}

export async function clearOrders() {
  try {
    await prisma.order.deleteMany()
  } catch (e) {
    console.error('clearOrders error', e)
    throw e
  }
}
