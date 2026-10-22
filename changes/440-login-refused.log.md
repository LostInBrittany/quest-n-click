## 4.4.0: the device login's refusal named; offline_access in the runbook

- Found on the reference deployment while measuring the preview: after the realm's admin was recovered, the login was
  refused with a bare `ResponseBodyError`. `auth/device.ts` now turns the OAuth error (`error`, `error_description`)
  into the message; the cause was the user's missing `offline_access` role (the CLI asks for `offline_access`, for its
  refresh token). STUDIO-SERVER (en, fr) lists both requirements.
→ next: none.
