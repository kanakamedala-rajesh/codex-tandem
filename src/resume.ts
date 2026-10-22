import { open, lstat, realpath, stat, rm } from 'node:fs/promises';
import { constants, type BigIntStats } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, isAbsolute, dirname, relative, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { claimPrivateState } from './private-state.js';
import {
  privateDirectory,
  verifyPrivate,
  writePrivate,
} from './private-files.js';
import {
  inspectResumePolicy,
  type CodexCommand,
  type ResumePolicy,
} from './profile-login.js';

const execute = promisify(execFile);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const safePath = (value: unknown): value is string =>
  typeof value === 'string' &&
  isAbsolute(value) &&
  value.length <= 4096 &&
  !/[\p{Cc}\p{Cf}]/u.test(value);

type Witness = {
  path: string;
  physical: string | null;
  kind: 'file' | 'directory' | 'missing';
  identityOnly?: true;
  device?: string;
  inode?: string;
  mode?: number;
  links?: string;
  size?: string;
  modified?: string;
  changed?: string;
};
type Prepared = {
  schemaVersion: 1;
  id: string;
  preparedAt: string;
  nativeVersion: '0.163.0';
  home: Witness;
  project: Witness;
  cwd: Witness;
  nativeCwd: Witness;
  source: Witness;
  command: Witness[];
  policy: ResumePolicy;
  environmentSqliteHome: string | null;
  configuration: Witness[];
  database: Witness[];
  ancestors: Witness[];
};
/** Inputs for explicit local resume preparation and lookup. The existing native command and physical project/home identify the target; source SQLite is copied privately only during preparation. */
export type LocalResumeOptions = {
  stateHome: string;
  codexHome: string;
  projectPath: string;
  command: CodexCommand;
  /** Effective config/feature overrides are inspected only during preparation; arbitrary values are never stored in prepared records. */
  policyArguments?: string[];
};
/** A project-scoped UUID with a fresh metadata proof. Revalidation performs bounded stat checks; supplying the mandatory policy probe's projection also proves the same operational database and feature configuration. */
export type ResumeSelection = {
  id: string;
  /** Refuse changed source, project, persistent native database data or invocation metadata; safe disposable SHM and absent/empty WAL changes are allowed after fresh path checks. Never reads rollouts, opens SQLite or starts another Codex probe. */
  revalidate: (policy?: ResumePolicy) => Promise<void>;
};

function redacted(error: unknown): Error {
  return error instanceof Error && /^RESUME_[A-Z_]+$/.test(error.message)
    ? error
    : new Error('RESUME_SOURCE_UNAVAILABLE');
}
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
async function witness(path: string, identityOnly = false): Promise<Witness> {
  if (!safePath(path)) throw new Error('RESUME_SOURCE_UNSAFE');
  try {
    const physical = await realpath(path),
      info = await stat(path, { bigint: true });
    if (!info.isFile() && !info.isDirectory())
      throw new Error('RESUME_SOURCE_UNSAFE');
    return {
      path,
      physical,
      kind: info.isDirectory() ? 'directory' : 'file',
      ...(identityOnly ? { identityOnly: true } : {}),
      device: String(info.dev),
      inode: String(info.ino),
      mode: Number(info.mode),
      ...(info.isFile() ? { links: String(info.nlink) } : {}),
      ...(!identityOnly && info.isFile()
        ? {
            size: String(info.size),
            modified: String(info.mtimeNs),
            changed: String(info.ctimeNs),
          }
        : {}),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return {
        path,
        physical: null,
        kind: 'missing',
        ...(identityOnly ? { identityOnly: true } : {}),
      };
    throw error;
  }
}
async function sourceWitness(path: string): Promise<Witness> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
    throw new Error('RESUME_SOURCE_UNSAFE');
  const result = await witness(path);
  if (result.physical !== path) throw new Error('RESUME_SOURCE_UNSAFE');
  return result;
}
async function directory(path: string, code: string): Promise<string> {
  try {
    const physical = await realpath(path);
    if (!(await stat(physical)).isDirectory()) throw new Error();
    return physical;
  } catch {
    throw new Error(code);
  }
}
async function databaseWitnesses(sqliteHome: string): Promise<Witness[]> {
  return Promise.all(
    ['', '-wal', '-shm', '-journal'].map(async (suffix) => {
      const path = join(sqliteHome, 'state_5.sqlite' + suffix);
      if (!safePath(path)) throw new Error('RESUME_SOURCE_UNSAFE');
      const identityOnly = suffix === '-shm';
      let before: BigIntStats;
      try {
        // Inspect the link itself first: realpath ENOENT can hide a dangling link.
        before = await lstat(path, { bigint: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        return {
          path,
          physical: null,
          kind: 'missing',
          ...(identityOnly ? { identityOnly: true } : {}),
        } satisfies Witness;
      }
      if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n)
        throw new Error('RESUME_SOURCE_UNSAFE');
      const physical = await realpath(path);
      const info = await stat(path, { bigint: true });
      if (
        physical !== path ||
        !info.isFile() ||
        info.nlink !== 1n ||
        info.dev !== before.dev ||
        info.ino !== before.ino
      )
        throw new Error('RESUME_SOURCE_UNSAFE');
      if (typeof info.mtimeNs !== 'bigint' || typeof info.ctimeNs !== 'bigint')
        throw new Error('RESUME_WITNESS_PRECISION_UNSUPPORTED');
      return {
        path,
        physical,
        kind: 'file',
        ...(identityOnly ? { identityOnly: true } : {}),
        device: String(info.dev),
        inode: String(info.ino),
        mode: Number(info.mode),
        links: String(info.nlink),
        ...(!identityOnly
          ? {
              size: String(info.size),
              modified: String(info.mtimeNs),
              changed: String(info.ctimeNs),
            }
          : {}),
      } satisfies Witness;
    }),
  );
}
async function requireDatabaseUnchanged(original: Witness[]): Promise<void> {
  const current = await databaseWitnesses(dirname(original[0].path));
  const emptyWal = (entry: Witness) =>
    entry.kind === 'missing' || (entry.kind === 'file' && entry.size === '0');
  for (let index = 0; index < original.length; index++) {
    // Every path was freshly validated above. SHM has no persistent data, and
    // an absent or exactly empty WAL has no frames; neither changes the index.
    if (index === 2) continue;
    if (index === 1 && emptyWal(original[index]) && emptyWal(current[index]))
      continue;
    if (!same(original[index], current[index]))
      throw new Error('RESUME_PREPARATION_STALE');
  }
}
async function requireUnchanged(records: Witness[]): Promise<void> {
  for (const record of records)
    if (!same(record, await witness(record.path, record.identityOnly)))
      throw new Error('RESUME_PREPARATION_STALE');
}
function key(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
async function recordsRoot(
  options: LocalResumeOptions,
  home: string,
  create = false,
): Promise<string> {
  const root = await claimPrivateState(
    resolve(options.stateHome),
    'installation',
  );
  const parent = join(root, 'resume');
  const path = join(parent, key(`${process.platform}:local:${home}`));
  if (create) {
    await privateDirectory(parent);
    await privateDirectory(path);
  } else {
    await verifyPrivate(parent);
    await verifyPrivate(path);
  }
  return path;
}
async function bounded(path: string, limit: number): Promise<Buffer> {
  const info = await lstat(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.nlink !== 1 ||
    info.size > limit
  )
    throw new Error('RESUME_SOURCE_UNSAFE');
  const handle = await open(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const opened = await handle.stat();
    if (opened.dev !== info.dev || opened.ino !== info.ino || !opened.isFile())
      throw new Error('RESUME_PREPARATION_STALE');
    const buffer = Buffer.alloc(limit + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > limit) throw new Error('RESUME_METADATA_LIMIT');
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
async function readPrepared(path: string): Promise<Prepared> {
  await verifyPrivate(path);
  let value: Prepared;
  try {
    value = JSON.parse((await bounded(path, 65536)).toString('utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw error;
    // Native causes may expose private source paths.
    // eslint-disable-next-line preserve-caught-error
    throw new Error('RESUME_PREPARATION_INVALID');
  }
  if (
    !value ||
    value.schemaVersion !== 1 ||
    !uuid.test(value.id) ||
    value.nativeVersion !== '0.163.0' ||
    typeof value.preparedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.preparedAt)) ||
    !value.policy ||
    !safePath(value.policy.sqliteHome) ||
    !Array.isArray(value.policy.files) ||
    value.policy.files.length > 128 ||
    !value.policy.files.every(safePath) ||
    !value.policy.features ||
    typeof value.policy.features !== 'object' ||
    Array.isArray(value.policy.features) ||
    Object.entries(value.policy.features).length > 256 ||
    !Object.entries(value.policy.features).every(
      ([name, enabled]) =>
        /^[a-z][a-z0-9_]{0,63}$/.test(name) && typeof enabled === 'boolean',
    ) ||
    !Array.isArray(value.command) ||
    value.command.length < 1 ||
    value.command.length > 2 ||
    !Array.isArray(value.configuration) ||
    value.configuration.length > 256 ||
    !Array.isArray(value.database) ||
    value.database.length !== 4 ||
    !Array.isArray(value.ancestors) ||
    value.ancestors.length > 64 ||
    ![
      value.home,
      value.project,
      value.cwd,
      value.nativeCwd,
      value.source,
      ...value.command,
      ...value.configuration,
      ...value.database,
      ...value.ancestors,
    ].every(
      (entry) =>
        entry &&
        safePath(entry.path) &&
        ['file', 'directory', 'missing'].includes(entry.kind) &&
        (entry.kind === 'missing'
          ? entry.physical === null
          : safePath(entry.physical) &&
            typeof entry.device === 'string' &&
            /^\d+$/.test(entry.device) &&
            typeof entry.inode === 'string' &&
            /^\d+$/.test(entry.inode) &&
            Number.isInteger(entry.mode) &&
            (entry.kind !== 'file' ||
              (typeof entry.links === 'string' &&
                /^\d+$/.test(entry.links) &&
                (entry.identityOnly === true ||
                  [entry.size, entry.modified, entry.changed].every(
                    (field) =>
                      typeof field === 'string' && /^-?\d+$/.test(field),
                  ))))),
    )
  )
    throw new Error('RESUME_PREPARATION_INVALID');
  if (
    ![value.home, value.project, value.cwd, value.nativeCwd].every(
      (entry) => entry.kind === 'directory',
    ) ||
    value.source.kind !== 'file' ||
    [
      value.home,
      value.project,
      value.cwd,
      value.nativeCwd,
      value.source,
      ...value.command,
      ...value.configuration,
      ...value.ancestors,
    ].some((entry) => entry.identityOnly !== undefined) ||
    value.command.some((entry) => entry.kind !== 'file') ||
    value.database.some(
      (entry, index) =>
        entry.path !==
          join(
            value.policy.sqliteHome,
            'state_5.sqlite' + ['', '-wal', '-shm', '-journal'][index],
          ) || entry.identityOnly !== (index === 2 ? true : undefined),
    )
  )
    throw new Error('RESUME_PREPARATION_INVALID');
  return value;
}
async function configurationWitnesses(
  policy: ResumePolicy,
  project: string,
): Promise<Witness[]> {
  const files = new Set(policy.files);
  files.add('/etc/codex/requirements.toml');
  files.add('/etc/codex/managed_config.toml');
  let current = project;
  for (let depth = 0; ; depth++) {
    if (depth >= 64) throw new Error('RESUME_LOOKUP_LIMIT');
    files.add(join(current, '.codex', 'config.toml'));
    files.add(join(current, '.git'));
    if (dirname(current) === current) break;
    current = dirname(current);
  }
  if (files.size > 256) throw new Error('RESUME_LOOKUP_LIMIT');
  return Promise.all([...files].sort().map((path) => witness(path)));
}
async function commandWitnesses(command: CodexCommand): Promise<Witness[]> {
  if ((command.prefix?.length ?? 0) > 1)
    throw new Error('RESUME_CONFIG_UNSUPPORTED');
  const result = await Promise.all(
    [command.executable, ...(command.prefix ?? [])].map((path) =>
      witness(resolve(path)),
    ),
  );
  if (result.some((entry) => entry.kind !== 'file'))
    throw new Error('RESUME_SOURCE_UNAVAILABLE');
  return result;
}
async function commandDigests(records: Witness[]): Promise<string[]> {
  const result: string[] = [];
  for (const record of records) {
    const size = BigInt(record.size!);
    if (size > 536870912n) throw new Error('RESUME_METADATA_LIMIT');
    const handle = await open(record.path, constants.O_RDONLY);
    try {
      const info = await handle.stat({ bigint: true });
      if (
        !info.isFile() ||
        String(info.dev) !== record.device ||
        String(info.ino) !== record.inode ||
        String(info.size) !== record.size ||
        String(info.mtimeNs) !== record.modified ||
        String(info.ctimeNs) !== record.changed
      )
        throw new Error('RESUME_PREPARATION_STALE');
      const digest = createHash('sha256');
      const buffer = Buffer.alloc(65536);
      let remaining = Number(size);
      while (remaining) {
        const { bytesRead } = await handle.read(
          buffer,
          0,
          Math.min(buffer.length, remaining),
          null,
        );
        if (!bytesRead) throw new Error('RESUME_PREPARATION_STALE');
        digest.update(buffer.subarray(0, bytesRead));
        remaining -= bytesRead;
      }
      if ((await handle.read(buffer, 0, 1, null)).bytesRead)
        throw new Error('RESUME_PREPARATION_STALE');
      result.push(digest.digest('hex'));
    } finally {
      await handle.close();
    }
  }
  await requireUnchanged(records);
  return result;
}
async function sourceAncestors(
  home: string,
  source: string,
): Promise<Witness[]> {
  const path = relative(home, source);
  if (
    path.startsWith('..' + sep) ||
    path === '..' ||
    isAbsolute(path) ||
    !['sessions', 'archived_sessions'].includes(path.split(sep)[0])
  )
    throw new Error('RESUME_SOURCE_UNSAFE');
  const result: Witness[] = [];
  for (
    let current = dirname(source);
    current !== home;
    current = dirname(current)
  ) {
    if (result.length >= 64 || dirname(current) === current)
      throw new Error('RESUME_SOURCE_UNSAFE');
    const entry = await witness(current);
    if (entry.kind !== 'directory' || entry.physical !== current)
      throw new Error('RESUME_SOURCE_UNSAFE');
    result.push(entry);
  }
  return result;
}
async function sessionMetadata(
  path: string,
): Promise<{ id: string; cwd: string }> {
  const handle = await open(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const buffer = Buffer.alloc(65536);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const end = buffer.subarray(0, bytesRead).indexOf(10);
    if (end < 0) throw new Error('RESUME_METADATA_INCOMPLETE');
    let value;
    try {
      value = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          buffer.subarray(0, end),
        ),
      );
    } catch {
      throw new Error('RESUME_METADATA_INVALID');
    }
    if (
      value?.type !== 'session_meta' ||
      !uuid.test(value.payload?.id) ||
      !safePath(value.payload?.cwd)
    )
      throw new Error('RESUME_METADATA_INVALID');
    return { id: value.payload.id, cwd: value.payload.cwd };
  } finally {
    await handle.close();
  }
}
async function snapshotDatabase(
  original: Witness[],
  destination: string,
): Promise<void> {
  if (original[0].kind !== 'file' || original[3].kind !== 'missing')
    throw new Error('RESUME_INDEX_UNAVAILABLE');
  for (const entry of original.slice(0, 2)) {
    if (entry.kind === 'missing') continue;
    const source = await sourceWitness(entry.path);
    if (!same(source, entry) || BigInt(entry.size!) > 268435456n)
      throw new Error('RESUME_INDEX_UNAVAILABLE');
    const input = await open(
      entry.path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    try {
      const output = await open(
        join(
          destination,
          entry.path.endsWith('-wal') ? 'state_5.sqlite-wal' : 'state_5.sqlite',
        ),
        'wx',
        0o600,
      );
      try {
        await output.chmod(0o600);
        const info = await input.stat({ bigint: true });
        if (
          String(info.dev) !== entry.device ||
          String(info.ino) !== entry.inode ||
          String(info.size) !== entry.size ||
          String(info.mtimeNs) !== entry.modified ||
          String(info.ctimeNs) !== entry.changed
        )
          throw new Error('RESUME_PREPARATION_STALE');
        let remaining = Number(info.size);
        const buffer = Buffer.alloc(65536);
        while (remaining) {
          const { bytesRead } = await input.read(
            buffer,
            0,
            Math.min(buffer.length, remaining),
            null,
          );
          if (!bytesRead) throw new Error('RESUME_PREPARATION_STALE');
          await output.writeFile(buffer.subarray(0, bytesRead));
          remaining -= bytesRead;
        }
        if ((await input.read(buffer, 0, 1, null)).bytesRead)
          throw new Error('RESUME_PREPARATION_STALE');
      } finally {
        await output.close();
      }
    } finally {
      await input.close();
    }
  }
  await requireDatabaseUnchanged(original);
}

/** Prepare one native indexed UUID or the newest indexed session for the physical project without launching or activating credentials. Windows preparation streams at most 512 MiB per command file before and after the native probes, allowing their first execution to change only ctime when bytes and all other metadata remain identical; digests are discarded and the final full generation is retained. Ordinary Codex policy initialization runs first; only a private generation-fenced database copy is opened with SQLite. Preparation may read bounded selected rollout metadata and examine up to 10,000 indexed rows; temporary copied native content is deleted. Unsupported versions/schema, incomplete backfill, ambiguous latest rows and changed sources are refused. */
export async function prepareLocalResume(
  options: LocalResumeOptions,
  selection: string,
): Promise<{ id: string; preparedAt: string }> {
  try {
    if (selection !== 'last' && !uuid.test(selection))
      throw new Error('RESUME_ID_INVALID');
    const home = await directory(
      options.codexHome,
      'RESUME_SOURCE_UNAVAILABLE',
    );
    const project = await directory(
      options.projectPath,
      'RESUME_PROJECT_UNAVAILABLE',
    );
    let command = await commandWitnesses(options.command);
    const digests =
      process.platform === 'win32' ? await commandDigests(command) : undefined;
    const version = await execute(
      options.command.executable,
      [...(options.command.prefix ?? []), '--version'],
      {
        cwd: project,
        env: { ...process.env, CODEX_HOME: home },
        timeout: 15000,
        maxBuffer: 1024,
        windowsHide: true,
      },
    );
    if (!/^codex(?:-cli)? 0\.163\.0\s*$/.test(version.stdout.trim()))
      throw new Error('RESUME_INDEX_UNSUPPORTED');
    const policy = await inspectResumePolicy({
      command: options.command,
      codexHome: home,
      stateHome: options.stateHome,
      cwd: project,
      policyArguments: options.policyArguments,
    });
    if (digests) {
      const current = await commandWitnesses(options.command);
      // Windows first execution can update executable ctime without changing its
      // bytes. Prove that exception during preparation only; persist the actual
      // final ctime so ordinary resume still refuses every generation change.
      const metadata = (records: Witness[]) =>
        records.map((entry) => ({ ...entry, changed: undefined }));
      if (
        !same(metadata(command), metadata(current)) ||
        !same(digests, await commandDigests(current))
      )
        throw new Error('RESUME_PREPARATION_STALE');
      command = current;
    }
    const sqliteHome = await directory(
      policy.sqliteHome,
      'RESUME_INDEX_UNAVAILABLE',
    );
    policy.sqliteHome = sqliteHome;
    const configuration = await configurationWitnesses(policy, project);
    const database = await databaseWitnesses(sqliteHome);
    const root = await recordsRoot(options, home, true);
    const temporary = await privateDirectory(
      join(tmpdir(), 'codex-tandem-resume-' + randomUUID()),
      { exclusive: true },
    );
    try {
      await snapshotDatabase(database, temporary);
      const { DatabaseSync } = await import('node:sqlite');
      let snapshot: InstanceType<typeof DatabaseSync> | undefined;
      let rows: Array<Record<string, unknown>>;
      try {
        snapshot = new DatabaseSync(join(temporary, 'state_5.sqlite'), {
          readOnly: true,
          enableDoubleQuotedStringLiterals: false,
        });
        const columns = snapshot.prepare('PRAGMA table_info(threads)').all();
        if (!columns.some((column) => column.name === 'id' && column.pk === 1))
          throw new Error('RESUME_INDEX_UNSUPPORTED');
        if (
          snapshot.prepare('SELECT status FROM backfill_state WHERE id=1').get()
            ?.status !== 'complete'
        )
          throw new Error('RESUME_INDEX_INCOMPLETE');
        rows =
          selection === 'last'
            ? snapshot
                .prepare(
                  'SELECT id,rollout_path,cwd,created_at_ms FROM threads ORDER BY created_at_ms DESC,id DESC LIMIT 10001',
                )
                .all()
            : snapshot
                .prepare(
                  'SELECT id,rollout_path,cwd,created_at_ms FROM threads WHERE id=?',
                )
                .all(selection);
      } catch (error) {
        if (error instanceof Error && /^RESUME_/.test(error.message))
          throw error;
        // Native SQLite causes can include source paths or database details.
        // eslint-disable-next-line preserve-caught-error
        throw new Error('RESUME_INDEX_UNSUPPORTED');
      } finally {
        snapshot?.close();
      }
      if (rows.length > 10000) throw new Error('RESUME_LOOKUP_LIMIT');
      const matches: Array<{
        row: Record<string, unknown>;
        source: Witness;
        cwd: Witness;
        ancestors: Witness[];
      }> = [];
      for (const row of rows) {
        if (
          typeof row.id !== 'string' ||
          !uuid.test(row.id) ||
          !safePath(row.rollout_path) ||
          !safePath(row.cwd) ||
          typeof row.created_at_ms !== 'number' ||
          !Number.isSafeInteger(row.created_at_ms)
        )
          throw new Error('RESUME_INDEX_UNSUPPORTED');
        let physicalProject: string;
        try {
          physicalProject = await directory(
            row.cwd,
            'RESUME_PROJECT_UNAVAILABLE',
          );
        } catch (error) {
          if (selection !== 'last') throw error;
          continue;
        }
        if (physicalProject !== project) {
          if (selection !== 'last') throw new Error('RESUME_PROJECT_MISMATCH');
          continue;
        }
        const source = await sourceWitness(row.rollout_path);
        const ancestors = await sourceAncestors(home, row.rollout_path);
        const meta = await sessionMetadata(row.rollout_path);
        if (
          meta.id !== row.id ||
          (await directory(meta.cwd, 'RESUME_PROJECT_UNAVAILABLE')) !== project
        )
          throw new Error('RESUME_METADATA_CONFLICT');
        const cwd = await witness(meta.cwd);
        try {
          const previous = await readPrepared(join(root, row.id + '.json'));
          const currentProject = await witness(project);
          if (
            previous.project.physical !== currentProject.physical ||
            previous.project.device !== currentProject.device ||
            previous.project.inode !== currentProject.inode
          )
            throw new Error('RESUME_PROJECT_CHANGED');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        matches.push({ row, source, cwd, ancestors });
        if (selection !== 'last' || matches.length === 2) break;
      }
      if (!matches.length) throw new Error('RESUME_UNAVAILABLE');
      if (
        matches.length > 1 &&
        matches[0].row.created_at_ms === matches[1].row.created_at_ms
      )
        throw new Error('RESUME_LAST_AMBIGUOUS');
      const selected = matches[0];
      const record: Prepared = {
        schemaVersion: 1,
        id: String(selected.row.id),
        preparedAt: new Date().toISOString(),
        nativeVersion: '0.163.0',
        home: await witness(home),
        project: await witness(project),
        cwd: selected.cwd,
        nativeCwd: await witness(String(selected.row.cwd)),
        source: selected.source,
        command,
        policy,
        environmentSqliteHome: process.env.CODEX_SQLITE_HOME ?? null,
        configuration,
        database,
        ancestors: selected.ancestors,
      };
      await requireUnchanged([
        record.home,
        record.project,
        record.cwd,
        record.nativeCwd,
        record.source,
        ...command,
        ...configuration,
        ...record.ancestors,
      ]);
      await requireDatabaseUnchanged(database);
      const encoded = JSON.stringify(record) + '\n';
      if (Buffer.byteLength(encoded) > 65536)
        throw new Error('RESUME_METADATA_LIMIT');
      await writePrivate(join(root, record.id + '.json'), encoded);
      if (selection === 'last')
        await writePrivate(join(root, key(project) + '.last.json'), encoded);
      return { id: record.id, preparedAt: record.preparedAt };
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  } catch (error) {
    throw redacted(error);
  }
}

/** Resolve explicitly prepared native metadata with constant work independent of transcript/file count. Missing or changed preparation refuses before activation; callers revalidate with the mandatory policy projection before credential writes and again immediately before child spawn. This reads only one bounded private metadata record and source stat witnesses, never rollout contents, SQLite, history directories or analytics. */
export async function resolveLocalResume(
  homePath: string,
  projectPath: string,
  selection: string,
  options?: Omit<LocalResumeOptions, 'codexHome' | 'projectPath'>,
): Promise<ResumeSelection> {
  try {
    if (selection !== 'last' && !uuid.test(selection))
      throw new Error('RESUME_ID_INVALID');
    const home = await directory(homePath, 'RESUME_SOURCE_UNAVAILABLE');
    const project = await directory(projectPath, 'RESUME_PROJECT_UNAVAILABLE');
    if (!options) throw new Error('RESUME_PREPARATION_REQUIRED');
    let record: Prepared;
    try {
      const root = await recordsRoot(
        { ...options, codexHome: home, projectPath: project },
        home,
      );
      record = await readPrepared(
        join(
          root,
          selection === 'last'
            ? key(project) + '.last.json'
            : selection + '.json',
        ),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        // Source paths must not escape in an actionable preparation error.
        // eslint-disable-next-line preserve-caught-error
        throw new Error('RESUME_PREPARATION_REQUIRED');
      throw error;
    }
    if (record.home.physical !== home || record.project.physical !== project)
      throw new Error('RESUME_PROJECT_MISMATCH');
    if (selection !== 'last' && record.id !== selection)
      throw new Error('RESUME_PREPARATION_INVALID');
    const revalidate = async (policy?: ResumePolicy) => {
      try {
        if (
          (process.env.CODEX_SQLITE_HOME ?? null) !==
            record.environmentSqliteHome ||
          !same(record.command, await commandWitnesses(options.command))
        )
          throw new Error('RESUME_PREPARATION_STALE');
        await requireUnchanged([
          record.home,
          record.project,
          record.cwd,
          record.nativeCwd,
          record.source,
          ...record.command,
          ...record.configuration,
          ...record.ancestors,
        ]);
        await requireDatabaseUnchanged(record.database);
        if (policy) {
          const physical = await directory(
            policy.sqliteHome,
            'RESUME_PREPARATION_STALE',
          );
          if (
            physical !== record.policy.sqliteHome ||
            !same(policy.features, record.policy.features) ||
            !same(policy.files, record.policy.files)
          )
            throw new Error('RESUME_PREPARATION_STALE');
        }
      } catch (error) {
        throw redacted(error);
      }
    };
    await revalidate();
    return { id: record.id, revalidate };
  } catch (error) {
    throw redacted(error);
  }
}
