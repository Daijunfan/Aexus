# Message view: commercial chat parity audit

The goal remains a complete, polished chatting experience comparable to WhatsApp and Telegram. Company, Messages and Plan now have independent appearance settings, as requested in the later design correction. Passing existing regression tests does not establish complete parity. No claim of full parity has been verified yet.

The latest scope explicitly includes every component's refinement and every element's animation. See [the component and motion inventory](MESSAGE_COMPONENTS.md) for reference evidence, current implementation and outstanding acceptance.

## Reference evidence

- [Telegram: folders, pinned chats, archive, bulk actions and desktop synchronization](https://telegram.org/blog/folders)
- [Telegram: full-history search, media/link/file filters and source filtering](https://telegram.org/blog/filters-anonymous-admins-comments)
- [WhatsApp: message editing and an explicit edited state](https://blog.whatsapp.com/now-you-can-edit-your-whatsapp-messages)

## Acceptance matrix

| Area | Required behavior | Current evidence / work remaining |
| --- | --- | --- |
| Conversation organization | Pin, favorites, archive/restore, manual unread, bulk actions, persistence and synchronization | Core and hidden desktop interaction/restart tests passed for pin, favorites, archive/restore, personal unread and bulk updates; browser pinning, archive synchronization and restoration also passed |
| History search | Search full histories, including unloaded group history; source/type filters, results, precise jump and highlight | Full-history Core search, typed/source filters, pagination and exact jumps into unloaded group history passed; large-history performance review pending |
| Message actions | Copy, linked/precise/cross-chat replies, forwarding, save, pin, reactions, context menu, multi-select | Core, installed desktop and Web tests cover source/return navigation, genuine authors, exact selected text and copied attachments. Accepted reaction motion and emoji replay are under the current integration acceptance; message editing remains open. |
| Drafts | Preserve per-conversation text/attachments/replies across navigation and application restart | Core restart plus direct/group draft reload and protected navigation passed; failure recovery and very fast unprotected reload still need dedicated acceptance |
| Shared content | Complete media history, links, files, source navigation, preview/export | Historical image cursor paging, albums, bounded nearby-original cache, scoped file downloads, audio/video playback and source navigation have installed desktop/Web evidence. Video-gallery integration and physical gesture comparison remain open. |
| Composer | Formatting, emoji, attachments, previews, recording, multiline, shortcuts | Offline bilingual1,914-entry emoji/skin-tone/recent palette, file/image upload progress/cancel/retry and recorded-WAV review/draft/send are implemented and installed-tested. Physical microphones, animated/custom emoji art, stickers and broader input-device acceptance remain open. |
| Delivery and recovery | Truthful send/task/file progress, retry without duplicate execution, offline state | Durable send/forwarding receipts, scoped upload cancellation/retry and uncertain-outcome recovery have Core/Web/native evidence. Complete comparative presentation of every send failure and queue state remains open. |
| Message changes | Editing/deletion with truthful effect on already executed Agent tasks and native context | Product behavior must be explicit; no cosmetic rewrite of execution history |
| Profiles and groups | Contact/group detail panel, members, accessible management, media and saved-message access | Profile content shortcuts and group shared-content panel implemented; broader group detail polish remains |
| Reading | Date/sender grouping, stable history, source jumps and unread boundary | Existing grouping, precise/source jumps and reading-position preservation passed. Frozen real-unread dividers, entry position and bounded earlier-unread paging now pass Web real-Core acceptance; native/installed acceptance has passed this iteration. Large-history windowing remains open. |
| Visual design | Cohesive named colors, hierarchy, icons, empty/loading/error details | Ten schemes plus custom color now coordinate all three views; actual colored room/material, Plan-sheet and Message wallpaper/bubble captures pass desktop/Web checks. Original round SVG controls and readable accents are in place. Full comparative aesthetic acceptance remains open. |
| Motion | Real send transition, incoming arrival, reactive background, menus/media/panels, no history replay, reduced motion | Composer-origin send movement, single incoming arrival, finite gradient movement, menu/panel/media entry transitions passed headless browser acceptance. Initial history, navigation, pagination and streaming deltas do not replay arrivals. Exact Telegram transition parity is not established. |
| Interaction quality | Keyboard navigation, focus restoration, context menus, touch targets, reduced motion, no clipped controls | Partial verification only; full interaction audit pending |
| Cross-client behavior | Same Core identities and state, persistent organization, no accidental read acknowledgement | Existing identity/receipt tests; browser organization synchronization passed; broader cross-client draft conflict/recovery acceptance remains |
| Rich communication | Files, voice/video playback/capture and richer conversation media | Installed file/image/WAV/MP3/AAC/H264/VP9 workflows and persistent audio queue pass native/Web tests. Recording uses synthetic signals in acceptance. Physical devices, transcription, calls, animated/custom emoji and stickers remain unverified or unimplemented; no dummy call controls are shown. |
| Interface language | Persistent English / Simplified Chinese selection, interface and accessibility labels, dates, unchanged user content | Core/CLI, hidden desktop and headless browser acceptance passed for the main interface; user data and protocol values are preserved. Plugin-owned interiors remain a separate open gap. |
| Verification | Isolated Core/CLI, actual desktop/Web, responsive/history and installed app | Most implemented workflows have macOS hidden-window, headless Web and installed CLI evidence in the linked iteration artifacts. This does not cover the complete commercial parity objective. Windows/Linux and physical devices remain untested. |

## Data and execution boundaries

Personal organization belongs to the operator and lives in `messenger.json`, separate from employee/native histories. Saving, pinning, reacting, archiving and marking a personal unread reminder never starts an engine, changes authority or claims a real receipt. A hidden message remains in native execution history. New tasks must still use the existing authenticated session/group send path. Forwarding must remain a deliberate send action, with visible destination and content.

Historical messages without recorded timestamps retain unknown timestamps. A UI must never fabricate delivery, online, read, voice/video or attachment support. Remaining gaps stay visible in this audit until actual acceptance evidence proves them resolved.

## Current acceptance evidence (continuing work, not a completion claim)

- `node Infra/src/test/messenger-core-test.mjs`: passed.
- `node Infra/src/test/messenger-ui-test.mjs`: passed, including multi-select save/forward and exact source navigation.
- `node Infra/src/test/message-forwarding-core-test.mjs`: passed, including image bytes copied into the recipient workspace and explicit group-image rejection/text-only choice.
- Existing Messages, group chat, read-receipt resilience and headless browser responsive suites passed during this iteration; rerun after subsequent edits as appropriate.
- Typecheck and builds passed during this iteration. Latest source contains further changes and must be rechecked before delivery.
- Screenshots: `.aexus/artifacts/message-parity/messenger-desktop.png` and `saved-message-library.png`.
- Current main-interface and Message changes were packaged and installed as 0.52.1 on macOS, with hidden-window and CLI verification. Remaining requirements still prevent a parity claim.
- `session send/enqueue --employee ... --images JSON` was found to drop image arguments in the CLI's employee-routing branch; the branch now forwards those paths, and the forwarding fixture verifies actual copied photo bytes.

## Bubble, background and motion iteration — 2026-10-01

Reference behavior was checked against Telegram's official [animated backgrounds and sending animations](https://telegram.org/blog/animated-backgrounds) and [background controls](https://telegram.org/blog/backgrounds-2-0). Telegram describes input-to-bubble transformation specifically for iOS; this is a design reference, not evidence that every Telegram client uses an identical transition. The garden pattern in this project is original SVG; no Telegram artwork or source implementation was copied.

- `node Infra/src/test/message-grouping-test.mjs`: speaker/date/time-gap boundaries, unknown historical dates, hidden/reply boundaries and out-of-order dates.
- `node Infra/src/test/message-surface-web-test.mjs`: real authenticated send, Web Animations API observations, one outgoing/incoming animation, finite wallpaper movement, streaming stability, restored-history silence, reduced motion including portaled menus, unloaded group reply navigation, preserved reading position and English/Chinese layouts at 390, 600, 800, 1024 and 1440 pixels.
- `node Infra/src/test/messenger-ui-test.mjs`, `node Infra/src/test/messages-ui-test.mjs`, `node Infra/src/test/group-chat-ui-test.mjs`, `node Infra/src/test/receipt-resilience-ui-test.mjs` and `node Infra/src/test/messages-polish-web-test.mjs`: passed with the new surfaces. No model requests or real employee changes were used.
- Visual evidence is in `.aexus/artifacts/message-surface/`: desktop/private/group screenshots, English/Chinese mobile screenshots, `interaction.webm` and `motion-evidence.json`. Screenshot capture waits for two animation frames after resizing; immediate capture produced a stale compositor region that was not present after layout settled.
- Wallpaper currently has one curated palette/pattern. Telegram-style user wallpaper customization, more complete exit/gesture transitions, performance on very large histories and native Windows/Linux rendering are still unverified or missing. No absolute visual superiority or full parity is claimed.

This iteration was installed as macOS 0.52.1 (ASAR SHA-256 `113ab9aeebba4cae8f38a5a468f1232607e91a161a896e50ae370e09f52c16e7`). Installed hidden-window Messenger and bilingual UI tests, portable CLI startup/restart and signature checks passed. Existing user-state JSON hashes remained unchanged; the real app was already stopped and was left stopped. This is a verified iteration, not final parity acceptance.

## Linked replies and recorded message metadata — 2026-10-01

Telegram's official [Replies 2.0 description](https://telegram.org/blog/reply-revolution) includes precise selected-text quotes, source navigation and replies into other chats. This iteration implements persistent same-conversation replies and source/return navigation. Selected-range quotes and cross-chat replies remain open; this is not full reply-feature parity.

- `session.send/enqueue --reply-to MESSAGE_ID` uses the existing authenticated Core operations. Core resolves a bounded public excerpt, validates references before opening an employee and at queued dispatch, excludes thinking/tool-only items, and retains the original destination and sender authority. A context reset invalidates a queued reference; the next valid task continues.
- Source links and excerpts live on the new user transcript item, alongside its observed creation time and authenticated sender. Original messages and native identities remain intact. Old dates and senders are not invented. Streaming keeps creation time stable, while inbox recency continues to follow completed-reply activity.
- The UI keeps the typed body separate from the reply preview, persists reply drafts across navigation/reload, supports Escape cancellation, shows the reference in pending work, returns from an original message to the reply, and preserves the same draft in the full workspace. Manager-origin requests are labeled with the actual sender; search and forwarding use recorded authorship rather than the model's `user` role.
- A delayed programmatic scroll event was incorrectly disabling bottom-follow during streamed replies. Private and group threads now retain the last scroll target while still respecting manual history reading. Composer height responds to width changes as well as text, preventing clipped existing drafts after a narrow resize.
- Core/CLI tests cover source/authority boundaries, original sender, stale queued references, no private-block leakage, Unicode excerpts, export/restart, unchanged old history and identities. Browser tests cover reply selection, draft isolation, source/return jumps, queue and photo references, and English/Chinese layouts. Hidden desktop Messenger tests cover actual send/link/reload behavior. Fixtures use isolated state and no billed model calls.
- The fixture socket reader was corrected to decode UTF-8 across packet boundaries, matching the production CLI. This removed a test-only export mismatch for long Chinese/emoji strings; the full equality assertions remain.
- Evidence: `.aexus/artifacts/linked-replies/`; installed acceptance is recorded separately after packaging and hidden-window verification.

Linked-reply iteration installed as macOS 0.52.1 (ASAR SHA-256 `29bccb5f0006f83d0de8b6e459a7e875c9438992119df3be24cea096fe22de1d`). The installed hidden-window Messenger/language workflows and portable CLI reply/restart tests passed. Current user-state JSON hashes are unchanged. Cline/Pi used deterministic protocol fixtures; the real Claude SDK/CLI used a local loopback model fixture with no provider billing. Full commercial and visual parity remains open.

## Precise text quotes — 2026-10-01

Private and group replies now accept an exact selected range through `replyQuote`.
A floating action quotes actual rendered Markdown text while leaving the new draft
body intact. Source navigation paints the precise range with the CSS Highlight API,
including the selected occurrence of a repeated phrase, and retains return navigation.
The selected range survives recipient changes, draft reload, Core restart and message
history persistence. Existing whole-message replies remain compatible.

Core and renderer share the same Markdown/GFM pipeline and whitespace projection.
Core rejects invented text, invalid offsets, split surrogate pairs, overlong selections,
and selections without a valid reply. Group retry keys include the selected range;
ordinary pre-existing group retry fingerprints are unchanged. Group quotes follow normal routing: explicit mentions select recipients; unmentioned operator sends broadcast to current members. Nonrouting publication uses chat.post. No author, permission, read receipt or execution-host
behavior is inferred from the quote.

`Infra/src/test/precise-quotes-core-test.mjs` covers formatting, duplicates, Unicode boundaries,
preflight rejection, private/group persistence, member posting and retry/mention rules.
`Infra/src/test/precise-quotes-web-test.mjs` exercises rendered selections across strong/link
nodes, paragraphs, code and Chinese/emoji, exact highlight positions, drafts, reload,
group sending and a 390px Chinese layout. The hidden Messenger workflow also performs
a native text selection and verifies the sent quote and actual highlight range.

The Markdown packages were already renderer dependencies; their existing installed
versions are now explicit dependencies, and the ESM parser pipeline is bundled into
the CommonJS Core build. A startup mismatch was caught and corrected before installation.

Evidence is in `.aexus/artifacts/precise-quotes/`. Cross-chat replies, broader gesture/a11y
acceptance, structured-result selections and exact animation-curve parity remain open.
This iteration does not establish complete Telegram parity.

Precise-quote iteration installed as macOS 0.52.1 (ASAR SHA-256 `8f961f5ac65a9d8a5ccc726fab7a0c10a16d4faaa854483ea7ea9945eeeb3383`). Installed hidden Messenger and language acceptance plus portable CLI selected-quote/restart verification passed. Existing user-state JSON hashes stayed unchanged. The complete commercial/UI parity goal remains active.

## Cross-conversation replies — 2026-10-01

The user can now choose another private or group conversation from a message or a
selected-quote preview. The shared destination dialog keeps the target draft, opens
its composer, and sends nothing until the user reviews and submits. All four source/
destination combinations are implemented, with source attribution, original-message
navigation, cross-conversation return navigation, selection preservation and reload.

Core resolves the source through an operator-only read API and the existing authorized
send/queue/group operations. The accepted snapshot contains only public message text,
its source identity and optional selected range. Source authority never becomes target
authority. Agent/Governor attempts and client-supplied internal snapshots are rejected.
Accepted queued references survive personal hiding; accepted group retry results survive
source hiding or deletion without duplicate delivery. Destination permissions still apply.

Cross-conversation photos are not copied silently: whole messages with images require
an explicit text-only choice, while a selected text range identifies its own scope.
The UI keeps a visible omission notice. Actual photo transfer remains the separate
forwarding operation; full group/shared-media parity is still open.

`Infra/src/test/cross-replies-core-test.mjs` verifies source resolution, four combinations,
permissions, forged snapshots, retry/deletion behavior, queued snapshots, image-path
non-disclosure, original read state and restart persistence. `Infra/src/test/cross-replies-web-test.mjs`
verifies actual destination selection, no implicit sending, both drafts, source/return
navigation, selected ranges, Chinese mobile layout and deliberate photo omission.
Hidden desktop Messenger tests also execute a cross-conversation reply and round trip.
Existing group, selected-quote, linked-reply, forwarding and read-receipt regressions passed.

Evidence: `.aexus/artifacts/cross-replies/`. All model responses are deterministic local fixtures.
General files/group media, richer delivery recovery, forwarding linked-reply metadata,
full accessibility/gesture coverage, and comparative visual/animation acceptance remain.
The full goal is still active.

Cross-reply iteration installed as macOS 0.52.1 (ASAR SHA-256 `67557da90e312050f0b5d4cd3555e70586c2378f4ebc987b82161c715424b01a`). Installed hidden Messenger/language workflows and portable CLI cross-quote/restart checks passed. User-state JSON hashes stayed unchanged. Full commercial/UI parity remains unproven and the goal stays active.

## Files and group media — 2026-10-01

Private conversations and groups now support real regular-file attachments alongside
images. The composer accepts selection, paste and drop; a scoped upload shows progress,
cancellation, failure and retry. Completed attachments retain their names and sizes,
survive draft reload/recipient changes, and use finite entry/exit motion. Files appear
as compact cards with type, size and download actions. The shared-content drawer has a
Files filter; group photos now appear in Media and the existing image viewer.

Both browser and desktop upload bytes using the existing 256 KiB chunk protocol and
atomic commit. Every upload receives its own directory. Desktop saves stream through
Core to a staging file before publication, while browser downloads stream through the
authenticated HTTP endpoint. The supported maximum is 2 GiB per file / 16 attachments;
tests exercise multiple chunks, zero bytes and binary/text integrity, not the full 2 GiB
boundary. Image previews retain the existing 10 MiB sniffed-format limit.

Core records trusted file metadata, includes scoped paths in existing employee task
context, and preserves files in transcripts, queues, drafts, exports and search. Group
uploads stay outside employee workspaces. Members can only read published paths via
`chat.file`; unpublished bytes and other groups remain inaccessible. Explicit mentions
copy attachments to each recipient's own workspace and recheck the existing authority.
An unmentioned group post never runs an employee. Publication of group files is currently
operator-only. Forwarding copies images/files in every private/group direction with
existing durable receipt semantics. Cross-conversation text quotes omit file paths and
show omission notices.

`Infra/src/test/message-attachments-core-test.mjs` verifies bytes, scoped reads, agent/outsider
rejection, traversal rejection, zero-byte files, cancellation, explicit mention copies,
forwarding, duplicate group posts, search and restart. `Infra/src/test/message-attachments-ui-test.mjs`
runs both headless Chromium and hidden Electron: actual upload/send, durable private
drafts, exact-byte downloads, group images/files/viewer, shared content and Chinese
layout. Browser checks also interrupt an upload, retry it and cancel one in progress.
The native save dialog's destination selection is stubbed; the actual Core save and
resulting bytes are verified. No real user data or billed provider is used.

Related Messenger, group, linked/selected/cross-reply, forwarding and Messages regressions
passed. The existing native Messages test now delays Blob byte reads to verify that an
upload finishing after recipient navigation remains with its original employee. Screenshot
review covers actual photo framing and file cards, including a 390px Chinese viewport.
Evidence: `.aexus/artifacts/message-attachments/`.

Still open: multi-image albums/gallery navigation, media playback, agent-published output
attachments, richer delivery recovery, linked-reply metadata during forwarding, exhaustive
component/accessibility/gesture comparison and the remaining Telegram parity checklist.
This is a verified increment, not proof of complete parity or superior aesthetics.

File/media iteration installed as macOS 0.52.1 (ASAR SHA-256 `16573972065dfb2fa5395ae1af7503aee718cccd6209f8aca93a10cb6ea76ae3`). Installed hidden attachment and bilingual workflows, full-workspace file rendering, and portable CLI upload/forward/download/restart checks passed. Root user-state hashes remain unchanged; the real app remains stopped. Full parity remains unproven and the goal stays active.

## Albums and continuous gallery — 2026-10-01

Message images now form compact albums with portrait-aware lead cells and media-sized
bubbles. A continuous light gallery supports the loaded conversation/shared-content
sequence, captions, position, bounded thumbnails, original downloads, keyboard controls,
zoom/pan, touch swipe/pinch/dismissal, failed-preview retry and source/focus return.
Search and shared-content panels stay open when the nested gallery is dismissed.
English/Chinese copy and reduced motion remain supported.

The actual hidden Electron test exposed a pre-existing event fan-out gap: `messenger:changed`
reached Web clients but not the desktop. Routing through the same runtime event publisher
as Chat/Plan fixes updates triggered by CLI or another client. A second desktop test
caught lost focus when the selected return thumbnail was still loading. Focus restoration
now selects the current image during dialog cleanup, and loading thumbnails remain usable.

Core/Messenger and attachment regressions passed. Gallery acceptance covers 2–16-image
layouts and a 38-image sequence on headless Web and hidden desktop. Browser tests exercise
actual directional Web Animations API frames, Chromium touch input, exact selected-image
download bytes, and 390px portrait / 740×420 landscape Chinese layouts. Existing Messages,
Messenger, component motion, surface motion and bilingual regressions passed. All state and
model protocols are local temporary fixtures. See `.aexus/artifacts/message-gallery/` and the
more detailed component audit in `Infra/src/docs/MESSAGE_COMPONENTS.md`.

The goal remains active. Loaded-media navigation is implemented; historical media paging,
playback, further interactions/accessibility and full comparative visual/animation acceptance
remain. No claim of complete parity or superior aesthetics is made.

Gallery iteration installed as macOS 0.52.1 (ASAR SHA-256 `2240c9305eaec200d7cd095d6f430ef9dc15f2e0513f1f32e19973f4ba3aa05d`). Installed hidden gallery/bilingual workflows and portable CLI attachment/forward/download/quote restart checks passed. User-state hashes are unchanged; the real app remains stopped. Native physical gestures and non-default browser zoom geometry still need acceptance, alongside the full parity checklist.

## Historical image browsing — 2026-10-01

Complete public image histories now have a Core/CLI paging contract (`messenger.gallery`).
The UI can browse older images without mounting every chat message, then explicitly reveal
the original message using the existing conversation navigation. Private/group scopes,
shared-content query/author filters and newest-first ordering are preserved. Every image
keeps its existing scoped byte-read operation. Browsing neither sends tasks nor clears read
receipts. Cursors survive restart; an open boundary excludes later arrivals until reopening
or refreshing. Hidden entries are filtered on each metadata read.

The viewer loads 40 metadata references per window and retains seven nearby originals.
Initial navigation stays responsive while metadata is loading, stale responses cannot reset
selection, and responses after closing are ignored. Read failures retain the visible image
and offer retry. Shared-media filtering now prevents stale-result activation and supports
retry. Source names and original-message navigation clarify historical context.

At non-default browser zoom, the original source transform incorrectly mixed CSS and visual
coordinates. The 125% reproducer measured over 100 px error. Corrected opening/closing and
pointer geometry passed at 80%, 100% and 125%. Responsive screenshot review also caught and
fixed narrow-header overflow; the close/source/download controls remain visible and use
44 px mobile targets.

Core/CLI, headless Web and hidden Electron tests cover historical paging, snapshot arrival
boundaries, permissions, restart, source navigation and failure/delay behavior. Existing
Messenger, Messages, attachment, component-motion and bilingual regressions passed. Tests
use isolated data and deterministic local protocol fixtures. See `.aexus/artifacts/gallery-history/`.
The full goal remains active: playback and the remaining comparative UI/motion and
accessibility acceptance are not yet complete.

Historical-gallery iteration installed as macOS 0.52.1 (ASAR SHA-256 `45c4c2a5ea684dd6dee7d74a3410c250a394f2ef62cf600e5b4f167663fbb000`). Installed hidden historical-gallery and bilingual UI tests plus portable CLI cursor/restart tests passed. The expanded Core fixture includes 105 private images as well as 195 original group images. Maximum measured opening/closing alignment error in the tested browser scales is 0.157 px. User-state hashes remain unchanged and the real app stays stopped. Full comparative UI parity remains unproven.

## Real audio/video playback — 2026-10-01

Messages now play real audio/video files through the existing scoped file boundaries.
The light controls expose actual playback, pause, seek, buffer/time, volume/mute, speed
and fullscreen behavior. Visible metadata/previews do not autoplay. Draft playback does
not send a message. Group playback does not mention or run a member. Current volume/mute
is reused while audio/video speeds are separate. Paused offscreen previews release their
source and resume locally; leaving a conversation stops and clears the media element.
Media and Audio shared-content filters expose the appropriate attachments.

Core/CLI media-open/info/read/close operations provide expiring client-owned grants.
The Web route adds session ownership, Host/Origin checks, single-range streaming and
logout revocation. Desktop uses a private custom stream protocol and the same Core reads,
without a loopback HTTP service or a control token in a URL. File/workspace changes fail
explicitly. Original download and retry remain available when a client cannot decode.

Core tests exercise ranges, permissions, file changes and active-stream revocation on a
1 GiB sparse file. Hidden desktop and headless Web decode WAV, VP9/WebM, H264/MP4, MP3 and
AAC/M4A fixtures and perform actual playback/seek/volume/speed, draft/group/shared-content
and error-recovery workflows. Browser fullscreen/Escape is verified; native OS fullscreen
is untested to preserve the hidden-window policy. No real microphone, camera, remote host
or billed provider is used. Evidence is in `.aexus/artifacts/media-playback/`.

The complete goal remains active. File playback is implemented; background audio/queues,
recording/transcription or calls, further video/gallery interactions, full accessibility
and comparative UI/motion acceptance remain. Codec support on other platforms is not
inferred from these macOS/Chromium checks.

Media iteration installed as macOS 0.52.1 (ASAR SHA-256 `4f7cc700324dd07d8175c0d3f3dda06fa22adb843127b71839cd72e5938b5846`). Installed hidden codec/playback and bilingual workflows plus portable CLI preview/read/release/restart checks passed. The sparse-stream test stopped after 2359296 bytes of a 1 GiB resource on logout. User-state hashes remain unchanged and the real app stays stopped. Full commercial/UI parity remains unproven.

## Background audio continuity — 2026-10-01

The audio element for posted messages now belongs to the application shell, so browsing
another conversation or changing primary views keeps the same source and playback position.
A mini-player and inline controls share playback, seeking, volume/mute and speed. Its explicit
queue supports add/play-next, reorder by dragging or buttons, removal, natural advance,
repeat and clear. Source navigation uses the original conversation/message reference.
Draft previews stay separate. New video/draft play intent pauses background audio and
invalidates older pending autoplay intentions. No queue operation runs an employee.

The queue is client-local and in memory; it is not a shared task queue or a persisted
playlist. Reload/quit starts silent. Media Session actions are routed to the current audio
owner where supported. Logout clears buffered media, queue and system metadata. The Web
login overlay previously retained application children, so stopping Core streams alone was
not sufficient to silence already-buffered playback; the client auth transition now does so.

Tests verify headless Web and hidden desktop continuity, synchronized controls, explicit
queue ordering, source navigation, repeat/completion, Chinese layout and release. Delayed
Web reads prove that an older response cannot replace a newer track or restart after stop.
A view-transition test caught a transient private workspace mounting during Plan navigation;
it is now gated by view kind, and the workflow creates neither a PTY nor model turns.
Screenshots and evidence are under `.aexus/artifacts/background-audio/`.

The full goal remains active. Background playback/queue is implemented for the current
window; persistent playlists, recording/transcription or calls, broader video/gallery
interaction and the remaining full comparative visual/motion audit are still open.

Background-audio iteration installed as macOS 0.52.1 (ASAR SHA-256 `8241915092c5bc28c125698b3acdf9d05237e5fe3694c2f56e3b4bbf63ca28ac`). Installed hidden audio-queue and bilingual tests, plus portable CLI media/gallery/file/quote checks, passed. User-state hashes are unchanged and the real app remains stopped. The complete comparative UI goal is still active.

## Color and expression iteration — 2026-10-01

Ten color schemes plus custom color now coordinate Company, Message and Plan through the
existing Core settings. The chooser is color-based, with saved custom HEX and readable accent
text. Strong conversation wallpaper, white floating surfaces, selected rows and themed bubbles
are tested in actual app captures. Original round SVG controls, a lazy offline bilingual
1,914-entry emoji palette and complete-grapheme large emoji bubbles improve expression.
Core/CLI persistence and invalid-update atomicity are covered; old theme IDs remain compatible.

Voice recording captures real PCM through an AudioWorklet, with pause/reacquire, real levels,
ten-minute bound, review and existing attachment upload/send. Synthetic audio tests exercise
the actual browser/native worklet without physical devices or model calls. Permission denial
and cancellation stop tracks, including late-returned streams. Physical microphone consent,
transcription/calls and Telegram animated/custom emoji parity are not established.

This iteration also removes superseded CSS instead of adding another override layer and fixes
Common menu/focus behavior, room material color inheritance and Plan pagination spacing.
See MESSAGE_COMPONENTS.md for the concrete scope and evidence. The goal remains active;
these improvements are not a claim of absolute aesthetic perfection or 100% Telegram parity.

Color/expression iteration installed as macOS 0.52.1 (ASAR SHA-256 `2e213c35a26af41885d79499a21203f7fe077fe5b61fc741d1d48a9af48fc1e8`). Installed hidden color/expression and portable CLI settings/media/restart acceptance passed. The real company remains 7 employees / 4 Teams; only the requested color preference (White → Violet) and its store revision changed, with other preferences preserved. The real application is stopped after installation; reopen normally to see the new palette. The overall goal stays active.

## Reading and reactive playback — 2026-10-01

The current iteration adds actual unread-boundary placement, stable visit snapshots and bounded
earlier-unread paging. Private unread markers use the recorded reply identity; personal unread
reminders do not manufacture receipts. Native/headless integration verifies an unseen tail stays
unread, actual tail visibility acknowledges it, and reopening a read conversation removes the
boundary. Unread separators break only the preceding bubble chain.

Reaction acknowledgement and emoji replay now use finite, explicit-operation motion. Playback
controls share one rendering implementation while inline video and application audio retain their
original owners. A51-card development profile reduced inactive-card progress commits from700 to0
across14native updates using stable per-track subscriptions; no second queue or player was added.
Metadata/grant lifecycle and voice permission/setup/interruption/hidden/auth races are covered by
synthetic source tests and extended real-app tests. Detailed acceptance is in MESSAGE_COMPONENTS.md
and the current iteration's artifacts. Complete commercial and comparative motion parity remains
unverified; the goal is active.

Reading/playback iteration installed as macOS 0.52.2 (ASAR SHA-256 `507cbbe6fa2f462751b6f076771bc881204f97eb0d9a2216f3a0b48dfcdea44e`). Installed hidden reading, expanded synthetic voice lifecycle, audio queue, bilingual UI and portable CLI media/restart passed. Project installer preserved the two real root-state JSON hashes (7 employees / 4 Teams). Evidence: `.aexus/artifacts/message-reading/verification.json`. Physical devices and complete Telegram/WhatsApp parity remain unproven; the goal stays active.


## Delivery, group conversation controls and message corrections — 2026-10-01

Outgoing private messages now carry exact task-correlated Sent, Delivered and Read milestones.
Accepted native input establishes delivery; a matching processing event establishes private Read.
Group Read requires an authenticated acknowledgment from that recipient. Task completion, opening
a conversation and another message's answer never fabricate those milestones. The details popover
shows per-recipient timestamps and independent task status, with the original frozen recipient set.
Legacy private messages without receipt metadata remain unknown.

Operator sends without mentions broadcast work to current group members. Explicit mentions and
same-group replies select formal work recipients; all other members receive bounded awareness.
Employee posts also reach the other current members as awareness, without granting control authority.
Every recipient may acknowledge with text:null (CLI --silent), including an explicitly addressed
employee. Internal acknowledgment replies force subsequent awareness to stay silent, preventing
recursive acknowledgment chatter. These rules supersede the earlier selective-only delivery design.
Member and whole-group publication mutes support fixed duration or indefinite mute, persist across
restart and expire under Core authorization. Muted members continue receiving work and may silently
acknowledge it. Only the operator manages speaking permissions.

Group message editing preserves accepted tasks, attachments, author, date, references and retry
identity. It has an isolated edit buffer, deliberate conflict recovery and exact caption/reference
refresh without reopening original media. A changed selected quote cannot silently send stale text.
The sidebar now uses consistent portraits, finite real avatar clips, stable action slots, readable
previews and truthful unread reminders. Hidden/offscreen/reduced-motion avatars stop animating.

Source Core, headless Web and hidden Electron tests cover the above flows. Current evidence lives
in .aexus/artifacts/group-delivery, .aexus/artifacts/chat-editing, .aexus/artifacts/chat-editing-projections,
.aexus/artifacts/message-receipts and .aexus/artifacts/message-sidebar. Actual Codex 0.156.1 environment probes
also confirm ordinary shell/patch denial during an isolated acknowledgment turn and same-thread
workspace restoration. The Core acknowledgment lifecycle holds formal work until the employee
explicitly confirms through the bound `agents_company_discussion_post` native tool or authenticated
post API. Ordinary text, JSON, thoughts and final output never become public messages or read
receipts. The default tool submission is null; visible text must be an actual reply to participants,
not internal planning. An already-recorded receipt is not repeated in the response stage. The
source lifecycle suites cover prompt-return latency under a held ACK, queue/steer rules,
missing acknowledgments, interruption and later recovery.
Four-engine callback acceptance is recorded separately in the final verification artifacts.
After an interrupted or failed Codex ACK, native /review and /compact wait for an ordinary
message to restore the original workspace. The app refuses those special operations explicitly
instead of allowing a misleading workspace-free completion. Switching reading/work catalogs
unsubscribes an idle actor and resumes the same native thread. Active background terminals
explicitly block that reading attempt and remain running; no read receipt is fabricated.
Local native acceptance covers preserved thread identity and original MCP restoration, not
actual remote SSH execution. No engine restart is forced. Full comparative Telegram
feature/motion parity remains unproven.

## Rich code and live message projections — continuing acceptance

The current pass addresses measured gaps rather than treating the previous green checks as
complete parity. Telegram's official [code-highlighting description](https://telegram.org/blog/similar-channels)
is the reference for readable code in chat. The application uses highlight.js's common language
bundle and original theme-aware controls, not Telegram artwork. Code copy and wrapping preserve
content; the separate whole-message copy continues returning the original Markdown/TeX.

The common-language highlighter is a separate local chunk, loaded only when a code block is rendered.
Source acceptance now covers fenced-code languages, safe markup, independent copy feedback,
stream-stable wrapping, exact quote mapping through syntax spans and toolbar exclusion. Large
blocks remain complete plain text above the syntax-work budget. Code rendering never runs an
engine, changes history or fetches an external highlighter.

The audit also reproduced stale search results after group edits/private replies, old loaded
group receipts beyond the newest 100 messages, stale pinned captions, and short-message actions
covering text/emoji. Their targeted regressions and final desktop/Web/installed acceptance are
recorded separately in the iteration artifacts. Complete UI/motion superiority, production-scale
performance across every surface, richer custom emoji/stickers, physical-device acceptance and other native
operating systems remain open; the full goal is not marked complete by this pass.

## Long histories and channel discussion — continuing acceptance

Loaded private and group histories now use one measured viewport beyond 200 rows. The complete
loaded data remains available to search, quotes and image navigation; only visible rows and
active interaction owners stay mounted. Expanded tools, thoughts, native details, code wrapping
and paused playback position survive recycling. Native and Web acceptance covers 1,200 private
items and 3,000 group messages, genuine unread entry, manual scrolling, loading earlier messages,
search/reply return, and cancelling stale navigation when leaving a conversation. The full-history
transport has not been replaced by a separate paging protocol. Evidence: `.aexus/artifacts/message-history`,
`.aexus/artifacts/message-viewport`, and `.aexus/artifacts/message-window-navigation`.

Channels have an independent administrator membership using existing employee identities. New
news creates reference-only delivery records; source content is resolved again at dispatch so
expiry, deletion, movement and revoked membership can stop an outdated delivery. News is silently
acknowledged. User discussions target mentions and the administrator being replied to while all
other administrators receive context. Public replies belong to an actual user discussion, and
an acknowledgment may use `text: null` / CLI `--silent`. The existing queue, acknowledgment gate,
native sessions and receipt projection are shared with groups; no hidden group or second permanent
news body is created. Actual prompts already sent to an engine may remain in that engine's native
history; local news retention does not rewrite external/native histories.

Work/awareness is routing, not a judgment that only operational tasks deserve replies. Ordinary
questions, stories and casual conversation remain valid user requests, including questions about
news. A news-only notification stays silent; a response to a user discussion uses an explicit
post API. No private model output is automatically copied to either a group or channel.

The channel timeline mixes source articles and discussion, reuses rich Markdown/math/code,
message actions and recipient details, and retains channel-scoped text/mention/reply drafts.
Administrator selection does not alter company roles. Official X and YouTube assets keep their
native colors, while Telegram identity images are stored per source independently of article
retention. Source rendering acceptance is recorded in `.aexus/artifacts/channel-discussion` and
`.aexus/artifacts/channel-icons`; Core/CLI, desktop/Web integration, remote avatar synchronization and
installation are reported separately. Complete comparative commercial feature and motion parity
is still not established by these changes.

The combined iteration is installed privately on macOS as 0.52.2, ASAR SHA-256
`d179e57b0c23cdbf26bceff3e0894b83a0cd0824440932abdf3a40d29f379c2f`.
Candidate and installed hidden-window channel workflows and portable CLI passed; the candidate
also passed the large-history workflow. All 13 existing Telegram source images were synchronized
and verified against the cloud service's original bytes. The requested Telegram, X, YouTube and
Group folders are present alongside built-in All. Source subscriptions, employee identities,
company permissions, workspaces and existing preferences were preserved. No real channel
administrators were assigned by the migration. Final evidence, including skipped tests and
untested platforms, is in `.aexus/artifacts/channel-administrators/verification.json`.

## Message action height threshold

The message copy/forward rail now sticks only when its message is taller than the actual
reading viewport. Short messages keep ordinary controls at their original position. The shared
resize/visibility observers update this decision for viewport changes, streaming content,
images and news expansion; there are no new scroll listeners or preferences. This applies
to private/group conversations, channel articles and the saved-news panel. Acceptance and
installation evidence: `.aexus/artifacts/message-action-threshold/verification.json`.


## Channel reading and source management — 2026-10-02

The current-state audit found that channels only supported manual unread reminders:
new source articles and administrator replies never generated actual user unread
badges. It also reproduced inaccessible management controls after selecting the last
of 485 authors. Those were concrete commercial-chat workflow gaps, rather than proof
that previous passing component checks covered the full product.

The Core now records personal reading by stable entry identity, separately from
administrator delivery receipts. New and backdated publications count as unread;
article enrichment, source moves and subscription changes preserve existing state.
Legacy retained entries get an unknown baseline without invented read times. Explicit
user batches and an explicit channel-wide mark-read command are idempotent and do not
start employees or change their receipts. Secretary may inspect reading state, but
cannot acknowledge for the user. The existing native foreground gate also protects
channel acknowledgments. Read-only Web history/context/state calls do not retain stale
mutation-replay responses; a retried mark-all still cannot consume later arrivals.

Message lists display real channel counts separately from personal reminders. A
channel enters at its loaded first-unread boundary, with complete adjacent date labels.
Earlier unread content remains reachable through contiguous paging; the UI does not
insert a lone old item and pretend the intervening history was loaded. Visible entry
ends require foreground dwell; search, saved previews and overlays do not acknowledge.
Returning from a native background window restarts the dwell. The explicit “Mark as
read” action can clear unloaded unread items in that channel. Current reading is not a
claim that an article was intellectually understood or that attached media was played.

Author management now keeps its heading, search/actions and footer visible while its
body scrolls. Local search covers names, handles, platforms and channel names, including
unfollowed authors. Publisher links still reveal, expand and focus the selected author
after asynchronous loading. No collector request or subscription mutation is used for
search. Compact message action rows retain a direct Reply control.

Source evidence: `.aexus/artifacts/channel-user-read/`, `.aexus/artifacts/channel-reading-ui/`,
`.aexus/artifacts/channel-read-review/`, `.aexus/artifacts/author-management/` and the integration
report under `.aexus/artifacts/channel-reading/`. The latter records actual packaging and
installation status separately; a source test is not evidence of installation.

The overall objective remains active. The current audit still does not establish full
commercial feature coverage or comparative motion/aesthetic parity. Calls, polls,
animated/custom sticker coverage, physical-device acceptance and native Windows/Linux
verification remain unproven or unimplemented. Channel draft persistence across filter
remounts and uncertain-send identity across remounts are concrete follow-up audit items;
these are not declared fixed by the reading work. General channel-history windowing
and richer first-unread jumps into very large mixed histories also remain open.

The reference inventory was refreshed against Telegram's official
[conversation organization description](https://telegram.org/blog/folders) and
WhatsApp's [group messaging features](https://www.whatsapp.com/groups). These references
inform the broader checklist; they do not certify this product as equivalent.


## Draft and confirmed-send recovery — 2026-10-02

The next audit reproduced concrete failures: filtering a channel lost pending text
and mentions, and losing an already accepted send response produced two publications
and two employee work turns after reopening or restarting. The draft writer could
also requeue an older failed value after a newer successful value and overwrite it.

Drafts now persist a send identity; group attempts also persist their original Company
team-view scope. The existing Core group/channel deduplication remains the only send
path. The UI waits for the complete draft to be saved and checks that it is still the
current snapshot before dispatch. Unchanged retries keep that identity across mounts
and Core restart. Meaningful payload changes get a new identity. Controlled tests
reduced the reproduced duplicate publication/work cases from two to one.

The shared draft controller keeps pending values visible and drains a single latest-value
map. Stale refreshes and failed superseded writes cannot overwrite newer local edits.
Core `expectedClientMessageId` protects an atomic draft replacement or clear without
bumping the revision on a mismatch. Late completion preserves new local text, files and
reply metadata. If another client has prepared a newer draft while the local submitted
draft was unchanged, the UI restores that newer record. Slash-command completion can
retain attachments through one conditional replacement.

Channel filters keep the same composer instance hidden, rather than discarding its
state. The Latest control is anchored above the actual composer region, including
reply, mention and error rows. It no longer overlays Cancel reply. Secretary private
and group UI sends also no longer receive the Governor-only task-view restriction;
existing authorization and Governor task scopes remain enforced.

Source evidence lives in `.aexus/artifacts/message-draft-recovery/`,
`.aexus/artifacts/messenger-draft-recovery/`, `.aexus/artifacts/channel-composer-recovery/` and
`.aexus/artifacts/private-draft-native/`. Packaging and actual installed acceptance are
recorded under `.aexus/artifacts/draft-recovery/`, separately from source checks. Native
fault injection wraps the original IPC handler inside a disposable test process;
it does not replace the authenticated Core route or modify the real application.

This does not establish full commercial parity. Private `session.send/enqueue` still
lack a durable client-send identity and recovery contract; private transport ambiguity
across restart is not declared fixed, and no blind private automatic retry was added.
Unprotected forced termination before an unsaved draft reaches Core, broader concurrent
editing, and the remaining media/call/sticker/motion/platform checklist remain open.

## Private send and forwarding recovery — 2026-10-02

Private regular sends now use an optional, persistent client attempt ID through the
same authorized `session.send/enqueue` operations. The receipt belongs to the real
sender and stable employee; changing from Send to Queue does not create another
attempt. Accepted confirmations survive Core restart without reopening an engine or
rereading a removed reply source. The Core still rechecks current authority. Slash
commands keep their existing unkeyed behavior. The two positional CLI parsers now
share their implementation instead of duplicating all attachment and reply flags.

Acceptance does not mean delivery, reading, or completed work. Live queues remain
non-durable: cancellation, closure, revoked authority and restart are explicitly
reported as interrupted. An ambiguous dispatch is never silently replayed. The UI
keeps its draft and offers a deliberate “Send as a new request” action after asking
the user to inspect the conversation. Ordinary retries retain the original ID and
Governor scope. Workbench sends also save their submitted snapshot; this does not
add continuous Workbench typing autosave.

The recovery notice occupies a row above the composer, rather than covering the
navigation or conversation title. On narrow screens, busy composers give text its
own row, with attachment, voice, Steer, Queue and Stop controls below it. English and
Chinese 390px tests check input width, overflow and actual button hit targets.

Forwarding retains one setup across dismissal and restart: selected references,
destination, note, text-only choice and send identity. Closing preserves it; explicit
discard clears the setup without cancelling previously accepted work. Attempted
payloads are locked, and a separate status lookup can recover an existing acceptance
without sending. Known failures before dispatch can retry; unknown or interrupted
dispatch cannot. A destination-navigation or draft-cleanup failure after success is
shown separately from a send failure. Group-forwarding copy now accurately describes
delivery of the shared request to current members.

An actual installed-app baseline showed that Electron discarded Core error codes.
IPC now carries the existing response envelope; plain error fields cross the bridge
and are reconstructed as renderer Errors. Native foreground acknowledgment guards
remain enforced. Keyed private sends and forwarding bypass the short-lived HTTP
response cache so current Core receipt/queue/authority checks cannot be replaced by
an obsolete successful transport response.

Evidence is under `.aexus/artifacts/private-send-recovery/`, `.aexus/artifacts/forward-recovery/`
and the packaging/installation report in `.aexus/artifacts/send-recovery/`. Tests use real
temporary Core, HTTP or native IPC paths with deterministic protocol fixtures, not
paid providers or real user conversations. Actual accepted-send and busy-queue
shutdown/restarts are tested separately from injected journal states representing
an uncertain dispatch boundary; no real native kill at that exact boundary is claimed.

Full commercial parity remains unproven. Durable unstarted private queues, forced
termination before draft persistence, broader simultaneous-client editing, richer
history/media/call/poll/sticker/motion coverage, physical devices, and native
Windows/Linux acceptance remain separate work. These recovery tests do not certify
comparative aesthetic or complete Telegram/WhatsApp feature parity.
