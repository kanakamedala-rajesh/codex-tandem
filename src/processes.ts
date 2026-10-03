import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
const execute = promisify(execFile);
/** Native process creation evidence. The environment separates Windows, WSL and native Linux PID namespaces. */
export type ProcessIdentity = {
  pid: number;
  creation: string;
  environment: string;
};
/** Identify the current operating environment without relying on caller-supplied WSL variables. */
export async function operatingEnvironment(): Promise<string> {
  if (process.platform === 'win32') return 'windows';
  if (process.platform !== 'linux')
    throw new Error('PROCESS_PLATFORM_UNSUPPORTED');
  return /microsoft/i.test(await readFile('/proc/sys/kernel/osrelease', 'utf8'))
    ? 'wsl'
    : 'linux';
}
/** Read native creation evidence for a PID. Returns null only when the native reader proves absence; inaccessible evidence throws. */
export async function processIdentity(
  pid: number,
): Promise<ProcessIdentity | null> {
  if (!Number.isSafeInteger(pid) || pid < 1)
    throw new Error('PROCESS_ID_INVALID');
  const environment = await operatingEnvironment();
  if (process.platform === 'win32') {
    const script = `$ErrorActionPreference='Stop'
$p=Get-CimInstance Win32_Process -Filter ("ProcessId="+$env:TANDEM_PROCESS_PID)
if (!$p) { [Console]::Write('null'); exit }
$o=Invoke-CimMethod -InputObject $p -MethodName GetOwnerSid
if ($o.ReturnValue -ne 0 -or !$p.CreationDate -or !$o.Sid) { exit 2 }
[Console]::Write((@{pid=[int]$p.ProcessId;creation=($p.CreationDate.ToUniversalTime().Ticks.ToString()+':'+$o.Sid)} | ConvertTo-Json -Compress))
`;
    try {
      const { stdout } = await execute(
        join(
          process.env.SystemRoot ?? 'C:\\Windows',
          'System32',
          'WindowsPowerShell',
          'v1.0',
          'powershell.exe',
        ),
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
          Buffer.from(script, 'utf16le').toString('base64'),
        ],
        {
          env: { ...process.env, TANDEM_PROCESS_PID: String(pid) },
          windowsHide: true,
          timeout: 10000,
          maxBuffer: 4096,
        },
      );
      const value = JSON.parse(stdout);
      if (value === null) return null;
      if (
        value.pid !== pid ||
        typeof value.creation !== 'string' ||
        !value.creation
      )
        throw new Error();
      return { ...value, environment };
    } catch {
      throw new Error('PROCESS_IDENTITY_UNAVAILABLE');
    }
  }
  try {
    const [raw, status, boot] = await Promise.all([
      readFile(`/proc/${pid}/stat`, 'utf8'),
      readFile(`/proc/${pid}/status`, 'utf8'),
      readFile('/proc/sys/kernel/random/boot_id', 'utf8'),
    ]);
    const fields = raw
      .slice(raw.lastIndexOf(')') + 2)
      .trim()
      .split(/\s+/);
    const uid = status.match(/^Uid:\s+(\d+)/m)?.[1];
    if (!uid || !/^\d+$/.test(fields[19] ?? ''))
      throw new Error('PROCESS_IDENTITY_UNAVAILABLE');
    return {
      pid,
      environment,
      creation: `${boot.trim()}:${fields[19]}:${uid}`,
    };
  } catch (error) {
    if (
      ['ENOENT', 'ESRCH'].includes((error as NodeJS.ErrnoException).code ?? '')
    ) {
      // A vanished proc entry is absence only after a second native lookup.
      try {
        await readFile(`/proc/${pid}/stat`);
      } catch (again) {
        if (
          ['ENOENT', 'ESRCH'].includes(
            (again as NodeJS.ErrnoException).code ?? '',
          )
        )
          return null;
      }
    }
    throw new Error('PROCESS_IDENTITY_UNAVAILABLE', { cause: error });
  }
}

/** A sanitized process row. Unknown scope remains a conflict; commands and environment contents are never returned. */
export type ScopedProcess = ProcessIdentity & {
  role: 'foreground' | 'worker' | 'background';
  ownership: 'managed' | 'unrelated' | 'unknown';
  executable?: string;
};
/** Persisted native ownership evidence tied to one guard nonce and canonical target home. */
export type ManagedProcess = ProcessIdentity & {
  nonce: string;
  executable: string;
  codexHome: string;
  parent: ProcessIdentity;
};
type NativeProcess = ProcessIdentity & {
  parentPid: number;
  executable?: string;
  home?: string;
  role: ScopedProcess['role'];
  nonce?: string;
};
type WindowsRow = {
  pid: number;
  status: 'known' | 'absent' | 'unknown';
  creation?: string;
  parentPid?: number;
  executable?: string;
  role?: ScopedProcess['role'];
  scope?: {
    CODEX_HOME?: string;
    USERPROFILE?: string;
    HOME?: string;
    TANDEM_GUARD_NONCE?: string;
  };
};
async function windowsRows(pids: number[]): Promise<WindowsRow[]> {
  const result: WindowsRow[] = [];
  for (let start = 0; start < pids.length; start += 128) {
    const chunk = pids.slice(start, start + 128);
    const script = (
      await readFile(
        new URL('./windows-process-reader.ps1', import.meta.url),
        'utf8',
      )
    )
      .replace(/^[ \t]*#.*(?:\r?\n|$)/gm, '')
      .replace(/^[ \t]+/gm, '')
      .replace(/^\s*\r?\n/gm, '');
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    if (encoded.length > 30000) throw new Error('WINDOWS_READER_UNAVAILABLE');
    try {
      const { stdout } = await execute(
        join(
          process.env.SystemRoot ?? 'C:\\Windows',
          'System32',
          'WindowsPowerShell',
          'v1.0',
          'powershell.exe',
        ),
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
          encoded,
        ],
        {
          env: { ...process.env, TANDEM_PROCESS_PIDS: JSON.stringify(chunk) },
          windowsHide: true,
          timeout: 15000,
          maxBuffer: 1048576,
        },
      );
      const value = JSON.parse(stdout);
      if (
        value.version !== 1 ||
        !Array.isArray(value.rows) ||
        value.rows.length !== chunk.length
      )
        throw new Error();
      for (let i = 0; i < chunk.length; i++) {
        const row = value.rows[i];
        if (
          row.pid !== chunk[i] ||
          !['known', 'absent', 'unknown'].includes(row.status)
        )
          throw new Error();
        if (
          row.status === 'known' &&
          (typeof row.creation !== 'string' ||
            !Number.isSafeInteger(row.parentPid) ||
            typeof row.executable !== 'string' ||
            !['foreground', 'background'].includes(row.role) ||
            !row.scope)
        )
          throw new Error();
        result.push(row);
      }
    } catch {
      throw new Error('PROCESS_INVENTORY_UNAVAILABLE');
    }
  }
  return result;
}
async function fromWindows(row: WindowsRow): Promise<NativeProcess | null> {
  if (row.status === 'absent') return null;
  if (row.status !== 'known') {
    const identity = await processIdentity(row.pid);
    if (!identity) return null;
    return { ...identity, parentPid: 0, role: 'foreground' };
  }
  const { canonicalPath } = await import('./discovery.js');
  let home: string | undefined;
  const selected =
    row.scope?.CODEX_HOME ??
    (row.scope?.USERPROFILE
      ? join(row.scope.USERPROFILE, '.codex')
      : undefined);
  if (selected) {
    try {
      home = await canonicalPath(selected);
    } catch {
      /* A missing or inaccessible canonical scope remains unknown. */
    }
  }
  return {
    pid: row.pid,
    creation: row.creation!,
    environment: 'windows',
    parentPid: row.parentPid!,
    executable: row.executable!,
    home,
    role: row.role!,
    nonce: row.scope?.TANDEM_GUARD_NONCE,
  };
}

async function nativeProcess(pid: number): Promise<NativeProcess | null> {
  if (process.platform === 'win32')
    return fromWindows((await windowsRows([pid]))[0]);
  const identity = await processIdentity(pid);
  if (!identity) return null;
  try {
    const { realpath } = await import('node:fs/promises');
    const { resolve, isAbsolute } = await import('node:path');
    const raw = await readFile(`/proc/${pid}/stat`, 'utf8');
    const fields = raw.slice(raw.lastIndexOf(')') + 2).split(/\s+/);
    let executable: string | undefined,
      home: string | undefined,
      nonce: string | undefined;
    try {
      executable = await realpath(`/proc/${pid}/exe`);
    } catch {
      /* An inaccessible candidate stays unknown. */
    }
    try {
      const env = (await readFile(`/proc/${pid}/environ`))
        .toString()
        .split('\0');
      const selected =
        env.find((x) => x.startsWith('CODEX_HOME='))?.slice(11) ??
        (env.find((x) => x.startsWith('HOME='))?.slice(5)
          ? join(env.find((x) => x.startsWith('HOME='))!.slice(5), '.codex')
          : undefined);
      if (selected) {
        const { canonicalPath } = await import('./discovery.js');
        const base = isAbsolute(selected)
          ? undefined
          : await realpath('/proc/' + pid + '/cwd');
        home = await canonicalPath(
          base ? resolve(base, selected) : resolve(selected),
        );
      }
      nonce = env.find((x) => x.startsWith('TANDEM_GUARD_NONCE='))?.slice(19);
    } catch {
      /* No guessed scope on denied environment access. */
    }
    let role: ScopedProcess['role'] = 'foreground';
    try {
      if (
        (await readFile(`/proc/${pid}/cmdline`))
          .toString()
          .split('\0')
          .some((x) => ['app-server', 'mcp-server', 'serve'].includes(x))
      )
        role = 'background';
    } catch {
      /* Ownership still requires native creation and scope. */
    }
    const after = await processIdentity(pid);
    if (!after || after.creation !== identity.creation)
      throw new Error('PROCESS_IDENTITY_CHANGED');
    return {
      ...identity,
      parentPid: Number(fields[1]),
      executable,
      home,
      nonce,
      role,
    };
  } catch {
    throw new Error('PROCESS_INVENTORY_UNAVAILABLE');
  }
}
function creationTime(identity: ProcessIdentity): bigint {
  const value =
    identity.environment === 'windows'
      ? identity.creation.split(':')[0]
      : identity.creation.split(':')[1];
  if (!/^\d+$/.test(value ?? ''))
    throw new Error('PROCESS_IDENTITY_UNAVAILABLE');
  return BigInt(value);
}
/** Prove a candidate is still a descendant of this manager using native creation chronology; returns private ownership metadata. */
export async function proveManagedProcess(
  pid: number,
  nonce: string,
  codexHome: string,
  executable?: string,
): Promise<ManagedProcess> {
  const { realpath, stat } = await import('node:fs/promises');
  const manager = await processIdentity(process.pid);
  const child = await nativeProcess(pid);
  if (!manager || !child || !child.executable || child.pid === manager.pid)
    throw new Error('PROCESS_OWNERSHIP_UNPROVEN');
  const wanted = executable ? await realpath(executable) : undefined;
  if (
    wanted
      ? child.executable !== wanted
      : !/(?:^|[\\/])codex(?:\.exe)?$/i.test(child.executable)
  )
    throw new Error('PROCESS_EXECUTABLE_MISMATCH');
  if (!child.home) throw new Error('PROCESS_SCOPE_UNPROVEN');
  const [selected, actualHome] = await Promise.all([
    stat(codexHome, { bigint: true }),
    stat(child.home, { bigint: true }),
  ]);
  if (selected.dev !== actualHome.dev || selected.ino !== actualHome.ino)
    throw new Error('PROCESS_SCOPE_MISMATCH');
  if (child.nonce !== undefined && child.nonce !== nonce)
    throw new Error('PROCESS_NONCE_MISMATCH');
  let next = child;
  let parent: ProcessIdentity | undefined;
  const seen = new Set<number>();
  for (let depth = 0; depth < 64; depth++) {
    if (seen.has(next.pid) || !next.parentPid) break;
    seen.add(next.pid);
    const row = await nativeProcess(next.parentPid);
    if (
      !row ||
      row.environment !== child.environment ||
      creationTime(row) > creationTime(next)
    )
      break;
    parent ??= {
      pid: row.pid,
      creation: row.creation,
      environment: row.environment,
    };
    if (row.pid === manager.pid && row.creation === manager.creation) {
      const confirmed = await processIdentity(child.pid);
      if (!confirmed || confirmed.creation !== child.creation) break;
      return {
        pid: child.pid,
        creation: child.creation,
        environment: child.environment,
        nonce,
        executable: child.executable,
        codexHome,
        parent,
      };
    }
    next = row;
  }
  throw new Error('PROCESS_OWNERSHIP_UNPROVEN');
}
/** Inspect local Codex candidates against a canonical home and native managed records. Vanished Linux scan entries are omitted only after native absence proof. Unreadable or ambiguous scope blocks switching; no process is stopped. */
export async function inspectProcesses(
  options: { codexHome: string; codexExecutable?: string },
  managed: ManagedProcess[] = [],
): Promise<ScopedProcess[]> {
  const { realpath, readdir, stat } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const home = await realpath(resolve(options.codexHome));
  const executable = options.codexExecutable
    ? await realpath(resolve(options.codexExecutable))
    : undefined;
  let candidates: number[] = [];
  if (process.platform === 'win32') {
    const script = `$ErrorActionPreference='Stop'
$r=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^codex(?:\\.exe)?$' -or ($env:TANDEM_CODEX_EXECUTABLE -and $_.ExecutablePath -eq $env:TANDEM_CODEX_EXECUTABLE) } | ForEach-Object { [int]$_.ProcessId })
[Console]::Write((ConvertTo-Json -InputObject $r -Compress))
`;
    try {
      const { stdout } = await execute(
        join(
          process.env.SystemRoot ?? 'C:\\Windows',
          'System32',
          'WindowsPowerShell',
          'v1.0',
          'powershell.exe',
        ),
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
          Buffer.from(script, 'utf16le').toString('base64'),
        ],
        {
          env: { ...process.env, TANDEM_CODEX_EXECUTABLE: executable ?? '' },
          windowsHide: true,
          timeout: 10000,
          maxBuffer: 65536,
        },
      );
      candidates = JSON.parse(stdout);
    } catch {
      throw new Error('PROCESS_INVENTORY_UNAVAILABLE');
    }
  } else {
    for (const entry of await readdir('/proc')) {
      if (!/^\d+$/.test(entry)) continue;
      const pid = Number(entry);
      let comm: string;
      try {
        comm = (await readFile(`/proc/${pid}/comm`, 'utf8')).trim();
      } catch (error) {
        if (
          ['ENOENT', 'ESRCH'].includes(
            (error as NodeJS.ErrnoException).code ?? '',
          )
        ) {
          // A failed name read cannot prove that the enumerated process is gone.
          try {
            if ((await processIdentity(pid)) === null) continue;
          } catch (identityError) {
            throw new Error('PROCESS_INVENTORY_UNAVAILABLE', {
              cause: identityError,
            });
          }
        }
        throw new Error('PROCESS_INVENTORY_UNAVAILABLE', { cause: error });
      }
      let exe;
      try {
        exe = await realpath(`/proc/${pid}/exe`);
      } catch {
        /* Candidate matching a Codex name still requires inspection. */
      }
      if (/^codex(?:\.exe)?$/i.test(comm) || (executable && exe === executable))
        candidates.push(pid);
    }
  }
  if (!Array.isArray(candidates) || candidates.length > 4096)
    throw new Error('PROCESS_INVENTORY_UNAVAILABLE');
  const excluded = new Set<number>([process.pid]);
  const result: ScopedProcess[] = [];
  const nativeRows = new Map<number, NativeProcess>();
  const batch =
    process.platform === 'win32'
      ? new Map(
          (
            await windowsRows(candidates.filter((pid) => !excluded.has(pid)))
          ).map((row) => [row.pid, row]),
        )
      : undefined;
  for (const pid of candidates) {
    if (excluded.has(pid)) continue;
    const row = batch
      ? await fromWindows(batch.get(pid)!)
      : await nativeProcess(pid);
    if (!row) continue;
    nativeRows.set(pid, row);
    const evidence = managed.find(
      (x) =>
        x.pid === pid &&
        x.creation === row.creation &&
        x.environment === row.environment &&
        x.executable === row.executable &&
        x.codexHome === home,
    );
    let sameHome: boolean | undefined;
    if (row.home) {
      if (row.home === home) sameHome = true;
      else
        try {
          const [a, b] = await Promise.all([
            stat(home, { bigint: true }),
            stat(row.home, { bigint: true }),
          ]);
          sameHome = a.dev === b.dev && a.ino === b.ino;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            sameHome = false;
        }
    }
    const ownership =
      evidence &&
      sameHome === true &&
      (row.nonce === undefined || row.nonce === evidence.nonce)
        ? 'managed'
        : sameHome === false
          ? 'unrelated'
          : 'unknown';
    result.push({
      pid,
      creation: row.creation,
      environment: row.environment,
      role: row.role,
      ownership,
      ...(row.executable ? { executable: row.executable } : {}),
    });
  }
  const candidateIds = new Set(result.map((x) => x.pid));
  for (const row of result) {
    const native = nativeRows.get(row.pid);
    if (
      row.role === 'foreground' &&
      native &&
      candidateIds.has(native.parentPid)
    )
      row.role = 'worker';
  }
  return result;
}
