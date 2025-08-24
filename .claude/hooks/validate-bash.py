#!/usr/bin/env python3
import json
import re
import sys

VALIDATION_RULES = [
    (r"\bgrep\b(?!.*\|)", "Use 'rg' (ripgrep) instead of 'grep' for better performance"),
    (r"\bfind\s+\S+\s+-name\b", "Use 'rg --files -g pattern' instead of 'find -name'"),
    (r"\bcat\s+.*\|\s*grep", "Use 'rg' directly on files instead of 'cat | grep'"),
]

try:
    input_data = json.load(sys.stdin)
    if input_data.get("tool_name") == "Bash":
        command = input_data.get("tool_input", {}).get("command", "")
        for pattern, message in VALIDATION_RULES:
            if re.search(pattern, command):
                print(f"• {message}", file=sys.stderr)
                sys.exit(2)
except Exception:
    pass
sys.exit(0)
