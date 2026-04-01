function normalizeBaseUrl(value) {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

function resolveCloudHealthUrl() {
  const explicitHealthUrl = String(process.env.CLOUD_API_HEALTH_URL ?? "").trim();

  if (explicitHealthUrl) {
    return explicitHealthUrl;
  }

  const baseUrl = normalizeBaseUrl(
    process.env.CLOUD_API_BASE_URL ?? process.env.API_BASE_URL ?? "http://localhost:4000"
  );

  return `${baseUrl}/health`;
}

function createCloudHealthService(options = {}) {
  const fetchImpl =
    typeof options.fetchImpl === "function"
      ? options.fetchImpl
      : typeof fetch === "function"
        ? fetch
        : null;

  const timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : 2500;

  return {
    getHealthUrl() {
      return resolveCloudHealthUrl();
    },

    async pingCloud() {
      const healthUrl = resolveCloudHealthUrl();
      const startedAt = Date.now();

      if (!fetchImpl) {
        return {
          ok: false,
          url: healthUrl,
          error: "FETCH_UNAVAILABLE",
          latencyMs: Date.now() - startedAt,
        };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(healthUrl, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          signal: controller.signal,
        });

        const latencyMs = Date.now() - startedAt;

        if (!response.ok) {
          return {
            ok: false,
            url: healthUrl,
            status: response.status,
            latencyMs,
            error: `HTTP_${response.status}`,
          };
        }

        let payload = null;

        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        return {
          ok: payload?.ok === undefined ? true : payload.ok === true,
          url: healthUrl,
          status: response.status,
          latencyMs,
        };
      } catch (error) {
        const errorCode = error?.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR";

        return {
          ok: false,
          url: healthUrl,
          error: errorCode,
          latencyMs: Date.now() - startedAt,
          message: error?.message ?? "Cloud non raggiungibile",
        };
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}

module.exports = {
  createCloudHealthService,
  resolveCloudHealthUrl,
};
