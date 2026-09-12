import path from "node:path";

export const DEFAULT_FEATURES_DIR = "src/features";
export const DEFAULT_LOGIC_FILES = ["api", "store", "spec", "index"];

export const toPosix = (filePath) => filePath.split(path.sep).join("/");

/**
 * Locates a file inside a feature folder: `<…>/<featuresDir>/<feature>/<rest>`.
 * Returns null when the file is not in one, which is how every rule here opts
 * out of the files it has nothing to say about.
 */
export function featureOf(filename, featuresDir = DEFAULT_FEATURES_DIR) {
	const marker = `/${featuresDir.replace(/^\/+|\/+$/g, "")}/`;
	const posix = toPosix(filename);
	const at = posix.lastIndexOf(marker);
	if (at === -1) return null;

	const [feature, ...rest] = posix.slice(at + marker.length).split("/");
	if (!feature) return null;

	// `file` is empty when the path is the feature folder itself, which is what an
	// import of `../todos` resolves to. Callers that need a file check for it.
	return { feature, file: rest.join("/"), root: posix.slice(0, at + marker.length) };
}

/** `api.ts` -> `api`, `NewsScreen.tsx` -> `NewsScreen`. */
export function stem(file) {
	const base = file.slice(file.lastIndexOf("/") + 1);
	const dot = base.indexOf(".");
	return dot === -1 ? base : base.slice(0, dot);
}

/**
 * A logic file is one a command has to be able to call from outside React.
 *
 * The check is the file's name, not its contents, because that is the part a
 * reviewer can see at a glance. It matches the four names directly inside a
 * feature folder only, so a `helpers.ts` slips through: put logic a command
 * needs in one of them, or widen `logicFiles`.
 */
export function isLogicFile(filename, options = {}) {
	const found = featureOf(filename, options.featuresDir ?? DEFAULT_FEATURES_DIR);
	if (!found || !found.file || found.file.includes("/")) return false;
	return (options.logicFiles ?? DEFAULT_LOGIC_FILES).includes(stem(found.file));
}

/** Named `store`, wherever it lives. The only place `set` may be called. */
export function isStoreFile(filename) {
	return stem(toPosix(filename)) === "store";
}
