import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { isEntrypoint } from '../lib/is-main.js';
import { monitorMarkdown, runProductionMonitor } from '../lib/production-monitor.js';

const DEFAULT_PRODUCTION_URL = 'https://joinsclee-radar.juno8i.easypanel.host';

async function main(): Promise<void> {
  const report = await runProductionMonitor({
    baseUrl: process.env.MONITOR_BASE_URL
      ?? process.env.E2E_BASE_URL
      ?? DEFAULT_PRODUCTION_URL,
  });
  const outputPath = resolve(process.env.MONITOR_OUTPUT ?? 'artifacts/production-monitor.json');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });

  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, monitorMarkdown(report));
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (isEntrypoint(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
