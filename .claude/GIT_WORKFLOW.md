# Git Workflow Automation

This project uses automated Git workflows triggered by specific commands. These commands handle branching, committing, and pull request creation automatically.

## Quick Reference

| Command                   | Purpose                  | Example                         |
| ------------------------- | ------------------------ | ------------------------------- |
| `git-start <description>` | Start new feature branch | `git-start setup manifest.json` |
| `git-save`                | Quick checkpoint commit  | `git-save`                      |
| `git-checkpoint`          | Alias for git-save       | `git-checkpoint`                |
| `git-review [#issue]`     | Create PR                | `git-review #35`                |
| `git-status`              | Check PR/CI status       | `git-status`                    |

## Detailed Commands

### Starting Work: `git-start`

```bash
git-start <description>
```

**What it does:**

1. Switches to main branch and pulls latest changes
2. Creates new feature branch: `feat/<description-in-kebab-case>`
3. Pushes branch to origin with tracking

**Example:**

```bash
git-start implement side panel UI
# Creates: feat/implement-side-panel-ui
```

### Saving Progress: `git-save` / `git-checkpoint`

```bash
git-save
# or
git-checkpoint
```

**What it does:**

1. Stages all current changes
2. Creates commit with message: `wip: checkpoint - <files changed>`
3. Pushes to current branch

**Use when:**

- Taking a break
- Before attempting risky changes
- Want to create a rollback point

### Creating PR: `git-review`

```bash
git-review [#issue-number]
```

**What it does:**

1. Commits all remaining changes: `feat: complete <feature-name>`
2. Pushes to origin
3. Creates pull request via GitHub CLI
4. Links to issue if number provided

**Examples:**

```bash
git-review          # Creates PR without issue linking
'git-review #35'    # Creates PR and adds "Closes #35"
git-review 35       # Also works without #
```

### Checking Status: `git-status`

```bash
git-status
```

**What it does:**

1. Shows all open pull requests
2. Lists recent CI workflow runs
3. Displays details of any failed runs

## Workflow Example

Complete workflow from start to finish:

```bash
# 1. Start new feature
git-start add dark mode toggle

# 2. Make changes, then checkpoint
# ... edit files ...
git-save

# 3. Continue working
# ... more edits ...
git-save

# 4. Ready for review
git-review #42

# 5. Check CI status
git-status
```

## Safety Rules

The workflow enforces these safety measures:

1. **Protected Branches**: Cannot commit directly to `main` or `master`
2. **Auto-pull**: Always pulls latest changes before creating branches
3. **Auto-push**: Every commit is pushed for backup
4. **Branch Naming**: Enforces conventional naming (`feat/`, `fix/`, etc.)

## Conventional Commit Types

The project uses these commit types:

- `feat`: New feature
- `fix`: Bug fix
- `wip`: Work in progress (checkpoints)
- `docs`: Documentation only
- `style`: Formatting, no logic change
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance
- `perf`: Performance improvement
- `ci`: CI/CD changes
- `build`: Build system changes
- `revert`: Reverting previous commit

## Troubleshooting

### Command not found

```bash
# Make commands executable
chmod +x .claude/commands/git-*.sh
```

### GitHub CLI not installed

```bash
# Install GitHub CLI
sudo apt install gh  # Ubuntu/Debian
```

### Wrong base branch

The workflow uses `main` as the base branch for all pull requests.

## Configuration

Commands are implemented in:

- `.claude/commands/git-workflow.sh` - Main logic
- `.claude/commands/git-*.sh` - Individual command triggers

Commit rules are defined in:

- `commitlint.config.js` - Conventional commit configuration
- `.husky/commit-msg` - Git hook for validation
