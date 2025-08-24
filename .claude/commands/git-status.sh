#!/bin/bash
# Trigger: git-status
# Shows PR and CI status

exec "$CLAUDE_PROJECT_DIR/.claude/commands/git-workflow.sh" status