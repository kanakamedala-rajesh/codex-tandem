// Synthetic native-index rows for the prepared-resume CLI and boundary tests.
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { modulePath } from './activation.mjs';

export async function resumeIndexFixture(fixture, entries) {
  const script = fixture.options.command.prefix[0];
  const source = await readFile(script, 'utf8');
  if (!source.includes('SYNTHETIC_RESUME_VERSION'))
    await writeFile(
      script,
      `// SYNTHETIC_RESUME_VERSION\nif(process.argv.includes('--version')) { console.log('codex-cli 0.163.0'); process.exit(0); }\n${source}`,
    );
  const { DatabaseSync } = await import('node:sqlite');
  const database = new DatabaseSync(join(fixture.home, 'state_5.sqlite'));
  try {
    database.exec(
      "CREATE TABLE threads(id TEXT PRIMARY KEY,rollout_path TEXT,cwd TEXT,created_at_ms INTEGER,preview TEXT); CREATE TABLE backfill_state(id INTEGER PRIMARY KEY,status TEXT); INSERT INTO backfill_state VALUES(1,'complete')",
    );
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      const cwd = entry.cwd ?? (await realpath(fixture.root));
      const path =
        entry.path ??
        join(
          fixture.home,
          'sessions',
          `rollout-2026-10-04T00-00-00-${entry.id}.jsonl`,
        );
      await mkdir(join(path, '..'), { recursive: true });
      try {
        await readFile(path);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await writeFile(
          path,
          JSON.stringify({
            type: 'session_meta',
            payload: {
              id: entry.id,
              cwd,
              timestamp: '2026-10-04T00:00:00.000Z',
            },
          }) + '\nSYNTHETIC-CONVERSATION-MUST-NOT-PERSIST\n',
        );
      }
      database
        .prepare('INSERT INTO threads VALUES(?,?,?,?,?)')
        .run(
          entry.id,
          path,
          cwd,
          entry.timestamp ?? index + 1,
          'SYNTHETIC-PREVIEW-MUST-NOT-PERSIST',
        );
    }
  } finally {
    database.close();
  }
  const { prepareLocalResume } = await import(modulePath('resume.js'));
  return (selection, projectPath = fixture.root) =>
    prepareLocalResume(
      {
        stateHome: fixture.state,
        codexHome: fixture.home,
        projectPath,
        command: fixture.options.command,
      },
      selection,
    );
}
