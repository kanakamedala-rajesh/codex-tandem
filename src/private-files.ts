import {
  lstat,
  mkdir,
  chmod,
  open,
  rename,
  rm,
  realpath,
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
const aclScript = `
$ErrorActionPreference = 'Stop'
$p = $env:TANDEM_PRIVATE_PATH
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
`;
/** Verify owner-only POSIX access or a Windows DACL allowing only the current user, SYSTEM and Administrators. Reject links and inaccessible ACLs. */
export async function verifyPrivate(path: string): Promise<void> {
  const info = await lstat(path);
  if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile()))
    throw new Error('PRIVATE_PATH_INVALID');
  if (process.platform === 'win32') {
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
            TANDEM_PRIVATE_PATH: path,
            TANDEM_PRIVATE_SET: '0',
          },
          windowsHide: true,
          timeout: 10000,
          maxBuffer: 1024,
        },
      );
    } catch {
      throw new Error('PRIVATE_ACL_REQUIRED');
    }
  } else if (
    info.uid !== process.getuid?.() ||
    (info.mode & 0o077) !== 0 ||
    (info.mode & 0o700) !== (info.isDirectory() ? 0o700 : 0o600)
  )
    throw new Error('PRIVATE_PERMISSIONS_REQUIRED');
}
async function restrict(path: string) {
  if (process.platform === 'win32') {
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
            TANDEM_PRIVATE_PATH: path,
            TANDEM_PRIVATE_SET: '1',
          },
          windowsHide: true,
          timeout: 10000,
          maxBuffer: 1024,
        },
      );
    } catch {
      throw new Error('PRIVATE_ACL_REQUIRED');
    }
  } else await chmod(path, (await lstat(path)).isDirectory() ? 0o700 : 0o600);
  await verifyPrivate(path);
}
/** Create a restricted directory, or verify an existing one without silently changing its permissions. Returns its canonical physical path. */
export async function privateDirectory(path: string): Promise<string> {
  try {
    await mkdir(path, { mode: 0o700 });
    await restrict(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    await verifyPrivate(path);
  }
  return realpath(path);
}
/**
 * Flush bytes into a restricted sibling file and atomically replace the destination.
 * Existing files must already be private. Failures before replacement preserve the
 * destination; a verification or cleanup failure after replacement can throw with
 * the new bytes already installed. This operation does not roll back replacement.
 */
export async function writePrivate(
  path: string,
  bytes: string | Buffer,
): Promise<void> {
  await verifyPrivate(dirname(path));
  try {
    await verifyPrivate(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const temporary = join(dirname(path), `.pending-${randomUUID()}`);
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await restrict(temporary);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    await rename(temporary, path);
    await verifyPrivate(path);
  } finally {
    await handle.close().catch(() => {});
    await rm(temporary, { force: true });
  }
}
