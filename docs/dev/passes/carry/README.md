# Carried passes

A pass a person made on one candidate may stand for a later one only when no file of its surface changed, the
version included (ADR 0024, `docs/dev/surfaces.json`). Each carry lives here, under the target release:

- `<release>/<pass id>.json`: the `CarryAttestation`, written `pending` by `npm run field:carry`;
- `<release>/<pass id>.report.json`: the source report, byte for byte as the person left it.

`field:carry` writes the files; it never commits them. **Every commit that touches them is the maintainer's, signed**:
one unsigned commit on a carry's path, even of the pending file, leaves that carry refused for good (its history is
checked whole). The maintainer approves a carry by setting `"decision": "approved"` and `"approvedBy"` to their principal in
`.github/allowed_signers`, **in a commit signed with their key**. That root is read as the source candidate's commit
holds it. A pull request that changes both `.github/allowed_signers` and this folder is refused. Claude never writes an
approved attestation. Merge these pull requests with a merge commit (`ship merge`), never a squash: a squash recreates
the commit under GitHub's key.
