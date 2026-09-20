import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportAllFiles } from './scripts/export-files.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3456', 10);
const DATA_FILE = path.join(__dirname, 'data', 'queries.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Helper to safely read queries database
async function readData() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      const initial = { project: 'Agent Query Workspace', queries: [] };
      await fs.writeFile(DATA_FILE, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    throw err;
  }
}

// Helper to safely write queries database
async function writeData(data) {
  const tmp = `${DATA_FILE}.tmp.${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmp, DATA_FILE);
  exportAllFiles().catch((e) => console.error('[AutoExport Error]:', e.message));
}

function uid(prefix = 'q') {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-4)}`;
}

// Parse request JSON body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 50 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Send JSON response
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data, null, 2));
}

// Generate Markdown export
function formatMarkdown(data, queryId = null) {
  let list = data.queries || [];
  if (queryId) list = list.filter((q) => q.id === queryId);

  let md = `# ${data.project || 'Agent Response Compilation'}\n\n`;
  md += `Exported: ${new Date().toISOString()}\n`;
  md += `Total Queries: ${list.length}\n\n`;
  md += `---\n\n`;

  list.forEach((q, i) => {
    md += `## Query ${i + 1}: ${q.title || 'Untitled Query'}\n\n`;
    if (q.tags && q.tags.length) {
      md += `**Tags:** ${q.tags.map((t) => `\`${t}\``).join(', ')}\n\n`;
    }
    md += `### Prompt / Task Definition\n\n\`\`\`\n${q.text || ''}\n\`\`\`\n\n`;

    const responses = q.responses || [];
    md += `### Responses (${responses.length})\n\n`;
    if (responses.length === 0) {
      md += `*No responses recorded yet.*\n\n`;
    } else {
      responses.forEach((r, ri) => {
        const modelName = r.model && r.model.trim() ? r.model.trim() : `Response ${ri + 1}`;
        md += `#### ${ri + 1}. ${modelName}${r.notes ? ` (${r.notes})` : ''}\n\n`;
        md += `\`\`\`\n${r.content || ''}\n\`\`\`\n\n`;
      });
    }

    if (q.consolidated && q.consolidated.trim()) {
      md += `### Consolidated Agent Answer\n\n${q.consolidated}\n\n`;
    }

    md += `---\n\n`;
  });

  return md;
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const pathname = urlObj.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  try {
    // API: Health check
    if (pathname === '/api/health') {
      return sendJson(res, 200, { status: 'ok', time: new Date().toISOString() });
    }

    // API: List & query manipulation
    if (pathname === '/api/queries' && method === 'GET') {
      const data = await readData();
      return sendJson(res, 200, data);
    }

    if (pathname === '/api/queries' && method === 'POST') {
      const body = await parseBody(req);
      const data = await readData();
      const newQuery = {
        id: body.id || uid('q'),
        title: body.title || 'Untitled Query',
        text: body.text || '',
        tags: Array.isArray(body.tags) ? body.tags : (body.tags ? String(body.tags).split(',').map(s=>s.trim()).filter(Boolean) : []),
        consolidated: body.consolidated || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        responses: Array.isArray(body.responses) ? body.responses : []
      };
      data.queries = [newQuery, ...(data.queries || [])];
      await writeData(data);
      return sendJson(res, 201, newQuery);
    }

    // Readiness status endpoint: GET /api/queries/readiness or /api/status
    if ((pathname === '/api/queries/readiness' || pathname === '/api/status') && method === 'GET') {
      const data = await readData();
      const queries = data.queries || [];
      const totalResponses = queries.reduce((acc, q) => acc + (q.responses || []).length, 0);
      const isComplete = queries.length > 0 && queries.every(q => (q.responses || []).length > 0);
      return sendJson(res, 200, {
        project: data.project || 'Agent Query Workspace',
        totalQueries: queries.length,
        totalResponses,
        isComplete,
        queries: queries.map((q, idx) => ({
          index: idx + 1,
          id: q.id,
          title: q.title || `Query ${idx + 1}`,
          responsesCount: (q.responses || []).length,
          hasResponses: (q.responses || []).length > 0,
          updatedAt: q.updatedAt || q.createdAt
        })),
        lastUpdated: new Date().toISOString()
      });
    }

    // Export query as ADR: POST /api/queries/:id/export-adr
    const adrMatch = pathname.match(/^\/api\/queries\/([a-zA-Z0-9_-]+)\/export-adr$/);
    if (adrMatch && method === 'POST') {
      const queryId = adrMatch[1];
      const data = await readData();
      const qIndex = data.queries.findIndex(q => q.id === queryId);
      if (qIndex === -1) return sendJson(res, 404, { error: 'Query not found' });
      const query = data.queries[qIndex];

      const adrDir = path.join(__dirname, '..', 'docs', 'adr');
      await fs.mkdir(adrDir, { recursive: true });

      const files = await fs.readdir(adrDir);
      let maxNum = 0;
      for (const f of files) {
        const m = f.match(/^(\d{4})-/);
        if (m) {
          const n = parseInt(m[1], 10);
          if (n > maxNum) maxNum = n;
        }
      }
      const nextNum = String(maxNum + 1).padStart(4, '0');
      const slug = (query.title || 'architecture-decision')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50);

      const filename = `${nextNum}-${slug}.md`;
      const targetPath = path.join(adrDir, filename);

      const responses = query.responses || [];
      let bodyText = `# ${query.title || 'Architecture Decision'}\n\n`;
      bodyText += `## Status\nAccepted\n\n`;
      bodyText += `## Context\n${query.text || 'No context specified.'}\n\n`;

      if (query.consolidated && query.consolidated.trim()) {
        bodyText += `## Decision\n${query.consolidated}\n\n`;
      } else if (responses.length > 0) {
        bodyText += `## Decision & Expert Consensus\n`;
        responses.forEach((r, ri) => {
          const model = r.model && r.model.trim() ? r.model.trim() : `Expert Model ${ri + 1}`;
          bodyText += `### ${model} Recommendation\n${r.content || ''}\n\n`;
        });
      } else {
        bodyText += `## Decision\nDecision pending architectural implementation.\n\n`;
      }

      bodyText += `## Alternatives Considered\n`;
      bodyText += `- Evaluated architectural options across ${responses.length} model outputs in Agent Query Hub.\n\n`;
      bodyText += `---\n*Generated from Agent Query Hub: \`${query.id}\`*\n`;

      await fs.writeFile(targetPath, bodyText, 'utf-8');

      // Auto-mark query as resolved
      query.status = 'resolved';
      query.updatedAt = new Date().toISOString();
      await writeData(data);

      return sendJson(res, 200, {
        success: true,
        filename,
        relativePath: `docs/adr/${filename}`,
        targetPath,
        query
      });
    }

    // Toggle query status: POST /api/queries/:id/status
    const statusMatch = pathname.match(/^\/api\/queries\/([a-zA-Z0-9_-]+)\/status$/);
    if (statusMatch && method === 'POST') {
      const queryId = statusMatch[1];
      const data = await readData();
      const qIndex = data.queries.findIndex(q => q.id === queryId);
      if (qIndex === -1) return sendJson(res, 404, { error: 'Query not found' });
      const body = await parseBody(req);
      data.queries[qIndex].status = body.status || 'open';
      data.queries[qIndex].updatedAt = new Date().toISOString();
      await writeData(data);
      return sendJson(res, 200, { success: true, query: data.queries[qIndex] });
    }

    // Single query matching: /api/queries/:id
    const queryMatch = pathname.match(/^\/api\/queries\/([a-zA-Z0-9_-]+)$/);
    if (queryMatch) {
      const queryId = queryMatch[1];
      const data = await readData();
      const qIndex = data.queries.findIndex(q => q.id === queryId);

      if (method === 'GET') {
        if (qIndex === -1) return sendJson(res, 404, { error: 'Query not found' });
        return sendJson(res, 200, data.queries[qIndex]);
      }

      if (method === 'PUT') {
        if (qIndex === -1) return sendJson(res, 404, { error: 'Query not found' });
        const body = await parseBody(req);
        const existing = data.queries[qIndex];
        const updated = {
          ...existing,
          title: body.title !== undefined ? body.title : existing.title,
          text: body.text !== undefined ? body.text : existing.text,
          status: body.status !== undefined ? body.status : (existing.status || 'open'),
          tags: body.tags !== undefined ? (Array.isArray(body.tags) ? body.tags : String(body.tags).split(',').map(s=>s.trim()).filter(Boolean)) : existing.tags,
          consolidated: body.consolidated !== undefined ? body.consolidated : existing.consolidated,
          responses: body.responses !== undefined ? body.responses : existing.responses,
          updatedAt: new Date().toISOString()
        };
        data.queries[qIndex] = updated;
        if (body.project) data.project = body.project;
        await writeData(data);
        return sendJson(res, 200, updated);
      }

      if (method === 'DELETE') {
        if (qIndex === -1) return sendJson(res, 404, { error: 'Query not found' });
        const deleted = data.queries.splice(qIndex, 1)[0];
        await writeData(data);
        return sendJson(res, 200, { success: true, deleted });
      }
    }

    // Add response to query: POST /api/queries/:id/responses
    const respAddMatch = pathname.match(/^\/api\/queries\/([a-zA-Z0-9_-]+)\/responses$/);
    if (respAddMatch && method === 'POST') {
      const queryId = respAddMatch[1];
      const data = await readData();
      const query = data.queries.find(q => q.id === queryId);
      if (!query) return sendJson(res, 404, { error: 'Query not found' });

      const body = await parseBody(req);
      const newResponse = {
        id: body.id || uid('resp'),
        model: (body.model || '').trim(),
        notes: (body.notes || '').trim(),
        content: body.content || '',
        updatedAt: new Date().toISOString()
      };
      if (!Array.isArray(query.responses)) query.responses = [];
      query.responses.push(newResponse);
      query.updatedAt = new Date().toISOString();
      await writeData(data);
      return sendJson(res, 201, { success: true, response: newResponse, query });
    }

    // Delete single response: DELETE /api/queries/:id/responses/:respId
    const respDelMatch = pathname.match(/^\/api\/queries\/([a-zA-Z0-9_-]+)\/responses\/([a-zA-Z0-9_-]+)$/);
    if (respDelMatch && method === 'DELETE') {
      const [, queryId, respId] = respDelMatch;
      const data = await readData();
      const query = data.queries.find(q => q.id === queryId);
      if (!query) return sendJson(res, 404, { error: 'Query not found' });

      query.responses = (query.responses || []).filter(r => r.id !== respId);
      query.updatedAt = new Date().toISOString();
      await writeData(data);
      return sendJson(res, 200, { success: true, query });
    }

    // Export endpoint: /api/export?format=json|markdown|md&download=true
    if (pathname === '/api/export' && method === 'GET') {
      const data = await readData();
      const rawFormat = (urlObj.searchParams.get('format') || 'markdown').toLowerCase();
      const format = (rawFormat === 'md' || rawFormat === 'markdown') ? 'markdown' : rawFormat;
      const queryId = urlObj.searchParams.get('id');
      const shouldDownload = urlObj.searchParams.get('download') === 'true' || urlObj.searchParams.get('download') === '1';
      const dateStamp = new Date().toISOString().slice(0, 10);
      const filenameBase = `${(data.project || 'compilation').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${dateStamp}`;

      if (format === 'json') {
        let exportData = data;
        if (queryId) {
          exportData = { ...data, queries: data.queries.filter(q => q.id === queryId) };
        }
        const jsonStr = JSON.stringify(exportData, null, 2);
        const headers = {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        };
        if (shouldDownload) {
          headers['Content-Disposition'] = `attachment; filename="${filenameBase}.json"`;
        }
        res.writeHead(200, headers);
        return res.end(jsonStr);
      } else {
        const md = formatMarkdown(data, queryId);
        const headers = {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        };
        if (shouldDownload) {
          headers['Content-Disposition'] = `attachment; filename="${filenameBase}.md"`;
        }
        res.writeHead(200, headers);
        return res.end(md);
      }
    }

    // Direct disk export trigger: POST /api/export/save-to-disk
    if ((pathname === '/api/export/save-to-disk' || pathname === '/api/export/files') && (method === 'POST' || method === 'GET')) {
      let targetPath = null;
      let format = 'md';
      if (method === 'POST') {
        try {
          const body = await parseBody(req);
          targetPath = body.targetPath;
          format = body.format || 'md';
        } catch {}
      }

      if (targetPath) {
        const data = await readData();
        const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(__dirname, targetPath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        if (format === 'json') {
          await fs.writeFile(fullPath, JSON.stringify(data, null, 2), 'utf-8');
        } else {
          await fs.writeFile(fullPath, formatMarkdown(data), 'utf-8');
        }
        return sendJson(res, 200, { success: true, targetPath: fullPath, format });
      }

      const result = await exportAllFiles();
      return sendJson(res, 200, { success: true, ...result });
    }

    // Static file serving from /public
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    try {
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
      const content = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.ico': 'image/x-icon',
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      return res.end(content);
    } catch {
      // If file not found in public and path does not start with /api, serve index.html (SPA fallback)
      if (!pathname.startsWith('/api')) {
        try {
          const indexHtml = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'));
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(indexHtml);
        } catch {
          /* pass to 404 */
        }
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not Found');
    }
  } catch (err) {
    console.error('Server error:', err);
    return sendJson(res, 500, { error: err.message || 'Internal Server Error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[QueryHub] Server running at http://localhost:${PORT}`);
  console.log(`[QueryHub] Data file: ${DATA_FILE}`);
});
