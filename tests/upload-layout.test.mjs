import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, relative, sep, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test('deployment checks pass when GitHub browser upload omits hidden dotfiles', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'portal-no-dotfiles-'));
  try {
    cpSync(projectRoot, sandbox, {
      recursive: true,
      filter(source) {
        if (source === projectRoot) return true;
        const rel = relative(projectRoot, source);
        const parts = rel.split(sep);
        return !parts.some((part) => part.startsWith('.') || part === 'node_modules' || part === 'coverage');
      }
    });

    const result = spawnSync(process.execPath, ['scripts/check.mjs'], {
      cwd: sandbox,
      encoding: 'utf8',
      timeout: 20000
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /ENVIRONMENT\.example\.txt/);
    assert.match(result.stdout, /hidden Node dotfile is optional/);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
