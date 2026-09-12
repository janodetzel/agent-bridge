import type { Registry } from "../core/command";
import { handleRequest, type HandleOptions } from "../core/handle";
import {
	PROTOCOL_VERSION,
	REQUEST_MESSAGE,
	RESPONSE_MESSAGE,
	type Request,
	type Response,
} from "../core/protocol";

/** The part of Expo's dev tools client the transport uses. */
export type BridgeClient = {
	addMessageListener(method: string, listener: (params: unknown) => void): { remove(): void };
	sendMessage(method: string, params: unknown): void;
};

/**
 * Answers `request` messages on a connected dev tools client until the returned
 * function is called. Transport-agnostic, so tests and the fake app peer can
 * drive it without React.
 */
export function attachAppCommands(
	client: BridgeClient,
	registry: Registry,
	opts?: HandleOptions,
): () => void {
	const subscription = client.addMessageListener(REQUEST_MESSAGE, (params: unknown) => {
		const req = params as Request;
		void handleRequest(registry, req, opts)
			.catch((e: unknown) => crashed(req, e))
			.then((response) => client.sendMessage(RESPONSE_MESSAGE, response));
	});

	return () => subscription.remove();
}

/** The handler answers every request, so reaching this means the bridge itself broke. */
function crashed(req: Request, e: unknown): Response {
	return {
		id: req?.id ?? "",
		clientId: req?.clientId ?? "",
		protocolVersion: PROTOCOL_VERSION,
		ok: false,
		code: "COMMAND_FAILED",
		error: `app-commands failed to handle the request: ${e instanceof Error ? e.message : String(e)}`,
	};
}
