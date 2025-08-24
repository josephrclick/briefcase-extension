# git-status

Check the status of pull requests and CI workflow runs.

## Usage
```
/git-status
```

## What this does
1. Shows all open pull requests
2. Lists recent CI workflow runs
3. Displays details of any failed runs

## Output includes
- PR status (open, merged, closed)
- CI run status (success, failure, in progress)
- Failed run details with error messages

## Implementation
Execute the following command:

```bash
.claude/commands/git-workflow.sh status
```

No additional parameters needed.