#!/usr/bin/env python3
"""
File protection hook for Claude Code.
Prevents editing of sensitive files and directories.
"""

import sys
import os
import fnmatch
from pathlib import Path

# Add parent 'hooks' directory to Python path to find 'common.py'
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from common import (
    get_hook_data,
    exit_with_error, 
    exit_success,
    is_dry_run,
    logger,
    get_file_paths_from_tool_input,
    EXIT_POLICY_VIOLATION,
    safe_get
)


# Patterns for protected files and directories
PROTECTED_PATTERNS = [
    # Environment and secrets
    ".env",
    ".env.*",
    "*.key",
    "*.pem",
    "*.crt",
    "secrets/*",
    
    # Version control
    ".git/*",
    
    # Dependencies and generated files
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "node_modules/*",
    "dist/*",
    "build/*",
    
    # Project-specific protected files
    "_docs/PRD.md",
    
    # System files
    ".*",  # Hidden files (can be refined if needed)
]

# Patterns that are explicitly allowed (overrides protected patterns)
ALLOWED_PATTERNS = [
    ".claude/*",           # Claude configuration is allowed
    ".github/*",          # GitHub workflows are allowed
    ".prettierrc*",       # Prettier config is allowed
    ".eslintrc*",         # ESLint config is allowed
    ".gitignore",         # Git ignore is allowed
    ".prettierignore",    # Prettier ignore is allowed
]


def is_path_protected(file_path: str) -> bool:
    """
    Check if a file path matches any protected pattern.
    
    Args:
        file_path: Path to check (can be absolute or relative)
        
    Returns:
        True if the path is protected, False otherwise
    """
    # Normalize the path
    path = Path(file_path)
    
    # Convert to relative path if absolute, for pattern matching
    try:
        if path.is_absolute():
            # Try to make it relative to current working directory
            path = path.relative_to(Path.cwd())
    except ValueError:
        # Path is outside current directory, use as-is
        pass
    
    path_str = str(path)
    
    # Check if explicitly allowed (takes precedence)
    for pattern in ALLOWED_PATTERNS:
        if fnmatch.fnmatch(path_str, pattern) or fnmatch.fnmatch(f"{path_str}/*", pattern):
            logger.debug(f"Path {path_str} matches allowed pattern: {pattern}")
            return False
    
    # Check if protected
    for pattern in PROTECTED_PATTERNS:
        if fnmatch.fnmatch(path_str, pattern) or fnmatch.fnmatch(f"{path_str}/*", pattern):
            logger.debug(f"Path {path_str} matches protected pattern: {pattern}")
            return True
    
    # Check for path traversal attempts
    if ".." in path.parts:
        logger.warning(f"Path traversal attempt detected: {path_str}")
        return True
    
    # Check for symlink (if file exists)
    try:
        if path.exists() and path.is_symlink():
            logger.warning(f"Symlink detected: {path_str}")
            # Be cautious with symlinks that might point to protected areas
            real_path = path.resolve()
            if real_path != path:
                return is_path_protected(str(real_path))
    except (OSError, PermissionError):
        # Can't check, err on the side of caution
        pass
    
    return False


def main():
    """Main hook execution."""
    data = get_hook_data()
    
    # Only process Edit, MultiEdit, and Write tools
    tool_name = data.get("tool_name", "")
    if tool_name not in ["Edit", "MultiEdit", "Write", "NotebookEdit"]:
        exit_success(f"Skipping file protection for tool: {tool_name}")
        return
    
    # Extract file paths from the tool input
    file_paths = get_file_paths_from_tool_input(data)
    
    if not file_paths:
        logger.debug("No file paths found in tool input")
        exit_success()
        return
    
    # Check each file path
    protected_files = []
    for file_path in file_paths:
        if is_path_protected(file_path):
            protected_files.append(file_path)
    
    if protected_files:
        error_msg = (
            f"Cannot modify protected file(s): {', '.join(protected_files)}\n"
            "These files are protected to prevent accidental modifications.\n"
            "Protected patterns include: environment files, dependencies, "
            "version control, and generated files."
        )
        
        if is_dry_run():
            logger.info(f"[DRY RUN] Would block modification of: {', '.join(protected_files)}")
            exit_success()
        else:
            exit_with_error(error_msg, EXIT_POLICY_VIOLATION)
    else:
        logger.debug(f"File(s) allowed: {', '.join(file_paths)}")
        exit_success()


if __name__ == "__main__":
    main()