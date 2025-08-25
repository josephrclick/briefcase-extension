#!/bin/bash
# Manages updates to the Work Log in CLAUDE.md
set -e

CLAUDE_MD="CLAUDE.md"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# --- Helper Functions ---
ensure_claude_md_exists() {
    if [ ! -f "$CLAUDE_MD" ]; then
        echo -e "${RED}Error: $CLAUDE_MD not found.${NC}" >&2
        exit 1
    fi
}

# --- Actions ---
update_branch() {
    local branch_name="$1"
    if [ -z "$branch_name" ]; then
        echo -e "${RED}Error: Branch name is required.${NC}" >&2
        exit 1
    fi

    # Check if the target line exists before trying to replace it
    if ! grep -q "^\*\*Current Branch\*\*:" "$CLAUDE_MD"; then
        echo -e "${RED}Error: '**Current Branch**:' line not found in $CLAUDE_MD.${NC}" >&2
        echo "Please add it under the '## Work Log' heading to enable automation." >&2
        exit 1
    fi
    
    # Use a temp file for cross-platform compatibility (macOS/Linux sed)
    # Escape forward slashes in branch name for sed
    escaped_branch=$(echo "$branch_name" | sed 's/\//\\\//g')
    sed "s/^\*\*Current Branch\*\*:.*/\*\*Current Branch\*\*: \`$escaped_branch\`/" "$CLAUDE_MD" > "$CLAUDE_MD.tmp" && mv "$CLAUDE_MD.tmp" "$CLAUDE_MD"
    echo -e "${GREEN}✓ CLAUDE.md: Updated current branch to '$branch_name'.${NC}"
}

add_entry() {
    local summary="$1"
    local pr_url="$2"
    local branch_name="$3"
    local today
    today=$(date +"%Y-%m-%d")
    
    # Extract PR number from URL for the link text, e.g., "123" from ".../pull/123"
    local pr_number
    pr_number=$(basename "$pr_url")

    # Prepare the markdown entry using printf for readability
    local new_entry
    new_entry=$(printf "### %s - %s\n\n- **Work Done**: Completed '%s' on branch \`%s\`.\n- **Outcome**: Created PR [#%s](%s) for review.\n" \
        "$today" "$summary" "$summary" "$branch_name" "$pr_number" "$pr_url")

    # Use awk to insert the new entry right after the '---' separator line under Current Branch
    awk -v entry="$new_entry" '
    1;
    /^\*\*Current Branch\*\*:/ { found_branch=1 }
    found_branch && /^---/ && !inserted {
        print "";
        print entry;
        inserted=1;
    }
    ' "$CLAUDE_MD" > "$CLAUDE_MD.tmp" && mv "$CLAUDE_MD.tmp" "$CLAUDE_MD"
    echo -e "${GREEN}✓ CLAUDE.md: Added new work log entry.${NC}"
}

# --- Main Command Handler ---
ensure_claude_md_exists

case "$1" in
    "set-branch")
        update_branch "$2"
        ;;
    "add-entry")
        if [ $# -ne 4 ]; then
            echo -e "${RED}Usage: $0 add-entry <summary> <pr_url> <branch>${NC}" >&2
            exit 1
        fi
        add_entry "$2" "$3" "$4"
        ;;
    *)
        echo -e "${RED}Usage: $0 {set-branch <branch> | add-entry <summary> <pr_url> <branch>}${NC}" >&2
        exit 1
        ;;
esac