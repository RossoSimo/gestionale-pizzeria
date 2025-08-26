export type IngredientRow = {
  id: string
  name: string
  add_price?: number | null
  production_cost?: number | null
}

export type CategoryRow = {
  id: string
  name: string
}

export type MenuRow = {
  id: string
  name: string
  price?: number
  category?: CategoryRow | null
  categoryId?: string | null
  description?: string | null
  image?: string | null
  allergens?: string[] | null
  ingredients?: IngredientRow[] | null
}

export type CustomerRow = {
  id: string
  name: string
  phone?: string | null
  address?: string | null
}

export type OrderRow = {
  id: string
  createdAt?: string | Date | null
  date?: string | Date | null
  customerName?: string | null
  customerId?: string | null
  time?: string | null
  isDelivery?: boolean | null
  phone?: string | null
  address?: string | null
  notes?: string | null
  items?: unknown[] | null
  subtotal?: number | null
}
