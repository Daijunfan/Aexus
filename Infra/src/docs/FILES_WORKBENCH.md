# Files and assets workbench

Files and Assets are two projections of the existing workspaces. They do not copy,
move or rename working files. Use the live Team/employee/conversation labels rather
than reconstructing a directory path from the visible name.

## Find a workspace

Use All spaces / Company / Messages / Plan, then expand a folder. Company lists
Shared and each Team workspace with its employee workspaces. Messages lists groups
and channels with user originals, first-level member folders and published attachments.
Plan exposes its existing export directory. Structural view nodes have no OS directory.

The filter control supports Team, employee, conversation and storage host. Employee choices carry
both the display name and Team, with a stable ID behind the selection. Employee filters
include personal files, their member folders and related shared originals; other members'
files are not attributed to them. Team and employee filters also work across views.

Search switches to Assets and accepts names, people and Team labels. The asset list
supports document/image/audio/video/code/archive/other, local/remote/cloud storage,
and name/modified/size order. Folder badges count descendant files in the selected
scope. While indexing, an ellipsis is shown instead of an unverified zero.

## File actions and Core contracts

| UI action | Existing authenticated Core / CLI operation |
| --- | --- |
| Browse views and filter ownership | assets.tree / assets.children |
| Search, sort, page and show hidden files | assets.search |
| Folder icon / Show in folder | assets.locate, then assets.file with list/read/image |
| Create file or directory | assets.file with write/create or mkdir |
| Edit and Save, including Back while dirty | assets.file write with original hash |
| Reload after a conflicting edit | assets.file read/image |
| Rename, Trash and Undo | assets.file move/trash/restore |
| Drag, Copy and Paste between workspaces | transfer.start with original from/to scopes |
| Browser upload | transfer.upload-begin/chunk/commit |
| Download | transfer.download-info / transfer.download-save and the authenticated client download stream |
| Open a cloud-only published document | channel.file-download/status, then same channel workspace |
| Show a cloud-only document's folder | assets.locate only; no download is implied |
| Open in Finder (native, physical local item) | workspace.reveal |
| Resize the workbench | settings.set assetDrawerWidth |
| English folder naming preview / apply | assets.naming (explicit confirmation only) |

The original clipboard and text-selection shortcuts remain client behavior. Their file
copy effects use the same transfer command as CLI. Virtual folders, Web clients and
remote/cloud items do not advertise an unsupported Finder action.

## CLI examples

```sh
agents assets tree --view Messages --employee EMPLOYEE_ID --json
agents assets children 'group:GROUP_ID' --employee EMPLOYEE_ID --limit 100 --json
agents assets search --team 'Research team' --kind document --sort modified --json
agents assets search --employee EMPLOYEE_ID --view Messages --storage local --json
agents assets locate 'WORKSPACE_ID|ENCODED_RELATIVE_PATH' --json
agents assets file shared --operation read --path 'Documents/brief.md' --json
```

Use the IDs and location.asset/path returned by Core. In particular, published channel
image paths contain postId/mediaId. Legacy media-ID-only references are resolved for
compatibility. The UI keeps the original filename even when the stored key has no extension.

## Persistence and errors

An invalid or deleted reference reports that the file/workspace no longer exists and
provides refresh/retry. A folder request failure is displayed on that folder, not as an
empty result. Same-scope refresh keeps current rows until replacements are available.
Late searches or file reads cannot overwrite a newer selection or reopen a dismissed panel.
Save then Back waits for the same in-flight write. Hash conflicts preserve the local draft
and disk content until the user explicitly reloads.

User actions retain the existing file-authority checks. Asset browsing is human-only;
ordinary members cannot overwrite conversation-root originals or other members' folders.
Separate authorized Secretary rules continue to be owned by the conversation API.
Published attachments stay read-only, and copying preserves the source. Trusted shell
OS access is independent of Core API authorization.

## Validation

Focused tests: assets-published-reference, asset-workbench-core, asset-workbench-ui
(with optional --desktop), asset-workbench-recovery-ui; original asset tree/transfer,
Finder, naming, performance and channel-document tests remain in the suite.
All tests use disposable workspaces; no production files or paid model calls are needed.

## Tree and icon library

Files retains the compact folder tree. Assets opens a large-icon library over the same
canonical workspaces. The expand button provides a larger window inside the app, without
switching Company, Messages or Plan. Single-click selects; double-click or Enter opens.
Tree folders also expand on click. Secondary click (including a trackpad two-finger click),
Shift+F10 and the ellipsis expose the same actions. Command/Ctrl+I opens Get Info.

File actions reuse the existing Core: open/locate, download, copy/paste, new file/folder,
rename, confirmed Trash and Undo. Protected employee roots cannot be renamed/removed;
read-only published originals cannot be edited. Save/conflict behavior remains in the
original file editor. Library pagination is bounded and changing filters starts at page 1.
The tree/gallery choice and icon size are remembered per client. Expanding/collapsing keeps the current folder.

At the top-level library, an employee filter returns that employee's Company and Message
member workspace folders. Team and conversation filters retain their real scope. Search
also finds nested folder names and files and includes relevant shared originals, without
attributing peers' files to the selected employee. Filters can combine view, Team, employee,
conversation, storage host, file type and local/remote/cloud storage. Results have stable
IDs and name/modified/size ordering. Display names are not constructed filesystem paths.

## Storage and Get Info

Rows/cards show Local or the registered host name, its OS/distribution icon and a cloud-only
indicator when applicable. Employee workspaces display their real portrait. A local employee
in a remote Team stays Local; channel originals may use a different host from their local
conversation workspace. Listing these identities does not probe host health or invent an
online indicator. Normal rows, tooltips and error summaries hide physical filesystem paths.

`assets.info {id}` is an explicit information operation. It returns logical ownership,
actual canonical physical path, host name/address, size/timestamps where available, access
and verification state. Passwords, tokens and private key paths are never returned.
Cloud-only document info uses retained metadata without downloading the original or opening
an SSH connection. Virtual collections have no physical path. A failed host check remains
metadata with an explanation; it is not reported as successful verification.

## Derived covers

`assets.preview {id}` reuses Margin Reader's pure cover-rendering worker for local PDF,
HTML, Markdown and text documents. It does not register a new Reader document or move files.
Small validated PNG/JPEG/GIF/WebP files use the existing image read. Local source size is
limited to 64 MiB, direct-image output to 1 MiB, worker concurrency to 2 and runtime to 15 s.
The worker cache is limited to 72 entries/12 MiB and the client cache to 60 entries/10 MiB.
Requests are lazy and version-checked; unsupported formats return a type illustration.
HTML Infra/src/tooling/network resources are not executed. Remote originals are not automatically
fetched for covers; cloud posts may use already cached thumbnails. Manual Refresh rechecks
covers; ordinary background updates reuse unchanged versions.

## CLI contracts

| Capability | Core API |
| --- | --- |
| Library/shelves/folder search | assets.browse |
| Explicit location/details | assets.info |
| Derived cover | assets.preview |

```sh
agents assets browse --employee EMPLOYEE_ID --json
agents assets browse --host HOST_ID --query report --json
agents assets browse --query notes --kind folder --json
agents assets browse --root 'WORKSPACE_ID|ENCODED_FOLDER' --sort modified --json
agents assets info 'WORKSPACE_ID|ENCODED_PATH' --json
agents assets preview 'WORKSPACE_ID|ENCODED_PATH' --json
```

`assets.browse` returns entries, total, nextOffset, parent, breadcrumbs, indexing and errors;
limit is 1–200. These are user-only asset APIs. Agent file permissions and workspace.catalog
are unchanged. Test with files-library-core and files-library-ui / --desktop, plus existing
asset/workspace/transfer regressions, using disposable Core and deterministic protocols.
