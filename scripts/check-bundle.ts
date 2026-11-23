/**
 * Bundle budget: the customer home page must load under 200 KB of JavaScript
 * (gzipped, the same measure as Next's "First Load JS"). Run after
 * `npm run build -w @hatod/web`; exits non-zero when over budget.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 200;
const ROUTE = '/[locale]/(customer)/page';
const next = path.resolve(__dirname, '../apps/web/.next');
const read = (f: string) => JSON.parse(readFileSync(path.join(next, f), 'utf8'));

const root: string[] = read('build-manifest.json').rootMainFiles;
const pages: Record<string, string[]> = read('app-build-manifest.json').pages;
// The page's own chunks plus the layouts it renders inside.
const layouts = Object.keys(pages).filter((k) => k.endsWith('/layout') && ROUTE.startsWith(k.replace(/\/layout$/, '')));
const files = new Set([...root, ...layouts.flatMap((k) => pages[k]!), ...(pages[ROUTE] ?? [])].filter((f) => f.endsWith('.js')));
if (!pages[ROUTE]) throw new Error(`route ${ROUTE} not in the build; run the web build first`);

const kb = [...files].reduce((sum, f) => sum + gzipSync(readFileSync(path.join(next, f))).length, 0) / 1024;
console.log(`Customer home: ${kb.toFixed(1)} KB JS gzipped (${files.size} files), budget ${BUDGET_KB} KB`);
if (kb > BUDGET_KB) {
  console.error('Over budget. Keep Firebase and heavy libraries out of the first load (lazy-load them).');
  process.exit(1);
}
