# Git Worktree Instructions

## Table of Contents

- [Overview](#overview)
- [When to Use Worktrees](#when-to-use-worktrees)
- [Prerequisites](#prerequisites)
- [Directory Structure](#directory-structure)
- [Creating Your First Worktree](#creating-your-first-worktree)
- [Best Practices](#best-practices)
- [Common Issues & Solutions](#common-issues--solutions)
- [Cleanup & Maintenance](#cleanup--maintenance)

## Overview

Git worktrees allow you to have multiple branches checked out simultaneously in different directories. This is particularly useful for:

- Working on multiple features in parallel
- Keeping a clean main branch available for hotfixes
- Running different versions of the application simultaneously
- Avoiding context switching and stash management

## When to Use Worktrees

### Use Worktrees When:

- Another developer/agent is working on a different branch
- You need to quickly switch between features without losing state
- You want to run tests on one branch while developing on another
- You need to compare implementations side-by-side
- Working on long-running features that span multiple days

### Don't Use Worktrees When:

- Making quick, small fixes (use regular branch switching)
- Working on a single feature at a time
- Disk space is limited (each worktree needs its own node_modules)

## Prerequisites

Before creating worktrees, ensure:

1. Git version 2.5 or higher: `git --version`
2. Sufficient disk space (each worktree will have its own node_modules ~500MB)
3. All current changes are committed or stashed
4. You're familiar with the project's branch naming conventions

## Directory Structure

Recommended directory organization:

```
~/dev/projects/
├── briefcase-extension/          # Main repository (primary worktree)
│   ├── apps/
│   ├── packages/
│   ├── node_modules/
│   └── package.json
└── briefcase-worktrees/         # Container for additional worktrees
    ├── issue-38/                # Worktree for issue #38
    │   ├── apps/
    │   ├── packages/
    │   ├── node_modules/
    │   └── package.json
    ├── hotfix-auth/             # Worktree for urgent fix
    └── feature-ui-redesign/     # Worktree for major feature
```

## Creating Your First Worktree

### Step 1: Prepare Your Current Branch

Check for uncommitted changes:

```bash
git status
```

If you have changes, either commit or stash them:

```bash
# Option A: Commit changes
git add .
git commit -m "WIP: Description of current work"

# Option B: Stash changes
git stash push -m "WIP: Description of current work"
```

### Step 2: Create Worktree Directory Structure

```bash
# Create container directory for all worktrees
mkdir -p ~/dev/projects/briefcase-worktrees
```

### Step 3: Fetch Latest Changes

Always sync with remote before creating a worktree:

```bash
git fetch origin main
git fetch --all --prune  # Optional: fetch all branches and clean up
```

### Step 4: Create the Worktree

#### For a New Feature Branch from Main:

```bash
# Syntax: git worktree add <path> -b <new-branch-name> <start-point>
git worktree add ~/dev/projects/briefcase-worktrees/issue-38 \
  -b feat/issue-38-sqlite-wasm-fts5 \
  origin/main
```

#### For an Existing Remote Branch:

```bash
# Syntax: git worktree add <path> <existing-branch>
git worktree add ~/dev/projects/briefcase-worktrees/pr-review \
  origin/feat/existing-feature
```

#### For a Local Branch:

```bash
git worktree add ~/dev/projects/briefcase-worktrees/local-work \
  my-local-branch
```

### Step 5: Navigate to the New Worktree

```bash
cd ~/dev/projects/briefcase-worktrees/issue-38
```

### Step 6: Install Dependencies

Each worktree needs its own dependencies:

```bash
# Install all dependencies
npm install

# Build the project if necessary
npm run build
```

### Step 7: Verify Setup

```bash
# Check you're on the correct branch
git branch --show-current

# Verify worktree list
git worktree list

# Check remote tracking
git branch -vv

# Run tests to ensure everything works
npm run test
```

## Managing Multiple Worktrees

### Listing All Worktrees

```bash
# Simple list
git worktree list

# Detailed list with more information
git worktree list --porcelain

# Custom format with specific details
git worktree list --verbose
```

Example output:

```
/home/joe/dev/projects/briefcase-extension          339a9ae [main]
/home/joe/dev/projects/briefcase-worktrees/issue-38 def456b [feat/issue-38-sqlite-wasm-fts5]
/home/joe/dev/projects/briefcase-worktrees/issue-39 abc123c [feat/issue-39-ui-components]
```

### Switching Between Worktrees

Simply navigate to the directory:

```bash
# Using absolute path
cd ~/dev/projects/briefcase-worktrees/issue-38

# Create aliases for frequently used worktrees (add to ~/.bashrc or ~/.zshrc)
alias briefcase-main="cd ~/dev/projects/briefcase-extension"
alias briefcase-38="cd ~/dev/projects/briefcase-worktrees/issue-38"
```

### Naming Conventions

Use descriptive names that include:

- Issue number: `issue-38`, `issue-39`
- Feature type: `hotfix-auth`, `feature-ui`, `bugfix-memory-leak`
- PR number for reviews: `pr-145-review`

## Best Practices

### 1. Consistent Naming

Always use kebab-case and include issue numbers:

```bash
# Good
feat/issue-38-sqlite-setup
bugfix/issue-45-memory-leak
hotfix/issue-52-auth-error

# Bad
myFeature
SQLiteSetup
issue38
```

### 2. Keep Worktrees Focused

One worktree = One feature/issue:

```bash
# Good: Specific to one issue
git worktree add ~/dev/projects/briefcase-worktrees/issue-38 \
  -b feat/issue-38-sqlite-wasm-fts5 origin/main

# Bad: Mixing multiple features
git worktree add ~/dev/projects/briefcase-worktrees/multiple-fixes \
  -b feat/various-improvements origin/main
```

### 3. Regular Cleanup

Remove worktrees when done:

```bash
# First, ensure all changes are pushed
cd ~/dev/projects/briefcase-worktrees/issue-38
git push origin feat/issue-38-sqlite-wasm-fts5

# Then remove the worktree
cd ~/dev/projects/briefcase-extension
git worktree remove ~/dev/projects/briefcase-worktrees/issue-38
```

### 4. Document Active Worktrees

Keep a README in your worktrees directory:

```bash
cat > ~/dev/projects/briefcase-worktrees/README.md << 'EOF'
# Active Worktrees

## issue-38
- Branch: feat/issue-38-sqlite-wasm-fts5
- Purpose: SQLite WASM + FTS5 Setup
- Created: 2025-01-27
- Status: In Progress

## issue-39
- Branch: feat/issue-39-ui-components
- Purpose: Implement sidebar components
- Created: 2025-01-26
- Status: In Review
EOF
```

### 5. Synchronize Regularly

Keep worktrees up-to-date with main:

```bash
cd ~/dev/projects/briefcase-worktrees/issue-38

# Fetch latest changes
git fetch origin main

# Merge or rebase (depending on project preferences)
git merge origin/main
# OR
git rebase origin/main
```

### 6. Use Environment Variables

Create `.env.local` for each worktree if needed:

```bash
# Worktree for issue 38
echo "PORT=3001" > ~/dev/projects/briefcase-worktrees/issue-38/.env.local
echo "DEBUG=sqlite:*" >> ~/dev/projects/briefcase-worktrees/issue-38/.env.local

# Worktree for issue 39
echo "PORT=3002" > ~/dev/projects/briefcase-worktrees/issue-39/.env.local
echo "DEBUG=ui:*" >> ~/dev/projects/briefcase-worktrees/issue-39/.env.local
```

## Common Issues & Solutions

### Issue: "fatal: already exists"

**Problem**: Trying to create a worktree in a directory that already exists.

**Solution**:

```bash
# Remove the existing directory
rm -rf ~/dev/projects/briefcase-worktrees/issue-38

# Or use a different directory name
git worktree add ~/dev/projects/briefcase-worktrees/issue-38-v2 \
  -b feat/issue-38-sqlite-wasm-fts5 origin/main
```

### Issue: "fatal: branch already exists"

**Problem**: The branch name already exists locally.

**Solution**:

```bash
# Option 1: Use the existing branch without -b flag
git worktree add ~/dev/projects/briefcase-worktrees/issue-38 \
  feat/issue-38-sqlite-wasm-fts5

# Option 2: Delete the local branch first
git branch -D feat/issue-38-sqlite-wasm-fts5
git worktree add ~/dev/projects/briefcase-worktrees/issue-38 \
  -b feat/issue-38-sqlite-wasm-fts5 origin/main
```

### Issue: "worktree is already registered"

**Problem**: Git thinks the worktree still exists but the directory is gone.

**Solution**:

```bash
# Prune broken worktree references
git worktree prune

# Force remove if needed
git worktree remove --force ~/dev/projects/briefcase-worktrees/issue-38
```

### Issue: Port Conflicts

**Problem**: Multiple worktrees trying to use the same development port.

**Solution**:

```bash
# Use different ports for each worktree
# Worktree 1
PORT=3001 npm run dev

# Worktree 2
PORT=3002 npm run dev

# Or modify package.json scripts in each worktree
```

### Issue: Disk Space

**Problem**: Running out of disk space with multiple node_modules.

**Solution**:

```bash
# Share dependencies using pnpm instead of npm
npm install -g pnpm
pnpm install  # Uses hard links to save space

# Or use a single node_modules with symlinks (advanced)
ln -s ~/dev/projects/briefcase-extension/node_modules \
      ~/dev/projects/briefcase-worktrees/issue-38/node_modules
```

## Cleanup & Maintenance

### Removing a Worktree

Complete removal process:

```bash
# 1. Navigate to the worktree
cd ~/dev/projects/briefcase-worktrees/issue-38

# 2. Check for uncommitted changes
git status

# 3. Push any final changes
git push origin feat/issue-38-sqlite-wasm-fts5

# 4. Navigate back to main repository
cd ~/dev/projects/briefcase-extension

# 5. Remove the worktree
git worktree remove ~/dev/projects/briefcase-worktrees/issue-38

# 6. Delete the remote branch if merged
git push origin --delete feat/issue-38-sqlite-wasm-fts5

# 7. Clean up local branch reference
git branch -d feat/issue-38-sqlite-wasm-fts5
```

### Pruning Stale Worktrees

Clean up broken references:

```bash
# Check for stale worktree entries
git worktree list

# Prune stale entries
git worktree prune

# Verbose pruning to see what's being removed
git worktree prune --verbose
```

### Moving a Worktree

If you need to relocate a worktree:

```bash
# Move the worktree to a new location
git worktree move ~/dev/projects/briefcase-worktrees/issue-38 \
                  ~/dev/new-location/issue-38
```

### Locking a Worktree

Prevent accidental removal of important worktrees:

```bash
# Lock a worktree
git worktree lock ~/dev/projects/briefcase-worktrees/production-hotfix

# Check lock status
git worktree list --porcelain | grep locked

# Unlock when done
git worktree unlock ~/dev/projects/briefcase-worktrees/production-hotfix
```

## Advanced Tips

### Script for Creating Worktrees

Add to your `.bashrc` or `.zshrc`:

```bash
create-worktree() {
  if [ $# -ne 2 ]; then
    echo "Usage: create-worktree <issue-number> <description>"
    echo "Example: create-worktree 38 'sqlite-wasm-fts5'"
    return 1
  fi

  local issue=$1
  local desc=$2
  local branch="feat/issue-${issue}-${desc}"
  local dir="$HOME/dev/projects/briefcase-worktrees/issue-${issue}"

  echo "Creating worktree for issue #${issue}..."
  git worktree add "$dir" -b "$branch" origin/main

  echo "Installing dependencies..."
  cd "$dir" && npm install

  echo "Worktree created at: $dir"
  echo "Branch: $branch"
}
```

### VS Code Multi-Worktree Setup

Open multiple worktrees in VS Code:

```bash
# Open each worktree in a separate VS Code window
code ~/dev/projects/briefcase-extension
code ~/dev/projects/briefcase-worktrees/issue-38

# Or use VS Code Workspaces
cat > ~/dev/projects/briefcase.code-workspace << 'EOF'
{
  "folders": [
    {
      "name": "Main",
      "path": "briefcase-extension"
    },
    {
      "name": "Issue #38",
      "path": "briefcase-worktrees/issue-38"
    }
  ]
}
EOF
```

## Summary Checklist

When creating a new worktree, always:

- [ ] Commit or stash current changes
- [ ] Create worktree container directory if it doesn't exist
- [ ] Fetch latest changes from origin
- [ ] Use consistent branch naming: `feat/issue-XX-description`
- [ ] Navigate to new worktree directory
- [ ] Run `npm install` to install dependencies
- [ ] Verify setup with `git worktree list` and `git status`
- [ ] Create `.env.local` if needed for different ports
- [ ] Document the worktree purpose in worktrees README
- [ ] Push branch to origin with `-u` flag for tracking

When removing a worktree:

- [ ] Push all changes to remote
- [ ] Navigate back to main repository
- [ ] Use `git worktree remove` command
- [ ] Delete remote branch if merged
- [ ] Clean up local branch reference
- [ ] Update worktrees README
