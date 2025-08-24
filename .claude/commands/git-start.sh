#!/bin/bash
# Trigger: git-start <description>
# Starts a new feature branch from main/dev

exec "$CLAUDE_PROJECT_DIR/.claude/commands/git-workflow.sh" start "$@"