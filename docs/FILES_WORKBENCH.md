# Files and assets workbench

Files and Assets are two projections of the existing workspaces. They do not copy,
move or rename working files. Use the live Team/employee/conversation labels rather
than reconstructing a directory path from the visible name.

## Find a workspace

Use All spaces / Company / Messages / Plan, then expand a folder. Company lists
Shared and each Team workspace with its employee workspaces. Messages lists groups
and channels with user originals, first-level member folders and published attachments.
Plan exposes its existing export directory. Structural view nodes have no OS directory.

The filter control supports Team, employee and conversation. Employee choices carry
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
