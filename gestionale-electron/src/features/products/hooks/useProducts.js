import { useCallback, useEffect, useState } from "react";
import { listProducts } from "../../../services/ipc/products.ipc";

// Hook for product catalog with loading/error state and explicit reload API.
export function useProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Re-fetches products from local IPC source, optionally with list filters.
  const reload = useCallback(async (filters) => {
    setLoading(true);
    setError(null);

    try {
      const result = await listProducts(filters);
      setProducts(Array.isArray(result?.data) ? result.data : []);
    } catch (err) {
      setProducts([]);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { products, loading, error, reload };
}
