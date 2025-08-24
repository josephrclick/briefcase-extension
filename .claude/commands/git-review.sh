#!/bin/bash
# Trigger: git-review [#issue-number]
# Finalizes work and creates a pull request

exec "$CLAUDE_PROJECT_DIR/.claude/commands/git-workflow.sh" review "$@"