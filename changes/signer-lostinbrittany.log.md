## LostInBrittany as a second tag signer

`ship tag 4.5.2 --sign` failed on LostInBrittany's machine: git's signing key there is a GPG one, and
`.github/allowed_signers` named only wanoo. The new line is LostInBrittany's `id_ed25519` key, in a commit signed by that
key over SSH (8ebe6f91). `tools/field/trust.ts` accepts a change to the file only from a key the previous version
names, so wanoo approves it here. Until it merges, 4.5.2 is tagged by wanoo or waits.

→ next: merge; LostInBrittany registers the key on GitHub as a signing key, runs `ship preflight-stable`, then tags 4.5.2 with `--key=$HOME/.ssh/id_ed25519.pub`.
