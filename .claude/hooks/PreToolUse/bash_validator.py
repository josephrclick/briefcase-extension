#!/usr/bin/env python3
"""
Bash command validator hook for Claude Code.
Validates bash commands for safety and best practices.
"""

import sys
import os
import re
import shutil
from typing import List, Tuple

# Add parent 'hooks' directory to Python path to find 'common.py'
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from common import (
    get_hook_data,
    exit_with_error,
    exit_success,
    is_dry_run,
    logger,
    EXIT_POLICY_VIOLATION,
    safe_get
)


# Validation rules: (pattern, message, severity)
# severity: "error" blocks execution, "warning" just logs
VALIDATION_RULES: List[Tuple[str, str, str]] = [
    # Performance and best practices
    (r"\bgrep\b(?!.*\|)", 
     "Use 'rg' (ripgrep) instead of 'grep' for better performance", 
     "error"),
    
    (r"\bfind\s+\S+\s+-name\b", 
     "Use 'rg --files -g pattern' instead of 'find -name'", 
     "error"),
    
    (r"\bcat\s+.*\|\s*grep", 
     "Use 'rg' directly on files instead of 'cat | grep'", 
     "error"),
    
    # Dangerous operations
    (r"\brm\s+-rf\s+/(?:\s|$)", 
     "DANGER: Attempting to delete root directory!", 
     "error"),
    
    (r"\brm\s+-rf\s+~(?:\s|/|$)", 
     "DANGER: Attempting to delete home directory!", 
     "error"),
    
    (r"\brm\s+-rf\s+\*", 
     "DANGER: Wildcard deletion detected. Please be more specific", 
     "error"),
    
    (r"\brm\s+-rf\s+\.", 
     "DANGER: Attempting to delete current directory", 
     "error"),
    
    # Security concerns
    (r"curl\s+.*\|\s*(?:bash|sh|python|perl|ruby)", 
     "SECURITY: Piping untrusted content directly to interpreter", 
     "error"),
    
    (r"wget\s+.*\|\s*(?:bash|sh|python|perl|ruby)", 
     "SECURITY: Piping untrusted content directly to interpreter", 
     "error"),
    
    (r"\beval\s+", 
     "SECURITY: Use of eval can be dangerous with untrusted input", 
     "warning"),
    
    # File operations
    (r">\s*/dev/null\s+2>&1", 
     "Consider using '&>/dev/null' for redirecting both stdout and stderr", 
     "warning"),
    
    (r"\bchmod\s+777\b", 
     "SECURITY: Setting world-writable permissions is dangerous", 
     "error"),
    
    # Package managers
    (r"\bnpm\s+install\s+-g\b", 
     "Global npm installs should be avoided in project context", 
     "warning"),
    
    (r"\bsudo\s+npm\b", 
     "Never use sudo with npm. Fix npm permissions instead", 
     "error"),
    
    # Git operations
    (r"\bgit\s+push\s+.*--force\b", 
     "Force push detected. This can overwrite remote history", 
     "warning"),
    
    (r"\bgit\s+reset\s+--hard\s+HEAD", 
     "Hard reset will discard all uncommitted changes", 
     "warning"),
]

# Commands that should suggest alternatives
COMMAND_ALTERNATIVES = {
    "ls": "Consider using 'LS' tool instead of 'ls' bash command",
    "cat": "Consider using 'Read' tool instead of 'cat' bash command",
    "head": "Consider using 'Read' tool with limit parameter",
    "tail": "Consider using 'Read' tool with offset parameter",
}


def validate_command(command: str) -> List[Tuple[str, str]]:
    """
    Validate a bash command against safety and best practice rules.
    
    Args:
        command: The bash command to validate
        
    Returns:
        List of (severity, message) tuples for violations found
    """
    violations = []
    
    # Check validation rules
    for pattern, message, severity in VALIDATION_RULES:
        if re.search(pattern, command, re.IGNORECASE):
            violations.append((severity, message))
    
    # Check for commands with better alternatives
    # Extract the first word as the command
    first_word = command.split()[0] if command.split() else ""
    if first_word in COMMAND_ALTERNATIVES:
        violations.append(("warning", COMMAND_ALTERNATIVES[first_word]))
    
    return violations


def check_shellcheck(command: str) -> List[str]:
    """
    Run shellcheck on the command if available.
    
    Args:
        command: The bash command to check
        
    Returns:
        List of shellcheck warnings/errors
    """
    if not shutil.which("shellcheck"):
        logger.debug("shellcheck not available, skipping static analysis")
        return []
    
    try:
        import subprocess
        import tempfile
        
        # Write command to a temporary file for shellcheck
        with tempfile.NamedTemporaryFile(mode='w', suffix='.sh', delete=False) as f:
            f.write("#!/bin/bash\n")
            f.write(command)
            temp_path = f.name
        
        try:
            result = subprocess.run(
                ["shellcheck", "-f", "gcc", temp_path],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.stdout:
                # Parse shellcheck output
                issues = []
                for line in result.stdout.strip().split('\n'):
                    if line:
                        # Extract just the message part
                        parts = line.split(':', 4)
                        if len(parts) >= 5:
                            issues.append(parts[4].strip())
                return issues
        finally:
            os.unlink(temp_path)
            
    except Exception as e:
        logger.debug(f"shellcheck execution failed: {e}")
    
    return []


def main():
    """Main hook execution."""
    data = get_hook_data()
    
    # Only process Bash tool
    tool_name = data.get("tool_name", "")
    if tool_name != "Bash":
        exit_success(f"Skipping bash validation for tool: {tool_name}")
        return
    
    # Extract the command
    command = safe_get(data, "tool_input.command", "")
    if not command:
        logger.debug("No command found in tool input")
        exit_success()
        return
    
    # Validate the command
    violations = validate_command(command)
    
    # Run shellcheck if available
    shellcheck_issues = check_shellcheck(command)
    for issue in shellcheck_issues:
        violations.append(("warning", f"shellcheck: {issue}"))
    
    # Separate errors and warnings
    errors = [msg for sev, msg in violations if sev == "error"]
    warnings = [msg for sev, msg in violations if sev == "warning"]
    
    # Log warnings
    for warning in warnings:
        logger.warning(warning)
    
    # Handle errors
    if errors:
        error_msg = "Command validation failed:\n"
        for error in errors:
            error_msg += f"  • {error}\n"
        error_msg += "\nPlease modify your command to address these issues."
        
        if is_dry_run():
            logger.info(f"[DRY RUN] Would block command: {command}")
            logger.info(f"[DRY RUN] Errors: {errors}")
            exit_success()
        else:
            exit_with_error(error_msg, EXIT_POLICY_VIOLATION)
    else:
        if warnings:
            logger.info(f"Command validated with {len(warnings)} warning(s)")
        else:
            logger.debug(f"Command validated successfully: {command[:50]}...")
        exit_success()


if __name__ == "__main__":
    main()