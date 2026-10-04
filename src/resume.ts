import { open, opendir, lstat, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, isAbsolute } from 'node:path';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Native source errors can contain private paths; only this module's explicit redacted codes cross the public boundary.
function redactedSourceFailure(error: unknown): Error {
  return error instanceof Error && /^RESUME_[A-Z_]+$/.test(error.message)
    ? error
    : new Error('RESUME_SOURCE_UNAVAILABLE');
}

/** Resolve a native rollout UUID in this physical Codex home and project. `last` explicitly chooses the newest matching session_meta timestamp. Reads only bounded first lines; never returns conversation content. Unknown/partial metadata, conflicting copies, links, unavailable projects or exceeded limits throw redacted RESUME_* errors without filesystem paths or native causes, including missing/inaccessible home, project and source boundaries. This metadata lookup proves project scope, not identity attribution or upstream resume success. */
export async function resolveLocalResume(
  homePath: string,
  projectPath: string,
  selection: string,
): Promise<string> {
  if (selection !== 'last' && !uuid.test(selection))
    throw new Error('RESUME_ID_INVALID');
  let home: string, project: string;
  try {
    home = await realpath(homePath);
    if (!(await stat(home)).isDirectory()) throw new Error();
  } catch {
    throw new Error('RESUME_SOURCE_UNAVAILABLE');
  }
  try {
    project = await realpath(projectPath);
    if (!(await stat(project)).isDirectory()) throw new Error();
  } catch {
    throw new Error('RESUME_PROJECT_UNAVAILABLE');
  }
  let visited = 0;
  let metadataBytes = 0;
  const sessions = new Map<string, { project: string; timestamp: number }>();
  const inspect = async (path: string, filenameId: string) => {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
      throw new Error('RESUME_SOURCE_UNSAFE');
    const handle = await open(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    let first = Buffer.alloc(0);
    try {
      const opened = await handle.stat();
      if (
        opened.dev !== info.dev ||
        opened.ino !== info.ino ||
        !opened.isFile()
      )
        throw new Error('RESUME_SOURCE_CHANGED');
      while (first.length < 65536) {
        const chunk = Buffer.alloc(Math.min(1024, 65536 - first.length));
        const { bytesRead } = await handle.read(
          chunk,
          0,
          chunk.length,
          first.length,
        );
        metadataBytes += bytesRead;
        if (metadataBytes > 16777216) throw new Error('RESUME_LOOKUP_LIMIT');
        if (!bytesRead) throw new Error('RESUME_METADATA_INCOMPLETE');
        const end = chunk.subarray(0, bytesRead).indexOf(10);
        first = Buffer.concat([
          first,
          chunk.subarray(0, end < 0 ? bytesRead : end),
        ]);
        if (end >= 0) break;
      }
      if (first.length >= 65536) throw new Error('RESUME_METADATA_LIMIT');
    } finally {
      await handle.close();
    }
    let value;
    try {
      value = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(first),
      );
    } catch {
      throw new Error('RESUME_METADATA_INVALID');
    }
    const meta = value?.payload;
    if (
      value?.type !== 'session_meta' ||
      meta?.id !== filenameId ||
      !uuid.test(meta.id) ||
      typeof meta.cwd !== 'string' ||
      !isAbsolute(meta.cwd) ||
      /[\p{Cc}\p{Cf}]/u.test(meta.cwd) ||
      typeof meta.timestamp !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(
        meta.timestamp,
      ) ||
      !Number.isFinite(Date.parse(meta.timestamp))
    )
      throw new Error('RESUME_METADATA_INVALID');
    let physicalProject: string;
    try {
      physicalProject = await realpath(meta.cwd);
      if (!(await stat(physicalProject)).isDirectory()) throw new Error();
    } catch {
      if (selection !== 'last' || meta.cwd === project)
        throw new Error('RESUME_PROJECT_UNAVAILABLE');
      return;
    }
    const record = {
      project: physicalProject,
      timestamp: Date.parse(meta.timestamp),
    };
    const previous = sessions.get(meta.id);
    if (
      previous &&
      (previous.project !== record.project ||
        previous.timestamp !== record.timestamp)
    )
      throw new Error('RESUME_METADATA_CONFLICT');
    sessions.set(meta.id, record);
  };
  const walk = async (path: string, depth: number) => {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error('RESUME_SOURCE_UNSAFE');
    const directory = await opendir(path);
    for await (const entry of directory) {
      if (++visited > 10000) throw new Error('RESUME_LOOKUP_LIMIT');
      if (entry.isSymbolicLink()) throw new Error('RESUME_SOURCE_UNSAFE');
      if (entry.isDirectory()) {
        if (depth >= 3) throw new Error('RESUME_LOOKUP_LIMIT');
        await walk(join(path, entry.name), depth + 1);
      } else {
        const match =
          /^rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-([0-9a-f-]{36})\.jsonl$/.exec(
            entry.name,
          );
        if (match && (selection === 'last' || match[1] === selection))
          await inspect(join(path, entry.name), match[1]);
      }
    }
  };
  for (const name of ['sessions', 'archived_sessions']) {
    try {
      await lstat(join(home, name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw redactedSourceFailure(error);
    }
    try {
      await walk(join(home, name), 0);
    } catch (error) {
      throw redactedSourceFailure(error);
    }
  }
  if (selection !== 'last') {
    const session = sessions.get(selection);
    if (!session) throw new Error('RESUME_UNAVAILABLE');
    if (session.project !== project) throw new Error('RESUME_PROJECT_MISMATCH');
    return selection;
  }
  const matches = [...sessions]
    .filter(([, record]) => record.project === project)
    .sort((a, b) => b[1].timestamp - a[1].timestamp);
  if (!matches.length) throw new Error('RESUME_UNAVAILABLE');
  if (matches.length > 1 && matches[0][1].timestamp === matches[1][1].timestamp)
    throw new Error('RESUME_LAST_AMBIGUOUS');
  return matches[0][0];
}
