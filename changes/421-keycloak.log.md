## 4.2.1 PR 9 (second part, first step): a real Keycloak in CI

- **`tests/studio-keycloak.test.ts`**, against the test realm of `ops/studio/keycloak/` (runs when
  `STUDIO_TEST_KEYCLOAK` is set): a login through Keycloak's own form (its HTML, its cookies); the identity (a
  verified email, a name, a sid, a refresh token and an id_token); an id_token refused as an access token; a refresh;
  an admin ending that very session, and the back-channel logout Keycloak then sends to this test, which
  `verifyLogoutToken` accepts and which names that session (its sid) and its user;
  a user disabled by an admin, whose next refresh is a `DefinitiveRefusal`.
- **CI:** the `studio-hosted` job starts Keycloak 26 (`quay.io/keycloak/keycloak`, pinned by digest) with the realm,
  able to reach the runner as `host.docker.internal`; `ops/studio/keycloak/` opens the job.
- **Run here** against the same image: 3 tests passed. On Apple silicon the JVM needs `-XX:UseSVE=0`
  (`JAVA_OPTS_APPEND`), not on the x86 runners.
- **Not covered here:** the device flow, which needs a person to approve the code (its contract stays tested against
  the test provider).

- **Second reading** (automated second context): the back-channel check proved little (an assertion that could not
  fail, optional comparisons, and a logout of every session racing several tokens); it now ends one session and
  requires the token naming it. Keycloak's readiness waits for a 200 (`curl -fsS`); the client's back-channel URL
  is put back afterwards; the id_token's refusal is pinned to its audience.

→ next: Claude (PR 7, the client, after the maintainer validates the mock-ups)
