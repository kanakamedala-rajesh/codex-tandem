# Read a bounded batch of native Windows process identities and allowed scope fields.
# The caller sends TANDEM_PROCESS_PIDS as a JSON array. Unknown capability, access,
# layout or changing evidence returns unknown; only two empty CIM lookups prove absence.
# This text helper emits in-memory P/Invoke metadata; it invokes no compiler and
# creates no native artifacts. Only native AMD64 processes on Windows 10+ qualify.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$script:maximumEnvironmentBytes = 262144

function New-NativeReader {
    $assembly = [AppDomain]::CurrentDomain.DefineDynamicAssembly(
        (New-Object Reflection.AssemblyName('TandemScopeReader')), [Reflection.Emit.AssemblyBuilderAccess]::Run)
    $module = $assembly.DefineDynamicModule('Native')
    $builder = $module.DefineType('TandemNativeScope', [Reflection.TypeAttributes]::Public)
    $definitions = @(
        @('OpenProcess', 'kernel32.dll', [IntPtr], @([uint32], [bool], [uint32])),
        @('CloseHandle', 'kernel32.dll', [bool], @([IntPtr])),
        @('IsWow64Process2', 'kernel32.dll', [bool], @([IntPtr], [uint16].MakeByRefType(), [uint16].MakeByRefType())),
        @('GetProcessTimes', 'kernel32.dll', [bool], @([IntPtr], [long].MakeByRefType(), [long].MakeByRefType(), [long].MakeByRefType(), [long].MakeByRefType())),
        @('GetExitCodeProcess', 'kernel32.dll', [bool], @([IntPtr], [uint32].MakeByRefType())),
        @('ReadProcessMemory', 'kernel32.dll', [bool], @([IntPtr], [IntPtr], [IntPtr], [UIntPtr], [UIntPtr].MakeByRefType())),
        @('NtQueryInformationProcess', 'ntdll.dll', [int], @([IntPtr], [int], [IntPtr], [uint32], [uint32].MakeByRefType()))
    )
    foreach ($definition in $definitions) {
        $method = $builder.DefinePInvokeMethod($definition[0], $definition[1],
            ([Reflection.MethodAttributes]::Public -bor [Reflection.MethodAttributes]::Static -bor [Reflection.MethodAttributes]::PinvokeImpl),
            [Reflection.CallingConventions]::Standard, $definition[2], [Type[]]$definition[3],
            [Runtime.InteropServices.CallingConvention]::Winapi, [Runtime.InteropServices.CharSet]::Unicode)
        $method.SetImplementationFlags([Reflection.MethodImplAttributes]::PreserveSig)
    }
    return $builder.CreateType()
}

function Read-Bytes([IntPtr]$handle, [long]$address, [int]$length) {
    if ($address -le 0 -or $length -lt 1 -or $length -gt 512) { throw 'MEMORY_UNAVAILABLE' }
    $buffer = [Runtime.InteropServices.Marshal]::AllocHGlobal($length)
    try {
        $read = [UIntPtr]::Zero
        $ok = $script:native::ReadProcessMemory($handle, [IntPtr]$address, $buffer, [UIntPtr]::new([uint64]$length), [ref]$read)
        $count = [int]$read.ToUInt64()
        if ($count -lt 1 -or $count -gt $length) { throw 'MEMORY_UNAVAILABLE' }
        $bytes = New-Object byte[] $count
        [Runtime.InteropServices.Marshal]::Copy($buffer, $bytes, 0, $count)
        return ,@{ bytes = $bytes; complete = ($ok -and $count -eq $length) }
    } finally { [Runtime.InteropServices.Marshal]::FreeHGlobal($buffer) }
}

function Read-Pointer([IntPtr]$handle, [long]$address) {
    $result = Read-Bytes $handle $address 8
    if (!$result.complete) { throw 'MEMORY_UNAVAILABLE' }
    $pointer = [BitConverter]::ToInt64($result.bytes, 0)
    if ($pointer -le 0 -or ($pointer % 8) -ne 0) { throw 'LAYOUT_UNAVAILABLE' }
    return $pointer
}

function Read-Scope([IntPtr]$handle, [long]$environment) {
    # Never construct strings for unselected environment entries. Read bounded
    # chunks and decode only entries whose ASCII key is on the allowlist.
    $scope = @{}
    $valueBytes = New-Object 'System.Collections.Generic.List[byte]'
    $allowed = @('CODEX_HOME', 'HOME', 'USERPROFILE', 'TANDEM_GUARD_NONCE')
    $encoding = New-Object Text.UnicodeEncoding($false, $false, $true)
    $offset = 0
    $previousTerminator = $false
    $key = ''
    $keyTooLong = $false
    $inValue = $false
    $selected = $false
    $highSurrogate = $false
    while ($offset -lt $script:maximumEnvironmentBytes) {
        $chunk = Read-Bytes $handle ($environment + $offset) 512
        if (($chunk.bytes.Length % 2) -ne 0) { throw 'LAYOUT_UNAVAILABLE' }
        for ($index = 0; $index -lt $chunk.bytes.Length; $index += 2) {
            $code = [int]$chunk.bytes[$index] + 256 * [int]$chunk.bytes[$index + 1]
            if ($highSurrogate) {
                if ($code -lt 0xDC00 -or $code -gt 0xDFFF) { throw 'ENVIRONMENT_UNAVAILABLE' }
                $highSurrogate = $false
            } elseif ($code -ge 0xD800 -and $code -le 0xDBFF) {
                $highSurrogate = $true
            } elseif ($code -ge 0xDC00 -and $code -le 0xDFFF) {
                throw 'ENVIRONMENT_UNAVAILABLE'
            }
            if ($code -ne 0) {
                $previousTerminator = $false
                if (!$inValue) {
                    if ($code -eq 61) {
                        $inValue = $true
                        $key = $key.ToUpperInvariant()
                        $selected = !$keyTooLong -and ($allowed -contains $key)
                        if ($selected -and $scope.ContainsKey($key)) { throw 'ENVIRONMENT_UNAVAILABLE' }
                    } elseif (!$keyTooLong) {
                        if ($code -lt 32 -or $code -gt 126 -or $key.Length -ge 32) {
                            $keyTooLong = $true; $key = ''
                        } else { $key += [char]$code }
                    }
                } elseif ($selected) {
                    $valueBytes.Add($chunk.bytes[$index]); $valueBytes.Add($chunk.bytes[$index + 1])
                    if ($valueBytes.Count -gt 8192) { throw 'ENVIRONMENT_UNAVAILABLE' }
                }
                continue
            }
            if ($previousTerminator) { return ,$scope }
            $previousTerminator = $true
            if (!$inValue -and ($key.Length -gt 0 -or $keyTooLong)) { throw 'ENVIRONMENT_UNAVAILABLE' }
            if ($selected) {
                $value = $encoding.GetString($valueBytes.ToArray())
                if ($value -match '[\x00-\x1f\x7f]') { throw 'ENVIRONMENT_UNAVAILABLE' }
                if ($key -eq 'TANDEM_GUARD_NONCE') {
                    if ($value -notmatch '^[a-f0-9]{64}$') { throw 'ENVIRONMENT_UNAVAILABLE' }
                } elseif ($value.Length -gt 0 -and $value -notmatch '^(?:[a-zA-Z]:[\\/]|\\\\[^\\]+\\[^\\]+)') {
                    throw 'ENVIRONMENT_UNAVAILABLE'
                }
                $scope[$key] = $value
            }
            $valueBytes.Clear()
            $key = ''; $keyTooLong = $false; $inValue = $false; $selected = $false
        }
        if (!$chunk.complete) { throw 'MEMORY_UNAVAILABLE' }
        $offset += $chunk.bytes.Length
    }
    throw 'ENVIRONMENT_UNAVAILABLE'
}

function Read-ProcessRow([int]$processId) {
    $unknown = @{ pid = $processId; status = 'unknown' }
    $handle = [IntPtr]::Zero
    try {
        $processRow = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $processId)
        if (!$processRow) {
            if (!(Get-CimInstance Win32_Process -Filter ("ProcessId=" + $processId))) {
                return @{ pid = $processId; status = 'absent' }
            }
            return $unknown
        }
        if (!$script:native -or !$processRow.CreationDate -or !$processRow.ExecutablePath) { return $unknown }
        $owner = Invoke-CimMethod -InputObject $processRow -MethodName GetOwnerSid
        if ($owner.ReturnValue -ne 0 -or $owner.Sid -notmatch '^S-1-') { return $unknown }
        $handle = $script:native::OpenProcess(0x410, $false, [uint32]$processId)
        if ($handle -eq [IntPtr]::Zero) { return $unknown }
        $machine = [uint16]0; $nativeMachine = [uint16]0
        if (!$script:native::IsWow64Process2($handle, [ref]$machine, [ref]$nativeMachine) -or $machine -ne 0 -or $nativeMachine -ne 0x8664) { return $unknown }
        $created = [long]0; $exited = [long]0; $kernel = [long]0; $user = [long]0
        if (!$script:native::GetProcessTimes($handle, [ref]$created, [ref]$exited, [ref]$kernel, [ref]$user)) { return $unknown }
        $ticks = $processRow.CreationDate.ToUniversalTime().Ticks
        # CIM_DATETIME carries six fractional digits (microseconds). FILETIME
        # carries 100 ns ticks; compare by exact truncation to that CIM precision.
        $nativeTicks = [DateTime]::FromFileTimeUtc($created).Ticks
        if (($nativeTicks - ($nativeTicks % 10)) -ne $ticks) { return $unknown }
        $basic = [Runtime.InteropServices.Marshal]::AllocHGlobal(48)
        try {
            $returned = [uint32]0
            if ($script:native::NtQueryInformationProcess($handle, 0, $basic, 48, [ref]$returned) -ne 0 -or $returned -ne 48) { return $unknown }
            $peb = [Runtime.InteropServices.Marshal]::ReadInt64($basic, 8)
            if ([Runtime.InteropServices.Marshal]::ReadInt64($basic, 32) -ne $processId -or [Runtime.InteropServices.Marshal]::ReadInt64($basic, 40) -ne $processRow.ParentProcessId -or $peb -le 0) { return $unknown }
        } finally { [Runtime.InteropServices.Marshal]::FreeHGlobal($basic) }
        # These internal AMD64 offsets are capability checked, bounded and read
        # twice. Any unsupported layout fails closed rather than guessing scope.
        $parameters = Read-Pointer $handle ($peb + 32)
        $header = Read-Bytes $handle $parameters 16
        if (!$header.complete) { return $unknown }
        $maximumLength = [BitConverter]::ToUInt32($header.bytes, 0)
        $length = [BitConverter]::ToUInt32($header.bytes, 4)
        $flags = [BitConverter]::ToUInt32($header.bytes, 8)
        if ($length -lt 136 -or $length -gt $maximumLength -or $maximumLength -gt 1048576 -or ($flags -band 1) -ne 1) { return $unknown }
        $environment = Read-Pointer $handle ($parameters + 128)
        $scope = Read-Scope $handle $environment
        $scopeAgain = Read-Scope $handle $environment
        if ($scope.Count -ne $scopeAgain.Count) { return $unknown }
        foreach ($key in $scope.Keys) {
            if (!$scopeAgain.ContainsKey($key) -or $scope[$key] -cne $scopeAgain[$key]) { return $unknown }
        }
        if ((Read-Pointer $handle ($peb + 32)) -ne $parameters -or (Read-Pointer $handle ($parameters + 128)) -ne $environment) { return $unknown }
        $createdAgain = [long]0; $exitCode = [uint32]0
        if (!$script:native::GetProcessTimes($handle, [ref]$createdAgain, [ref]$exited, [ref]$kernel, [ref]$user) -or $createdAgain -ne $created -or !$script:native::GetExitCodeProcess($handle, [ref]$exitCode) -or $exitCode -ne 259) { return $unknown }
        $after = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $processId)
        if (!$after -or $after.CreationDate.ToUniversalTime().Ticks -ne $ticks -or $after.ExecutablePath -cne $processRow.ExecutablePath -or $after.ParentProcessId -ne $processRow.ParentProcessId) { return $unknown }
        $role = if ($processRow.CommandLine -match '(?:^|\s)(?:app-server|mcp-server|serve)(?:\s|$)') { 'background' } else { 'foreground' }
        return @{ pid = $processId; status = 'known'; creation = ($ticks.ToString() + ':' + $owner.Sid); parentPid = [int]$processRow.ParentProcessId; executable = $processRow.ExecutablePath; role = $role; scope = $scope }
    } catch { return $unknown }
    finally { if ($handle -ne [IntPtr]::Zero) { [void]$script:native::CloseHandle($handle) } }
}

try {
    if (!$env:TANDEM_PROCESS_PIDS -or $env:TANDEM_PROCESS_PIDS.Length -gt 2048) { throw 'INPUT_INVALID' }
    $ids = ConvertFrom-Json -InputObject $env:TANDEM_PROCESS_PIDS
    if ($ids -isnot [array]) { throw 'INPUT_INVALID' }
    if ($ids.Count -lt 1 -or $ids.Count -gt 128) { throw 'INPUT_INVALID' }
    foreach ($id in $ids) {
        if ($id -isnot [int] -and $id -isnot [long]) { throw 'INPUT_INVALID' }
        if ($id -lt 1 -or $id -gt [int]::MaxValue) { throw 'INPUT_INVALID' }
    }
    $script:native = $null
    if ([IntPtr]::Size -eq 8 -and [Environment]::OSVersion.Version.Major -ge 10) {
        try { $script:native = New-NativeReader } catch { $script:native = $null }
    }
    $rows = @($ids | ForEach-Object { Read-ProcessRow ([int]$_) })
    [Console]::Write((@{ version = 1; rows = $rows } | ConvertTo-Json -Depth 5 -Compress))
} catch {
    [Console]::Write('{"version":1,"error":"INPUT_INVALID"}')
    exit 2
}
