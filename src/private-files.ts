import {
  lstat,
  mkdir,
  chmod,
  open,
  rename,
  rm,
  realpath,
  link,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
const windowsPowerShell = join(
  process.env.SystemRoot ?? 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe',
);
const replaceScript = `
$ErrorActionPreference = 'Stop'
$assembly = [AppDomain]::CurrentDomain.DefineDynamicAssembly((New-Object Reflection.AssemblyName('TandemReplace')), [Reflection.Emit.AssemblyBuilderAccess]::Run)
$module = $assembly.DefineDynamicModule('Native')
$type = $module.DefineType('Replace', [Reflection.TypeAttributes]::Public)
$method = $type.DefinePInvokeMethod('MoveFileExW', 'kernel32.dll', ([Reflection.MethodAttributes]::Public -bor [Reflection.MethodAttributes]::Static -bor [Reflection.MethodAttributes]::PinvokeImpl), [Reflection.CallingConventions]::Standard, [bool], [Type[]]@([string],[string],[uint32]), [Runtime.InteropServices.CallingConvention]::Winapi, [Runtime.InteropServices.CharSet]::Unicode)
$method.SetImplementationFlags([Reflection.MethodImplAttributes]::PreserveSig)
$native = $type.CreateType()
if (!$native::MoveFileExW($env:TANDEM_REPLACE_SOURCE,$env:TANDEM_REPLACE_DESTINATION,[uint32]$env:TANDEM_REPLACE_FLAGS)) { exit 2 }
`;
/** One actual private-file operation and its before/after boundary. Observers may throw to simulate a crash; they receive no file contents. */
export type PrivateWriteBoundary =
  `${'open' | 'restrict' | 'write' | 'flush' | 'close' | 'replace' | 'verify' | 'publication-flush'}:${'before' | 'after'}`;
/** Publish flushed private bytes with target-filesystem replacement and durability barriers. POSIX flushes the parent directory; Windows requests native write-through replacement. Exclusive records cannot replace an existing destination. Failures before publication preserve the destination bytes; failures after publication may leave the new bytes installed. No automatic rollback is provided. A failing observer leaves the same recoverable filesystem state as failure at that boundary. */
export async function writePrivateDurable(
  path: string,
  bytes: string | Buffer,
  options: {
    exclusive?: boolean;
    boundary?: (event: PrivateWriteBoundary) => void | Promise<void>;
  } = {},
): Promise<void> {
  const boundary = async (event: PrivateWriteBoundary) => {
    await options.boundary?.(event);
  };
  await verifyPrivate(dirname(path));
  try {
    await verifyPrivate(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const pending = join(dirname(path), '.pending-' + randomUUID());
  await boundary('open:before');
  const handle = await open(pending, 'wx', 0o600);
  let closed = false;
  try {
    await boundary('open:after');
    await boundary('restrict:before');
    await restrict([pending]);
    await boundary('restrict:after');
    await boundary('write:before');
    await handle.writeFile(bytes);
    await boundary('write:after');
    await boundary('flush:before');
    await handle.sync();
    await boundary('flush:after');
    await boundary('close:before');
    await handle.close();
    closed = true;
    await boundary('close:after');
    await boundary('replace:before');
    if (options.exclusive && process.platform !== 'win32') {
      await link(pending, path);
      await rm(pending);
    } else if (process.platform === 'win32') {
      try {
        await execute(
          windowsPowerShell,
          [
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-EncodedCommand',
            Buffer.from(replaceScript, 'utf16le').toString('base64'),
          ],
          {
            env: {
              ...process.env,
              TANDEM_REPLACE_SOURCE: pending,
              TANDEM_REPLACE_DESTINATION: path,
              TANDEM_REPLACE_FLAGS: options.exclusive ? '8' : '9',
            },
            windowsHide: true,
            timeout: 10000,
            maxBuffer: 1024,
          },
        );
      } catch {
        throw new Error('PRIVATE_REPLACE_FAILED');
      }
    } else await rename(pending, path);
    await boundary('replace:after');
    await boundary('verify:before');
    await verifyPrivate(path);
    await boundary('verify:after');
    await boundary('publication-flush:before');
    if (process.platform !== 'win32') {
      const directory = await open(dirname(path), 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } else {
      const destination = await open(path, 'r+');
      try {
        await destination.sync();
      } finally {
        await destination.close();
      }
    }
    await boundary('publication-flush:after');
  } finally {
    if (!closed) await handle.close();
    await rm(pending, { force: true });
  }
}
const aclScript = `
$ErrorActionPreference = 'Stop'
foreach ($p in (ConvertFrom-Json $env:TANDEM_PRIVATE_PATHS)) {
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
if ($env:TANDEM_PRIVATE_SET -eq '1') {
  if ([System.IO.Directory]::Exists($p)) { $acl = New-Object System.Security.AccessControl.DirectorySecurity } else { $acl = New-Object System.Security.AccessControl.FileSecurity }
  $acl.SetOwner($sid)
  $acl.SetAccessRuleProtection($true,$false)
  $inherit = if ([System.IO.Directory]::Exists($p)) { 'ContainerInherit, ObjectInherit' } else { 'None' }
  foreach ($who in @($sid.Value, 'S-1-5-18', 'S-1-5-32-544')) {
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.SecurityIdentifier]::new($who), 'FullControl', $inherit, 'None', 'Allow')
    $acl.AddAccessRule($rule)
  }
  if ([System.IO.Directory]::Exists($p)) { [System.IO.Directory]::SetAccessControl($p,$acl) } else { [System.IO.File]::SetAccessControl($p,$acl) }
}
$acl = if ([System.IO.Directory]::Exists($p)) { [System.IO.Directory]::GetAccessControl($p) } else { [System.IO.File]::GetAccessControl($p) }
if ($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid.Value -or ([System.IO.Directory]::Exists($p) -and !$acl.AreAccessRulesProtected)) { exit 2 }
$ownerAllowed = $false
foreach ($r in $acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])) {
  if ($r.AccessControlType -ne 'Allow' -or @($sid.Value,'S-1-5-18','S-1-5-32-544') -notcontains $r.IdentityReference.Value) { exit 3 }
  if ($r.IdentityReference.Value -eq $sid.Value -and ($r.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -eq [System.Security.AccessControl.FileSystemRights]::FullControl) { $ownerAllowed = $true }
}
if (!$ownerAllowed) { exit 4 }
}
`;

async function windowsAcl(paths: string[], set: boolean) {
  try {
    await execute(
      windowsPowerShell,
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(aclScript, 'utf16le').toString('base64'),
      ],
      {
        env: {
          ...process.env,
          TANDEM_PRIVATE_PATHS: JSON.stringify(paths),
          TANDEM_PRIVATE_SET: set ? '1' : '0',
        },
        windowsHide: true,
        timeout: 10000,
        maxBuffer: 1024,
      },
    );
  } catch {
    throw new Error('PRIVATE_ACL_REQUIRED');
  }
}
/** Verify owner-only POSIX access or a Windows DACL limited to the current user, SYSTEM and Administrators. A bounded path batch shares one native ACL probe; links and inaccessible protection throw. */
export async function verifyPrivate(
  path: string | readonly string[],
): Promise<void> {
  const paths = typeof path === 'string' ? [path] : path;
  if (paths.length > 256 || JSON.stringify(paths).length > 16384)
    throw new Error('PRIVATE_PATHS_INVALID');
  for (const item of paths) {
    const info = await lstat(item);
    if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile()))
      throw new Error('PRIVATE_PATH_INVALID');
    if (
      process.platform !== 'win32' &&
      (info.uid !== process.getuid?.() ||
        (info.mode & 0o077) !== 0 ||
        (info.mode & 0o700) !== (info.isDirectory() ? 0o700 : 0o600))
    )
      throw new Error('PRIVATE_PERMISSIONS_REQUIRED');
  }
  if (process.platform === 'win32' && paths.length)
    await windowsAcl([...paths], false);
}
async function restrict(paths: string[]) {
  for (const path of paths) {
    const info = await lstat(path);
    if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile()))
      throw new Error('PRIVATE_PATH_INVALID');
  }
  if (process.platform === 'win32') {
    await windowsAcl(paths, true);
    return;
  }
  for (const path of paths)
    await chmod(path, (await lstat(path)).isDirectory() ? 0o700 : 0o600);
  await verifyPrivate(paths);
}
/** Create a restricted directory or verify an existing one without changing its permissions. Returns its physical path. Exclusive creation throws EEXIST for an existing path. */
export async function privateDirectory(
  path: string,
  options: { exclusive?: boolean } = {},
): Promise<string> {
  try {
    await mkdir(path, { mode: 0o700 });
    await restrict([path]);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || options.exclusive)
      throw error;
    await verifyPrivate(path);
  }
  return realpath(path);
}
/** Flush private bytes and atomically replace one file. Errors before replacement preserve it; verification or cleanup errors after replacement may leave the new bytes installed. No rollback is provided. */
export async function writePrivate(
  path: string,
  bytes: string | Buffer,
): Promise<void> {
  await writePrivateBatch([{ path, bytes }]);
}
/** Replace private metadata files with batched native protection checks. Each replacement is atomic, but the batch is not a transaction: later failures may leave earlier files replaced. Throws on any protection, write, replacement or cleanup failure. */
export async function writePrivateBatch(
  records: readonly { path: string; bytes: string | Buffer }[],
): Promise<void> {
  if (
    records.length < 1 ||
    records.length > 128 ||
    new Set(records.map((r) => r.path)).size !== records.length
  )
    throw new Error('PRIVATE_BATCH_INVALID');
  await verifyPrivate([...new Set(records.map((r) => dirname(r.path)))]);
  const existing: string[] = [];
  for (const { path } of records) {
    try {
      await lstat(path);
      existing.push(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  await verifyPrivate(existing);
  const temporary: {
    path: string;
    destination: string;
    bytes: string | Buffer;
    handle: Awaited<ReturnType<typeof open>>;
    closed: boolean;
  }[] = [];
  try {
    for (const { path, bytes } of records) {
      const pending = join(dirname(path), '.pending-' + randomUUID());
      const handle = await open(pending, 'wx', 0o600);
      temporary.push({
        path: pending,
        destination: path,
        bytes,
        handle,
        closed: false,
      });
    }
    await restrict(temporary.map((r) => r.path));
    for (const entry of temporary) {
      await entry.handle.writeFile(entry.bytes);
      await entry.handle.sync();
      await entry.handle.close();
      entry.closed = true;
    }
    for (const entry of temporary) await rename(entry.path, entry.destination);
    await verifyPrivate(records.map((r) => r.path));
  } finally {
    for (const entry of temporary) {
      if (!entry.closed) await entry.handle.close();
      await rm(entry.path, { force: true });
    }
  }
}
