#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

function schemaSql() {
  const folder = path.join(__dirname, '../supabase/migrations');
  return fs.readdirSync(folder).filter(name => name.endsWith('.sql')).sort()
    .map(name => `-- ${name}\n${fs.readFileSync(path.join(folder, name), 'utf8')}`).join('\n\n');
}
async function main() {
  const query = schemaSql();
  if (process.argv.includes('--print')) { process.stdout.write(query + '\n'); return; }
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('Automatic installation needs SUPABASE_ACCESS_TOKEN. Alternatively run npm run db:sql and execute its SQL in the Supabase SQL Editor.');
  let project = process.env.SUPABASE_PROJECT_REF;
  if (!project) {
    try { project = new URL(process.env.SUPABASE_URL).hostname.split('.')[0]; } catch { /* validated below */ }
  }
  if (!/^[a-z]{20}$/.test(project || '')) throw new Error('Set SUPABASE_PROJECT_REF to the existing Supabase project reference.');
  let response;
  try {
    response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }), signal: AbortSignal.timeout(30_000),
    });
  } catch { throw new Error('Could not reach Supabase Management API. No credentials were logged.'); }
  if (!response.ok) throw new Error(`Supabase schema installation failed (HTTP ${response.status}). Check project access and SQL Editor logs.`);
  console.log('MediCluster Supabase schema and private media bucket installed.');
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { schemaSql };
