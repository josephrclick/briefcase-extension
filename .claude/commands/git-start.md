# git-start

Start a new feature branch from main with automatic setup.

## Usage
```
/git-start <description>
```

## What this does
1. Switches to main branch and pulls latest changes
2. Creates new feature branch: `feat/<description-in-kebab-case>`
3. Pushes branch to origin with tracking

## Example
```
/git-start implement side panel UI
```
This creates branch: `feat/implement-side-panel-ui`

## Implementation
Execute the following command with the provided description:

```bash
.claude/commands/git-workflow.sh start {{description}}
```

Replace `{{description}}` with the user's provided description.