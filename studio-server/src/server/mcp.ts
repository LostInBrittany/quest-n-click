// The remote MCP (4.2.3 PR 5, plan H4, ADR 0029): the game's MCP tools on the Studio Server itself, at `/mcp`, in MCP's
// Streamable HTTP transport, stateless (each POST a whole exchange, its answer JSON: no stream to keep, none to revoke).
// Policy B only (an OIDC access token for this Studio's audience, never the session cookie: no page can ride it), the
// caller a member; it says where its authorization is (RFC 9728, `/.well-known/oauth-protected-resource`). A tool runs
// as a request to this server's own `/api` on the loopback with the caller's token: the same gate, role, spans,
// journal and replay as any client, by construction rather than by a second copy of the checks.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { instructionsFor, toolsServer } from '../../../tools/mcp/tools-server';
import { httpBackend } from '../../../tools/studio/http-backend';
import { isStudioError, StudioError } from '../ops/errors';
import type { Gate } from './auth/gate';

export interface McpEndpointOptions {
  gate: Gate;
  /** The Studio's public URL (the resource is `<publicUrl>/mcp`). */
  publicUrl: string;
  /** The OIDC provider: the authorization server the metadata names. */
  issuer: string;
  game: string;
  version: string;
  log?: (line: Record<string, unknown>) => void;
}

/** Where `/mcp` says its protected resource's metadata is (RFC 9728 §3: the path appended). */
export const MCP_METADATA_PATHS = [
  '/.well-known/oauth-protected-resource/mcp',
  '/.well-known/oauth-protected-resource',
];

export function mcpEndpoint(o: McpEndpointOptions) {
  const base = o.publicUrl.replace(/\/+$/, '');
  const metadataUrl = `${base}${MCP_METADATA_PATHS[0]}`;
  const challenge = (error?: string) => `Bearer resource_metadata="${metadataUrl}"${error ? `, error="${error}"` : ''}`;
  const refuse = (res: ServerResponse, status: number, error: string, headers: Record<string, string> = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
    res.end(JSON.stringify({ error }));
  };

  return {
    /** RFC 9728: the resource, its authorization server, how a token is sent. */
    metadata: () => ({
      resource: `${base}/mcp`,
      authorization_servers: [o.issuer],
      bearer_methods_supported: ['header'],
      resource_name: `web-scumm Studio (${o.game})`,
    }),

    async handle(req: IncomingMessage, res: ServerResponse, readBody: () => Promise<unknown>): Promise<void> {
      // Stateless: no stream to open (GET) and no session to end (DELETE).
      if (req.method !== 'POST') return refuse(res, 405, 'the MCP endpoint takes POST', { allow: 'POST' });
      const auth = req.headers.authorization;
      if (!auth) return refuse(res, 401, 'an access token is required', { 'www-authenticate': challenge() });
      let principal: Awaited<ReturnType<Gate['authenticate']>>;
      try {
        principal = await o.gate.authenticate(req);
        if (!principal || principal.via !== 'bearer') throw new StudioError('an access token is required', 401);
        o.gate.require(principal, 'reviewer');
      } catch (e) {
        if (!isStudioError(e)) throw e;
        const invalid: Record<string, string> =
          e.status === 401 ? { 'www-authenticate': challenge('invalid_token') } : {};
        return refuse(res, e.status, e.message, invalid);
      }
      const token = auth.slice('Bearer '.length);
      const body = await readBody();
      // The loopback: this very server, which checks the token again, as for any request.
      const port = req.socket.localPort;
      let client = 'ai';
      const backend = httpBackend({ api: `http://127.0.0.1:${port}/api`, token: () => token, author: () => client });
      const server = toolsServer(backend, {
        name: 'web-scumm',
        version: o.version,
        instructions: instructionsFor(
          o.game,
          `${base}, as ${principal.user.name ?? principal.user.email ?? 'a member'}`,
        ),
        log: (line) => o.log?.({ event: 'mcp-tool-failed', user: principal.user.id, line: line.slice(0, 300) }),
      });
      server.server.oninitialized = () => {
        client = server.server.getClientVersion()?.name ?? 'ai';
      };
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    },
  };
}

export type McpEndpoint = ReturnType<typeof mcpEndpoint>;
