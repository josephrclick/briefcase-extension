# Claude Code Hooks Documentation

## Overview

This project uses a hierarchical hook system for Claude Code that provides automated safety checks, formatting, and validation. All hooks are organized by event type and implemented in Python for consistency and maintainability.

## Directory Structure

```
.claude/hooks/
├── common.py              # Shared utilities for all hooks
├── PreToolUse/           # Hooks that run before tool execution
│   ├── file_protection.py
│   └── bash_validator.py
├── PostToolUse/          # Hooks that run after tool execution
│   └── prettier_format.py
└── UserPromptSubmit/     # Hooks that modify user prompts
    ├── append_default.py
    ├── append_explain.py
    └── append_ultrathink.py
```

## Hook Types

### PreToolUse Hooks

These hooks run **before** a tool is executed and can prevent execution by exiting with a non-zero code.

#### file_protection.py

- **Purpose**: Prevents modification of sensitive files
- **Triggers**: Edit, MultiEdit, Write, NotebookEdit tools
- **Protected patterns**:
  - Environment files (`.env`, `.env.*`)
  - Dependencies (`package-lock.json`, `node_modules/`)
  - Version control (`.git/`)
  - Secrets (`*.key`, `*.pem`, `secrets/`)
  - Generated files (`dist/`, `build/`)
- **Exit codes**:
  - 0: Success (file allowed)
  - 2: Policy violation (file protected)

#### bash_validator.py

- **Purpose**: Validates bash commands for safety and best practices
- **Triggers**: Bash tool
- **Checks**:
  - Dangerous operations (`rm -rf /`, wildcard deletions)
  - Security issues (`curl | bash`, `chmod 777`)
  - Performance optimizations (suggests `rg` over `grep`)
  - Optional shellcheck integration
- **Exit codes**:
  - 0: Success (command allowed)
  - 2: Policy violation (command blocked)

### PostToolUse Hooks

These hooks run **after** a tool completes successfully.

#### prettier_format.py

- **Purpose**: Automatically formats modified files
- **Triggers**: Edit, MultiEdit, Write, NotebookEdit tools
- **Supported formats**: JS, TS, JSON, CSS, HTML, Markdown, YAML, and more
- **Features**:
  - Detects prettier via npx or global installation
  - Graceful degradation if prettier not available
  - Respects project prettier configuration

### UserPromptSubmit Hooks

These hooks modify user prompts before they're processed.

#### append_default.py

- Appends instructions when prompt ends with `-d`

#### append_explain.py

- Appends explanation request when prompt ends with `-e`

#### append_ultrathink.py

- Appends deep thinking instructions when prompt ends with `-u`

## Environment Variables

### Global Hook Configuration

- `CLAUDE_HOOK_DRY_RUN`: Set to "1" or "true" to run hooks in dry-run mode
- `CLAUDE_HOOK_DEBUG`: Enable debug logging
- `CLAUDE_HOOK_LOG_JSON`: Set to "true" for JSON-structured logging
- `CLAUDE_HOOK_TIMEOUT`: Override default timeout (in seconds)

### Hook-Specific Variables

- `CLAUDE_PROJECT_DIR`: Automatically set to project root directory
- `CLAUDE_TOOL_FILE_PATH`: File being modified (legacy, for compatibility)

## Exit Codes

All hooks use standardized exit codes:

| Code | Meaning          | Effect                         |
| ---- | ---------------- | ------------------------------ |
| 0    | Success          | Operation continues            |
| 1    | General error    | Operation fails                |
| 2    | Policy violation | Operation blocked (PreToolUse) |
| 3    | Transient error  | May be retried                 |
| 4    | Misconfiguration | Configuration issue            |

## Common Utilities (common.py)

The shared scaffold provides:

### Functions

- `get_hook_data()`: Read and parse JSON from stdin
- `is_dry_run()`: Check if running in dry-run mode
- `exit_with_error(message, code)`: Log error and exit
- `exit_success(message, output)`: Log success and exit
- `validate_required_fields(data, fields)`: Validate JSON structure
- `safe_get(data, path, default)`: Safe nested dictionary access
- `get_file_paths_from_tool_input(data)`: Extract file paths from various tool inputs

### Logging

- All logs go to stderr (stdout reserved for JSON output)
- Structured logging with timestamp, logger name, and level
- Optional JSON format for production environments

## Testing Hooks

### Manual Testing

Test individual hooks with sample JSON:

```bash
# Test file protection
echo '{"tool_name":"Edit","tool_input":{"file_path":".env"}}' | \
  CLAUDE_HOOK_DRY_RUN=1 python3 .claude/hooks/PreToolUse/file_protection.py

# Test bash validation
echo '{"tool_name":"Bash","tool_input":{"command":"grep test file.txt"}}' | \
  CLAUDE_HOOK_DRY_RUN=1 python3 .claude/hooks/PreToolUse/bash_validator.py

# Test prettier formatting
echo '{"tool_name":"Write","tool_input":{"file_path":"test.js"}}' | \
  CLAUDE_HOOK_DRY_RUN=1 python3 .claude/hooks/PostToolUse/prettier_format.py
```

### Dry-Run Mode

Enable dry-run mode to test hooks without side effects:

```bash
export CLAUDE_HOOK_DRY_RUN=1
# Run Claude Code normally - hooks will log actions without executing them
```

## Adding New Hooks

### 1. Create the Hook File

```python
#!/usr/bin/env python3
"""Description of your hook."""

import sys
import os

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from common import get_hook_data, exit_success, exit_with_error, logger

def main():
    data = get_hook_data()

    # Your hook logic here

    exit_success("Hook completed")

if __name__ == "__main__":
    main()
```

### 2. Update settings.json

```json
{
  "hooks": {
    "EventType": [
      {
        "matcher": "ToolName",
        "hooks": [
          {
            "type": "command",
            "command": "python3 $CLAUDE_PROJECT_DIR/.claude/hooks/EventType/your_hook.py"
          }
        ]
      }
    ]
  }
}
```

## Troubleshooting

### Hook Not Running

1. Check that the hook file is executable: `chmod +x hook.py`
2. Verify the path in settings.json is correct
3. Check the matcher pattern matches your tool

### Hook Failing

1. Enable debug logging: `export CLAUDE_HOOK_DEBUG=1`
2. Check stderr output for error messages
3. Test the hook manually with sample JSON

### Prettier Not Formatting

1. Verify prettier is installed: `npm list prettier`
2. Check that file extension is supported
3. Look for prettier configuration files in project

### File Protection Too Restrictive

1. Review ALLOWED_PATTERNS in file_protection.py
2. Consider adding exceptions for your use case
3. Use dry-run mode to test changes

## Migration Notes

This hierarchical structure replaces the previous mixed approach:

- Inline Python commands → Dedicated Python files
- Shell scripts → Python implementations
- Flat structure → Organized by event type

### Backward Compatibility

During migration:

1. Old hooks were tested in parallel with new ones
2. Settings.json updated atomically
3. Old files removed after verification

## Best Practices

1. **Always use common.py utilities** for consistency
2. **Log to stderr only** - stdout is for JSON output
3. **Exit with appropriate codes** - especially important for PreToolUse
4. **Support dry-run mode** for testing
5. **Handle missing dependencies gracefully** (like prettier)
6. **Validate input thoroughly** before processing
7. **Provide clear error messages** with remediation steps

## Security Considerations

- File protection prevents accidental exposure of secrets
- Bash validator blocks dangerous commands
- Path traversal attempts are detected and blocked
- Symlinks are resolved and checked
- All hooks run with same permissions as Claude Code

## Performance

- Hooks add minimal overhead (<100ms typical)
- Python process spawn is fast enough for interactive use
- Prettier formatting is batched when possible
- Timeouts prevent hanging on large operations

## Future Enhancements

Potential improvements:

- Hook composition/chaining
- Async hook execution for PostToolUse
- Caching for frequently accessed patterns
- Configuration file for protected patterns
- Web UI for hook management
