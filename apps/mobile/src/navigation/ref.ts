import { createNavigationContainerRef } from "@react-navigation/native";

export type RootStackParamList = {
	Home: undefined;
	Settings: undefined;
};

/** Created once, passed to the container, and shared with the navigation commands. */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
