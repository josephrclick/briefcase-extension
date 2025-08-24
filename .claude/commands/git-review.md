# git-review

Create a pull request with automatic dynamic checklists based on changed files.

## Usage
```
/git-review [#issue-number]
```

## What this does
1. Commits all remaining changes: `feat: complete <feature-name>`
2. Pushes to origin
3. Analyzes changed files to create dynamic PR checklist
4. Creates pull request via GitHub CLI
5. Links to issue if number provided

## Examples
```
/git-review          # Creates PR without issue linking
/git-review #35      # Creates PR and adds "Closes #35"
/git-review 35       # Also works without #
```

## Dynamic Checklists
The PR will include context-specific checklists based on what you changed:
- Database changes → Schema documentation checks
- UI changes → Accessibility and dark mode checks
- Manifest changes → Permission justification checks
- TypeScript changes → Type safety checks
- And more...

## Implementation
Execute the following command:

```bash
.claude/commands/git-workflow.sh review {{issue_number}}
```

If no issue number provided, omit the parameter.