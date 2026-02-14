/**
 * Reads vendor_data.csv, groups all upcoming_jobs by consumer_name,
 * and writes consumer_data.csv with one row per consumer and their jobs.
 *
 * Run: node scripts/vendor-to-consumer-csv.js
 */

import fs from 'fs';

function escapeCsv(str) {
  const s = String(str);
  return '"' + s.replace(/"/g, '""') + '"';
}

/**
 * Parse a single line of CSV respecting quoted fields (handles "" as escaped quote).
 * Matches each "..." field and unescapes "" -> " inside.
 */
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

const vendorPath = 'vendor_data.csv';
const outPath = 'consumer_data.csv';

const csvText = fs.readFileSync(vendorPath, 'utf8');
const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
if (lines.length < 2) {
  console.error('vendor_data.csv is empty or has no data rows');
  process.exit(1);
}

const header = lines[0];
const columnNames = parseCsvLine(header);
const nameIdx = columnNames.indexOf('name');
const upcomingIdx = columnNames.indexOf('upcoming_jobs');
if (nameIdx === -1 || upcomingIdx === -1) {
  console.error('vendor_data.csv must have "name" and "upcoming_jobs" columns');
  process.exit(1);
}

// consumer_name -> array of { date, start_time, end_time, price, type, vendor_name }
const byConsumer = {};

for (let r = 1; r < lines.length; r++) {
  const fields = parseCsvLine(lines[r]);
  if (fields.length <= upcomingIdx) continue;
  const vendorName = fields[nameIdx] || '';
  const upcomingJson = fields[upcomingIdx] || '[]';
  let jobs;
  try {
    jobs = JSON.parse(upcomingJson);
  } catch (e) {
    console.warn(`Row ${r + 1}: invalid upcoming_jobs JSON, skipping`);
    continue;
  }
  if (!Array.isArray(jobs)) continue;

  for (const job of jobs) {
    const consumer = job.consumer_name || 'Unknown';
    if (!byConsumer[consumer]) byConsumer[consumer] = [];

    byConsumer[consumer].push({
      date: job.date,
      start_time: job.start_time,
      end_time: job.end_time,
      price: job.price,
      type: job.type,
      vendor_name: vendorName,
    });
  }
}

// Sort jobs per consumer by date then start_time
for (const consumer of Object.keys(byConsumer)) {
  byConsumer[consumer].sort((a, b) => {
    const d = (a.date || '').localeCompare(b.date || '');
    if (d !== 0) return d;
    return (a.start_time || '').localeCompare(b.start_time || '');
  });
}

// Build output: consumer_name, job_count, jobs (JSON)
const outHeader = 'consumer_name,job_count,jobs';
const outRows = [];

for (const [consumerName, jobs] of Object.entries(byConsumer)) {
  const jobCount = jobs.length;
  const jobsJson = JSON.stringify(jobs);
  outRows.push([consumerName, jobCount, jobsJson].map(escapeCsv).join(','));
}

const outCsv = [outHeader, ...outRows].join('\n');
fs.writeFileSync(outPath, outCsv, 'utf8');

console.log(`Wrote ${outRows.length} consumers to ${outPath}`);
console.log(`Total jobs: ${Object.values(byConsumer).reduce((s, j) => s + j.length, 0)}`);
