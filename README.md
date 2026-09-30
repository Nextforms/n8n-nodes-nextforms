# n8n-nodes-nextforms

Start an n8n workflow from a [Nextforms](https://nextforms.com) form, at the point in
the form's own workflow you choose, and read forms and responses from n8n. Works with
self-hosted n8n (and n8n cloud once n8n has verified the node), with a team API key: no
OAuth callback to register.

Two nodes:

- **Nextforms Trigger**: starts when a response reaches a **Send to app** step in the
  form's workflow. Every answer arrives with its label and type, plus the run and an
  event name, so one n8n workflow can tell "approved" from "declined". Uploaded files
  come attached as binary data (`file_1`, `file_2`, …), ready for a storage or email
  node.
- **Nextforms**: List Forms, Get Fields (a form's questions with their ids and labels),
  Get Responses (the newest, up to 100), Download File (a response's uploaded file as
  binary data, for a storage or email node).

## Install

In n8n: **Settings → Community nodes → Install**, package name `n8n-nodes-nextforms`.
Self-hosted n8n needs community nodes enabled (they are by default).

## Connect

1. In Nextforms, under **Settings → Connected apps**, create an API key with
   `forms:read`, `responses:read` and `hooks:manage`. Copy it: it is shown once. The key
   belongs to the team, so the workflow keeps running when the person who made it
   leaves, and any editor can revoke it.
2. In n8n, add a **Nextforms API** credential and paste the key. Leave the base URL as
   it is unless Nextforms told you otherwise.

## Trigger a workflow from a form

1. Add a **Nextforms Trigger** node, pick the credential and the **form**, and activate
   the workflow. n8n registers itself with the form; nothing is sent yet.
2. In Nextforms, open that form's workflow and add a **Send to app** step. Its picker
   lists this n8n workflow by name; choose it and publish.
3. Place the step where it makes sense: right after the trigger for every response,
   after an **Approval** step's Approve branch, or on one branch of a **Route** step.
   Give each step an **event name** when one n8n workflow should tell them apart; it
   arrives as `workflow.event`.

Every delivery shows in the form's workflow runs in Nextforms, with what n8n answered.

## What the trigger receives

The public API's response shape: `id`, `number`, `createdAt`, `formId`, `formTitle`,
`url`, `answers` keyed by question id (each with `label`, `key` when the question has a
field key, `type`, `value`, `display`, and `files`, `address` or `options` where they
apply), `payment` when the form takes one, and `workflow` (`runId`, `stepId`, `event`,
`approval`). The full field reference is at
[nextforms.com/docs/api](https://nextforms.com/docs/api/).

## Troubleshooting

- **The Send to app picker does not list the workflow**: it is not active, or another
  form is picked in the trigger. Activate it with this form and look again.
- **A run in Nextforms failed at the step with "410 Gone"**: n8n's webhook is gone (the
  workflow was deleted or its URL changed). Deactivate and activate the workflow so it
  registers again, then pick it again in the step.
- **The workflow does not start**: nothing is sent without a Send to app step. The
  trigger alone does not receive responses.

More at [nextforms.com/docs/n8n](https://nextforms.com/docs/n8n/).

## Developing this package

Source lives in the Nextforms frontend repository under `integrations/n8n`:
`credentials/NextformsApi.credentials.ts` (the key and an optional base URL, tested on
`/v1/me`), `nodes/Nextforms/NextformsTrigger.node.ts` (activating registers
`POST /v1/hooks` with n8n's webhook URL, labelled `n8n: <workflow name>`; deactivating
removes it; `checkExists` re-registers a hook that is gone), `nodes/Nextforms/Nextforms.node.ts`
(the reads) and `nodes/Nextforms/shared.ts` (the request helper and the Form dropdown).

`pnpm --filter n8n-nodes-nextforms test` builds (`tsc`, copies the icon) and runs
offline tests against stand-in n8n contexts. To try a local build in n8n: `npm link`
this folder, then `npm link n8n-nodes-nextforms` in `~/.n8n/nodes` and restart n8n.
Publishing is `npm publish` from this folder; `files` limits the tarball to `dist`.
