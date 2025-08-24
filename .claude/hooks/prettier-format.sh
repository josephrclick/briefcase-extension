#!/bin/sh
# POSIX-compliant prettier formatting hook for Claude Code
# Only formats files modified by Claude Code tool calls

# Exit silently if no file path is provided
if [ -z "$CLAUDE_TOOL_FILE_PATH" ]; then
    exit 0
fi

# Check if prettier is available
if ! command -v npx >/dev/null 2>&1; then
    # Prettier not available, exit silently
    exit 0
fi

# Check if the file exists
if [ ! -f "$CLAUDE_TOOL_FILE_PATH" ]; then
    exit 0
fi

# Get the file extension using parameter expansion
filename="${CLAUDE_TOOL_FILE_PATH##*/}"
extension="${filename##*.}"

# Check if file has an extension
if [ "$filename" = "$extension" ]; then
    # No extension found
    exit 0
fi

# Format based on file extension
case "$extension" in
    ts|tsx|js|jsx|json|md|css|yml|yaml)
        # Attempt to format the file, suppress errors
        npx prettier --write "$CLAUDE_TOOL_FILE_PATH" 2>/dev/null || true
        # Optional: Provide feedback (comment out if not desired)
        # echo "Formatted: $CLAUDE_TOOL_FILE_PATH"
        ;;
    *)
        # Not a supported file type, exit silently
        exit 0
        ;;
esac

exit 0