import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  ConnectInput,
  ConnectResult,
  ConnectorReadiness,
  Directory,
  OauthCompleteInput,
} from "@/types/directory";

export const directoryApi = {
  directory: async () =>
    unwrap<Directory>(await client.get(ENDPOINTS.HUB_DIRECTORY)),
  readiness: async (code: string) =>
    unwrap<ConnectorReadiness>(
      await client.get(ENDPOINTS.HUB_CONNECTOR_READINESS(code)),
    ),
  /** the Idempotency-Key makes a repeated send of the same attempt return the first result instead of connecting twice */
  connect: async (body: ConnectInput, idempotencyKey: string) =>
    unwrap<ConnectResult>(
      await client.post(ENDPOINTS.HUB_CONNECT, body, {
        headers: { "Idempotency-Key": idempotencyKey },
      }),
    ),
  oauthComplete: async (body: OauthCompleteInput) =>
    unwrap<ConnectResult>(
      await client.post(ENDPOINTS.HUB_OAUTH_COMPLETE, body),
    ),
};
