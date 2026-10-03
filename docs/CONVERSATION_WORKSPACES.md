# Group and channel workspaces

Groups and channels have a persistent workspace on the Core host. The workspace is independent of every employee's existing personal workspace, native session, company Team and execution host.

## Location and identity

The current path is returned by `conversation.workspace`; do not reconstruct it from display names. New workspaces use:

```text
APP_HOME/conversation-workspaces/group/CONVERSATION_ID/Group name/
APP_HOME/conversation-workspaces/channel/CONVERSATION_ID/Channel name/
    user-uploaded-image.png
    user-uploaded-file.txt
    Alice/
    Bob/
```

The ID parent separates conversations with the same name. Current members have named child folders. Duplicate or filesystem-unsafe names receive a safe, unique directory name. `members[].directory` and `memberDirectory` are authoritative. Existing folder names remain stable after display-name changes so active files and native working paths are not moved. Leaving, archiving or deleting a conversation does not delete its workspace files. Removed members lose Core API access; their outputs remain for current members.

```sh
# Authenticated employee: discover your group and channel workspaces.
agents conversation workspaces --json
agents conversation workspace group:GROUP_ID --json
agents conversation workspace channel:CHANNEL_ID --json
# User: inspect the member folder belonging to a specific employee.
agents conversation workspace group:GROUP_ID --employee EMPLOYEE_ID --json
```

The descriptor includes `root`, `folderName`, `members`, and, for a selected employee, `memberDirectory`, `memberPath`, `personalWorkspace` and `nativeAccess`. All paths describe the Core or employee execution host, never the browser's local filesystem. Remote employees should use these APIs and explicit copies; a Core path is not a remote-local path.

## Member access

A current group member or channel administrator may read shared files, including user originals and other members' working files. Agent writes, renames, deletes, restoration and copy destinations are limited to that Agent's own named subfolder. The operator may manage user files. No company management role, creation line or archive state substitutes for membership. Copying to another employee's private workspace is not allowed by the member copy API.

User originals at the conversation root are read-only to Agents through the Core APIs. This is application authorization, not an operating-system sandbox for arbitrary shell processes running as the same trusted macOS account. Native tools keep their existing access/approval mode. No engine is granted a broader execution sandbox by joining a conversation.

```sh
agents conversation file group:GROUP_ID --operation list --json
agents conversation file group:GROUP_ID --operation read --path brief.txt --json
agents conversation file group:GROUP_ID --operation image --path reference.png --json
agents conversation file group:GROUP_ID --operation write --path 'Alice/result.md' --content 'Review completed.' --create --json
```

Use the returned file `hash` to update an existing text file. Text writes are limited to 4 MiB; `chunk` reads bounded binary data. Absolute paths, parent traversal, symlinks and internal transfer/trash paths are rejected. Managed member-root directories cannot be renamed or removed through this API. Each member's trash and restore operate inside that member directory.

## Explicit copies and work location

The employee chooses its named conversation folder or its existing personal Workspace. The recommended location for work originating in a group is the named member folder. Copying to the personal Workspace remains available.

```sh
# Copy a root original to your named folder, without modifying the original.
agents conversation copy --from '{"conversation":"group:GROUP_ID","path":"@workspace/brief.txt"}' --to '{"conversation":"group:GROUP_ID","path":"Alice"}' --json
# Or copy it to your original personal Workspace.
agents conversation copy --from '{"conversation":"group:GROUP_ID","path":"@workspace/brief.txt"}' --to '{"employee":"self","path":"."}' --json
# Copy a result back from your own personal Workspace.
agents conversation copy --from '{"employee":"self","path":"result.md"}' --to '{"conversation":"group:GROUP_ID","path":"Alice"}' --json
agents conversation transfer TRANSFER_ID --json
agents conversation transfer TRANSFER_ID --cancel --json
```

A destination is an existing directory. Transfers preserve source files, never overwrite an existing target, and recheck membership and workspace identity during IO. A queued/running transfer is not a completed copy. An interrupted Core does not silently replay the transfer. `conversation.transfer` belongs to its authenticated initiating identity.

## User attachments and task routing

A message may contain text, up to 16 combined images/files, or attachments alone. New user uploads are committed directly under the conversation root. Simultaneous duplicate filenames receive suffixes such as `brief (2).txt`. Completed uploads are readable by current members immediately; pressing Send notifies them. Upload staging remains hidden. The system does not overwrite another upload or a member folder. Private-chat uploads retain their existing storage behavior.

Published attachments keep stable `@workspace/relative-path` references and file metadata in the group/channel message. The visible message still displays the user's original text, image album and file cards. Files persist independently of channel news retention.

Each addressed employee receives one **text-only task** containing the original user text plus a structured list of uploaded filenames, references, byte sizes and types. No image/file array is added to the employee's private transcript, no attachment bytes are automatically sent to its native model, and no automatic employee-workspace copy occurs. Non-addressed recipients keep the existing context-only behavior. An employee reads or copies files explicitly when needed. Legacy group attachments remain readable through their existing `chat.file` references; this feature does not move or delete old attachment storage.

```sh
# User or UI: begin one upload. Complete it with the existing transfer upload protocol.
agents messenger upload-begin group:GROUP_ID --name brief.txt --bytes 120 --json
# After successful upload, use the returned destination references.
agents chat send GROUP_ID --text 'Review these materials.' --files '["@workspace/brief.txt"]' --images '["@workspace/reference.png"]' --mentions all --json
agents channel message-send CHANNEL_ID --text 'Review these materials.' --files '["@workspace/brief.txt"]' --images '["@workspace/reference.png"]' --json
```

Creating/importing a file directly in the workspace does not send a chat message. Explicit publication remains necessary. Group/channel work still does not create a private unread badge; real private unread and group/channel reading remain independent.

## Interface

Only Company displays `Add Team` and `Add Employee`, with readable labels at compact widths. Messages has an explicit **Archived chats** entry that combines private employees, groups and channels. Each archived row can be restored directly, and the existing context-menu/bulk operations remain available. Archiving does not change file access, group membership or message read receipts.

Both group and channel headers expose **Shared workspace**. The dialog opens the root or a chosen named member folder using the existing file browser. A Company employee workbench exposes **Employee work folder** to switch between personal files and joined conversation folders; it does not change that employee's configured working directory, native identity or terminal host. The same business operations are available through CLI/API.
