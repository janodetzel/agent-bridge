import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApolloClient, InMemoryCache } from "@apollo/client";
import { createNavigationContainerRef } from "@react-navigation/native";

import { createSettingsStore, type SettingsState } from "../features/settings/store";
import type { RootStackParamList } from "../navigation/routes";
import { apiLink } from "./api";

/**
 * The only file that creates instances. Screens and commands both import from
 * here, so a command runs against the very client, store, and ref the UI uses.
 * An ApolloClient built inside a component with useMemo would be unreachable
 * for the bridge.
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

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const SETTINGS_KEY = "settings";
