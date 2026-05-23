# ClickUp Plugin for KB Labs

Manage ClickUp workspaces, spaces, folders, lists, and tasks directly from your terminal.

## Installation

```bash
kb marketplace install kb:kirill/@kb-labs/clickup-entry
```

## Configuration

Set your ClickUp API token:

```bash
export CLICKUP_API_TOKEN=your_token_here
export CLICKUP_TEAM_ID=your_team_id
```

Get your API token from **ClickUp → Settings → Apps → API Token**.

## Commands

### Tasks

| Command | Description |
|---|---|
| `kb clickup:task-get` | Get task details by ID |
| `kb clickup:task-create` | Create a new task |
| `kb clickup:task-update` | Update task fields |
| `kb clickup:task-delete` | Delete a task |
| `kb clickup:task-search` | Search tasks by query |
| `kb clickup:task-comment-add` | Add a comment to a task |
| `kb clickup:task-comment-list` | List task comments |

### Lists & Folders

| Command | Description |
|---|---|
| `kb clickup:list-tasks` | List tasks in a list |
| `kb clickup:list-create` | Create a new list |
| `kb clickup:list-update` | Update list settings |
| `kb clickup:list-delete` | Delete a list |
| `kb clickup:list-statuses` | Get statuses for a list |
| `kb clickup:folder-create` | Create a folder |
| `kb clickup:folder-update` | Update a folder |
| `kb clickup:folder-delete` | Delete a folder |

### Spaces & Workspace

| Command | Description |
|---|---|
| `kb clickup:space-create` | Create a space |
| `kb clickup:space-update` | Update a space |
| `kb clickup:space-delete` | Delete a space |
| `kb clickup:workspace` | Show workspace info |

## Example

```bash
# List tasks in a list
kb clickup:list-tasks --list-id 123456

# Create a task
kb clickup:task-create --list-id 123456 --name "Fix login bug" --priority high

# Search tasks
kb clickup:task-search --query "login" --team-id $CLICKUP_TEAM_ID
```
