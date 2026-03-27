type PushPayload = {
	clientId?: string;
	mutations?: unknown[];
};

type PullPayload = {
	since?: string;
};

export async function pushProductMutations(payload: PushPayload) {
	return {
		ok: true,
		entity: "products",
		accepted: Array.isArray(payload?.mutations) ? payload.mutations.length : 0,
		clientId: payload?.clientId ?? null,
		receivedAt: new Date().toISOString(),
	};
}

export async function pullProductMutations(payload: PullPayload) {
	return {
		ok: true,
		entity: "products",
		since: payload?.since ?? null,
		mutations: [],
		serverTime: new Date().toISOString(),
	};
}
