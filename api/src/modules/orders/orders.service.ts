type PushPayload = {
	clientId?: string;
	mutations?: unknown[];
};

type PullPayload = {
	since?: string;
};

export async function pushOrderMutations(payload: PushPayload) {
	return {
		ok: true,
		entity: "orders",
		accepted: Array.isArray(payload?.mutations) ? payload.mutations.length : 0,
		clientId: payload?.clientId ?? null,
		receivedAt: new Date().toISOString(),
	};
}

export async function pullOrderMutations(payload: PullPayload) {
	return {
		ok: true,
		entity: "orders",
		since: payload?.since ?? null,
		mutations: [],
		serverTime: new Date().toISOString(),
	};
}
