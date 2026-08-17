# ClickUp Plugin for KB Labs

Manage ClickUp workspaces, spaces, folders, lists, and tasks directly from your terminal.

## Installation

```bash
kb marketplace install kb:kirill/@kb-labs/clickup-entry
```

## Configuration

Set your ClickUp API token:

```bash
export CLICKUP_API_KEY=your_token_here
export CLICKUP_TEAM_ID=your_team_id
```

Get your API token from **ClickUp → Settings → Apps → API Token**.

## Commands

### Tasks

| Command | Description |
|---|---|
| `kb clickup task get <taskId>` | Get task details by ID |
| `kb clickup task create --list <listId> --name "<name>"` | Create a new task |
| `kb clickup task update <taskId> --status "<status>"` | Update task fields |
| `kb clickup task delete <taskId> --yes` | Delete a task |
| `kb clickup task search "<query>"` | Search tasks by query |
| `kb clickup task comments add <taskId> --text "<text>"` | Add a comment to a task |
| `kb clickup task comments list <taskId>` | List task comments |

### Lists & Folders

| Command | Description |
|---|---|
| `kb clickup list tasks <listId>` | List tasks in a list |
| `kb clickup list create --folder <folderId> --name "<name>"` | Create a new list |
| `kb clickup list update <listId> --name "<name>"` | Update list settings |
| `kb clickup list delete <listId> --force` | Delete a list |
| `kb clickup list statuses <listId>` | Get statuses for a list |
| `kb clickup folder create --space <spaceId> --name "<name>"` | Create a folder |
| `kb clickup folder update <folderId> --name "<name>"` | Update a folder |
| `kb clickup folder delete <folderId> --force` | Delete a folder |

### Spaces & Workspace

| Command | Description |
|---|---|
| `kb clickup space create --name "<name>"` | Create a space |
| `kb clickup space update <spaceId> --name "<name>"` | Update a space |
| `kb clickup space delete <spaceId> --force` | Delete a space |
| `kb clickup workspace` | Show workspace info |

## Example

```bash
# Inspect the workspace and list tasks
kb clickup workspace --json
kb clickup list tasks 123456

# Create a task
kb clickup task create --list 123456 --name "Fix login bug" --priority 2

# Search tasks
kb clickup task search "login"
```
