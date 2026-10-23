# Reuse the packaged native reader, then terminate one freshly verified process handle.
# Only the scoped consent flow supplies this request; no process-name or tree kill.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$env:TANDEM_PROCESS_LIBRARY = 'stop'
. ([scriptblock]::Create([IO.File]::ReadAllText($env:TANDEM_PROCESS_READER)))
$handle = [IntPtr]::Zero
function Home-Identity([string]$path) {
    if ($path -notmatch '^(?:[a-zA-Z]:[\\/]|\\\\[^\\]+\\[^\\]+\\)') { throw 'PROCESS_SCOPE_UNPROVEN' }
    $directory = $script:native::CreateFileW($path, 0, 7, [IntPtr]::Zero, 3, 0x02000000, [IntPtr]::Zero)
    if ($directory -eq [IntPtr]::new(-1)) { throw 'PROCESS_SCOPE_UNPROVEN' }
    $buffer = [Runtime.InteropServices.Marshal]::AllocHGlobal(52)
    try {
        # NTFS's 64-bit file ID is the existing Node dev/ino generation contract.
        # ReFS needs a 128-bit contract and is not silently treated as equivalent.
        $filesystem = New-Object Text.StringBuilder(32)
        if (!$script:native::GetVolumeInformationByHandleW($directory, $null, 0, [IntPtr]::Zero, [IntPtr]::Zero, [IntPtr]::Zero, $filesystem, 32) -or $filesystem.ToString() -cne 'NTFS') { throw 'PROCESS_SCOPE_UNPROVEN' }
        if (!$script:native::GetFileInformationByHandle($directory, $buffer)) { throw 'PROCESS_SCOPE_UNPROVEN' }
        $bytes = New-Object byte[] 52
        [Runtime.InteropServices.Marshal]::Copy($buffer, $bytes, 0, 52)
        if (([BitConverter]::ToUInt32($bytes, 0) -band 0x10) -eq 0) { throw 'PROCESS_SCOPE_UNPROVEN' }
        $volume = [BitConverter]::ToUInt32($bytes, 28)
        $index = [uint64][BitConverter]::ToUInt32($bytes, 44) * [uint64]4294967296 + [uint64][BitConverter]::ToUInt32($bytes, 48)
        return $volume.ToString() + ':' + $index.ToString()
    } finally { [Runtime.InteropServices.Marshal]::FreeHGlobal($buffer); [void]$script:native::CloseHandle($directory) }
}
try {
    $request = ConvertFrom-Json $env:TANDEM_STOP_REQUEST
    if ($request.pid -isnot [int] -or $request.pid -le 1 -or !$request.creation -or !$request.home -or !$request.executable -or $request.nonce -notmatch '^[a-f0-9]{64}$') { throw 'INPUT_INVALID' }
    $script:native = New-NativeReader
    $row = Read-ProcessRow $request.pid
    if ($row.status -ne 'known' -or $row.creation -cne $request.creation -or $row.executable -cne $request.executable -or ($row.scope.TANDEM_GUARD_NONCE -and $row.scope.TANDEM_GUARD_NONCE -cne $request.nonce)) { throw 'PROCESS_OWNERSHIP_UNPROVEN' }
    $processHome = $row.scope.CODEX_HOME
    if (!$processHome -and $row.scope.USERPROFILE) { $processHome = Join-Path $row.scope.USERPROFILE '.codex' }
    if (!$request.homeIdentity -or (Home-Identity $processHome) -cne $request.homeIdentity -or (Home-Identity $request.home) -cne $request.homeIdentity) { throw 'SCOPE_PATH_CHANGED' }
    $handle = $script:native::OpenProcess(0x1001, $false, [uint32]$request.pid)
    if ($handle -eq [IntPtr]::Zero) { throw 'PROCESS_IDENTITY_UNAVAILABLE' }
    $created = [long]0; $exited = [long]0; $kernel = [long]0; $user = [long]0
    if (!$script:native::GetProcessTimes($handle, [ref]$created, [ref]$exited, [ref]$kernel, [ref]$user)) { throw 'PROCESS_IDENTITY_UNAVAILABLE' }
    $ticks = [DateTime]::FromFileTimeUtc($created).Ticks
    $creationTicks = $request.creation.Split(':')[0]
    if (($ticks - ($ticks % 10)).ToString() -cne $creationTicks) { throw 'PID_REUSED' }
    # Read-ProcessRow already verifies the CIM SID plus FILETIME for this creation.
    # The opened handle pins the process object, so PID reuse cannot retarget this action.
    if (!$script:native::TerminateProcess($handle, 137)) { throw 'STOP_FAILED' }
    [Console]::Write('{"ok":true}')
} catch {
    $code = $_.Exception.Message
    if ($code -notmatch '^[A-Z_]+$') { $code = 'STOP_FAILED' }
    [Console]::Write((@{ok=$false;code=$code} | ConvertTo-Json -Compress))
    exit 2
} finally { if ($handle -ne [IntPtr]::Zero) { [void]$script:native::CloseHandle($handle) } }
