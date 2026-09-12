export type JsonSafeResult =
	{ ok: true; value: unknown } | { ok: false; path: string; reason: string };

class NotSerializable extends Error {
	constructor(
		readonly path: string,
		readonly reason: string,
	) {
		super(`${path}: ${reason}`);
	}
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const childPath = (path: string, key: string | number): string =>
	typeof key === "number"
		? `${path}[${key}]`
		: IDENTIFIER.test(key)
			? `${path}.${key}`
			: `${path}[${JSON.stringify(key)}]`;

/**
 * Converts a command result into something `JSON.stringify` round-trips.
 *
 * `Date` becomes an ISO string. `undefined` is dropped from objects and becomes
 * `null` at the top level or inside an array. Everything JSON cannot carry -
 * `Map`, `Set`, functions, symbols, `BigInt`, `NaN`, `Infinity`, and cycles -
 * fails with the path of the first offending value.
 */
export function toJsonSafe(value: unknown, rootPath = "result"): JsonSafeResult {
	try {
		return { ok: true, value: convert(value, rootPath, new Set()) };
	} catch (e) {
		if (e instanceof NotSerializable) return { ok: false, path: e.path, reason: e.reason };
		throw e;
	}
}

function convert(value: unknown, path: string, ancestors: Set<object>): unknown {
	if (value === null || value === undefined) return null;

	switch (typeof value) {
		case "string":
		case "boolean":
			return value;
		case "number":
			if (!Number.isFinite(value)) {
				throw new NotSerializable(path, `${value} is not valid JSON`);
			}
			return value;
		case "bigint":
			throw new NotSerializable(path, "BigInt is not valid JSON");
		case "function":
			throw new NotSerializable(path, "a function is not valid JSON");
		case "symbol":
			throw new NotSerializable(path, "a symbol is not valid JSON");
	}

	const object = value as object;
	if (ancestors.has(object)) throw new NotSerializable(path, "circular reference");

	if (object instanceof Date) {
		if (Number.isNaN(object.getTime())) throw new NotSerializable(path, "invalid Date");
		return object.toISOString();
	}
	if (object instanceof Map) throw new NotSerializable(path, "a Map is not valid JSON");
	if (object instanceof Set) throw new NotSerializable(path, "a Set is not valid JSON");

	const nested = new Set(ancestors).add(object);

	if (Array.isArray(object)) {
		return object.map((item, index) => convert(item, childPath(path, index), nested));
	}

	const out: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(object)) {
		if (item === undefined) continue;
		out[key] = convert(item, childPath(path, key), nested);
	}
	return out;
}
