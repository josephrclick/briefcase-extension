#!/bin/bash
# Trigger: git-save or git-checkpoint
# Creates a WIP checkpoint commit and pushes

exec "$CLAUDE_PROJECT_DIR/.claude/commands/git-workflow.sh" save