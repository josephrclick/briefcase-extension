#!/usr/bin/env node

/**
 * Work Log Pruning Script for CLAUDE.md
 * 
 * This script automatically archives old work log entries from CLAUDE.md
 * to keep the file focused on recent work while preserving history.
 * 
 * Usage: node .claude/scripts/prune-worklog.js [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  claudeMdPath: path.join(__dirname, '../../CLAUDE.md'),
  archivesDir: path.join(__dirname, '../archives'),
  keepSections: 2, // Number of recent sections to keep
  workLogMarker: '## Work Log',
  sectionPattern: /^### \d{4}-\d{2}-\d{2}/m,
};

/**
 * Parse work log sections from CLAUDE.md content
 */
function parseWorkLogSections(content) {
  const workLogStart = content.indexOf(CONFIG.workLogMarker);
  if (workLogStart === -1) {
    throw new Error('Work Log section not found in CLAUDE.md');
  }

  const beforeWorkLog = content.substring(0, workLogStart);
  const workLogContent = content.substring(workLogStart);
  
  // Split work log into sections by H3 headers (### Date - Title)
  const sections = [];
  const lines = workLogContent.split('\n');
  let currentSection = [];
  let inWorkLog = false;
  
  for (const line of lines) {
    if (line === CONFIG.workLogMarker) {
      inWorkLog = true;
      continue;
    }
    
    if (inWorkLog && line.match(/^### \d{4}-\d{2}-\d{2}/)) {
      if (currentSection.length > 0) {
        sections.push(currentSection.join('\n'));
      }
      currentSection = [line];
    } else if (currentSection.length > 0) {
      currentSection.push(line);
    }
  }
  
  if (currentSection.length > 0) {
    sections.push(currentSection.join('\n'));
  }
  
  return { beforeWorkLog, sections };
}

/**
 * Create archive filename from section content
 */
function createArchiveFilename(sectionContent) {
  const dateMatch = sectionContent.match(/### (\d{4}-\d{2}-\d{2})/);
  if (!dateMatch) {
    return `worklog-${new Date().toISOString().split('T')[0]}.md`;
  }
  
  const date = dateMatch[1];
  const titleMatch = sectionContent.match(/### \d{4}-\d{2}-\d{2}[^-]*- (.+)/);
  const title = titleMatch ? `-${titleMatch[1].toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : '';
  
  return `worklog-${date}${title}.md`;
}

/**
 * Archive old sections
 */
function archiveSections(sections, dryRun = false) {
  const toArchive = sections.slice(0, -CONFIG.keepSections);
  if (toArchive.length === 0) {
    console.log('No sections to archive (keeping last', CONFIG.keepSections, 'sections)');
    return;
  }
  
  const year = new Date().getFullYear();
  const yearDir = path.join(CONFIG.archivesDir, year.toString());
  
  if (!dryRun && !fs.existsSync(yearDir)) {
    fs.mkdirSync(yearDir, { recursive: true });
  }
  
  const archived = [];
  
  for (const section of toArchive) {
    const filename = createArchiveFilename(section);
    const archivePath = path.join(yearDir, filename);
    
    if (dryRun) {
      console.log(`[DRY RUN] Would archive to: ${archivePath}`);
    } else {
      const archiveContent = `# Archived Work Log Entry

*This file contains an archived work log entry from CLAUDE.md*
*Archived on: ${new Date().toISOString().split('T')[0]}*

---

${section}`;
      
      fs.writeFileSync(archivePath, archiveContent);
      console.log(`Archived to: ${archivePath}`);
    }
    
    archived.push({ path: path.relative(CONFIG.archivesDir, archivePath), section });
  }
  
  return archived;
}

/**
 * Update the archive index
 */
function updateArchiveIndex(archived, dryRun = false) {
  const indexPath = path.join(CONFIG.archivesDir, 'INDEX.md');
  
  if (dryRun) {
    console.log('[DRY RUN] Would update archive index');
    return;
  }
  
  let indexContent = fs.existsSync(indexPath) 
    ? fs.readFileSync(indexPath, 'utf8')
    : `# Work Log Archives Index

This directory contains archived work log entries from CLAUDE.md to keep the main file focused on recent work.

## Archive Files

`;
  
  // Add new entries to the index
  for (const { path: archivePath, section } of archived) {
    const titleMatch = section.match(/### (.+)/);
    const title = titleMatch ? titleMatch[1] : 'Untitled Entry';
    const year = archivePath.split('/')[0];
    
    // Check if year section exists
    if (!indexContent.includes(`### ${year}`)) {
      const insertPoint = indexContent.indexOf('## Archive Files') + '## Archive Files'.length;
      indexContent = indexContent.slice(0, insertPoint) + `\n\n### ${year}\n` + indexContent.slice(insertPoint);
    }
    
    // Add entry under year section
    const yearSection = indexContent.indexOf(`### ${year}`);
    const nextSection = indexContent.indexOf('\n### ', yearSection + 1);
    const insertPoint = nextSection === -1 ? indexContent.length : nextSection;
    
    const entry = `\n- [${title}](${archivePath})`;
    
    if (!indexContent.includes(entry)) {
      indexContent = indexContent.slice(0, insertPoint) + entry + indexContent.slice(insertPoint);
    }
  }
  
  fs.writeFileSync(indexPath, indexContent);
  console.log('Updated archive index');
}

/**
 * Update CLAUDE.md with pruned content
 */
function updateClaudeMd(beforeWorkLog, keptSections, dryRun = false) {
  const archiveNote = '\n📁 **Archives**: This log shows recent work only. For historical entries, see [.claude/archives/INDEX.md](.claude/archives/INDEX.md)\n';
  
  const newContent = beforeWorkLog + CONFIG.workLogMarker + archiveNote + '\n---\n\n## Work Log\n\n' + keptSections.join('\n\n');
  
  if (dryRun) {
    console.log('[DRY RUN] Would update CLAUDE.md');
    console.log('Keeping', keptSections.length, 'recent sections');
  } else {
    fs.writeFileSync(CONFIG.claudeMdPath, newContent);
    console.log('Updated CLAUDE.md');
  }
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  
  if (dryRun) {
    console.log('Running in DRY RUN mode - no files will be modified\n');
  }
  
  try {
    // Read CLAUDE.md
    const content = fs.readFileSync(CONFIG.claudeMdPath, 'utf8');
    
    // Parse sections
    const { beforeWorkLog, sections } = parseWorkLogSections(content);
    console.log(`Found ${sections.length} work log sections`);
    
    if (sections.length <= CONFIG.keepSections) {
      console.log(`No pruning needed (${sections.length} sections <= ${CONFIG.keepSections} keep limit)`);
      return;
    }
    
    // Archive old sections
    const archived = archiveSections(sections, dryRun);
    
    if (archived && archived.length > 0) {
      // Update archive index
      updateArchiveIndex(archived, dryRun);
      
      // Update CLAUDE.md with kept sections
      const keptSections = sections.slice(-CONFIG.keepSections);
      updateClaudeMd(beforeWorkLog, keptSections, dryRun);
      
      console.log(`\n✅ Pruning complete: archived ${archived.length} sections, kept ${CONFIG.keepSections} recent sections`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
main();