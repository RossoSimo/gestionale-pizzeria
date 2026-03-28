import { useCallback, useEffect, useState } from "react";
import { listIngredients } from "../../../services/ipc/ingredients.ipc";

export function useIngredients() {
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async (filters) => {
    setLoading(true);
    setError(null);

    try {
      const result = await listIngredients(filters);
      setIngredients(Array.isArray(result?.data) ? result.data : []);
    } catch (err) {
      setIngredients([]);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ingredients, loading, error, reload };
}
