# Message components: visual and motion acceptance

The user's requirement covers every chat-page component and every interaction state, not just message bubbles. The current light visual language and English/Chinese selection must remain. This checklist is work in progress; it is not a claim of complete Telegram parity or superior aesthetics.

## Reference inspected

Telegram's [macOS website](https://macos.telegram.org/) links to the official TelegramSwift repository. The inspected snapshot is `579cebbf0c01fd41b712eff3647fa7f69db9665d`:

- [AppMenuController.swift](https://github.com/overtake/TelegramSwift/blob/579cebbf0c01fd41b712eff3647fa7f69db9665d/packages/TGUIKit/Sources/AppMenuController.swift): click-origin menu scale, 200 ms appearance and disappearance.
- [Popover.swift](https://github.com/overtake/TelegramSwift/blob/579cebbf0c01fd41b712eff3647fa7f69db9665d/packages/TGUIKit/Sources/Popover.swift): control-origin expansion, distinct opacity and geometry transitions, dismissal behavior.
- [Modal.swift](https://github.com/overtake/TelegramSwift/blob/579cebbf0c01fd41b712eff3647fa7f69db9665d/packages/TGUIKit/Sources/Modal.swift): separate backdrop/content transitions and 250 ms dismissal paths.
- [ChatInputView.swift](https://github.com/overtake/TelegramSwift/blob/579cebbf0c01fd41b712eff3647fa7f69db9665d/Telegram-Mac/ChatInputView.swift): 200 ms input-panel/layout transitions.
- [GalleryPageController.swift](https://github.com/overtake/TelegramSwift/blob/579cebbf0c01fd41b712eff3647fa7f69db9665d/Telegram-Mac/GalleryPageController.swift): 250 ms source/destination position and scale transitions.
- [CAAnimationUtils.swift](https://github.com/overtake/TelegramSwift/blob/579cebbf0c01fd41b712eff3647fa7f69db9665d/packages/TGUIKit/Sources/CAAnimationUtils.swift): native spring implementation. Matching a duration does not establish equality of curves. Our browser easing still needs frame-by-frame comparative acceptance.

The implementation uses original application code and the existing icon system. No Telegram artwork or source files were added to application inputs. References describe the macOS client; mobile behavior and Telegram Desktop's separate implementation must not be treated as interchangeable evidence.

## Component inventory

| Component | Implemented and locally tested | Still open |
| --- | --- | --- |
| Top navigation | Three centered buttons, active state, Common outside dismissal, bilingual labels | Full visual comparison of all navigation states |
| Sidebar heading/search | More compact spacing and type hierarchy; search and empty results | Long-name, dense-list and loading-state visual audit |
| Conversation folders | Sliding selection surface, hover/press/focus states | Comparative frame review |
| Conversation rows | Position-preserving reordering, interrupted movement handling, avatar press response, current/unread/pinned/draft states, always-available row actions with reserved timestamp space | Large-list performance and removal choreography |
| Thread header | Light translucent surface, consistent controls, status distinctions | Profile/avatar transition continuity |
| Bubbles | Sender/time grouping, tails, typography, date markers, original light wallpaper | Album/caption surfaces implemented; old timestamps remain unknown; new messages record actual creation time |
| New messages | Composer-origin movement, incoming arrival, finite background response | Full source-to-bubble morph and comparative spring curves |
| Streaming/history | No replay on deltas, pagination or returning to history; stable old-message reading | Very large histories and attachment-loading layout stability |
| Message actions/menu | Anchored 200 ms menu expansion/fade, 200 ms dismissal, inert closing snapshot, keyboard navigation and rapid reopening | Every context-menu placement and reaction animation comparison |
| Search bar | 200 ms height transition and collapse, focus returns in English and Chinese | Comparative layout-shift review during active search |
| Selection controls | Animated toolbar, circular selected indicators, existing batch actions | Full selection/unselection transition review |
| Reply strip | Height/opacity transition and collapse; private/group source navigation, return-to-reply, persisted private/group selected ranges, exact source text highlights, cross-conversation attribution/return links and real sender labels | Cross-conversation text references verified; media transfer and broader selected-text gestures remain |
| Input/formatting/emoji | Focus and press states, anchored emoji menu, composer growth on text and width changes, attachment entry, file upload progress/cancel/retry | Exit choreography for individual attachments and richer emoji inventory |
| Shared-content drawer | Appearance/dismissal, tab indicators, search focus, focus restoration, preserved closing scroll position and existing source navigation | Content changes, loading skeletons and full visual comparison |
| Employee profile | Appearance/dismissal, focus containment/restoration, content links | Avatar-to-profile morph and profile detail polish |
| Group/forward dialogs | Independent backdrop/card motion, dismissal, rapid interaction safety, retained authenticated actions | Complete state-by-state comparative review |
| Media viewer | Albums, source transitions, continuous loaded-media navigation, bounded thumbnails, fit/zoom/pan, keyboard/touch controls, retry and exact-byte Web download | Historical paging implemented; native physical gestures and frame-by-frame reference comparison |
| Reduced motion | New animations suppressed; active finite animations finish and release listeners; no retained interactive snapshots | Broader OS/platform acceptance |
| Accessibility | Focus restoration, inert/hidden closing snapshots, keyboard image navigation, localized controls | Full assistive-technology and touch-target audit |

## Evidence and boundaries

`Infra/src/test/message-components-web-test.mjs` records actual Web Animations API calls and verifies menu interruption, drawer/dialog dismissal, preserved scrolled drawer contents, contact reordering, toolbar cleanup, source-linked image transitions, keyboard/pointer zoom/pan, unchanged application zoom, original download bytes, bilingual focus return, Chinese mobile media layout and reduced motion.

Evidence is written to `.aexus/artifacts/message-components/`, including screenshots, `interactions.webm` and `verification.json`. `Infra/src/test/message-surface-web-test.mjs` remains responsible for bubble arrival/history/scroll behavior. Native hidden-window regression tests cover the shared desktop behavior. All fixtures use isolated state and deterministic local protocols; no billed model calls are used.

Closing snapshots contain no active React handlers, are inert and hidden from accessibility, and are removed when their finite transition ends. They never rewrite message state or execute an operation. The real component closes immediately so focus and navigation can recover promptly.

Windows/Linux rendering, exact native spring matching, voice/video protocols and the remaining commercial-chat functionality remain unverified. The goal stays active.

During candidate verification, a hover-only row action became unreachable after animated pinning. Row actions now stay visible and clickable while timestamps retain their own space. The regression is covered by both the hidden desktop Messenger workflow and the component browser test. The hidden desktop Messages suite also verifies gallery zoom shortcuts, fit, return focus, and unchanged application zoom.

The native gallery shortcut check caught an application-level zoom handler running before the gallery handler. The application now defers zoom keys while the image viewer is open; both native desktop and browser tests use the real platform modifier shortcut and assert that the Core page-zoom preference stays unchanged.

Installed macOS acceptance passed for this iteration (version 0.52.1, ASAR SHA-256 `70b9c926b47430be91dbd09a08197c2bd84c467a26e04eec0c36fde9460b5dab`). The project installer preserved existing user-state JSON hashes. Installed hidden Messages and language workflows and portable CLI startup/restart passed. The real app was already stopped and remains stopped. The whole parity goal is still active.

File/media iteration adds compact file cards, type/size labels, native/browser downloads,
conversation-scoped draft cards, bounded upload progress, cancel/retry states, group
photos and Files/Media content tabs. Draft and transfer strips reuse the existing finite
motion and reduced-motion policy. Chinese 390px and desktop screenshots were inspected
in `.aexus/artifacts/message-attachments/`. Native and browser functional acceptance passed;
exact Telegram timing/curve comparison and exhaustive component states remain open.

## Gallery and albums — 2026-10-01

The gallery now navigates the ordered public images loaded in the current conversation
or shared-content panel. A snapshot keeps new incoming content from shifting the selected
index. Initially hidden messages are excluded. Group, private, draft and shared-content
images retain their existing scoped read APIs. A viewer caches at most seven nearby
originals; old entries are released as the window moves and on close. This bounds the
viewer cache, not the entire transcript's existing thumbnail memory.

Albums have tested 2/3/4/5/8/16-image layouts; a five-image collection with a portrait first
image preserves a tall lead cell. Bubble width follows the album so captions wrap to the
media surface. The viewer adds position, caption, previous/next controls, a seven-item
thumbnail strip, keyboard navigation, horizontal wheel navigation and real touch swipe,
pinch and vertical dismissal. Zoomed arrow keys pan instead of changing the image.
Loading thumbnails remain keyboard accessible; missing previews have a retry action.
Closing scrolls to the current source and restores focus there through dialog cleanup.

The pinned [Telegram macOS gallery controller](https://github.com/overtake/TelegramSwift/blob/579cebbf0c01fd41b712eff3647fa7f69db9665d/Telegram-Mac/GalleryPageController.swift)
remains the interaction reference for paging, thumbnail controls and separate magnified
interaction. Implementation and fixture art are original. Our source transition is 250 ms;
directional entry/exit is 220/180 ms with reduced-motion suppression. Exact native spring
and frame-by-frame equality are not proven by those durations.

`Infra/src/test/message-gallery-ui-test.mjs` runs in headless Chromium and hidden Electron (including
`--desktop`). It checks a 38-image sequence, bounded filmstrip, boundary controls, frozen
order, CLI-driven hide synchronization, source/focus return, retry, nested search/library
Escape behavior, bilingual layouts and reduced motion. Browser acceptance additionally
uses Chromium touch input for swipe/pinch/dismissal and checks directional WAAPI frames,
selected original download bytes and portrait/landscape mobile geometry. Evidence is in
`.aexus/artifacts/message-gallery/`.

The native test found that Messenger changes emitted directly on the Web event bus did
not reach the desktop. Messenger now uses the existing runtime publish path, matching
Chat and Plan, so CLI/browser changes refresh desktop organization. No permission or
execution behavior was changed. The gallery focus test also caught a disabled loading
thumbnail and a late focus restoration race; both are corrected without timing retries.

Full-history paging beyond the currently loaded media, native physical touch/trackpad
acceptance, media playback, broader accessibility and comparative visual acceptance remain
open. This iteration does not establish full Telegram parity.

## Historical gallery and scale correctness — 2026-10-01

The gallery now uses the authenticated `messenger.gallery` projection to page complete
public image histories, including sources outside the current transcript/shared-content
page. Metadata windows contain 40 references (API maximum 100); nearby original bytes
retain the separate seven-image cache. Stable source cursors and a returned boundary keep
new arrivals from moving the opened sequence. Current hidden/query/author filters apply,
and shared-content galleries preserve their newest-first order and album order.

Already displayed images remain responsive while initial metadata is pending. A late
response preserves the current selected source rather than resetting the first image.
Closing invalidates outstanding metadata responses; late responses cannot finish a close
animation early or switch its image. History failures keep the current photo with a retry
action. Source conversation names and an explicit original-message action provide context.

A real 125% browser zoom test found a 101.875 px source-size error. Viewport, thumbnail and
pointer coordinates now use one CSS-page-scale conversion. Opening and closing projections
and drag distance pass at 80%, 100% and 125%. Gallery exit snapshots use the same conversion.
This is geometric acceptance in Chromium, not proof of native physical gesture parity.

Changing a shared-media query previously allowed clicking stale rows before the new result
set arrived, opening then unmounting the wrong gallery. Rows are now inert while their query
and result scope differ; same-query background refreshes retain usability. Failed searches
have an explicit retry. Narrow gallery headers now fit long counters and source metadata;
mobile header controls have 44 px targets and remain within the viewport.

Evidence: `Infra/src/test/gallery-history-core-test.mjs`, `Infra/src/test/gallery-history-ui-test.mjs` (Web and
hidden desktop), and `Infra/src/test/gallery-zoom-web-test.mjs`; captures and reports are under
`.aexus/artifacts/gallery-history/`. UI coverage includes old sources beyond 100 rendered group
messages and 40 shared-content results, both paging directions, first/last navigation,
new-arrival boundaries, source location, delayed reads, retries, closing motion and Chinese
mobile layout. The geometry test measures rendered transforms against actual thumbnails.
Media playback, full comparative spring/visual acceptance, native physical gestures and
very-large-history performance remain open.

## Audio/video files — 2026-10-01

Audio/video attachments now have real light playback surfaces in private/group messages,
unsent drafts and shared content. Controls use actual media state: play/pause, buffered and
played progress, seeking, duration, mute/volume, playback speed and video fullscreen.
Visible previews read metadata without autoplay; paused offscreen previews release their
grant and retain a local resume point. Playing another message pauses the earlier one.
Unmounting a player captures and clears its media element as well as releasing its grant,
so buffered playback cannot outlive conversation navigation. Audio and video keep separate
speed preferences; volume/mute follow the user's current in-app choice.

The Media content tab includes images/videos; Audio selects audio files and Files remains
the full attachment list. Labels, error/retry paths and keyboard controls are localized.
Original download remains available. Unsupported media produces a real error, not a fake
play state. The preview surface stays light while waiting for the first decoded frame.

Core issues file-scoped, client-owned, eight-hour grants. HTTP uses authenticated single
byte-range streaming; desktop uses a CSP-limited Electron stream protocol backed by the
same Core reads. The implementation follows the documented [Electron stream protocol](https://www.electronjs.org/docs/latest/api/protocol)
and [HTTP range behavior](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests).
The scheme does not bypass CSP or expose arbitrary paths. Core rechecks workspace identity,
file size/version and ownership; cookie playback also checks its issuing Web session.

`Infra/src/test/media-playback-core-test.mjs` verifies exact range bytes, suffix/open ranges, HEAD,
416, bounded 256 KiB reads, client/session denial, header sniffing, traversal, changed files,
removed conversations, explicit release and logout. An active 1 GiB sparse WAV stream is
cut short on logout. `Infra/src/test/media-playback-ui-test.mjs` exercises original silent WAV,
VP9/WebM, H264/MP4, MP3 and AAC/M4A files in headless Chrome and hidden Electron. It checks
real time progression and decoding, seek/volume/rate, draft preview without sending,
single active playback, paused-preview resume, conversation teardown, group playback,
shared filters, source recovery/retry and Chinese layout. Web additionally enters/exits
real HTML fullscreen. Native OS fullscreen was not exercised because tests stay hidden.

Evidence: `.aexus/artifacts/media-playback/`. The fixtures are original generated geometry and
silence, with no device recordings, provider calls or FFmpeg runtime added to the app.
Other browser/OS codec combinations, remote-host performance, recording/transcription,
background audio controls/queues, video gallery choreography and the remaining complete
visual/animation comparison are still open.

## Background audio and queue — 2026-10-01

Posted audio now uses one application-owned media element. Inline controls and a light
mini-player share it across conversation and Company/Plan navigation. Draft previews and
video remain local; a common play-intent signal prevents older asynchronous source reads
from stealing playback from a newer choice. Each file still uses the existing authenticated,
version-checked Core media grant. Queueing itself never sends or runs a task.

The mini-player provides play/pause, previous/next, seek, speed, repeat off/all/one, mute,
queue access and exact message navigation. The queue supports explicit add/play-next,
deduplication, keyboard buttons and drag reorder, removal and clear. Reordering keeps the
current source and position. Natural completion advances only through the chosen queue.
The queue lives in the current window/tab; reload/quit starts silent rather than restoring
or autoplaying it. Media Session metadata/actions are registered when audio owns playback;
physical OS media keys still require device-specific acceptance.

The queue reuses finite keyed-row motion and the existing surface/focus policy. Visual QA
caught a clipped dropdown inherited from strip overflow and a dark native range track;
the panel now escapes the strip correctly and ranges use explicit light styling. Tests
check hit-testing, not just DOM visibility. The audio rail occupies normal layout space;
conversation/workspace overlays account for its height.

The workflow exposed an unrelated but triggered view bug: changing a selected private
conversation to Plan briefly mounted the workspace and opened a PTY. The conversation
surface now renders only in its valid view kind. The new workflow verifies no extra PTY
or model turn. Logout additionally stops buffered media and clears queue/system metadata,
even though WebGate retains the application behind its login overlay.

`Infra/src/test/background-audio-ui-test.mjs` covers source continuity across conversations/Plan,
shared controls, queue add/next, drag/buttons, natural advance/repeat, exact message return,
Chinese responsive layout and stop/release in headless Web and hidden Electron. Web also
holds source requests to verify latest-choice/stop behavior, invokes registered Media
Session actions, and signs out while audio is buffered. Evidence: `.aexus/artifacts/background-audio/`.
Full queue persistence, recording/transcription/calls, richer playback choreography and
complete comparative accessibility/visual/motion acceptance remain open.

## Color schemes, expression and capture — 2026-10-01

The three views now share ten named color schemes and a custom color through the existing
Core preferences path. The chooser is organized by color; previous theme IDs remain readable
for compatibility. Backdrop, card surfaces, selected states, controls, room materials and
message bubbles use the same theme tokens. Custom colors retain the original selected value;
accent text is darkened only as needed for 4.5:1 contrast against white cards. No new theme
store, window-only preference authority or engine configuration was introduced.

Message uses a stronger patterned backdrop, floating header, saturated selected conversation,
larger text and original round-stroke SVG controls. The original wallpaper contains twelve
motif groups; its bottom fade preserves toolbar readability. The six Message stylesheets
retain a net byte reduction from their 123,386-byte starting point after removing 337
superseded declarations, 85 empty rules and obsolete selectors. Plan removes its full-height
white wrapper and keeps pagination adjacent to small result sets; dense tables still scroll.
Common fixes short-window menu clipping, disclosure visibility and editor focus return.
A real three-view capture caught and corrected legacy dark floor defaults overriding the new
room colors. User-defined room materials remain independent.

The emoji picker now loads a local 1,914-entry bilingual Unicode catalog only when opened.
It supports categories, English/Chinese search, skin tones, recent choices, bounded result
pages and keyboard navigation. Ordinary Unicode enters the existing conversation draft;
no alternative message format is stored. Data is generated from pinned Emojibase 17.0.0
(MIT; see THIRD_PARTY_NOTICES.md); system emoji fonts render the glyphs. This does not claim
Telegram's animated/custom emoji artwork or cross-platform font equality. One to three
complete emoji graphemes get larger transparent bubbles, including joined emoji and flags.
The generic menu now stays inside a resized viewport and preserves native input navigation.

Voice capture starts only after the explicit record action. A small AudioWorklet collects
mono PCM, posts real waveform levels and enforces a ten-minute bound. Pause immediately
releases input tracks; resume requests a new stream. Finish releases the microphone and
creates a WAV for review; adding it to the draft uses the existing upload and send pipeline.
Permission denial, late permission completion after cancellation, hidden-page pause and
teardown release the capture. No new Core execution or file authority bypass was added.

Acceptance: `theme-preferences-test.mjs`, `theme-picker-ui-test.mjs`, `theme-core-test.mjs`,
`color-schemes-ui-test.mjs`, `common-visual-test.mjs`, `voice-recording-test.mjs` and
`message-expression-ui-test.mjs`, together with existing Plan/Team-view, surface/component,
audio and server regressions. The capture tests feed a synthetic signal into the real worklet;
they never access a physical microphone or make billed model calls. Physical microphone/OS
consent, other operating systems, full comparative spring behavior and complete commercial
messaging parity remain unverified. Evidence: `.aexus/artifacts/color-schemes/`,
`.aexus/artifacts/message-expression/` and `.aexus/artifacts/common-visual/`. The overall goal remains active.

Color/expression iteration installed as macOS 0.52.1 (ASAR SHA-256 `2e213c35a26af41885d79499a21203f7fe077fe5b61fc741d1d48a9af48fc1e8`). Installed hidden color/expression and portable CLI settings/media/restart acceptance passed. The real company remains 7 employees / 4 Teams; only the requested color preference (White → Violet) and its store revision changed, with other preferences preserved. The real application is stopped after installation; reopen normally to see the new palette. The overall goal stays active.

## Reading boundaries, expression and playback isolation — 2026-10-01

The group reader captures the actual read sequence through the existing `chat.get` projection
when opening history. A stable unread divider starts a new bubble group and opens the loaded
unread section without acknowledging its unseen tail. If earlier unread messages are outside
the current100-message page, an explicit older-unread action uses normal bounded history
paging. The divider remains fixed for the visit after read acknowledgements, preserving the
reading position. Reopening a read conversation removes it. Private conversations mark the
actual latest unread reply; personal unread reminders never fabricate Core receipts or counts.

Accepted reaction mutations now produce one finite flight to the rendered reaction pill and
settle. Emoji-only messages offer keyboard-accessible local replay. Failed/pending mutations,
initial history, reduced-motion settings and hidden/unmounted surfaces do not replay these
effects. Motion uses the existing lifecycle helper and normal page-scale conversion.

Voice capture now checks request ownership after each asynchronous setup step. Superseded
setup cannot stop a resumed stream. Hidden/disabled drafts pause without losing samples;
conversation change, logout and teardown clear capture and previews. Processor failures retain
already-delivered PCM and show an explicit error. Inert exit snapshots no longer fetch released
media grants or revoked blob URLs. Tests use synthetic signals, including a real failing
AudioWorklet in a source fixture; physical microphone/OS consent remains untested.

Audio and video now share presentation controls while their existing playback owners remain
separate. Inactive audio metadata recovers after an initially active card becomes idle, and
stale source responses release their grants. A measured development React Profiler fixture
with50inactive cards and1playing card found700unnecessary inactive-card commits across14native
progress events. Stable controller context and per-track subscriptions reduce those inactive
commits to0, while the active card and dock continue updating. Global volume/rate/queue/switch
changes still reach affected cards. This is commit-isolation evidence, not a production FPS
claim. No second player, queue store or Core authority path was added.

Evidence: `Infra/src/test/message-reading-ui-test.mjs`, `Infra/src/test/message-expression-motion-test.mjs`,
`Infra/src/test/media-controls-ui-test.mjs`, extended voice/expression acceptance, and
`.aexus/artifacts/audio-profile/{before,after}.json`. Full integrated and installed acceptance for
this iteration is recorded separately once complete. Overall parity remains unproven.

The employee/canvas language audit also replaced untranslated static location, environment,
status and accessibility copy. Long English badge labels now wrap within their existing columns;
source geometry tests keep native cloud labels below the badge without changing employee frames.
Real names, paths, error text and location protocol values remain untouched. The expanded emoji
catalog preserves the old36pickers' bilingual search names as build-time aliases; the installed
language workflow caught the missing Chinese launch synonym and now checks it explicitly.

Reading/playback iteration installed as macOS 0.52.2 (ASAR SHA-256 `507cbbe6fa2f462751b6f076771bc881204f97eb0d9a2216f3a0b48dfcdea44e`). Installed hidden reading, expanded synthetic voice lifecycle, audio queue, bilingual UI and portable CLI media/restart passed. Project installer preserved the two real root-state JSON hashes (7 employees / 4 Teams). Evidence: `.aexus/artifacts/message-reading/verification.json`. Physical devices and complete Telegram/WhatsApp parity remain unproven; the goal stays active.


## Conversation delivery and administration

MessageReceipt is shared by private turns and group message footers. It consumes authoritative
metadata only, with finite milestone motion and a keyboard-accessible detail dialog. The private
transport adapters correlate receipts to a native turn/request identifier; the central transcript
store persists first-write timestamps. Group history remains the owner of routed recipient receipts.
No renderer timer guesses when an employee has read a message.

ChatMuteControls presents the existing chat.mute Core operation inside GroupEditor. It has one
nearest-expiry timer, shows effective all/member status, and uses the returned authoritative group
revision immediately. While a mute mutation is pending, group saving is disabled. A concurrent
nonconfiguration revision can be retried once after verifying the original name and membership;
actual configuration conflicts preserve the user's draft and reject overwriting another client.

EditMessageComposer owns only an edit buffer and expected revision. GroupConversation restores the
normal draft after the edit commits. Existing refresh queues synchronize corrected history,
search/library metadata, gallery captions and unsent cross-conversation references. Already-sent
references remain snapshots. MessageListAvatar reuses existing original sprite atlases and portrait
crops, with one shared intersection observer and a window-level motion preference gate.

Validation is separated: group-delivery-core tests permissions, persistence and acknowledgment
semantics; outbound-receipts tests four deterministic adapters; group-delivery-ui tests real Core
and renderer together in disposable hidden/headless state; message-sidebar-visual measures the
source list without claiming native production performance. No paid provider or real employee
state is required by these suites. See MESSAGE_PARITY.md and the corresponding artifacts.


Before formal group/channel work, the same native session performs a short internal reading
turn. The employee explicitly calls the bound `agents_company_discussion_post` native tool or
authenticated post API; ordinary text, JSON, thoughts and final output are never publication
or read-confirmation requests. Missing or rejected acknowledgments and interruption cannot
release work. The normal queue remains available, with a
derived “Confirming message…” status instead of prematurely reporting “Working…”. The
original input and task identity are written once, and hidden acknowledgment output does
not become private transcript text. The default receipt is null. Public text is a deliberate
human-facing reply; a current mute or silent-only policy rejects visible submissions and
requires an explicit null receipt. The response stage does not repeat a recorded acknowledgment.

Source acceptance: Infra/src/test/group-ack-fixture-test.mjs, Infra/src/test/group-ack-lifecycle-test.mjs and
Infra/src/test/group-ack-drivers-test.mjs. Local Codex 0.156.1 native probes additionally verify ordinary
tool isolation and same-thread environment restoration both on a live connection and after
process restart. The special /review and /compact operations are refused following a failed
ACK until an ordinary message restores the workspace; a real probe found that otherwise a
review could report completion without workspace tools. The reading/work tool catalog switches
by unsubscribing an idle native actor and resuming the same thread. An active native background
terminal rejects the reading attempt without stopping the terminal or recording a receipt;
retry after it finishes or the user explicitly stops it. No process restart is forced. These
native probes are local; they do not establish actual remote SSH execution coverage.


Group bubbles keep recipient work details in MessageReceipt's existing detail dialog. They
no longer render one task card per recipient beneath every broadcast. The same detail rows
show task status/errors and open existing private conversations; missing/deleting employees
remain unavailable. Failed/interrupted work has a compact warning on the bubble's receipt
without changing its factual delivery/read milestone. This removes duplicate controls and
keeps broadcast bubble density independent of recipient count.
