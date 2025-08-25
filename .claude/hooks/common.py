#!/usr/bin/env python3
"""
Shared utilities for Claude Code hooks.
Provides consistent error handling, logging, and JSON I/O processing.
"""

import json
import sys
import logging
import os
from typing import Optional, Dict, Any


# Exit codes with semantic meaning
EXIT_SUCCESS = 0
EXIT_GENERAL_ERROR = 1
EXIT_POLICY_VIOLATION = 2  # Hard fail for PreToolUse
EXIT_TRANSIENT_ERROR = 3   # Retryable failure
EXIT_MISCONFIGURATION = 4


# Configure logging to write to stderr so it doesn't corrupt stdout JSON
def _configure_logging():
    """Configure logging based on environment variables."""
    log_format = "[%(asctime)s][%(name)s][%(levelname)s] %(message)s"
    date_format = "%Y-%m-%d %H:%M:%S"
    
    # Check for JSON logging preference
    if os.getenv("CLAUDE_HOOK_LOG_JSON", "").lower() == "true":
        # JSON structured logging for production
        log_format = json.dumps({
            "timestamp": "%(asctime)s",
            "logger": "%(name)s",
            "level": "%(levelname)s",
            "message": "%(message)s"
        })
    
    logging.basicConfig(
        level=logging.DEBUG if os.getenv("CLAUDE_HOOK_DEBUG") else logging.INFO,
        stream=sys.stderr,
        format=log_format,
        datefmt=date_format,
    )

_configure_logging()
logger = logging.getLogger("claude_hook")


def get_hook_data() -> Dict[str, Any]:
    """
    Reads and parses JSON data from stdin with robust error handling.
    
    Returns:
        Parsed JSON data as a dictionary.
        
    Exits:
        With EXIT_MISCONFIGURATION if JSON parsing fails.
    """
    try:
        return json.load(sys.stdin)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to decode JSON from stdin: {e}")
        sys.exit(EXIT_MISCONFIGURATION)
    except Exception as e:
        logger.error(f"Unexpected error reading stdin: {e}")
        sys.exit(EXIT_GENERAL_ERROR)


def is_dry_run() -> bool:
    """
    Checks if the hook should run in dry-run mode.
    
    Dry-run mode is enabled if:
    - CLAUDE_HOOK_DRY_RUN environment variable is set to "1" or "true"
    - --dry-run argument is passed
    """
    env_dry_run = os.getenv("CLAUDE_HOOK_DRY_RUN", "").lower()
    return env_dry_run in ("1", "true") or "--dry-run" in sys.argv


def get_timeout() -> Optional[int]:
    """
    Gets the timeout value for the current hook execution.
    
    Returns:
        Timeout in seconds from environment variable, or None if not set.
    """
    timeout_str = os.getenv("CLAUDE_HOOK_TIMEOUT")
    if timeout_str:
        try:
            return int(timeout_str)
        except ValueError:
            logger.warning(f"Invalid timeout value: {timeout_str}")
    return None


def exit_with_error(message: str, exit_code: int = EXIT_GENERAL_ERROR) -> None:
    """
    Logs an error message to stderr and exits with specified code.
    
    Args:
        message: Error message to log
        exit_code: Exit code (default: EXIT_GENERAL_ERROR)
    """
    logger.error(message)
    sys.exit(exit_code)


def exit_success(message: Optional[str] = None, output: Optional[Any] = None) -> None:
    """
    Logs an optional success message and exits successfully.
    
    Args:
        message: Optional info message to log to stderr
        output: Optional data to output as JSON to stdout
    """
    if message:
        logger.info(message)
    if output is not None:
        # Write JSON output to stdout for machine consumption
        json.dump(output, sys.stdout)
        sys.stdout.write('\n')
        sys.stdout.flush()
    sys.exit(EXIT_SUCCESS)


def validate_required_fields(data: Dict[str, Any], required_fields: list) -> bool:
    """
    Validates that required fields exist in the data dictionary.
    
    Args:
        data: Dictionary to validate
        required_fields: List of required field paths (supports nested with '.')
        
    Returns:
        True if all required fields exist, False otherwise
    """
    for field_path in required_fields:
        current = data
        for field in field_path.split('.'):
            if not isinstance(current, dict) or field not in current:
                logger.error(f"Required field missing: {field_path}")
                return False
            current = current[field]
    return True


def safe_get(data: Dict[str, Any], path: str, default: Any = None) -> Any:
    """
    Safely get a value from a nested dictionary using dot notation.
    
    Args:
        data: Dictionary to search
        path: Dot-separated path to the value
        default: Default value if path doesn't exist
        
    Returns:
        Value at path or default if not found
    """
    current = data
    for field in path.split('.'):
        if not isinstance(current, dict):
            return default
        current = current.get(field)
        if current is None:
            return default
    return current


# Common patterns for file path extraction
def get_file_paths_from_tool_input(data: Dict[str, Any]) -> set:
    """
    Extracts file paths from various tool input structures.
    
    Handles:
    - Single file_path (Write, Edit)
    - Multiple edits with file_path (MultiEdit)
    - NotebookEdit with notebook_path
    
    Args:
        data: Hook data containing tool_input
        
    Returns:
        Set of unique file paths
    """
    paths = set()
    tool_input = data.get("tool_input", {})
    
    # Single file_path (Write, Edit)
    if "file_path" in tool_input:
        paths.add(tool_input["file_path"])
    
    # Multiple edits (MultiEdit)
    if "edits" in tool_input and isinstance(tool_input["edits"], list):
        for edit in tool_input["edits"]:
            if isinstance(edit, dict) and "file_path" in edit:
                paths.add(edit["file_path"])
    
    # Notebook path (NotebookEdit)
    if "notebook_path" in tool_input:
        paths.add(tool_input["notebook_path"])
    
    return paths


# Utility for running hooks with a main function
def run_hook(main_func):
    """
    Decorator to handle common hook execution patterns.
    
    Wraps the main function with error handling and logging.
    
    Usage:
        @run_hook
        def main():
            # Your hook logic here
            pass
    """
    def wrapper():
        try:
            if is_dry_run():
                logger.info("Running in dry-run mode")
            main_func()
        except SystemExit:
            # Let explicit exits pass through
            raise
        except Exception as e:
            logger.exception(f"Unexpected error in hook: {e}")
            sys.exit(EXIT_GENERAL_ERROR)
    
    return wrapper