// Copy the built dashboard SPA into the control package's dist so it ships with
// the published package and is served at runtime. Runs after tsup (which cleans dist).
import { cp, rm, access } from 'node:fs/promises';

const src = new URL('../frontend/dist/', import.meta.url);
const dst = new URL('../dist/public/', import.meta.url);

try {
  await access(src);
} catch {
  console.warn('bundle-frontend: frontend/dist not found; build the frontend first. Skipping.');
  process.exit(0);
}

await rm(dst, { recursive: true, force: true });
await cp(src, dst, { recursive: true });
console.log('bundle-frontend: copied frontend/dist -> dist/public');
