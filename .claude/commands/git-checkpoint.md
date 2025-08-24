# git-checkpoint

Alias for git-save. Creates a quick checkpoint commit with automatic push.

## Usage

```
/git-checkpoint
```

## What this does

Same as `/git-save`:

1. Stages all current changes
2. Creates commit with message: `wip: checkpoint - <files changed>`
3. Pushes to current branch

## Implementation

Execute the following command:

```bash
.claude/commands/git-workflow.sh checkpoint
```

No additional parameters needed.
