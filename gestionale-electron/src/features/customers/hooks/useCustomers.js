import { useCallback, useEffect, useState } from "react";
import { listCustomers } from "../../../services/ipc/customers.ipc";

export function useCustomers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async (filters) => {
    setLoading(true);
    setError(null);

    try {
      const result = await listCustomers(filters);
      setCustomers(Array.isArray(result?.data) ? result.data : []);
    } catch (err) {
      setCustomers([]);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { customers, loading, error, reload };
}
