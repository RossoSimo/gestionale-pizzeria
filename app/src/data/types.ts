export type MenuItem = {
  id: string
  name: string
  price: number
  category: string
  description?: string
  image?: string
  allergens?: string[]
  ingredients?: string[]
}

export type CartItem = MenuItem & { qty: number; selectedIngredients?: string[]; productId?: string }

export type Order = {
  id: string
  createdAt: string
  customerName: string
  customerId?: string
  time: string
  isDelivery: boolean
  phone?: string
  address?: string
  notes?: string
  items: CartItem[]
  subtotal: number
}

export type Customer = { id: string; name: string; phone?: string; address?: string }
