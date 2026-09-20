#!/usr/bin/env node
/**
 * fetch-export.js
 * Programmatically fetch or save Query Hub compilation via API without user UI intervention.
 * 
 * Usage:
 *   node query-hub/scripts/fetch-export.js --check
 *   node query-hub/scripts/fetch-export.js --format=md --out=./compilation.md
 *   node query-hub/scripts/fetch-export.js --format=json --out=./compilation.json
 *   node query-hub/scripts/fetch-export.js --sync-disk
 *   node query-hub/scripts/fetch-export.js > compilation.md
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const params = {};
for (const arg of args) {
  if (arg.startsWith('--')) {
    const [key, ...valParts] = arg.slice(2).split('=');
    params[key] = valParts.length > 0 ? valParts.join('=') : true;
  }
}

const PORT = parseInt(params.port || process.env.PORT || '3456', 10);
const HOST = params.host || '127.0.0.1';

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: raw
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  // Mode 1: Check readiness
  if (params.check || params.status) {
    try {
      const res = await request({
        hostname: HOST,
        port: PORT,
        path: '/api/queries/readiness',
        method: 'GET'
      });
      if (res.statusCode !== 200) {
        console.error(`Error: Server responded with status ${res.statusCode}: ${res.data}`);
        process.exit(1);
      }
      const data = JSON.parse(res.data);
      console.log(`\n======================================================`);
      console.log(`📊  QUERY HUB STATUS: ${data.project}`);
      console.log(`======================================================`);
      console.log(`• Total Queries:    ${data.totalQueries}`);
      console.log(`• Total Responses:  ${data.totalResponses}`);
      console.log(`• Fully Answered:   ${data.isComplete ? '✅ YES' : '⏳ IN PROGRESS'}`);
      console.log(`\nQueries Breakdown:`);
      data.queries.forEach(q => {
        const check = q.hasResponses ? `✅ ${q.responsesCount} response(s)` : '❌ Awaiting responses';
        console.log(`  [Q${q.index}] ${q.title} -> ${check}`);
      });
      console.log(`======================================================\n`);
      return;
    } catch (e) {
      console.error(`Failed to connect to Query Hub on port ${PORT}: ${e.message}`);
      process.exit(1);
    }
  }

  // Mode 2: Generate ADR from query
  if (params.adr) {
    try {
      const queryId = typeof params.adr === 'string' ? params.adr : params.id;
      if (!queryId) {
        console.error('Error: Must specify query ID, e.g. --adr=q-arch-drawer-01');
        process.exit(1);
      }
      const res = await request({
        hostname: HOST,
        port: PORT,
        path: `/api/queries/${queryId}/export-adr`,
        method: 'POST'
      });
      if (res.statusCode !== 200) {
        console.error(`Error: Server responded with status ${res.statusCode}: ${res.data}`);
        process.exit(1);
      }
      const data = JSON.parse(res.data);
      console.log(`\n======================================================`);
      console.log(`📝  ADR GENERATED SUCCESSFULLY`);
      console.log(`======================================================`);
      console.log(`• File:     ${data.relativePath}`);
      console.log(`• Query:    ${data.query.title}`);
      console.log(`• Status:   Marked as RESOLVED`);
      console.log(`======================================================\n`);
      return;
    } catch (e) {
      console.error(`Failed to generate ADR: ${e.message}`);
      process.exit(1);
    }
  }

  // Mode 3: Trigger server-side disk sync
  if (params['sync-disk'] || params.sync) {
    try {
      const targetPath = params.out || null;
      const format = params.format || 'md';
      const body = JSON.stringify({ targetPath, format });
      const res = await request({
        hostname: HOST,
        port: PORT,
        path: '/api/export/save-to-disk',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      }, body);
      const data = JSON.parse(res.data);
      console.log(`✅ Disk export triggered successfully.`);
      console.log(JSON.stringify(data, null, 2));
      return;
    } catch (e) {
      console.error(`Failed to trigger disk export: ${e.message}`);
      process.exit(1);
    }
  }

  // Mode 3: Fetch compilation (markdown or json)
  const format = (params.format || 'md').toLowerCase();
  try {
    const res = await request({
      hostname: HOST,
      port: PORT,
      path: `/api/export?format=${format}`,
      method: 'GET'
    });

    if (res.statusCode !== 200) {
      console.error(`Failed to fetch export: ${res.statusCode} ${res.data}`);
      process.exit(1);
    }

    if (params.out) {
      const outPath = path.resolve(process.cwd(), params.out);
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, res.data, 'utf-8');
      console.log(`✅ Saved ${format.toUpperCase()} compilation (${(res.data.length / 1024).toFixed(1)} KB) to ${outPath}`);
    } else {
      process.stdout.write(res.data);
    }
  } catch (e) {
    console.error(`Failed to fetch from Query Hub: ${e.message}`);
    process.exit(1);
  }
}

main();
