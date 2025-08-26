const { PrismaClient } = require('@prisma/client')
const menu = require('./menu.json')

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding ingredients and additions from prisma/menu.json...')
  const names = new Set()
  for (const m of menu) {
    (m.ingredients || []).forEach((i) => names.add(String(i)))
  }

  // heuristic add_price values for common ingredients; fallback to 0.5
  const priceMap = {
    'Mozzarella': 0.8,
    'Pomodoro': 0.25,
    'Basilico': 0.25,
    'Aglio': 0.25,
    'Origano': 0.25,
    'Salame': 1.0,
    'Patate': 0.5,
    'Olio': 0
  }

  for (const n of Array.from(names)) {
    try {
  const add_price = typeof priceMap[n] === 'number' ? priceMap[n] : 0.5
  // heuristic production cost: a fraction of add_price or a small base if unknown
  const production_cost = typeof priceMap[n] === 'number' ? Math.max(0.1, priceMap[n] * 0.5) : 0.2
  await prisma.ingredient.upsert({ where: { name: n }, update: { add_price, production_cost }, create: { name: n, add_price, production_cost } })
    } catch (e) {
      console.warn('ingredient upsert failed for', n, e.message || e)
    }
  }

  // extras are represented as menu entries or handled inline; no dedicated additions table seeding

  // seed categories and menus
  const categories = new Map()
  for (const m of menu) {
    const cat = String(m.category || 'Other')
    if (!categories.has(cat)) categories.set(cat, { name: cat, slug: cat.toLowerCase().replace(/\s+/g, '-') })
  }
  for (const c of categories.values()) {
    try {
      await prisma.category.upsert({ where: { slug: c.slug }, update: { name: c.name }, create: { name: c.name, slug: c.slug } })
    } catch (e) {
      console.warn('category upsert failed for', c.slug, e.message || e)
    }
  }

  for (const m of menu) {
    try {
      // find category id
      const slug = String((m.category || 'Other')).toLowerCase().replace(/\s+/g, '-')
      const cat = await prisma.category.findUnique({ where: { slug } })
      const ingredientConnect = (m.ingredients || []).map(i => ({ name: String(i) }))
      await prisma.menu.upsert({
        where: { id: m.id },
        update: {
          name: m.name,
          description: m.description || null,
          price: m.price || 0,
          categoryId: cat ? cat.id : null,
          image: m.image || null,
          ingredients: { connect: ingredientConnect }
        },
        create: {
          id: m.id,
          name: m.name,
          description: m.description || null,
          price: m.price || 0,
          categoryId: cat ? cat.id : null,
          image: m.image || null,
          ingredients: { connect: ingredientConnect }
        }
      })
    } catch (e) {
      console.warn('menu upsert failed for', m.id, e.message || e)
    }
  }

  console.log('Seed complete')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
