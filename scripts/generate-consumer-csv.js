/**
 * Reads jobs_data.csv, counts jobs per consumer_name,
 * and writes consumer_data.csv with one row per customer: consumer_name, job_count, job_ids.
 * Every consumer_name that appears in any job gets an entry in the output (no jobs
 * are assigned to customers that don't exist in the resulting customer table).
 *
 * Run after: node scripts/generate-vendor-csv.js
 * Then: node scripts/generate-consumer-csv.js
 */

import fs from 'fs';

function escapeCsv(str) {
  const s = String(str);
  return '"' + s.replace(/"/g, '""') + '"';
}

function parseCsvLine(line) {
  const fields = [];
  let i = 0;
  while (i < line.length) {
    const rest = line.slice(i);
    const trimmed = rest.trimStart();
    i += rest.length - trimmed.length;
    if (i >= line.length) break;
    if (line[i] === '"') {
      let field = '';
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          field += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++;
          break;
        } else {
          field += line[i];
          i++;
        }
      }
      fields.push(field);
      if (line[i] === ',') i++;
    } else {
      const comma = line.indexOf(',', i);
      if (comma === -1) {
        fields.push(line.slice(i).trim());
        break;
      }
      fields.push(line.slice(i, comma).trim());
      i = comma + 1;
    }
  }
  return fields;
}

const jobsPath = 'jobs_data.csv';
const outPath = 'consumer_data.csv';

if (!fs.existsSync(jobsPath)) {
  console.error('jobs_data.csv not found. Run: node scripts/generate-vendor-csv.js first');
  process.exit(1);
}

const csvText = fs.readFileSync(jobsPath, 'utf8');
const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
if (lines.length < 2) {
  console.error('jobs_data.csv is empty or has no data rows');
  process.exit(1);
}

const header = lines[0];
const columnNames = parseCsvLine(header);
const consumerNameIdx = columnNames.indexOf('consumer_name');
const jobIdIdx = columnNames.indexOf('job_id');
if (consumerNameIdx === -1) {
  console.error('jobs_data.csv must have a "consumer_name" column');
  process.exit(1);
}

// consumer_name -> { count, job_ids[] }
const byConsumer = {};

for (let r = 1; r < lines.length; r++) {
  const fields = parseCsvLine(lines[r]);
  if (fields.length <= consumerNameIdx) continue;
  const name = (fields[consumerNameIdx] || '').trim();
  if (!name) continue;
  if (!byConsumer[name]) byConsumer[name] = { job_count: 0, job_ids: [] };
  byConsumer[name].job_count += 1;
  if (jobIdIdx >= 0 && fields[jobIdIdx] !== undefined) {
    const id = parseInt(fields[jobIdIdx], 10);
    if (!Number.isNaN(id)) byConsumer[name].job_ids.push(id);
  }
}

// Output: one row per customer that appears in jobs_data (every job's consumer_name has an entry)
const outHeader = 'consumer_name,job_count,job_ids';
const outRows = Object.entries(byConsumer).map(([consumerName, { job_count, job_ids }]) =>
  [escapeCsv(consumerName), job_count, escapeCsv(JSON.stringify(job_ids))].join(',')
);

const outCsv = [outHeader, ...outRows].join('\n');
fs.writeFileSync(outPath, outCsv, 'utf8');

const totalJobs = Object.values(byConsumer).reduce((s, c) => s + c.job_count, 0);
console.log(`Wrote ${outRows.length} customers to ${outPath}`);
console.log(`Total jobs (from jobs_data): ${totalJobs}`);
