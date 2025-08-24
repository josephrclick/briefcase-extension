#!/bin/sh
# Check if file should be formatted with prettier
case "$CLAUDE_TOOL_FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.json|*.md|*.css)
    npx prettier --write "$CLAUDE_TOOL_FILE_PATH" 2>/dev/null
    ;;
esac
exit 0