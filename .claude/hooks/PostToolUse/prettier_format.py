#!/usr/bin/env python3
"""
Prettier formatting hook for Claude Code.
Automatically formats files after they are modified.
"""

import sys
import os
import subprocess
import shutil
from pathlib import Path
from typing import Set, List

# Add parent 'hooks' directory to Python path to find 'common.py'
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from common import (
    get_hook_data,
    exit_success,
    exit_with_error,
    is_dry_run,
    logger,
    get_file_paths_from_tool_input,
    EXIT_GENERAL_ERROR
)


# File extensions that Prettier can format
PRETTIER_EXTENSIONS = {
    '.js', '.jsx', '.ts', '.tsx',      # JavaScript/TypeScript
    '.json', '.jsonc', '.json5',       # JSON variants
    '.css', '.scss', '.sass', '.less', # Stylesheets
    '.html', '.htm',                   # HTML
    '.md', '.mdx',                     # Markdown
    '.yml', '.yaml',                   # YAML
    '.graphql', '.gql',                # GraphQL
    '.vue',                            # Vue
    '.svelte',                         # Svelte
}

# Additional extensions to check (project might have custom config)
MAYBE_PRETTIER_EXTENSIONS = {
    '.php',                            # With plugin
    '.pug',                            # With plugin
    '.ruby',                           # With plugin
    '.xml',                            # With plugin
    '.toml',                          # With plugin
}


def check_prettier_availability() -> tuple[bool, str]:
    """
    Check if prettier is available via npx or globally.
    
    Returns:
        Tuple of (is_available, command_to_use)
    """
    # First check for npx (preferred for project-local prettier)
    if shutil.which("npx"):
        # Check if prettier is available via npx
        try:
            result = subprocess.run(
                ["npx", "--no-install", "prettier", "--version"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                return True, "npx prettier"
        except (subprocess.TimeoutExpired, subprocess.SubprocessError):
            pass
    
    # Check for global prettier installation
    if shutil.which("prettier"):
        return True, "prettier"
    
    return False, ""


def should_format_file(file_path: str) -> bool:
    """
    Determine if a file should be formatted with prettier.
    
    Args:
        file_path: Path to the file
        
    Returns:
        True if the file should be formatted
    """
    path = Path(file_path)
    
    # Check if file exists
    if not path.exists() or not path.is_file():
        return False
    
    # Check extension
    extension = path.suffix.lower()
    
    # Always format known extensions
    if extension in PRETTIER_EXTENSIONS:
        return True
    
    # For maybe extensions, check if prettier config exists
    if extension in MAYBE_PRETTIER_EXTENSIONS:
        # Look for prettier config in project
        for config_name in ['.prettierrc', '.prettierrc.json', '.prettierrc.js', 
                           '.prettierrc.yml', '.prettierrc.yaml', 'prettier.config.js']:
            if (path.parent / config_name).exists() or (Path.cwd() / config_name).exists():
                return True
    
    return False


def format_files(files: List[str], prettier_cmd: str) -> tuple[bool, str]:
    """
    Format files using prettier.
    
    Args:
        files: List of file paths to format
        prettier_cmd: The prettier command to use
        
    Returns:
        Tuple of (success, message)
    """
    if not files:
        return True, "No files to format"
    
    # Build the command
    cmd_parts = prettier_cmd.split() + ["--write"] + files
    
    try:
        # Set timeout based on number of files (10 seconds per file, max 60 seconds)
        timeout = min(len(files) * 10, 60)
        
        result = subprocess.run(
            cmd_parts,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=os.getcwd()
        )
        
        if result.returncode == 0:
            # Parse prettier output to see what was formatted
            formatted_files = []
            for line in result.stdout.split('\n'):
                if line.strip() and not line.startswith('['):
                    formatted_files.append(line.strip())
            
            if formatted_files:
                return True, f"Formatted {len(formatted_files)} file(s)"
            else:
                return True, "Files already formatted"
        else:
            # Prettier returned an error
            error_msg = result.stderr if result.stderr else result.stdout
            return False, f"Prettier error: {error_msg}"
            
    except subprocess.TimeoutExpired:
        return False, f"Prettier timed out after {timeout} seconds"
    except Exception as e:
        return False, f"Failed to run prettier: {e}"


def main():
    """Main hook execution."""
    # Check prettier availability first
    prettier_available, prettier_cmd = check_prettier_availability()
    
    if not prettier_available:
        logger.info(
            "Prettier not found. Skipping auto-formatting. "
            "Install prettier to enable this feature: npm install --save-dev prettier"
        )
        exit_success()
        return
    
    data = get_hook_data()
    
    # Only process file modification tools
    tool_name = data.get("tool_name", "")
    if tool_name not in ["Edit", "MultiEdit", "Write", "NotebookEdit"]:
        logger.debug(f"Skipping prettier format for tool: {tool_name}")
        exit_success()
        return
    
    # Extract file paths from the tool input
    file_paths = get_file_paths_from_tool_input(data)
    
    if not file_paths:
        logger.debug("No file paths found in tool input")
        exit_success()
        return
    
    # Filter files that should be formatted
    files_to_format = []
    for file_path in file_paths:
        if should_format_file(file_path):
            files_to_format.append(file_path)
        else:
            logger.debug(f"Skipping non-formattable file: {file_path}")
    
    if not files_to_format:
        logger.debug("No files need formatting")
        exit_success()
        return
    
    # Handle dry-run mode
    if is_dry_run():
        logger.info(f"[DRY RUN] Would format {len(files_to_format)} file(s):")
        for file_path in files_to_format:
            logger.info(f"  • {file_path}")
        exit_success()
        return
    
    # Format the files
    success, message = format_files(files_to_format, prettier_cmd)
    
    if success:
        logger.info(message)
        if files_to_format:
            for file_path in files_to_format:
                logger.debug(f"Formatted: {file_path}")
        exit_success()
    else:
        # Don't fail the entire operation if prettier fails
        # Just log the error and continue
        logger.warning(f"Prettier formatting failed: {message}")
        exit_success()


if __name__ == "__main__":
    main()