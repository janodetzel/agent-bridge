import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApolloClient, InMemoryCache } from "@apollo/client";
import { createNavigationContainerRef } from "@react-navigation/native";

import { createNews } from "../features/news";
import { createDismissedNewsStore } from "../features/news/store";
import { createSettings } from "../features/settings";
import { createSettingsStore, type SettingsState } from "../features/settings/store";
import { createTodos } from "../features/todos";
import type { RootStackParamList } from "../navigation/routes";
import { apiLink } from "./api";

/**
 * The only file that creates instances, and the only file that wires features to
 * each other. Screens and the agent registry both import from here, so a command
 * runs against the very client, store, and ref the UI uses. An ApolloClient built
 * inside a component with useMemo would be unreachable for the bridge.
 */

export const apolloClient = new ApolloClient({ link: apiLink, cache: new InMemoryCache() });

export const settingsStore = createSettingsStore({
	storage: {
		async get() {
			const saved = await AsyncStorage.getItem(SETTINGS_KEY);
			return saved ? (JSON.parse(saved) as SettingsState) : null;
		},
		async set(settings) {
			await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
		},
	},
});

export const dismissedNewsStore = createDismissedNewsStore({
	storage: {
		async get() {
			const saved = await AsyncStorage.getItem(DISMISSED_NEWS_KEY);
			return saved ? (JSON.parse(saved) as string[]) : null;
		},
		async set(ids) {
			await AsyncStorage.setItem(DISMISSED_NEWS_KEY, JSON.stringify(ids));
		},
	},
});

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * The features. Each takes the instances it needs; none imports another. A
 * feature that needed a value from a neighbour would take a getter here, never
 * a snapshot, so the port cannot go stale.
 */
export const todos = createTodos({ apollo: apolloClient });
export const settings = createSettings({ store: settingsStore });
export const news = createNews({ apollo: apolloClient, dismissed: dismissedNewsStore });

const SETTINGS_KEY = "settings";
const DISMISSED_NEWS_KEY = "news.dismissedIds";
