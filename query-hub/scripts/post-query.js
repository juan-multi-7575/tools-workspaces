#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, '..', 'data', 'queries.json');

function printUsage() {
  console.log(`
Usage:
  node post-query.js --title "<Title>" --text "<Query prompt text>" [--tags "tag1,tag2"]
  node post-query.js --file <path/to/prompt.md> [--title "<Title>"] [--tags "tag1,tag2"]

Examples:
  node post-query.js --title "Cache Invalidation" --text "How should we invalidate cache on update?" --tags "cache,api"
  node post-query.js --file ./prompts/arch.md
`);
}

function parseArgs(args) {
  const parsed = { tags: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--title' && args[i + 1]) {
      parsed.title = args[++i];
    } else if (arg === '--text' && args[i + 1]) {
      parsed.text = args[++i];
    } else if (arg === '--file' && args[i + 1]) {
      parsed.file = args[++i];
    } else if (arg === '--tags' && args[i + 1]) {
      parsed.tags = args[++i].split(',').map(s => s.trim()).filter(Boolean);
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    }
  }
  return parsed;
}

function uid() {
  return `q-${Math.random().toString(36).slice(2, 7)}-${Date.now().toString(36).slice(-4)}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || (!args.text && !args.file)) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  let text = args.text || '';
  let title = args.title || '';

  if (args.file) {
    const filePath = path.resolve(process.cwd(), args.file);
    const content = await fs.readFile(filePath, 'utf-8');
    text = content;
    if (!title) {
      // First line as title if begins with #
      const lines = content.split('\n');
      const firstLine = lines.find(l => l.trim().length > 0) || 'Imported Query';
      title = firstLine.replace(/^#+\s*/, '').trim().slice(0, 80);
    }
  }

  if (!title) {
    title = text.slice(0, 50).replace(/[\r\n]+/g, ' ').trim() + (text.length > 50 ? '...' : '');
  }

  // Load queries.json
  let data = { project: 'Agent Query Workspace', queries: [] };
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    data = JSON.parse(raw);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const newQuery = {
    id: uid(),
    title,
    text,
    tags: args.tags || [],
    consolidated: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    responses: []
  };

  data.queries = [newQuery, ...(data.queries || [])];

  const tmp = `${DATA_FILE}.tmp.${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmp, DATA_FILE);

  console.log(`[QueryHub] Successfully posted new query:`);
  console.log(`  ID:    ${newQuery.id}`);
  console.log(`  Title: ${newQuery.title}`);
  console.log(`  Tags:  ${newQuery.tags.join(', ') || '(none)'}`);
  console.log(`  File:  ${DATA_FILE}`);
}

main().catch(err => {
  console.error('[QueryHub] Error posting query:', err);
  process.exit(1);
});
