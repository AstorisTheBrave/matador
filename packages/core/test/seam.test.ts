import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', 'src');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
}

describe('core/exporter seam (I2)', () => {
  it('core source imports no exporter or prom-client', () => {
    for (const f of files(srcDir)) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/from ['"]prom-client['"]/);
      expect(src, f).not.toMatch(/from ['"]@matador\/(prometheus|otlp)['"]/);
    }
  });
});
