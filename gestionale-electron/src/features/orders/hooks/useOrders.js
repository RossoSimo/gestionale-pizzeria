import { useCallback, useEffect, useState } from "react";
import { listOrders } from "../../../services/ipc/orders.ipc";

// Hook for orders list with normalized loading/error state and manual reload.
export function useOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Re-fetches order data from local IPC source, optionally with list filters.
  const reload = useCallback(async (filters) => {
    setLoading(true);
    setError(null);

    try {
      const result = await listOrders(filters);
      setOrders(Array.isArray(result?.data) ? result.data : []);
    } catch (err) {
      setOrders([]);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { orders, loading, error, reload };
}
