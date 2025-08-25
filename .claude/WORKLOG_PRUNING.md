# Work Log Pruning Documentation

## Overview

The work log pruning system keeps CLAUDE.md focused on recent work while preserving historical context in searchable archives.

## Directory Structure

```
.claude/
├── archives/
│   ├── INDEX.md           # Archive index with links to all archived entries
│   └── 2025/              # Year-based subdirectories
│       └── worklog-*.md   # Individual archived work log entries
└── scripts/
    └── prune-worklog.js   # Pruning script
```

## How It Works

1. **Retention Policy**: CLAUDE.md keeps only the 2 most recent work log sections
2. **Section Detection**: Sections are identified by H3 headers starting with dates (`### YYYY-MM-DD`)
3. **Archive Process**: Older sections are moved to date-stamped files in `.claude/archives/`
4. **Index Updates**: The archive INDEX.md is automatically updated with links to new archives

## Usage

### Manual Pruning

Run the pruning script manually when the work log grows too large:

```bash
# Perform actual pruning
npm run prune:worklog

# Preview what would be pruned (dry run)
npm run prune:worklog:dry
```

### When to Prune

Consider pruning when:
- CLAUDE.md has more than 2-3 work log sections
- The file becomes slow to load or edit
- Starting a new major phase of development
- After completing a significant milestone

## Archive Format

Archived files follow this naming pattern:
- `worklog-YYYY-MM-DD.md` - Basic date-based naming
- `worklog-YYYY-MM-DD-description.md` - With optional description from section title

Example: `worklog-2025-08-24-git-workflow-automation.md`

## Finding Historical Information

1. **Check Recent Work**: Start with CLAUDE.md for the most recent 1-2 sessions
2. **Browse Archives**: Visit [.claude/archives/INDEX.md](.claude/archives/INDEX.md) for older entries
3. **Search in IDE**: Use your IDE's search to find content across all archive files
4. **Git History**: Use `git log` to see when specific archives were created

## Configuration

Edit `.claude/scripts/prune-worklog.js` to adjust:
- `keepSections`: Number of sections to keep in CLAUDE.md (default: 2)
- `sectionPattern`: Regex pattern for detecting section headers
- `archivesDir`: Location of archive files

## Best Practices

1. **Before Pruning**:
   - Commit any uncommitted work log changes
   - Review what will be archived with `--dry-run`

2. **After Pruning**:
   - Verify CLAUDE.md still contains recent work
   - Check that archives were created successfully
   - Commit the changes with a descriptive message

3. **Archive Maintenance**:
   - Keep archives in version control (not .gitignored)
   - Periodically review very old archives (>1 year)
   - Consider consolidating archives by quarter/year if needed

## Troubleshooting

### Script Can't Find Work Log
- Ensure CLAUDE.md contains `## Work Log` section
- Check that sections use H3 headers (`### YYYY-MM-DD`)

### Archives Not Created
- Verify `.claude/archives/` directory exists
- Check file permissions
- Run with `--dry-run` to see what would happen

### Manual Recovery
If needed, archived content can be manually copied back to CLAUDE.md from the archive files.

## Future Enhancements

Potential improvements for consideration:
- Automated pruning via git hooks
- Configurable retention period (by date instead of count)
- Archive compression for very old entries
- Search interface for archives