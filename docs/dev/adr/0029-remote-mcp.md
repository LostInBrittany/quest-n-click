# 0029 · The remote MCP: the same checks as the API, by going through it (4.2.3)

**Context.** An AI agent works on a hosted Studio through the Model Context Protocol (plan
`docs/dev/PLAN-4.2.3-COORDINATION.md` H4). Until 4.2.3 the MCP server ran on the author's machine over stdio,
calling the Studio core on the local folder: on a shared Studio that bypasses everything the shared Studio guarantees
(who writes, which role, whose span, the journal, a retry applied once). The MCP authorization specification (2025)
makes a remote server an OAuth protected resource: it says where its authorization server is (RFC 9728) and takes
Bearer tokens for its own audience.

**Decision.**

1. **`/mcp` on the Studio Server**, in MCP's Streamable HTTP transport, **stateless**: each POST carries a whole
   exchange and is answered in JSON. No stream stays open, so none outlives a revocation; GET and DELETE are 405.
2. **Policy B only.** An OIDC access token for this Studio's audience (the `oidc.audience` the CLI's tokens carry),
   checked by the gate as for `/api`; never the session cookie, which a page could ride. A 401 says where the
   authorization is: `WWW-Authenticate: Bearer resource_metadata="<public>/.well-known/oauth-protected-resource/mcp"`;
   that document (RFC 9728) names the resource and the OIDC provider. The caller must be a member (reviewer at least).
3. **A tool is a request to this server's own `/api`, on the loopback, with the caller's token**
   (`tools/studio/http-backend.ts`). The checks are not copied: they are the API's, the same code path a Studio page
   takes, the gate included (a member removed is refused at the next request, their tokens revoked with them). Each
   write carries its own operation id.
4. **The same tools everywhere** (`tools/mcp/tools-server.ts`): the stdio server over the core (the repository), the
   stdio server over a hosted Studio's API (`npm run mcp -- --server <url>`, with the CLI's device-flow token), and
   `/mcp`. A tool whose ability a backend lacks is not offered (screenshots, the test suite, documents and asset
   prompts stay local).

**Consequences.**

- An agent's write is a member's write: their role, their spans (a span another member holds is a 423 the agent reads),
  their name in the journal and the audit.
- An agent sends no revision it read (`x-studio-base`, H10): its writes are computed by the server on the file as it is,
  and checked by the guard, but not refused because someone wrote the file since the agent read it. A client that
  tracks its reads is for later.
- The loopback costs one more HTTP request per tool call, and the token is checked twice. Accepted: the price of one
  copy of the checks.
- A client that does not follow MCP's authorization discovery stays on the stdio server, local or `--server`.
- Rejected: an MCP endpoint calling the core directly with its own checks (two copies that drift); a stateful session
  with a server-sent stream (a long connection to close on revocation, for no need of the tools).
