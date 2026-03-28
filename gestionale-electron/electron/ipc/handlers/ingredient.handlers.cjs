function toIpcErrorPayload(error) {
  return {
    code: error?.code ?? "INTERNAL_ERROR",
    message: error?.message ?? "Errore interno",
    details: error?.details ?? null,
  };
}

function throwNormalizedIpcError(error) {
  throw new Error(JSON.stringify(toIpcErrorPayload(error)));
}

function validateIngredientFilters(payload) {
  if (payload == null) {
    return {};
  }

  if (typeof payload !== "object" || Array.isArray(payload)) {
    const error = new Error("Filtri ingredienti non validi");
    error.code = "VALIDATION_ERROR";
    throw error;
  }

  return payload;
}

function registerIngredientHandlers(ipcMain, channels, ingredientService) {
  ipcMain.handle(channels.INGREDIENTS_LIST, async (_event, payload) => {
    try {
      const filters = validateIngredientFilters(payload);
      return await ingredientService.listIngredients(filters);
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });

  ipcMain.handle(channels.INGREDIENTS_CREATE, async (_event, payload) => {
    try {
      return await ingredientService.createIngredient(payload);
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });

  ipcMain.handle(channels.INGREDIENTS_UPDATE, async (_event, payload) => {
    try {
      return await ingredientService.updateIngredient(payload);
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });

  ipcMain.handle(channels.INGREDIENTS_DELETE, async (_event, payload) => {
    try {
      return await ingredientService.deleteIngredient(payload);
    } catch (error) {
      throwNormalizedIpcError(error);
    }
  });
}

module.exports = { registerIngredientHandlers };
