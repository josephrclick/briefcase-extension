#!/bin/bash
# Git Workflow Automation for Briefcase Extension

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to create kebab-case from description
kebab_case() {
    echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//'
}

# Function to get current branch
current_branch() {
    git branch --show-current
}

# Main command handler
case "$1" in
    "start")
        description="${@:2}"
        if [ -z "$description" ]; then
            echo -e "${RED}Error: Please provide a description${NC}"
            echo "Usage: git-start <description>"
            exit 1
        fi
        
        branch_name="feat/$(kebab_case "$description")"
        
        echo -e "${BLUE}Starting new feature: $description${NC}"
        echo "1. Updating main branch..."
        git checkout main
        git pull origin main
        
        echo "2. Creating feature branch: $branch_name"
        git checkout -b "$branch_name"
        
        echo "3. Pushing branch to origin..."
        git push -u origin "$branch_name"
        
        echo -e "${GREEN}✓ Feature branch '$branch_name' created and ready!${NC}"
        echo -e "${YELLOW}Next steps:${NC}"
        echo "  - Make your changes"
        echo "  - Use 'git-save' for checkpoints"
        echo "  - Use 'git-review' when ready for PR"
        ;;
        
    "save"|"checkpoint")
        current=$(current_branch)
        if [[ "$current" == "main" ]] || [[ "$current" == "master" ]]; then
            echo -e "${RED}Error: Cannot commit directly to $current branch${NC}"
            exit 1
        fi
        
        echo -e "${BLUE}Creating checkpoint...${NC}"
        
        # Get a brief description of changes
        changes=$(git status --short | head -5 | cut -c4- | tr '\n' ', ' | sed 's/,$//')
        if [ -z "$changes" ]; then
            echo -e "${YELLOW}No changes to save${NC}"
            exit 0
        fi
        
        git add .
        git commit -m "wip: checkpoint - $changes" || echo "No changes to commit"
        git push
        
        echo -e "${GREEN}✓ Checkpoint saved and pushed!${NC}"
        ;;
        
    "review")
        current=$(current_branch)
        if [[ "$current" == "main" ]] || [[ "$current" == "master" ]]; then
            echo -e "${RED}Error: Cannot create PR from $current branch${NC}"
            exit 1
        fi
        
        issue_number=""
        if [[ "$2" =~ ^#?([0-9]+)$ ]]; then
            issue_number="${BASH_REMATCH[1]}"
            echo -e "${BLUE}Linking to issue #$issue_number${NC}"
        fi
        
        echo -e "${BLUE}Finalizing work for review...${NC}"
        
        # Extract feature name from branch
        feature_name=$(echo "$current" | sed 's/^[^\/]*\///' | tr '-' ' ')
        
        echo "1. Committing final changes..."
        git add .
        git commit -m "feat: complete $feature_name" || echo "No new changes to commit"
        
        echo "2. Pushing to origin..."
        git push
        
        echo "3. Analyzing changes for PR checklist..."
        
        # Use main as the base branch
        base_branch="main"
        
        # Analyze what files have changed
        changed_files=$(git diff --name-only origin/$base_branch...HEAD 2>/dev/null || git diff --name-only $base_branch...HEAD)
        
        # Initialize dynamic checklist items
        checklist=""
        
        # Check for database changes
        if echo "$changed_files" | grep -q "packages/db/"; then
            checklist="${checklist}
### Database Changes
- [ ] Schema changes documented
- [ ] Migration scripts provided (if needed)
- [ ] SQLite WASM compatibility verified
- [ ] FTS5 indexes updated (if applicable)"
        fi
        
        # Check for extension manifest changes
        if echo "$changed_files" | grep -q "manifest.json"; then
            checklist="${checklist}
### Manifest Changes
- [ ] Permissions are justified and minimal
- [ ] Version number updated appropriately
- [ ] Chrome Web Store requirements met
- [ ] Content Security Policy reviewed"
        fi
        
        # Check for UI/React changes
        if echo "$changed_files" | grep -qE "(\.tsx|\.jsx|\.css)"; then
            checklist="${checklist}
### UI/React Changes
- [ ] UI tested in Chrome side panel
- [ ] Accessibility (ARIA) attributes added
- [ ] Dark mode compatibility checked
- [ ] React hooks used correctly
- [ ] No unnecessary re-renders"
        fi
        
        # Check for provider/LLM changes
        if echo "$changed_files" | grep -q "packages/providers/"; then
            checklist="${checklist}
### LLM Provider Changes
- [ ] Provider interface compatibility maintained
- [ ] API key handling is secure
- [ ] Streaming support tested (if applicable)
- [ ] Error handling implemented
- [ ] Rate limiting considered"
        fi
        
        # Check for extractor changes
        if echo "$changed_files" | grep -q "packages/extractor/"; then
            checklist="${checklist}
### Content Extractor Changes
- [ ] Tested on various websites
- [ ] Readability.js integration verified
- [ ] Edge cases handled gracefully
- [ ] Content sanitization maintained"
        fi
        
        # Check for test changes
        if echo "$changed_files" | grep -qE "\.(test|spec)\.(ts|tsx|js|jsx)"; then
            checklist="${checklist}
### Test Changes
- [ ] All tests pass locally
- [ ] New test coverage added
- [ ] Edge cases covered"
        fi
        
        # Check for TypeScript changes
        has_ts_changes=""
        if echo "$changed_files" | grep -qE "\.(ts|tsx)$"; then
            has_ts_changes="yes"
        fi
        
        # Check for package.json changes
        if echo "$changed_files" | grep -q "package.json"; then
            checklist="${checklist}
### Dependency Changes
- [ ] Dependencies are necessary
- [ ] No security vulnerabilities
- [ ] Lock file updated
- [ ] Bundle size impact reviewed"
        fi
        
        # Generate summary of changed areas
        changed_areas=""
        echo "$changed_files" | grep -q "apps/extension/" && changed_areas="${changed_areas}- Chrome extension core\n"
        echo "$changed_files" | grep -q "packages/db/" && changed_areas="${changed_areas}- Database layer\n"
        echo "$changed_files" | grep -q "packages/providers/" && changed_areas="${changed_areas}- LLM providers\n"
        echo "$changed_files" | grep -q "packages/extractor/" && changed_areas="${changed_areas}- Content extractor\n"
        echo "$changed_files" | grep -q ".github/" && changed_areas="${changed_areas}- GitHub workflows\n"
        
        # Count changed files
        file_count=$(echo "$changed_files" | wc -l)
        
        echo "4. Creating pull request with dynamic checklist..."
        
        # Create PR body
        pr_body="## 📋 Description
Complete implementation of $feature_name

## 📁 Changed Areas (${file_count} files)
${changed_areas:-No specific areas detected}

## 🔄 Type of Change
- [ ] 🐛 Bug fix (non-breaking change)
- [ ] ✨ New feature (non-breaking change)
- [ ] 💥 Breaking change
- [ ] 📝 Documentation update
- [ ] 🎨 Style/UI update
- [ ] ♻️ Code refactor
- [ ] ⚡ Performance improvement
- [ ] ✅ Test update
- [ ] 🔧 Configuration change

## ✅ General Checklist
- [ ] Code follows project conventions (see CLAUDE.md)
- [ ] Conventional commit format used
- [ ] Self-review completed
- [ ] Comments added for complex code"
        
        # Add TypeScript checks if applicable
        if [ -n "$has_ts_changes" ]; then
            pr_body="${pr_body}
- [ ] TypeScript types properly defined
- [ ] No \`any\` types without justification
- [ ] \`npm run typecheck\` passes"
        fi
        
        pr_body="${pr_body}
- [ ] \`npm run lint\` passes
- [ ] \`npm run build\` succeeds
- [ ] \`npm run test\` passes (if tests exist)

## 🔍 Context-Specific Review
${checklist:-No specific checks needed for these changes.}

## 🧪 Testing Performed
- [ ] Tested locally in Chrome
- [ ] Extension loads without errors
- [ ] Core functionality verified
- [ ] No console errors

## 📸 Screenshots
<!-- Add screenshots here if UI changes were made -->

## 📝 Additional Notes
<!-- Any additional context for reviewers -->"
        
        # Add issue closing if number provided
        if [ -n "$issue_number" ]; then
            pr_body="${pr_body}

---
Closes #$issue_number"
        fi
        
        # Create the PR
        gh pr create \
            --base "$base_branch" \
            --title "feat: $feature_name" \
            --body "$pr_body" \
            --web
        
        echo -e "${GREEN}✓ Pull request created with dynamic checklist based on ${file_count} changed files!${NC}"
        ;;
        
    "status")
        echo -e "${BLUE}Checking Git and CI status...${NC}"
        
        echo -e "\n${YELLOW}PR Status:${NC}"
        gh pr status || echo "No pull requests found"
        
        echo -e "\n${YELLOW}Recent CI Runs:${NC}"
        gh run list --limit 3 || echo "No CI runs found"
        
        # Check for failed runs
        if gh run list --limit 1 | grep -q "failure"; then
            echo -e "\n${RED}Latest run failed. Viewing details:${NC}"
            gh run view || true
        fi
        ;;
        
    *)
        echo -e "${RED}Unknown git workflow command: $1${NC}"
        echo "Available commands:"
        echo "  git-start <description>  - Start new feature branch"
        echo "  git-save/git-checkpoint  - Quick WIP commit and push"
        echo "  git-review [#issue]      - Finalize and create PR"
        echo "  git-status               - Show PR and CI status"
        exit 1
        ;;
esac