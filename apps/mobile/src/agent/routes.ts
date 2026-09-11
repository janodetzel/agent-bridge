import { z } from "zod";

import type { RootStackParamList } from "../navigation/ref";

/** Types do not exist at runtime, so the route names are repeated here. */
export const RouteName = z.enum(["Home", "Settings"]);

type Assert<T extends true> = T;

/** Fails to compile when RouteName and RootStackParamList drift apart. */
export type RoutesMatchTheNavigator = Assert<
	[z.infer<typeof RouteName>] extends [keyof RootStackParamList]
		? [keyof RootStackParamList] extends [z.infer<typeof RouteName>]
			? true
			: false
		: false
>;
