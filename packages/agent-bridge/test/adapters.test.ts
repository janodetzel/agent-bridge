import { ApolloClient, ApolloLink, InMemoryCache, gql } from "@apollo/client";
import { createNavigationContainerRef } from "@react-navigation/native";
import { describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";
import { z } from "zod";

import { apolloCommands } from "../src/adapters/apollo";
import { navigationCommands, type NavigationRef } from "../src/adapters/react-navigation";
import { zustandInspect } from "../src/adapters/zustand";
import { buildRegistry, type CommandGroup } from "../src/core/command";
import { handleRequest } from "../src/core/handle";
import { PROTOCOL_VERSION, type Response } from "../src/core/protocol";

const call = (groups: CommandGroup[], command: string, args?: unknown) =>
	handleRequest(buildRegistry(groups), {
		id: "1",
		clientId: "test",
		protocolVersion: PROTOCOL_VERSION,
		cmd: "run",
		command,
		args,
	});

const failed = (res: Response) => {
	if (res.ok) throw new Error(`expected a failure, got ${JSON.stringify(res.result)}`);
	return res;
};

describe("navigationCommands", () => {
	const routes = z.enum(["Home", "Settings"]);

	it("fails when the container is not ready", async () => {
		const ref = createNavigationContainerRef<{ Home: undefined; Settings: undefined }>();
		const groups = [navigationCommands(ref as NavigationRef, { routes })];

		expect(failed(await call(groups, "nav.navigate", { screen: "Home" })).error).toMatch(
			/navigation is not ready/,
		);
	});

	it("reports the route it is on, and null before the container mounts", async () => {
		const ref = createNavigationContainerRef<{ Home: undefined; Settings: undefined }>();
		const groups = [navigationCommands(ref as NavigationRef, { routes })];

		const res = await call(groups, "nav.current");
		expect(res).toMatchObject({ ok: true, result: null });
	});

	it("times out when the route never becomes focused, which is what an unknown route does", async () => {
		// React Navigation does not throw for an unknown route, so the adapter is
		// driven here with a ref that reports a route that never changes.
		const ref = {
			isReady: () => true,
			navigate: () => {},
			goBack: () => {},
			canGoBack: () => true,
			getCurrentRoute: () => ({ name: "Home", params: undefined }),
		} as unknown as NavigationRef;

		const groups = [navigationCommands(ref, { routes, focusTimeoutMs: 100 })];
		const res = failed(await call(groups, "nav.navigate", { screen: "Settings" }));

		expect(res.code).toBe("COMMAND_FAILED");
		expect(res.error).toMatch(/did not become the focused route within 100 ms/);
	});

	it("rejects a route that is not in the enum before it reaches the app", async () => {
		const ref = createNavigationContainerRef<{ Home: undefined; Settings: undefined }>();
		const groups = [navigationCommands(ref as NavigationRef, { routes })];

		const res = failed(await call(groups, "nav.navigate", { screen: "DoesNotExist" }));
		expect(res.code).toBe("INVALID_ARGS");
	});

	it("fails to go back when there is no history", async () => {
		const ref = { canGoBack: () => false } as unknown as NavigationRef;
		const groups = [navigationCommands(ref, { routes })];

		expect(failed(await call(groups, "nav.back")).error).toMatch(/cannot go back/);
	});
});

describe("apolloCommands", () => {
	const client = new ApolloClient({ cache: new InMemoryCache(), link: ApolloLink.empty() });

	client.cache.writeQuery({
		query: gql`
			query Favorites {
				favorites {
					__typename
					id
					title
				}
			}
		`,
		data: { favorites: [{ __typename: "Favorite", id: "1", title: "Kept" }] },
	});

	const groups = [apolloCommands(client)];

	it("returns only the cache entries with the prefix", async () => {
		const res = await call(groups, "apollo.cache", { prefix: "Favorite:" });
		if (!res.ok) throw new Error(res.error);

		expect(Object.keys(res.result as object)).toEqual(["Favorite:1"]);
	});

	it("requires a prefix, so an agent cannot dump the whole cache", async () => {
		expect(failed(await call(groups, "apollo.cache")).code).toBe("INVALID_ARGS");
		expect(failed(await call(groups, "apollo.cache", { prefix: "" })).code).toBe("INVALID_ARGS");
	});

	it("returns an empty list when no named query is active", async () => {
		const res = await call(groups, "apollo.refetch", { operations: ["Favorites"] });
		expect(res).toMatchObject({ ok: true, result: [] });
	});
});

describe("zustandInspect", () => {
	const store = createStore<{ units: string; setUnits(u: string): void }>()((set) => ({
		units: "km",
		setUnits: (units) => set({ units }),
	}));

	const groups = [zustandInspect({ settings: store })];

	it("returns state without the actions", async () => {
		const res = await call(groups, "store.get", { store: "settings" });
		expect(res).toMatchObject({ ok: true, result: { units: "km" } });
		expect(Object.keys((res as { result: object }).result)).toEqual(["units"]);
	});

	it("only knows the stores it was given", async () => {
		expect(failed(await call(groups, "store.get", { store: "nope" })).code).toBe("INVALID_ARGS");
	});

	it("exposes no way to write", () => {
		expect(Object.keys(groups[0]!.commands)).toEqual(["get"]);
	});
});
