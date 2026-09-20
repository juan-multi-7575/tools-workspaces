#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT_DIR, 'data', 'queries.json');
const EXPORTS_DIR = path.join(ROOT_DIR, 'exports');
const BACKUPS_DIR = path.join(ROOT_DIR, 'data', 'backups');

function sanitizeSlug(str) {
  return (str || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
}

export async function exportAllFiles() {
  await fs.mkdir(EXPORTS_DIR, { recursive: true });
  await fs.mkdir(BACKUPS_DIR, { recursive: true });

  const raw = await fs.readFile(DATA_FILE, 'utf-8');
  const data = JSON.parse(raw);
  const queries = data.queries || [];

  // 1. Create a timestamped backup of the database
  const backupFile = path.join(BACKUPS_DIR, `queries.backup.${Date.now()}.json`);
  await fs.writeFile(backupFile, raw, 'utf-8');

  // 2. Export full compilation JSON
  const jsonExport = path.join(EXPORTS_DIR, 'compilation.json');
  await fs.writeFile(jsonExport, JSON.stringify(data, null, 2), 'utf-8');

  // 3. Export full master Markdown
  let masterMd = `# ${data.project || 'Agent Response Compilation'}\n\n`;
  masterMd += `> **Generated:** ${new Date().toISOString()}  \n`;
  masterMd += `> **Total Queries:** ${queries.length}  \n`;
  masterMd += `> **Database File:** \`${DATA_FILE}\`  \n\n`;
  masterMd += `---\n\n`;

  const writtenFiles = [jsonExport];

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    const qIndex = i + 1;
    const responses = q.responses || [];

    masterMd += `## Q${qIndex}: ${q.title || 'Untitled Query'}\n\n`;
    masterMd += `- **ID:** \`${q.id}\`\n`;
    if (q.tags && q.tags.length) {
      masterMd += `- **Tags:** ${q.tags.map(t => `\`${t}\``).join(', ')}\n`;
    }
    masterMd += `- **Total Responses:** ${responses.length}\n`;
    masterMd += `- **Updated:** ${q.updatedAt || q.createdAt || new Date().toISOString()}\n\n`;

    masterMd += `### Agent Query Prompt\n\n\`\`\`\n${q.text || ''}\n\`\`\`\n\n`;
    masterMd += `---\n\n`;
    masterMd += `### Model Responses (${responses.length})\n\n`;

    if (responses.length === 0) {
      masterMd += `*No responses recorded yet.*\n\n`;
    } else {
      for (let ri = 0; ri < responses.length; ri++) {
        const r = responses[ri];
        const rIndex = ri + 1;
        const modelName = (r.model && r.model.trim()) ? r.model.trim() : `Response ${rIndex}`;

        masterMd += `#### ${rIndex}. ${modelName}\n\n`;
        masterMd += `> **Saved:** ${r.updatedAt || ''} | **Length:** ${(r.content || '').length.toLocaleString()} chars\n\n`;
        masterMd += `${r.content || ''}\n\n`;
        masterMd += `---\n\n`;
      }
    }
  }

  const masterFile = path.join(EXPORTS_DIR, 'FULL_COMPILATION.md');
  await fs.writeFile(masterFile, masterMd, 'utf-8');
  writtenFiles.push(masterFile);

  return { backupFile, writtenFiles, queriesCount: queries.length };
}

// Run if called as CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  exportAllFiles()
    .then(({ backupFile, writtenFiles, queriesCount }) => {
      console.log(`\n======================================================`);
      console.log(`📁  AGENT QUERY HUB: ALL RESPONSES EXPORTED TO DISK`);
      console.log(`======================================================`);
      console.log(`✅ Backup Created:   ${path.relative(ROOT_DIR, backupFile)}`);
      console.log(`✅ Queries Processed: ${queriesCount}`);
      console.log(`✅ Files Written (${writtenFiles.length}):`);
      writtenFiles.forEach(f => {
        console.log(`   - ${path.relative(ROOT_DIR, f)}`);
      });
      console.log(`======================================================\n`);
    })
    .catch(err => {
      console.error('[Export Error]:', err);
      process.exit(1);
    });
}
