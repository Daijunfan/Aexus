# News channels

Channels are a Core-owned publishing surface. Collection is a separate service: it can
run on the Core host, another machine, or behind a tunnel. The renderer never calls
social platforms or reads a collector's configuration files.

## Ownership and routing

- Core stores subscriptions, channel routes, retained articles, original images and
  saved state under `AGENTS_COMPANY_HOME/channels`.
- Each Telegram subscription owns one channel. X and YouTube start with separate
  aggregate channels. An X or YouTube author can be moved to any existing channel;
  all their retained articles, including saved articles, follow the route immediately.
- Unfollowing disables collection while preserving the author's identity and saved
  articles. Re-following reuses that identity.
- Worker authentication, platform cookies and plugin options stay on the worker.
  Import only public target fields: `targetId`, `plugin`, `locator`, `name`, `enabled`
  and `pollSeconds`. Preserve disabled entries and existing target IDs.
- Categories are personal collections of conversation references. They can mix
  private chats, groups and channels, and overlap. Deleting a category does not delete
  its contents. All is the only built-in category.

An article's stable identity is its source ID and external item ID. Updating content
does not reset its expiry. Unsaved articles expire at the earlier of publication plus
48 hours and receipt plus 48 hours. Saving retains the article and its local media;
unsaving after expiry deletes them immediately. User deletion is authoritative, and
bounded tombstones prevent collector retries from recreating deleted content.

## Administrators and discussion

Administrators are existing employees assigned by the user or Secretary to this channel only.
The same employee may administer several channels and join several groups. Removing
one assignment leaves the others intact. The assignment does not change company
roles, permissions, engines or workspaces. An authenticated employee can discover
its own channel identities with `agents channel list` and `agents channel get ID`;
other channels and user subscription/saved metadata remain inaccessible.
Channels start without administrators; adding one does not replay older articles.

New external articles reach the current administrators through their existing native
queue as silent-only reading turns. The queue retains a news ID reference rather
than a duplicate article body. Full text and source/media metadata are delivered;
image bytes are not automatically sent to native vision inputs. The channel UI
still displays and downloads the original images. Expired, deleted or moved articles and revoked
administrator assignments are rejected before a queued read. Article cleanup does
not rewrite the native engine's own history of content it already received.

The channel composer publishes user discussion to every current administrator. A Secretary who is an actual administrator can also send a management request through channel.message-send, retaining its own Agent author; Core marks that request as its own discussion root.
Mentions and a reply's administrator author identify the work targets; without a
target, all administrators receive work. Others receive context only. Administrators
may publish a concise reply only within a user or Secretary management discussion delivered to them, or use
`channel.message-post --silent`. A news-only notification does not invite a public
reply; a user's question about news is a normal discussion that may be answered.
Questions, stories and casual conversation are valid requests as well as work tasks.
Public administrator replies cause silent-only awareness in the other recipients,
preventing automatic acknowledgment loops.

During the reading stage, the native tool
`agents_company_discussion_post({conversationType:"group"|"channel",conversationId,messageId,text:string|null})` is bound to that
employee and entry. All four fields are required: use conversationType:"channel",
this channelId as conversationId, and its entryId as messageId. Wrong conversation
or message IDs are rejected without an acknowledgment, including for another joined
channel. It normally submits
`text:null`. Public text is a deliberate reply to people, never private planning.
Ordinary text, JSON, thoughts and final output cannot publish or mark an entry read.
A successful native receipt returns `nextAction:"end_turn"`; end the current turn
with OK and no more tools. History/publication instructions are withheld from the
reading-stage context and supplied only in the subsequent response-stage task.
Without an accepted tool/API acknowledgment, formal work stays blocked. Once confirmed,
the response stage does not repeat the receipt; an actual answer is published explicitly
with `channel.message-post`. A silent receipt does not dismiss a user's request.

Channel discussion supports personal save, pin, hide and reactions, message references,
forwarding, and text/mentions/same-channel reply drafts. News keeps its original 48-hour
retention and independent saved state. See the channel discussion contracts in API.md.

## Administrator history reads

For "summarize the news above", use the full public timeline rather than the
legacy discussion-only history:

```sh
agents channel timeline CHANNEL_ID --kind news --before-entry QUESTION_ID --limit 20 --json
agents channel timeline CHANNEL_ID --kind news --before-entry QUESTION_ID --limit 20 --cursor NEXT_CURSOR --json
```

Choose 1–100 entries per request (default 20), or omit kind for news and discussion.
The latest page is returned chronologically; nextCursor retrieves older entries
with the same channel/kind/beforeEntry. News bodies and source metadata are complete;
user bookmark fields and image bytes are omitted. Ordinary administrators can read
their channel; this does not grant subscription management or unrelated-channel
access. Expired/deleted news stays excluded, saved articles remain available, and
reads never acknowledge, replay or publish anything. Fetch on demand in the response
stage, not during initialization/ACK. See API.md for ordering and current-timeline
boundaries.

## Collector connection

The dedicated listener is disabled by default and binds only to Core loopback.
Enable it with the operator CLI, then inspect the returned `runtime.listening` field:

```sh
agents channel settings --patch '{"enabled":true,"port":5152}' --json
agents channel settings --json
```

Create a dedicated credential with `channel.collector-add`. Its token is returned
once; store it in a worker-readable file with mode `0600`. Never copy the company's
`control.token` to a collector. `channel.collector-revoke` disables one connection
without changing subscriptions or articles.

The service uses `POST /api/channels/collector` with `Content-Type: application/json`,
`Authorization: Bearer <collector token>`, and a body containing `{cmd,args}`. Only
four operations are available through this listener:

1. `channel.collector-config`: fetch public subscriptions on startup, then pass
   `sinceRevision` to poll for changes. Reconcile by stable source/target IDs.
2. `channel.media-put`: upload image bytes, including optional author avatars,
   associated with a source and external article ID. Core does not fetch arbitrary
   remote image URLs. PNG, JPEG, GIF and WebP are accepted, up to 8 MiB each.
3. `channel.publish`: publish the article using the returned media IDs. A body may
   be empty for an image, title or source-link-only item. An avatar alone is not news.
4. `channel.source-avatar-put`: replace the original source identity image independently
   of article retention. It uses the same image validation and source capability;
   an identical hash is a no-op. No message or administrator operation is exposed.

Responses use `{ok:true,data}` or `{ok:false,error,code}`. A successful publish reports
`created`, `updated`, `duplicate`, `deleted` or `expired`. Treat the last two as final
for that article. If an upload returns `POST_DELETED` or `POST_EXPIRED`, stop uploading
its remaining media and reconcile through publish. Other failed operations remain
retryable; do not acknowledge publication before Core confirms it.

See [API.md](../API.md) for complete request/response fields and
[PERMISSIONS.md](../PERMISSIONS.md) for the capability boundary.

For another host, expose only this listener through an authenticated deployment
transport, such as an SSH reverse forward or an HTTPS reverse proxy. The collector's
endpoint remains ordinary HTTP/HTTPS; SSH details are not part of its business API.
An SSH deployment should own a separate connection (`ControlMaster=no`,
`ControlPath=none`) so restarting the bridge cannot terminate an unrelated session.

## Xhs service adapter

The external Xhs service's managed mode uses `app.agents`. In `config/app.yaml`,
add the following top-level section alongside the existing application settings:

```yaml
agents:
  enabled: true
  endpoint: http://127.0.0.1:5152
  token_file: ../runtime/secrets/agents-collector.token
  poll_seconds: 5
```

The endpoint is resolved from the worker, so a remote deployment may point at the
worker end of a tunnel. The service fetches Core subscriptions before starting its
scheduler and applies later changes while running. Its target YAML becomes a
replaceable cache; local subscription mutation is disabled in managed mode. Cached
configuration is only reusable for the same endpoint. Existing worker secrets,
collection logic and worker-side cleanup remain local. YouTube enrichment runs on
the worker: download the cover and complete audio, transcribe with its local Whisper
model, then use DeepSeek for a Chinese summary and the complete Chinese translation.
Only the finished article and images are published. Preparation, transcript and
translation chunks are checkpointed independently; restart resumes saved work.
Review, scoring and publication to public social accounts remain disabled.

An already published title-only YouTube item is completed by updating its original
source/external identity and publication time with a new content hash. This preserves
the Core article ID, saved state and original 48-hour retention deadline. Deleted or
expired articles are never recreated. The Core requires no ASR or model credentials;
the worker uses its existing private DeepSeek key file (or `DEEPSEEK_API_KEY`).

Before switching an existing service, make private rollback copies of its exact
configuration, import public targets without replacing existing Core choices, test
the dedicated connection, and then restart the service once. Verify configuration
revision, new articles and original image bytes after startup. If Core is temporarily
unreachable, pending publication retries must not be recorded as successful.

## Reading and export

Private messages, group messages and news share GFM Markdown and offline KaTeX
rendering. Copy and forwarding preserve original source text. Formula selections
are excluded from precise text quoting rather than creating an incorrect range.
Message action rails stay within their message and follow the visible reading area.

Downloads contain `story.md` and original local images in a self-contained `.tar.gz`.
Web clients use the authenticated download endpoint; desktop clients use the native
save dialog. Export staging files expire after one hour, independently of saved news.

## Verification

Deterministic Core/API/integration tests use isolated homes. Renderer tests cover
mixed categories, source moves, saved navigation, downloads, formula rendering and
sticky actions. `test/channels-collector-live-test.mjs --confirm-live` is an opt-in
cross-host read/publication probe against a disposable Core. Set
`AGENTS_COMPANY_COLLECTOR_PROBE` to a private JSON configuration containing the
authorized `host`, `project`, `probeScript`, and three existing `recordIds` (Telegram,
X, YouTube). It does not change real collector configuration or publication marks.
