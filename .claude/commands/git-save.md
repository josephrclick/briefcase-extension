# git-save

Quick checkpoint commit with automatic push to save your work in progress.

## Usage
```
/git-save
```

## What this does
1. Stages all current changes
2. Creates commit with message: `wip: checkpoint - <files changed>`
3. Pushes to current branch

## When to use
- Taking a break
- Before attempting risky changes
- Want to create a rollback point
- Need to save progress quickly

## Implementation
Execute the following command:

```bash
.claude/commands/git-workflow.sh save
```

No additional parameters needed.