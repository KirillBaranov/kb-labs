import { cmd, group, mergeCliGroups, GET, POST, PATCH, DELETE, combinePermissions } from '@kb-labs/sdk';
import { CLICKUP_BASE_PATH, CLICKUP_ROUTES } from '@kb-labs/clickup-contracts';

const permissions = combinePermissions()
  .withEnv(['CLICKUP_API_KEY', 'CLICKUP_TEAM_ID'])
  .withNetwork({ fetch: ['api.clickup.com'] })
  .withQuotas({ timeoutMs: 30000, memoryMb: 128 })
  .build();

export const manifest = {
  schema: 'kb.plugin/3' as const,
  id: '@kb-labs/clickup',
  version: '0.1.0',

  display: {
    name: 'ClickUp',
    description: 'Manage ClickUp tasks, lists, and comments from CLI and REST API',
    tags: ['clickup', 'tasks', 'productivity'],
  },

  permissions,

  cli: mergeCliGroups(
    group({ path: 'clickup', describe: 'ClickUp task management', category: 'Workspace' }, [
      cmd('clickup workspace', './commands/workspace.js#default', 'Show full workspace hierarchy (spaces → folders → lists)')
        .read()
        .flags({
          json: { type: 'boolean', description: 'Output JSON (slim by default)' },
          full: { type: 'boolean', description: 'Output full raw JSON (requires --json)' },
        })
        .examples(['kb clickup workspace', 'kb clickup workspace --json', 'kb clickup workspace --json --full']),
    ]),

    group({ path: 'clickup task', describe: 'Task operations', category: 'Tasks' }, [
      cmd('clickup task search', './commands/task-search.js#default', 'Search tasks across the workspace')
        .read()
        .flags({
          list:     { type: 'string',  description: 'Filter by list ID' },
          status:   { type: 'string',  description: 'Filter by status (comma-separated)' },
          assignee: { type: 'string',  description: 'Filter by assignee user IDs (comma-separated)' },
          limit:    { type: 'number',  description: 'Max results', default: 20 },
          closed:   { type: 'boolean', description: 'Include closed tasks' },
          json:     { type: 'boolean', description: 'Output JSON (slim by default)' },
          full:     { type: 'boolean', description: 'Output full raw JSON (requires --json)' },
        })
        .examples(['kb clickup task search "my bug"', 'kb clickup task search --status "in progress" --json']),

      cmd('clickup task get', './commands/task-get.js#default', 'Get full task details including comments')
        .read()
        .flags({
          json: { type: 'boolean', description: 'Output JSON (slim by default)' },
          full: { type: 'boolean', description: 'Output full raw JSON (requires --json)' },
        })
        .examples(['kb clickup task get abc123', 'kb clickup task get abc123 --json']),

      cmd('clickup task create', './commands/task-create.js#default', 'Create a new task')
        .mutate()
        .flags({
          list:     { type: 'string',  description: 'Target list ID (required)' },
          name:     { type: 'string',  description: 'Task name (required)' },
          desc:     { type: 'string',  description: 'Task description' },
          status:   { type: 'string',  description: 'Initial status' },
          priority: { type: 'number',  description: '1=urgent 2=high 3=normal 4=low' },
          assignee: { type: 'string',  description: 'Assignee user IDs (comma-separated)' },
          due:      { type: 'string',  description: 'Due date (ISO string or unix ms)' },
          json:     { type: 'boolean', description: 'Output JSON (slim by default)' },
          full:     { type: 'boolean', description: 'Output full raw JSON (requires --json)' },
        })
        .examples([
          'kb clickup task create --list abc123 --name "Fix login bug" --priority 2',
          'kb clickup task create --list abc123 --name "Task" --json',
        ]),

      cmd('clickup task update', './commands/task-update.js#default', 'Update an existing task')
        .mutate()
        .flags({
          name:         { type: 'string',  description: 'New task name' },
          desc:         { type: 'string',  description: 'New description' },
          status:       { type: 'string',  description: 'New status' },
          priority:     { type: 'number',  description: '1=urgent 2=high 3=normal 4=low' },
          assignee_add: { type: 'string',  description: 'User IDs to add (comma-separated)' },
          assignee_rem: { type: 'string',  description: 'User IDs to remove (comma-separated)' },
          due:          { type: 'string',  description: 'Due date (ISO, unix ms, or "none")' },
          json:         { type: 'boolean', description: 'Output JSON (slim by default)' },
          full:         { type: 'boolean', description: 'Output full raw JSON (requires --json)' },
        })
        .examples([
          'kb clickup task update abc123 --status "in progress"',
          'kb clickup task update abc123 --priority 1 --json',
        ]),

      cmd('clickup task delete', './commands/task-delete.js#default', 'Delete a task')
        .mutate()
        .flags({
          json: { type: 'boolean', description: 'Output raw JSON' },
        })
        .examples(['kb clickup task delete abc123 --yes', 'kb clickup task delete abc123 --dry-run']),
    ]),

    group({ path: 'clickup task comments', describe: 'Task comment operations', category: 'Comments' }, [
      cmd('clickup task comments list', './commands/task-comment-list.js#default', 'List comments on a task')
        .read()
        .flags({
          json: { type: 'boolean', description: 'Output JSON (slim by default)' },
          full: { type: 'boolean', description: 'Output full raw JSON (requires --json)' },
        })
        .examples(['kb clickup task comments list abc123', 'kb clickup task comments list abc123 --json']),

      cmd('clickup task comments add', './commands/task-comment-add.js#default', 'Add a comment to a task')
        .mutate()
        .flags({
          text:    { type: 'string',  description: 'Comment text (required)' },
          assignee:{ type: 'number',  description: 'Assign comment to user ID' },
          notify:  { type: 'boolean', description: 'Notify all task watchers' },
          json:    { type: 'boolean', description: 'Output JSON (slim by default)' },
          full:    { type: 'boolean', description: 'Output full raw JSON (requires --json)' },
        })
        .examples(['kb clickup task comments add abc123 --text "Fixed in branch feature/x"']),
    ]),

    group({ path: 'clickup list', describe: 'List operations', category: 'Lists' }, [
      cmd('clickup list tasks', './commands/list-tasks.js#default', 'List tasks in a specific list')
        .read()
        .flags({
          status:   { type: 'string',  description: 'Filter by status (comma-separated)' },
          assignee: { type: 'string',  description: 'Filter by user IDs (comma-separated)' },
          limit:    { type: 'number',  description: 'Max results', default: 50 },
          page:     { type: 'number',  description: 'Page number', default: 0 },
          closed:   { type: 'boolean', description: 'Include closed tasks' },
          json:     { type: 'boolean', description: 'Output JSON (slim by default)' },
          full:     { type: 'boolean', description: 'Output full raw JSON (requires --json)' },
        })
        .examples(['kb clickup list tasks listId123', 'kb clickup list tasks listId123 --status "open" --json']),

      cmd('clickup list statuses', './commands/list-statuses.js#default', 'List available statuses for a list')
        .read()
        .flags({
          json: { type: 'boolean', description: 'Output JSON (slim by default)' },
          full: { type: 'boolean', description: 'Output full raw JSON (requires --json)' },
        })
        .examples(['kb clickup list statuses listId123', 'kb clickup list statuses listId123 --json']),

      cmd('clickup list create', './commands/list-create.js#default', 'Create a new list in a folder or space')
        .mutate()
        .flags({
          folder: { type: 'string',  description: 'Folder ID (use instead of --space)' },
          space:  { type: 'string',  description: 'Space ID for folderless list' },
          name:   { type: 'string',  description: 'List name (required)' },
          json:   { type: 'boolean', description: 'Output JSON (slim by default)' },
          full:   { type: 'boolean', description: 'Output full raw JSON (requires --json)' },
        })
        .examples([
          'kb clickup list create --folder folderId --name "Backlog"',
          'kb clickup list create --space spaceId --name "Inbox"',
        ]),

      cmd('clickup list update', './commands/list-update.js#default', 'Update a list')
        .mutate()
        .flags({
          name: { type: 'string',  description: 'New list name' },
          json: { type: 'boolean', description: 'Output JSON (slim by default)' },
          full: { type: 'boolean', description: 'Output full raw JSON (requires --json)' },
        })
        .examples(['kb clickup list update listId --name "Sprint 5"']),

      cmd('clickup list delete', './commands/list-delete.js#default', 'Delete a list')
        .mutate()
        .flags({
          force: { type: 'boolean', description: 'Skip confirmation' },
          json:  { type: 'boolean', description: 'Output raw JSON' },
        })
        .examples(['kb clickup list delete listId --force']),
    ]),

    group({ path: 'clickup space', describe: 'Space operations', category: 'Spaces' }, [
      cmd('clickup space create', './commands/space-create.js#default', 'Create a new space')
        .mutate()
        .flags({
          name:    { type: 'string',  description: 'Space name (required)' },
          color:   { type: 'string',  description: 'Space color (hex)' },
          private: { type: 'boolean', description: 'Make space private' },
          json:    { type: 'boolean', description: 'Output JSON (slim by default)' },
          full:    { type: 'boolean', description: 'Output full raw JSON (requires --json)' },
        })
        .examples(['kb clickup space create --name "Engineering"', 'kb clickup space create --name "Design" --color "#ff0000"']),

      cmd('clickup space update', './commands/space-update.js#default', 'Update a space')
        .mutate()
        .flags({
          name:  { type: 'string',  description: 'New space name' },
          color: { type: 'string',  description: 'New color (hex)' },
          json:  { type: 'boolean', description: 'Output JSON (slim by default)' },
          full:  { type: 'boolean', description: 'Output full raw JSON (requires --json)' },
        })
        .examples(['kb clickup space update spaceId --name "Backend"']),

      cmd('clickup space delete', './commands/space-delete.js#default', 'Delete a space')
        .mutate()
        .flags({
          force: { type: 'boolean', description: 'Skip confirmation' },
          json:  { type: 'boolean', description: 'Output raw JSON' },
        })
        .examples(['kb clickup space delete spaceId --force']),
    ]),

    group({ path: 'clickup folder', describe: 'Folder operations', category: 'Folders' }, [
      cmd('clickup folder create', './commands/folder-create.js#default', 'Create a new folder in a space')
        .mutate()
        .flags({
          space: { type: 'string',  description: 'Space ID (required)' },
          name:  { type: 'string',  description: 'Folder name (required)' },
          json:  { type: 'boolean', description: 'Output JSON (slim by default)' },
          full:  { type: 'boolean', description: 'Output full raw JSON (requires --json)' },
        })
        .examples(['kb clickup folder create --space spaceId --name "Q3 Sprint"']),

      cmd('clickup folder update', './commands/folder-update.js#default', 'Rename a folder')
        .mutate()
        .flags({
          name: { type: 'string',  description: 'New folder name (required)' },
          json: { type: 'boolean', description: 'Output JSON (slim by default)' },
          full: { type: 'boolean', description: 'Output full raw JSON (requires --json)' },
        })
        .examples(['kb clickup folder update folderId --name "Q4 Sprint"']),

      cmd('clickup folder delete', './commands/folder-delete.js#default', 'Delete a folder')
        .mutate()
        .flags({
          force: { type: 'boolean', description: 'Skip confirmation' },
          json:  { type: 'boolean', description: 'Output raw JSON' },
        })
        .examples(['kb clickup folder delete folderId --force']),
    ]),
  ),

  rest: {
    basePath: CLICKUP_BASE_PATH,
    routes: [
      GET(CLICKUP_ROUTES.WORKSPACE,     './rest/handlers/workspace-handler.js#default'),
      GET(CLICKUP_ROUTES.TASKS_SEARCH,  './rest/handlers/search-handler.js#default'),
      GET(CLICKUP_ROUTES.TASK,          './rest/handlers/task-get-handler.js#default'),
      POST(CLICKUP_ROUTES.TASKS_IN_LIST,'./rest/handlers/task-create-handler.js#default',  { input: { zod: '@kb-labs/clickup-contracts#CreateTaskSchema' } }),
      PATCH(CLICKUP_ROUTES.TASK,        './rest/handlers/task-update-handler.js#default',  { input: { zod: '@kb-labs/clickup-contracts#UpdateTaskSchema' } }),
      DELETE(CLICKUP_ROUTES.TASK,       './rest/handlers/task-delete-handler.js#default'),
      GET(CLICKUP_ROUTES.TASKS_IN_LIST, './rest/handlers/list-tasks-handler.js#default'),
      GET(CLICKUP_ROUTES.LIST_STATUSES, './rest/handlers/list-statuses-handler.js#default'),
      GET(CLICKUP_ROUTES.TASK_COMMENTS, './rest/handlers/task-comments-handler.js#default'),
      POST(CLICKUP_ROUTES.TASK_COMMENTS,'./rest/handlers/task-comment-add-handler.js#default', { input: { zod: '@kb-labs/clickup-contracts#AddCommentSchema' } }),
      POST(CLICKUP_ROUTES.SPACES,       './rest/handlers/space-create-handler.js#default',  { input: { zod: '@kb-labs/clickup-contracts#CreateSpaceSchema' } }),
      PATCH(CLICKUP_ROUTES.SPACE,       './rest/handlers/space-update-handler.js#default',  { input: { zod: '@kb-labs/clickup-contracts#UpdateSpaceSchema' } }),
      DELETE(CLICKUP_ROUTES.SPACE,      './rest/handlers/space-delete-handler.js#default'),
      POST(CLICKUP_ROUTES.SPACE_FOLDERS,'./rest/handlers/folder-create-handler.js#default', { input: { zod: '@kb-labs/clickup-contracts#CreateFolderSchema' } }),
      PATCH(CLICKUP_ROUTES.FOLDER,      './rest/handlers/folder-update-handler.js#default', { input: { zod: '@kb-labs/clickup-contracts#UpdateFolderSchema' } }),
      DELETE(CLICKUP_ROUTES.FOLDER,     './rest/handlers/folder-delete-handler.js#default'),
      POST(CLICKUP_ROUTES.FOLDER_LISTS, './rest/handlers/list-create-handler.js#default',   { input: { zod: '@kb-labs/clickup-contracts#CreateListSchema' } }),
      POST(CLICKUP_ROUTES.SPACE_LISTS,  './rest/handlers/list-create-handler.js#default',   { input: { zod: '@kb-labs/clickup-contracts#CreateListSchema' } }),
      PATCH(CLICKUP_ROUTES.LIST,        './rest/handlers/list-update-handler.js#default',   { input: { zod: '@kb-labs/clickup-contracts#UpdateListSchema' } }),
      DELETE(CLICKUP_ROUTES.LIST,       './rest/handlers/list-delete-handler.js#default'),
    ],
  },
};

export default manifest;
