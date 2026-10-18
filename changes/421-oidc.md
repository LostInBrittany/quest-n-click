### Changes

- **The Studio Server behind OpenID Connect** (4.2.1).
  - **Login:** with Keycloak or any OIDC provider (Authorization Code + PKCE). The rights live in the Studio: owner,
    dev or reviewer, given by one-time invitations to a verified email (`studio-server invite`, `POST
    /api/invitations`). The owner's routes: members, roles, sessions, audit.
  - **Mutations:** a mutation from the browser needs the exact `Origin` and the `X-Studio-Request` header. The CLI and
    MCP use Bearer access tokens for the Studio's audience, obtained with `studio-server login --server <url>` (device
    flow).
  - **Access ends:**
    - at the next request when a member is removed;
    - at once on the provider's back-channel logout;
    - within 15 min when the provider disables the user, or when it stays unreachable (the session is then
      suspended until it answers).
  - **Without OIDC:** the server stays on the loopback.
