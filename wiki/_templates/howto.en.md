<!--
Template: how-to (a procedure), docs/dev/PLAN-4.5-WIKI.md Annex B. Copy it to wiki/en/<id>.md, its French twin to
wiki/fr/<id>.md, and keep the ten headings and their section ids. The header (type, audience, context, versions,
language switch) and the footer are generated from the manifest: do not write them. Link another page by its source,
`create.rooms.md#walkable-zones`; link the code by its path from the repository root, `src/engine/core/save.ts`.
Every command block says first the folder and the context it runs in. Delete these comments.
-->

# Restore the Studio on a fresh installation

<a name="what-you-get"></a>

## What you get

One or two sentences: the state you are in at the end.

<a name="context-and-versions"></a>

## Context and versions

Where this applies (engine repository, created project, local or hosted Studio, Bridge) and from which version: the
manifest's `versions.appliesFrom`.

<a name="prerequisites"></a>

## Prerequisites

- What must be installed or done before, each with its page.

<a name="where-to-run"></a>

## Where to run the commands

The folder and the machine: "in the engine repository, on your machine", "in the created project", "on the Clever
Cloud app, through `clever ssh`".

<a name="steps"></a>

## Steps

<!-- step: first-step -->
1. The first essential step, with its exact command.

   ```sh
   # in the created project
   npm run validate
   ```

<!-- step: second-step -->
2. The next one. Each essential step keeps its `step` id, the same in both languages.

> [!LIMIT id=example-limit]
> What this procedure does not cover, said plainly.

> [!GUARANTEE id=example-guarantee]
> What the product guarantees here, and the test that shows it (named in the manifest).

> [!MEASURE id=example-measure]
> A figure, with its date, version, volume, conditions and source at its commit.

<a name="expected-result"></a>

## Expected result, and how to check it

What you see when it worked, and the command or screen that shows it.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| The exact message | Why | What to do |

<a name="files-changed"></a>

## Files or data changed

What the procedure writes, so you know what to back up or review.

<a name="recovery"></a>

## Recovery or going back

How to undo it, when it can be undone; and say so when it cannot.

<a name="references"></a>

## References

- The reference pages, ADRs and source files this procedure rests on.
