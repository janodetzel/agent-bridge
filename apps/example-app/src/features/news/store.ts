import { createStore } from "zustand/vanilla";

export type DismissedNewsState = { dismissedIds: string[] };

export type DismissedNewsActions = {
	load(): Promise<void>;
	dismiss(id: string): Promise<void>;
};

export type DismissedNewsDeps = {
	storage: {
		get(): Promise<string[] | null>;
		set(ids: string[]): Promise<void>;
	};
};

/**
 * Local-only state: which articles the reader dismissed. Server data (the
 * articles themselves) stays in Apollo's cache; this store never copies it.
 */
export const createDismissedNewsStore = (deps: DismissedNewsDeps) =>
	createStore<DismissedNewsState & DismissedNewsActions>()((set, get) => ({
		dismissedIds: [],

		async load() {
			const saved = await deps.storage.get();
			if (saved) set({ dismissedIds: saved });
		},

		async dismiss(id) {
			const before = get().dismissedIds;
			if (before.includes(id)) return;
			const next = [...before, id];
			set({ dismissedIds: next });
			try {
				await deps.storage.set(next);
			} catch (e) {
				set({ dismissedIds: before });
				throw e;
			}
		},
	}));

export type DismissedNewsStore = ReturnType<typeof createDismissedNewsStore>;

/** What the screen subscribes to. Commands read `getState()` and pick the same fields. */
export const dismissedNewsStoreSelectors = {
	dismissedIds: (s: DismissedNewsState) => s.dismissedIds,
};
