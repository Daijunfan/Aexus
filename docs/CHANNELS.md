# News channels

Channels are a Core-owned publishing surface with an explicit employee or external-process
engine. External collection can run on the Core host, another machine, or behind a tunnel.
The renderer never calls social platforms or reads a collector's configuration files.

## Publishing engine, channel identity and schedules

`channel.create {name,engine,avatar?}` requires a deliberate engine choice. The shared
desktop/Web channel manager exposes New channel and Channel settings; the same contracts
are available to the user or Secretary through Core and CLI. Creation is atomic, including
image validation, source identities and any dedicated credential. It does not launch a
process or employee task.

For an employee channel, select existing employees, or add the current members of a Team.
This is a membership snapshot, not a new Team, employee or native session. Publishing
membership is the existing channel administrator list; change it through `channel.update`.
The same employee may publish in several channels. Removing a member immediately revokes
publication but retains that employee's articles and source identity.

```sh
agents channel create --name 'Research desk' --engine '{"kind":"employees","employeeIds":["EMPLOYEE_A","EMPLOYEE_B"]}' --json
agents channel update CHANNEL_ID --admins '["EMPLOYEE_A"]' --expected-revision 1 --json
# Run with the publishing employee's existing authentication; no discussion parent is needed.
agents channel publish --data @article.json --json
```

An employee article uses `{channelId,externalId,publishedAt,title,body,mediaIds?}`.
Core resolves its source from the authenticated employee and current membership, and supplies
the actual employee author name. It rejects a different employee's source or author name.
Upload images first through `channel.media-put` with the same channelId, externalId and
publishedAt, plus mediaKey/name/mimeType/base64 data. Stable externalId and original Unix
millisecond publishedAt keep retries idempotent; do not reset them on every retry.
Articles share the existing timeline, post view, saved state and retention rules. Ordinary
private answers do not automatically become channel articles, and the author does not receive
its own news as another awareness turn. Discussion replies keep their separate existing rules.

After creating the channel, Add publishing schedule creates an ordinary `schedule.create`
agent task. Choose a publishing employee, interval, task prompt and whether to enable runs.
The editor includes the channel publication contract in the task and uses a clientRequestId
for retry safety. Without an explicit anchor, the first interval occurs one interval after
acceptance. Manage/pause the task in Plan. Removing a publisher revokes writes, not that
employee's independent schedule. No second scheduler or worker queue is created.

External engines require a process name and local/remote location. Remote engines additionally
require the process IP/hostname and a Core receiver URL reachable **from that process**:

```sh
agents channel create --name 'Cloud news' --engine '{"kind":"external","location":"remote","name":"News worker","host":"203.0.113.10","endpoint":"https://core.example.com/api/channels/collector"}' --json
agents channel connection CHANNEL_ID --json
agents channel collector-add --name 'Replacement worker' --channel CHANNEL_ID --json
```

`host` records where the process runs; `endpoint` is where it pushes messages, not an SSH
address or the process's own API. Core does not deploy, log into, or start the cloud process.
The local collector listener remains loopback-only and disabled until explicitly enabled.
Use an HTTPS reverse proxy or an HTTP loopback tunnel for remote access. Saving a host does
not prove reachability. Connection status reports unconfigured, waiting, the last successful
authenticated request, or a revoked credential; it never asserts that a quiet worker is online.

Creation returns a dedicated token once in `setup`, unless an active collectorId was chosen.
Pass it as `Authorization: Bearer TOKEN` to the receiver using a POST body `{cmd,args}`.
Read `channel.collector-config` for source IDs; publish using `sourceId`, not an employee
channelId. A custom process has a generic `process` source. Telegram/X/YouTube keep their
existing adapters and may use social sources routed into an external channel. Once explicitly
bound, only the selected collector credential may publish that channel's external sources;
a legacy wildcard token does not bypass the binding and cannot reach employee sources.
Replacing the channel credential invalidates the old credential's access to this channel
without revoking unrelated channels. Tokens are not returned by later channel reads.
Existing channels retain their source-scoped compatibility and show an unconfigured origin
until explicitly configured; no fictitious host is inferred.

Names and avatars are independent of source/article metadata. Upload PNG/JPEG/GIF/WebP up
to 8 MiB as `avatar:{name,mimeType,data}` during create/update. Original validated bytes are
stored independently of news expiry. `channel.avatar-image {id}` reads the image; the channel
view projects `{channelId,sourceId:channelId,sha256}`. A custom image overrides any platform
icon. Send `avatar:null` to restore the platform/default image. Updating engine location,
connection, membership, name or avatar supports expectedRevision; a stale save preserves the
UI draft and offers an explicit reload. Engine kind itself is fixed after configuration.

## Ownership and routing

- Core stores subscriptions, channel routes, retained articles, original images and
  saved state under `AGENTS_COMPANY_HOME/channels`.
- Each Telegram subscription owns one channel. X and YouTube start with separate
  aggregate channels. An X or YouTube author can be moved to any external-engine channel;
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
Legacy/external channels start without administrators; employee channels start with their
selected publishers. Adding a member does not replay older articles.

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
may publish a concise reply only within a user or Secretary management discussion delivered to them.
When no public reply is needed, they make no publication call. A news-only notification does not invite a public
reply; a user's question about news is a normal discussion that may be answered.
Questions, stories and casual conversation are valid requests as well as work tasks.
Public administrator replies cause silent-only awareness in the other recipients,
preventing automatic acknowledgment loops.

Reading runs privately without tools. Core records receipt only after native success
and current-authority checks; no acknowledgment API or special output is needed.
Awareness ends here. Work targets receive the original task in the same native session.
Failed or interrupted reading does not start that task.

The optional native agents_company_discussion_post is a response-stage publisher:
{conversationType:"channel",conversationId:CHANNEL_ID,messageId:ENTRY_ID,text:STRING}.
It is bound to the current task/employee; wrong or stale IDs, revoked credentials,
empty text and null are rejected. The ordinary API remains channel.message-post
--text ... --reply-to .... --silent is removed. Ordinary text/JSON/thoughts never create
public messages. Reading other employees' posts cannot invoke a publisher. Channel
work remains in the full employee transcript but creates no private/Company unread.

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

## Cloud documents and channel storage

An external channel may bind `engine.fileStorage: {hostId,directory}` to an existing
Cloud Hosts record and the collector's content-addressed media root. Its collector
configuration advertises `collectFiles:true`. The collector sends only
`channel.publish.files` metadata: `{id,name,mimeType,bytes,sha256,thumbnailMediaId?}`.
Original document bytes remain on the cloud host; paths are always derived as
`directory/SHA256_PREFIX/SHA256`, never supplied arbitrarily by the collector.
The existing validated image protocol handles optional document thumbnails.

```sh
agents channel file-download --post POST_ID --file FILE_ID --json
agents channel file-status --post POST_ID --file FILE_ID --json
agents conversation workspace channel:CHANNEL_ID --json
```

`channel.file-download {postId,fileId}` is human-only and starts an existing SSH
transfer into the channel's shared workspace. `channel.file-status` reports
not-downloaded/queued/running/completed/failed, byte progress and the saved relative
path. Wait for completed: acceptance is not completion. Files up to 2 GiB are
streamed in chunks; size and SHA-256 are verified before atomic commit. A conflicting
user filename is retained, and a new suffix is used. Repeated downloads reuse the
completed copy. The channel Files button opens the same storage interface as groups.

For document channels, cloud posts and files expire seven days after publication.
The worker automatically removes expired records and unreferenced file bytes.
Initial backfill is the last 48 hours. Ordinary channels retain their existing
48-hour policy. Saving a local post does not extend cloud cache lifetime. Documents
explicitly copied into the local channel workspace survive cloud expiration, post
deletion and Core restart. SSH failure never reads a same-named file on the Mac.
