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
  node read-responses.js [--id <query-id>] [--json] [--answered] [--pending]

Examples:
  node read-responses.js                  # Summarize all queries & full responses
  node read-responses.js --id q-arch-01   # Show specific query with responses
  node read-responses.js --answered       # Show only queries with submitted responses
  node read-responses.js --json           # Output pure JSON
`);
}

function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--id' && args[i + 1]) {
      parsed.id = args[++i];
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--answered') {
      parsed.answered = true;
    } else if (arg === '--pending') {
      parsed.pending = true;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    }
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  let raw = '';
  try {
    raw = await fs.readFile(DATA_FILE, 'utf-8');
  } catch (err) {
    console.error(`[QueryHub] Could not read ${DATA_FILE}:`, err.message);
    process.exit(1);
  }

  const data = JSON.parse(raw);
  let queries = data.queries || [];

  if (args.id) {
    queries = queries.filter(q => q.id === args.id);
    if (queries.length === 0) {
      console.error(`[QueryHub] Query ID '${args.id}' not found.`);
      process.exit(1);
    }
  }

  if (args.answered) {
    queries = queries.filter(q => (q.responses || []).some(r => (r.content || '').trim().length > 0));
  } else if (args.pending) {
    queries = queries.filter(q => !(q.responses || []).some(r => (r.content || '').trim().length > 0));
  }

  if (args.json) {
    console.log(JSON.stringify({ project: data.project, count: queries.length, queries }, null, 2));
    return;
  }

  console.log(`\n======================================================`);
  console.log(`📋  AGENT QUERY HUB: RESPONSES SUMMARY`);
  console.log(`Project: ${data.project || 'Agent Workspace'}`);
  console.log(`Total Listed Queries: ${queries.length}`);
  console.log(`======================================================\n`);

  if (queries.length === 0) {
    console.log(`No queries matched the filter.`);
    return;
  }

  queries.forEach((q, idx) => {
    const responses = (q.responses || []).filter(r => (r.content || '').trim().length > 0);
    const totalResponses = (q.responses || []).length;
    const status = responses.length > 0 ? `🟢 ${responses.length} response(s)` : `🟡 Pending`;

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[Q${idx + 1}] ID: ${q.id}  |  Status: ${status}`);
    console.log(`Title: ${q.title}`);
    if (q.tags && q.tags.length) console.log(`Tags:  ${q.tags.join(', ')}`);
    console.log(`------------------------------------------------------`);
    console.log(`PROMPT:`);
    console.log(q.text || '(empty prompt)');
    console.log(`------------------------------------------------------`);

    if (totalResponses === 0) {
      console.log(`(No responses submitted yet)\n`);
    } else {
      console.log(`SUBMITTED RESPONSES (${responses.length}/${totalResponses}):`);
      q.responses.forEach((r, ri) => {
        const model = r.model && r.model.trim() ? r.model.trim() : `Response ${ri + 1}`;
        const hasContent = (r.content || '').trim().length > 0;
        console.log(`\n--- [Response ${ri + 1}] ${model} ${r.notes ? `(${r.notes})` : ''} ---`);
        if (!hasContent) {
          console.log(`(slot created, no content pasted)`);
        } else {
          console.log(r.content.trim());
        }
      });
      console.log('');
    }

    if (q.consolidated && q.consolidated.trim()) {
      console.log(`⭐ CONSOLIDATED ANSWER:`);
      console.log(q.consolidated.trim());
      console.log('');
    }
  });
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

main().catch(err => {
  console.error('[QueryHub] Error:', err);
  process.exit(1);
});
