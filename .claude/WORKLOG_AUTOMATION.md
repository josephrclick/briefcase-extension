# Work Log Automation Documentation

## Overview

The work log automation system ensures that the CLAUDE.md Work Log section stays current with the project's actual state by automatically updating it during git operations.

## Components

### 1. Structured Work Log Format

CLAUDE.md now includes a structured "Current Branch" indicator:

```markdown
## Work Log

**Current Branch**: `main`

---

### Date - Work Entry

...
```

This fixed format enables reliable automated updates.

### 2. Update Script

`.claude/scripts/update-worklog.sh` handles all modifications to CLAUDE.md:

- **`set-branch <branch>`**: Updates the current branch indicator
- **`add-entry <summary> <pr_url> <branch>`**: Adds a new work log entry

### 3. Git Workflow Integration

The git workflow commands automatically update the work log:

| Command                   | Work Log Update                            |
| ------------------------- | ------------------------------------------ |
| `git-start <description>` | Sets current branch to new feature branch  |
| `git-switch <branch>`     | Updates current branch when switching      |
| `git-review [#issue]`     | Adds work log entry for PR, resets to main |

## How It Works

### Branch Creation

When you run `git-start implement-dark-mode`:

1. Creates branch: `feat/implement-dark-mode`
2. Updates CLAUDE.md: `**Current Branch**: \`feat/implement-dark-mode\``

### Branch Switching

When you run `git-switch main`:

1. Switches to `main` branch
2. Updates CLAUDE.md: `**Current Branch**: \`main\``

### Pull Request Creation

When you run `git-review #42`:

1. Creates PR with dynamic checklist
2. Adds work log entry with date, summary, and PR link
3. Updates current branch back to `main`

## Usage Examples

```bash
# Start new feature
$ git-start "add user authentication"
✓ Feature branch 'feat/add-user-authentication' created and ready!
✓ CLAUDE.md: Updated current branch to 'feat/add-user-authentication'.

# Switch to existing branch
$ git-switch fix/memory-leak
✓ Switched to branch 'fix/memory-leak' and updated work log.

# Create PR and update log
$ git-review #15
✓ Pull request created with dynamic checklist!
✓ Work log updated and branch reset to main.
```

## Manual Usage

The update script can also be called directly:

```bash
# Update current branch
.claude/scripts/update-worklog.sh set-branch feature/new-feature

# Add work log entry
.claude/scripts/update-worklog.sh add-entry "Added dark mode" "https://github.com/user/repo/pull/123" "feat/dark-mode"
```

## CI Integration

For CI environments, the work log updates can be verified:

```yaml
- name: Verify work log is current
  run: |
    current_branch=$(git branch --show-current)
    if ! grep -q "**Current Branch**: \`$current_branch\`" CLAUDE.md; then
      echo "Error: CLAUDE.md shows incorrect branch"
      exit 1
    fi
```

## Limitations

- Updates only occur when using the git workflow commands (`git-start`, `git-switch`, `git-review`)
- Direct `git checkout` commands won't trigger updates (by design, to avoid git hook complexity)
- Manual updates can still be made directly to CLAUDE.md when needed

## Troubleshooting

### "Current Branch line not found" Error

Add the following structure to CLAUDE.md under the Work Log heading:

```markdown
## Work Log

**Current Branch**: `main`

---
```

### Updates Not Occurring

Ensure you're using the workflow commands:

- Use `git-switch` instead of `git checkout`
- Use `git-start` instead of manually creating branches
- Use `git-review` to create PRs

### Script Permission Denied

Make the script executable:

```bash
chmod +x .claude/scripts/update-worklog.sh
```

## Best Practices

1. **Always use workflow commands** for git operations to ensure updates
2. **Verify updates** after operations with `cat CLAUDE.md | grep "Current Branch"`
3. **Keep entries concise** - detailed information goes in PR descriptions
4. **Use work log pruning** periodically to archive old entries

## Integration with Existing Tools

- **Work Log Pruning**: Compatible with `.claude/scripts/prune-worklog.js`
- **Git Workflow**: Seamlessly integrated into all workflow commands
- **Claude Code**: Work log stays current for AI context
