import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('local resume uses isolated file authentication for both launches', () => {
  const home = mkdtempSync(join(tmpdir(), 'tandem-auth-boundary-'));
  const root = join(home, 'codex-tandem-ct06-qualification-20261002');
  mkdirSync(root);
  try {
    for (const mode of ['A', 'B']) {
      const result = spawnSync(
        process.execPath,
        [
          '--import',
          new URL('./fixtures/local-resume-child.mjs', import.meta.url).href,
          'tools/capture/local-authenticated-resume.mjs',
          'harmless-child',
          root,
          mode,
        ],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            TANDEM_TEST_HOME: home,
            OPENAI_API_KEY: 'test-only',
            CODEX_API_KEY: 'test-only',
            OPENAI_BASE_URL: 'https://invalid.example.test',
          },
        },
      );
      assert.equal(result.status, 0, result.stderr);
      const report = JSON.parse(result.stdout);
      assert.equal(report.exit, 0);
      assert.equal(report.nativeTurnCompleted, true);
      assert.equal(report.sameSession, true);
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
