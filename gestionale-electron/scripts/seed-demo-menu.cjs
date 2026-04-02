const { getDbClient, disconnectDb } = require("../electron/db/client.cjs");

const DEMO_INGREDIENTS = [
  { name: "Pomodoro", extraPriceCents: 0, removeDiscountCents: 0 },
  { name: "Mozzarella", extraPriceCents: 100, removeDiscountCents: 20 },
  { name: "Basilico", extraPriceCents: 30, removeDiscountCents: 0 },
  { name: "Aglio", extraPriceCents: 30, removeDiscountCents: 0 },
  { name: "Origano", extraPriceCents: 20, removeDiscountCents: 0 },
  { name: "Olio EVO", extraPriceCents: 30, removeDiscountCents: 0 },
  { name: "Prosciutto Cotto", extraPriceCents: 150, removeDiscountCents: 30 },
  { name: "Funghi", extraPriceCents: 120, removeDiscountCents: 20 },
  { name: "Salame Piccante", extraPriceCents: 150, removeDiscountCents: 30 },
  { name: "Cipolla Rossa", extraPriceCents: 80, removeDiscountCents: 10 },
  { name: "Olive Nere", extraPriceCents: 100, removeDiscountCents: 20 },
  { name: "Gorgonzola", extraPriceCents: 160, removeDiscountCents: 30 },
  { name: "Salsiccia", extraPriceCents: 170, removeDiscountCents: 30 },
  { name: "Grana Padano", extraPriceCents: 120, removeDiscountCents: 20 },
  { name: "Scamorza", extraPriceCents: 130, removeDiscountCents: 20 },
  { name: "Patatine", extraPriceCents: 140, removeDiscountCents: 20 },
];

const DEMO_PIZZAS = [
  {
    name: "Margherita",
    description: "Pomodoro, mozzarella e basilico.",
    priceCents: 700,
    ingredientNames: ["Pomodoro", "Mozzarella", "Basilico", "Olio EVO"],
  },
  {
    name: "Marinara",
    description: "Pomodoro, aglio, origano e olio EVO.",
    priceCents: 600,
    ingredientNames: ["Pomodoro", "Aglio", "Origano", "Olio EVO"],
  },
  {
    name: "Diavola",
    description: "Pomodoro, mozzarella e salame piccante.",
    priceCents: 900,
    ingredientNames: ["Pomodoro", "Mozzarella", "Salame Piccante", "Olio EVO"],
  },
  {
    name: "Capricciosa",
    description: "Pomodoro, mozzarella, prosciutto cotto, funghi e olive nere.",
    priceCents: 1000,
    ingredientNames: ["Pomodoro", "Mozzarella", "Prosciutto Cotto", "Funghi", "Olive Nere"],
  },
  {
    name: "Quattro Formaggi",
    description: "Mozzarella, gorgonzola, grana e scamorza.",
    priceCents: 1050,
    ingredientNames: ["Mozzarella", "Gorgonzola", "Grana Padano", "Scamorza"],
  },
  {
    name: "Salsiccia e Cipolla",
    description: "Pomodoro, mozzarella, salsiccia e cipolla rossa.",
    priceCents: 980,
    ingredientNames: ["Pomodoro", "Mozzarella", "Salsiccia", "Cipolla Rossa"],
  },
  {
    name: "Patatine e Wurstel",
    description: "Pomodoro, mozzarella e patatine.",
    priceCents: 930,
    ingredientNames: ["Pomodoro", "Mozzarella", "Patatine"],
  },
];

async function ensureIngredient(db, ingredientInput) {
  const existing = await db.ingredient.findFirst({
    where: {
      name: ingredientInput.name,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (existing) {
    return db.ingredient.update({
      where: { id: existing.id },
      data: {
        extraPriceCents: ingredientInput.extraPriceCents,
        removeDiscountCents: ingredientInput.removeDiscountCents,
        deletedAt: null,
        syncStatus: "PENDING",
      },
    });
  }

  return db.ingredient.create({
    data: {
      name: ingredientInput.name,
      extraPriceCents: ingredientInput.extraPriceCents,
      removeDiscountCents: ingredientInput.removeDiscountCents,
      syncStatus: "PENDING",
    },
  });
}

async function ensurePizzaProduct(db, pizzaInput) {
  const existing = await db.product.findFirst({
    where: {
      name: pizzaInput.name,
      category: "PIZZA",
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (existing) {
    return db.product.update({
      where: { id: existing.id },
      data: {
        description: pizzaInput.description,
        priceCents: pizzaInput.priceCents,
        deletedAt: null,
        syncStatus: "PENDING",
      },
    });
  }

  return db.product.create({
    data: {
      name: pizzaInput.name,
      description: pizzaInput.description,
      priceCents: pizzaInput.priceCents,
      category: "PIZZA",
      syncStatus: "PENDING",
    },
  });
}

async function ensureProductIngredientLink(db, productId, ingredientId) {
  const existing = await db.productIngredient.findFirst({
    where: {
      productId,
      ingredientId,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (existing) {
    await db.productIngredient.update({
      where: { id: existing.id },
      data: {
        deletedAt: null,
        syncStatus: "PENDING",
      },
    });

    return;
  }

  await db.productIngredient.create({
    data: {
      productId,
      ingredientId,
      syncStatus: "PENDING",
    },
  });
}

async function seedDemoMenu() {
  const db = getDbClient();

  const ingredientByName = new Map();

  for (const ingredientInput of DEMO_INGREDIENTS) {
    const ingredient = await ensureIngredient(db, ingredientInput);
    ingredientByName.set(ingredient.name, ingredient.id);
  }

  for (const pizzaInput of DEMO_PIZZAS) {
    const pizzaProduct = await ensurePizzaProduct(db, pizzaInput);

    for (const ingredientName of pizzaInput.ingredientNames) {
      const ingredientId = ingredientByName.get(ingredientName);

      if (!ingredientId) {
        throw new Error(`Ingrediente mancante durante seed: ${ingredientName}`);
      }

      await ensureProductIngredientLink(db, pizzaProduct.id, ingredientId);
    }
  }

  console.log(`Seed demo completato: ${DEMO_INGREDIENTS.length} ingredienti e ${DEMO_PIZZAS.length} pizze.`);
}

seedDemoMenu()
  .catch((error) => {
    console.error("Seed demo fallito:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDb();
  });
