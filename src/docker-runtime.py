# Existing target Python 3.5+ standard library. Invoked inline; never installed.
import sys
prefix = getattr(sys, 'base_prefix', sys.prefix).rstrip('/')
version = '%d.%d' % sys.version_info[:2]
stdlib = [prefix + '/lib/python' + version, prefix + '/lib64/python' + version]
sys.path[:] = [p.rstrip('/') for p in sys.path if p.startswith('/') and p.rstrip('/') in stdlib + [s + '/lib-dynload' for s in stdlib] + [prefix + '/lib/python%d%d.zip' % sys.version_info[:2]]]
import os, json, stat, errno, base64, uuid, time, signal, subprocess, ctypes, select, re, datetime, calendar, contextlib

class Refused(Exception):
    pass

def fail(code):
    raise Refused(code)

uuid_pattern = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')

def native_record(value):
    if not isinstance(value, dict) or set(value) != set(['pid', 'creation', 'parent', 'state', 'uid', 'name']) or not isinstance(value['pid'], int) or value['pid'] < 2 or not isinstance(value['uid'], int) or value['uid'] < 1 or not isinstance(value['parent'], int) or value['parent'] < 0 or not isinstance(value['creation'], str) or not re.match(r'^[0-9a-f-]{36}:\d+:\d+$', value['creation']) or not isinstance(value['state'], str) or not isinstance(value['name'], str):
        fail('REMOTE_PROCESS_RECORD_INVALID')
    return value

def guard_record(value, home):
    if not isinstance(value, dict) or set(value) != set(['schemaVersion', 'home', 'nonce', 'manager']) or value['schemaVersion'] != 2 or value['home'] != home or not isinstance(value['nonce'], str) or not re.match(r'^[0-9a-f]{64}$', value['nonce']):
        fail('REMOTE_GUARD_INVALID')
    native_record(value['manager'])
    return value

def identity(pid):
    try:
        with open('/proc/%d/stat' % pid, 'r') as f:
            raw = f.read(8192)
        fields = raw[raw.rindex(')') + 2:].split()
        with open('/proc/%d/status' % pid, 'r') as f:
            status = f.read(16384)
        uid = next(line.split()[1] for line in status.splitlines() if line.startswith('Uid:'))
        with open('/proc/sys/kernel/random/boot_id', 'r') as f:
            boot = f.read(100).strip()
        return {'pid': pid, 'creation': boot + ':' + fields[19] + ':' + uid, 'parent': int(fields[1]), 'state': fields[0], 'uid': int(uid), 'name': raw[raw.index('(') + 1:raw.rindex(')')]}
    except (IOError, OSError) as error:
        if error.errno == errno.ENOENT and not os.path.exists('/proc/%d' % pid):
            return None
        fail('REMOTE_PROCESS_INACCESSIBLE')
    except Exception:
        fail('REMOTE_PROCESS_INACCESSIBLE')

def private(path, directory=False):
    info = os.lstat(path)
    expected = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode) and info.st_nlink == 1
    if not expected or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != (0o700 if directory else 0o600):
        fail('REMOTE_PRIVATE_PERMISSIONS_REQUIRED')
    return info

def folder(path):
    try:
        os.mkdir(path, 0o700)
        fd = os.open(os.path.dirname(path), os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    except OSError as error:
        if error.errno != errno.EEXIST:
            raise
    private(path, True)

def read(path, optional=False):
    try:
        before = private(path)
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            current = os.fstat(fd)
            if current.st_dev != before.st_dev or current.st_ino != before.st_ino or current.st_size > 65536:
                fail('REMOTE_FILE_CHANGED')
            data = os.read(fd, 65537)
            if len(data) > 65536:
                fail('REMOTE_FILE_TOO_LARGE')
            return data
        finally:
            os.close(fd)
    except OSError as error:
        if optional and error.errno == errno.ENOENT:
            return None
        raise

def record(path, optional=False):
    data = read(path, optional)
    return json.loads(data.decode('utf8')) if data is not None else None

def write(path, data, exclusive=False):
    if len(data) > 65536:
        fail('REMOTE_FILE_TOO_LARGE')
    parent = os.path.dirname(path)
    private(parent, True)
    try:
        private(path)
        if exclusive:
            fail('REMOTE_RECORD_EXISTS')
    except OSError as error:
        if error.errno != errno.ENOENT:
            raise
    temporary = os.path.join(parent, '.pending-' + str(uuid.uuid4()))
    fd = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    try:
        os.fchmod(fd, 0o600)
        offset = 0
        while offset < len(data):
            offset += os.write(fd, data[offset:])
        os.fsync(fd)
    finally:
        os.close(fd)
    private(temporary)
    if exclusive:
        os.link(temporary, path)
        os.unlink(temporary)
    else:
        os.replace(temporary, path)
    private(path)
    directory = os.open(parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)

def put(path, value, exclusive=False):
    write(path, json.dumps(value, separators=(',', ':')).encode('utf8'), exclusive)

def environment(pid):
    try:
        with open('/proc/%d/environ' % pid, 'rb') as f:
            data = f.read(1048577)
        if len(data) > 1048576:
            fail('REMOTE_PROCESS_INACCESSIBLE')
        result = {}
        for entry in data.split(b'\x00'):
            name, _, value = entry.partition(b'=')
            if name in [b'HOME', b'CODEX_HOME', b'TANDEM_LAUNCH_ID', b'TANDEM_MANAGER_NONCE']:
                result[name.decode('ascii')] = value.decode('utf8')
        return result
    except (IOError, OSError) as error:
        if error.errno == errno.ENOENT and identity(pid) is None:
            return None
        fail('REMOTE_PROCESS_INACCESSIBLE')

def inventory(home, executable, journal, ignore=None):
    processes = {}
    for name in os.listdir('/proc'):
        if name.isdigit():
            info = identity(int(name))
            if info is not None:
                processes[info['pid']] = info
    managed = {}
    if os.path.isdir(journal):
        names = os.listdir(journal)
        if len(names) > 10000:
            fail('REMOTE_INVENTORY_LIMIT')
        for name in names:
            if name.startswith('process-') and name.endswith('.json'):
                value = record(os.path.join(journal, name))
                if not isinstance(value, dict) or set(value) - set(['schemaVersion', 'home', 'nonce', 'launchId', 'supervisor', 'state', 'child', 'exitCode']) or value.get('schemaVersion') != 1 or value.get('home') != home or not isinstance(value.get('launchId'), str) or not uuid_pattern.match(value['launchId']) or not isinstance(value.get('nonce'), str) or not re.match(r'^[0-9a-f]{64}$', value['nonce']) or value.get('state') not in ['starting', 'running', 'exited']:
                    fail('REMOTE_PROCESS_RECORD_INVALID')
                retained = False
                for key in ['supervisor', 'child']:
                    if key == 'child' and 'child' not in value:
                        continue
                    expected = native_record(value.get(key))
                    actual = processes.get(expected['pid'])
                    if actual is not None:
                        if actual['creation'] != expected['creation']:
                            fail('REMOTE_PID_REUSED')
                        if actual['uid'] != os.geteuid():
                            fail('REMOTE_PROCESS_OWNER_CHANGED')
                        managed[actual['pid']] = value
                        retained = True
                # Only the subreaper's durable exited record proves every adopted
                # descendant was reaped. Missing recorded roots do not prove it.
                if not retained and value['state'] != 'exited':
                    fail('REMOTE_DESCENDANTS_UNPROVEN')
    result = []
    for pid, info in processes.items():
        if pid == ignore or pid == os.getpid():
            continue
        parent, visited, owner = pid, set(), None
        while parent in processes and parent not in visited:
            visited.add(parent)
            if parent in managed:
                owner = managed[parent]
                break
            parent = processes[parent]['parent']
        try:
            path = os.readlink('/proc/%d/exe' % pid)
        except OSError as error:
            if identity(pid) is None:
                continue
            if info['uid'] == os.geteuid() and info['state'] != 'Z':
                fail('REMOTE_PROCESS_INACCESSIBLE')
            path = ''
        candidate = path == executable or os.path.basename(path).split(' ')[0] == 'codex' or info['name'] == 'codex'
        if owner is None and not candidate:
            continue
        if info['uid'] != os.geteuid():
            if candidate:
                fail('REMOTE_PROCESS_OWNER_UNPROVEN')
            continue
        env = environment(pid)
        if env is None:
            continue
        scope_path = env.get('CODEX_HOME') or (os.path.join(env['HOME'], '.codex') if env.get('HOME') else None)
        scope = os.path.realpath(scope_path) if scope_path and scope_path.startswith('/') else None
        if owner is None:
            if scope is None:
                fail('REMOTE_PROCESS_OWNER_UNPROVEN')
            if scope != home:
                continue
        if owner is not None and (env.get('TANDEM_MANAGER_NONCE') != owner.get('nonce') or scope != home):
            # An adopted child may deliberately clear its environment; ancestry
            # still proves the owned supervisor relation while it remains alive.
            if pid == owner['supervisor']['pid']:
                fail('REMOTE_PROCESS_OWNER_UNPROVEN')
        result.append({'pid': pid, 'creation': info['creation'], 'executable': path, 'managed': owner is not None, 'launchId': owner.get('launchId') if owner else None, 'state': info['state'], 'role': 'supervisor' if owner and pid == owner['supervisor']['pid'] else 'child' if owner else 'external'})
    return result

def process_snapshot(home, project, executable):
    paths = pinned_paths(home, project, executable)
    journal, lock = os.path.join(home, '.tandem-activation'), os.path.join(home, '.tandem-docker.lock')
    owner, lock_identity = None, None
    if os.path.lexists(lock):
        info = private(lock, True)
        lock_identity = (info.st_dev, info.st_ino)
        owner = guard_record(record(os.path.join(lock, 'owner.json')), home)
        actual = identity(owner['manager']['pid'])
        if actual is not None and actual['creation'] != owner['manager']['creation']:
            fail('REMOTE_PID_REUSED')
    if os.path.lexists(journal):
        private(journal, True)
    found = inventory(home, executable, journal)
    if pinned_paths(home, project, executable) != paths:
        fail('REMOTE_PATH_CHANGED')
    if owner is not None:
        info = private(lock, True)
        if (info.st_dev, info.st_ino) != lock_identity or guard_record(record(os.path.join(lock, 'owner.json')), home) != owner:
            fail('REMOTE_GUARD_CHANGED')
    elif os.path.lexists(lock):
        fail('REMOTE_GUARD_CHANGED')
    return {'processes': found, 'owner': owner}

def stable_processes(values):
    return sorted([{key: value for key, value in p.items() if key != 'state'} for p in values], key=lambda p: p['pid'])

def inspect_or_stop(mode, home, project, executable):
    before = process_snapshot(home, project, executable)
    if mode == 'stop':
        raw = sys.stdin.readline(262145)
        if len(raw.encode('utf8')) > 262144:
            fail('REMOTE_REQUEST_TOO_LARGE')
        requested = json.loads(raw)
        approved = requested.get('processes')
        if not isinstance(approved, list) or not isinstance(requested.get('force'), bool) or requested.get('owner') != before['owner'] or stable_processes(approved) != stable_processes(before['processes']) or any(not p.get('managed') or p.get('pid', 0) < 2 for p in approved):
            fail('REMOTE_STOP_SCOPE_CHANGED')
        # All approved processes are rechecked before the first signal. Subsequent
        # exact native identities prevent PID reuse from extending this consent.
        for p in approved:
            fresh = identity(p['pid'])
            if fresh is not None and (fresh['creation'] != p['creation'] or fresh['uid'] != os.geteuid()):
                fail('REMOTE_PID_REUSED')
        if stable_processes(process_snapshot(home, project, executable)['processes']) != stable_processes(approved):
            fail('REMOTE_STOP_SCOPE_CHANGED')
        for p in approved:
            if p.get('role') == 'supervisor':
                continue
            current_owner = process_snapshot(home, project, executable)['owner']
            if current_owner != before['owner']:
                fail('REMOTE_GUARD_CHANGED')
            fresh = identity(p['pid'])
            if fresh is None:
                continue
            if fresh['creation'] != p['creation'] or fresh['uid'] != os.geteuid():
                fail('REMOTE_PID_REUSED')
            os.kill(p['pid'], signal.SIGKILL if requested['force'] else signal.SIGTERM)
        before = process_snapshot(home, project, executable)
    print(json.dumps({'ok': True, 'result': before}))
    sys.stdout.flush()

def pinned_paths(home, project, executable):
    if os.geteuid() == 0:
        fail('ROOT_TARGET_UNSUPPORTED')
    for path in [home, project, executable]:
        if not path.startswith('/') or os.path.realpath(path) != path:
            fail('REMOTE_PATH_CHANGED')
    private(home, True)
    if not os.path.isdir(project) or not os.path.isfile(executable) or not os.access(executable, os.X_OK):
        fail('REMOTE_PATH_UNAVAILABLE')
    return [(os.stat(p).st_dev, os.stat(p).st_ino) for p in [home, project, executable]]

def invocation_path(path, root=None):
    physical = os.path.realpath(path)
    if not isinstance(path, str) or not path.startswith('/') or os.path.normpath(path) != path:
        fail('REMOTE_PATH_INVALID')
    info = os.stat(physical)
    result = {'path': path, 'physical': physical, 'device': info.st_dev, 'inode': info.st_ino, 'root': root}
    if root is not None:
        if os.path.realpath(root) != root or not os.path.isdir(root) or not os.path.isdir(physical) or (physical != root and not physical.startswith(root.rstrip('/') + '/')):
            fail('REMOTE_PROJECT_OUTSIDE_REGISTERED_ROOT')
        root_info = os.stat(root)
        if root_info.st_dev != info.st_dev:
            fail('REMOTE_PROJECT_MOUNT_REQUIRES_REGISTERED_ROOT')
        with open('/proc/self/mountinfo', 'r') as mountinfo:
            mounts = [re.sub(r'\\([0-7]{3})', lambda match: chr(int(match.group(1), 8)), line.split(' ')[4]) for line in mountinfo]
        if any(m != root and m.startswith(root.rstrip('/') + '/') and (physical == m or physical.startswith(m.rstrip('/') + '/')) for m in mounts):
            fail('REMOTE_PROJECT_MOUNT_REQUIRES_REGISTERED_ROOT')
        result['rootDevice'], result['rootInode'] = root_info.st_dev, root_info.st_ino
    elif physical != path or not stat.S_ISREG(info.st_mode) or not os.access(path, os.X_OK):
        fail('REMOTE_ENVIRONMENT_WRAPPER_CHANGED')
    return result

def recheck_invocation(records):
    if not isinstance(records, list) or not records or len(records) > 35:
        fail('REMOTE_INVOCATION_UNPROVEN')
    for entry in records:
        if invocation_path(entry['path'], entry['root']) != entry:
            fail('REMOTE_INVOCATION_PATH_CHANGED')

def resume_session(home, project, selection):
    if selection != 'last' and (not isinstance(selection, str) or not uuid_pattern.match(selection)):
        fail('RESUME_ID_INVALID')
    visited, metadata_bytes, sessions = [0], [0], {}
    def inspect(path, filename_id):
        physical = os.path.realpath(path)
        if not physical.startswith(home.rstrip('/') + '/'):
            fail('RESUME_SOURCE_UNSAFE')
        before = os.lstat(path)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
            fail('RESUME_SOURCE_UNSAFE')
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        first, completed = b'', False
        try:
            opened = os.fstat(fd)
            if opened.st_dev != before.st_dev or opened.st_ino != before.st_ino:
                fail('RESUME_SOURCE_CHANGED')
            while len(first) < 65536:
                chunk = os.read(fd, min(1024, 65536 - len(first)))
                metadata_bytes[0] += len(chunk)
                if metadata_bytes[0] > 16777216:
                    fail('RESUME_LOOKUP_LIMIT')
                if not chunk:
                    fail('RESUME_METADATA_INCOMPLETE')
                if b'\n' in chunk:
                    first += chunk.split(b'\n', 1)[0]
                    completed = True
                    break
                first += chunk
        finally:
            os.close(fd)
        if not completed or len(first) >= 65536:
            fail('RESUME_METADATA_LIMIT')
        try:
            value = json.loads(first.decode('utf8'))
            meta = value.get('payload')
            if value.get('type') != 'session_meta' or not isinstance(meta, dict) or meta.get('id') != filename_id or not uuid_pattern.match(filename_id) or not isinstance(meta.get('cwd'), str) or not meta['cwd'].startswith('/') or any(ord(c) < 32 or ord(c) == 127 for c in meta['cwd']) or not isinstance(meta.get('timestamp'), str):
                fail('RESUME_METADATA_INVALID')
            match = re.match(r'^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$', meta['timestamp'])
            if not match:
                fail('RESUME_METADATA_INVALID')
            seconds = calendar.timegm(datetime.datetime.strptime(match.group(1), '%Y-%m-%dT%H:%M:%S').timetuple())
            zone = match.group(3)
            if zone != 'Z':
                hours, minutes = int(zone[1:3]), int(zone[4:6])
                if hours > 23 or minutes > 59:
                    fail('RESUME_METADATA_INVALID')
                seconds -= (1 if zone[0] == '+' else -1) * (hours * 3600 + minutes * 60)
            stamp = seconds * 1000000000 + int((match.group(2) or '').ljust(9, '0') or '0')
        except Refused:
            raise
        except Exception:
            fail('RESUME_METADATA_INVALID')
        physical_project = os.path.realpath(meta['cwd'])
        if not os.path.isdir(physical_project):
            if selection != 'last' or meta['cwd'] == project:
                fail('RESUME_PROJECT_UNAVAILABLE')
            return
        entry = (physical_project, stamp)
        if filename_id in sessions and sessions[filename_id] != entry:
            fail('RESUME_METADATA_CONFLICT')
        sessions[filename_id] = entry
    def walk(path, depth):
        info = os.lstat(path)
        if not stat.S_ISDIR(info.st_mode) or not os.path.realpath(path).startswith(home.rstrip('/') + '/'):
            fail('RESUME_SOURCE_UNSAFE')
        iterator = os.scandir(path)
        try:
            for entry in iterator:
                visited[0] += 1
                if visited[0] > 10000:
                    fail('RESUME_LOOKUP_LIMIT')
                if entry.is_symlink():
                    fail('RESUME_SOURCE_UNSAFE')
                if entry.is_dir(follow_symlinks=False):
                    if depth >= 3:
                        fail('RESUME_LOOKUP_LIMIT')
                    walk(entry.path, depth + 1)
                else:
                    match = re.match(r'^rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-([0-9a-f-]{36})\.jsonl$', entry.name)
                    if match and (selection == 'last' or match.group(1) == selection):
                        inspect(entry.path, match.group(1))
        finally:
            close = getattr(iterator, 'close', None)
            if close is not None:
                close()
            del iterator
    try:
        for name in ['sessions', 'archived_sessions']:
            source = os.path.join(home, name)
            try:
                os.lstat(source)
            except OSError as error:
                if error.errno == errno.ENOENT:
                    continue
                raise
            walk(source, 0)
    except Refused:
        raise
    except Exception:
        fail('RESUME_SOURCE_UNAVAILABLE')
    if selection != 'last':
        if selection not in sessions:
            fail('RESUME_UNAVAILABLE')
        if sessions[selection][0] != project:
            fail('RESUME_PROJECT_MISMATCH')
        return selection
    matching = sorted([(value[1], key) for key, value in sessions.items() if value[0] == project], reverse=True)
    if not matching:
        fail('RESUME_UNAVAILABLE')
    if len(matching) > 1 and matching[0][0] == matching[1][0]:
        fail('RESUME_LAST_AMBIGUOUS')
    return matching[0][1]

def policy(project, executable, arguments, wrapper):
    if not isinstance(arguments, list) or len(arguments) % 2 or any(arguments[i] not in ['-c', '--config', '--enable', '--disable'] for i in range(0, len(arguments), 2)):
        fail('REMOTE_POLICY_ARGUMENTS_INVALID')
    if wrapper and (os.path.realpath(wrapper) != wrapper or not os.path.isfile(wrapper) or not os.access(wrapper, os.X_OK)):
        fail('REMOTE_ENVIRONMENT_WRAPPER_CHANGED')
    child = subprocess.Popen(([wrapper, executable] if wrapper else [executable]) + ['app-server'] + arguments, cwd=project, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    initial = identity(child.pid)
    def send(value):
        child.stdin.write((json.dumps(value) + '\n').encode('utf8'))
        child.stdin.flush()
    config, layers, requirements = None, None, None
    result, buffer, size = None, b'', 0
    deadline = time.monotonic() + 15
    try:
        send({'id': 0, 'method': 'initialize', 'params': {'clientInfo': {'name': 'codex-tandem', 'version': '0.1.0'}, 'capabilities': {'experimentalApi': True}}})
        while result is None:
            if time.monotonic() >= deadline:
                fail('REMOTE_POLICY_INSPECTION_FAILED')
            readers, _, _ = select.select([child.stdout, child.stderr], [], [], min(0.1, deadline - time.monotonic()))
            for reader in readers:
                chunk = os.read(reader.fileno(), 65536)
                size += len(chunk)
                if not chunk or size > 1048576:
                    fail('REMOTE_POLICY_INSPECTION_FAILED')
                if reader is child.stderr:
                    continue
                buffer += chunk
                while b'\n' in buffer:
                    line, buffer = buffer.split(b'\n', 1)
                    message = json.loads(line.decode('utf8'))
                    if message.get('error'):
                        fail('REMOTE_POLICY_INSPECTION_FAILED')
                    if message.get('id') == 0:
                        send({'method': 'initialized'})
                        send({'id': 1, 'method': 'config/read', 'params': {'includeLayers': True, 'cwd': project}})
                    elif message.get('id') == 1:
                        config, layers = message.get('result', {}).get('config'), message.get('result', {}).get('layers')
                        if not isinstance(config, dict) or not isinstance(layers, list):
                            fail('REMOTE_POLICY_UNVERIFIABLE')
                        send({'id': 2, 'method': 'configRequirements/read', 'params': None})
                    elif message.get('id') == 2:
                        payload = message.get('result')
                        if config is None or not isinstance(payload, dict) or 'requirements' not in payload:
                            fail('REMOTE_POLICY_UNVERIFIABLE')
                        requirements = payload['requirements']
                        mode = config.get('cli_auth_credentials_store')
                        method = config.get('forced_login_method')
                        providers = config.get('model_providers')
                        projected = {'cli_auth_credentials_store': mode if mode in ['file', 'keyring', 'auto', 'ephemeral'] else 'unknown', 'forced_login_method': method if method in [None, 'chatgpt', 'api'] else 'unknown', 'forced_chatgpt_workspace_id': config.get('forced_chatgpt_workspace_id'), 'model_provider': config.get('model_provider') if config.get('model_provider') in [None, 'openai'] else 'unsupported', 'model_providers': {} if providers in [None, {}] else {'unsupported': True}}
                        restriction = requirements.get('cliAuthCredentialsStore') if isinstance(requirements, dict) else 'unknown'
                        result = {'config': projected, 'managed': any('enterpriseManaged' in json.dumps(layer) for layer in layers), 'requirements': None if requirements is None else {'cliAuthCredentialsStore': restriction if restriction in [None, 'file', 'keyring', 'auto', 'ephemeral'] else 'unknown'}}
    finally:
        child.stdin.close()
        until = time.monotonic() + 1.5
        while child.poll() is None and time.monotonic() < until:
            time.sleep(0.02)
        if child.poll() is None:
            fresh = identity(child.pid)
            if fresh is None or initial is None or fresh['creation'] != initial['creation']:
                fail('REMOTE_POLICY_PROCESS_CHANGED')
            child.terminate()
            try:
                child.wait(timeout=1.5)
            except subprocess.TimeoutExpired:
                fail('REMOTE_POLICY_PROCESS_RETAINED')
        child.stdout.close()
        child.stderr.close()
    return result

@contextlib.contextmanager
def control_mutex(home):
    # This inode is permanent: unlinking a flock file would let two controllers
    # lock different inodes. Hold its descriptor until all requests finish;
    # controller death releases the kernel lock without removing durable guards.
    import fcntl
    path = os.path.join(home, '.tandem-docker-owner.lock')
    fd = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        os.set_inheritable(fd, False)
        before, opened = private(path), os.fstat(fd)
        if (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino):
            fail('REMOTE_GUARD_CHANGED')
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            if error.errno in [errno.EACCES, errno.EAGAIN]:
                fail('REMOTE_SCOPE_BUSY')
            raise
        after = private(path)
        if (after.st_dev, after.st_ino) != (opened.st_dev, opened.st_ino):
            fail('REMOTE_GUARD_CHANGED')
        os.fsync(fd)
        directory = os.open(home, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
        yield (fd, opened.st_dev, opened.st_ino)
    finally:
        os.close(fd)

def control(home, project, executable, nonce):
    folder(home)
    paths = pinned_paths(home, project, executable)
    with control_mutex(home) as held:
        journal, lock = os.path.join(home, '.tandem-activation'), os.path.join(home, '.tandem-docker.lock')
        folder(journal)
        current = identity(os.getpid())
        if os.path.exists(lock):
            private(lock, True)
            old = guard_record(record(os.path.join(lock, 'owner.json')), home)
            actual = identity(old['manager'].get('pid', 0))
            if actual is not None:
                if actual['creation'] != old['manager'].get('creation'):
                    fail('REMOTE_PID_REUSED')
                fail('REMOTE_SCOPE_BUSY')
            if inventory(home, executable, journal):
                fail('REMOTE_SCOPE_BUSY')
            # An idle dead controller may be reclaimed. Credential reconciliation is
            # still mandatory before its interrupted transaction is overwritten.
            retired = lock + '.retired-' + str(uuid.uuid4())
            os.rename(lock, retired)
            os.unlink(os.path.join(retired, 'owner.json'))
            os.rmdir(retired)
        os.mkdir(lock, 0o700)
        put(os.path.join(lock, 'owner.json'), {'schemaVersion': 2, 'home': home, 'nonce': nonce, 'manager': current}, True)
        lock_identity = (os.stat(lock).st_dev, os.stat(lock).st_ino)
        invocation, wrapper = [], None
        def check():
            mutex = private(os.path.join(home, '.tandem-docker-owner.lock'))
            opened = os.fstat(held[0])
            if (mutex.st_dev, mutex.st_ino) != held[1:] or (opened.st_dev, opened.st_ino) != held[1:]:
                fail('REMOTE_GUARD_CHANGED')
            if pinned_paths(home, project, executable) != paths:
                fail('REMOTE_PATH_CHANGED')
            private(lock, True)
            if (os.stat(lock).st_dev, os.stat(lock).st_ino) != lock_identity:
                fail('REMOTE_GUARD_CHANGED')
            owner = guard_record(record(os.path.join(lock, 'owner.json')), home)
            if owner.get('nonce') != nonce or owner.get('manager') != current:
                fail('REMOTE_GUARD_CHANGED')
            if invocation:
                recheck_invocation(invocation)
        def idle():
            found = inventory(home, executable, journal)
            if found:
                fail('REMOTE_SCOPE_BUSY')
        print(json.dumps({'ok': True, 'manager': current}))
        sys.stdout.flush()
        for raw in sys.stdin:
            try:
                if len(raw.encode('utf8')) > 262144:
                    fail('REMOTE_REQUEST_TOO_LARGE')
                value = json.loads(raw)
                check()
                action = value.get('action')
                result = None
                if action == 'check':
                    idle()
                elif action == 'pin':
                    idle()
                    requested = value.get('paths')
                    if not isinstance(requested, list) or not requested or len(requested) > 34:
                        fail('REMOTE_INVOCATION_UNPROVEN')
                    invocation = [invocation_path(p['path'], p['root']) for p in requested]
                    if invocation[-1]['physical'] != project:
                        fail('REMOTE_INVOCATION_PATH_CHANGED')
                    wrapper = value.get('wrapper')
                    if wrapper is not None:
                        invocation.append(invocation_path(wrapper))
                elif action == 'policy':
                    idle()
                    result = policy(project, executable, value.get('arguments'), value.get('wrapper'))
                    idle()
                elif action == 'inventory':
                    result = inventory(home, executable, journal)
                elif action == 'resume':
                    idle()
                    result = resume_session(home, project, value.get('selection'))
                elif action == 'interrupt':
                    launch_id = value.get('launchId')
                    signum = signal.SIGINT if value.get('signal') == 'SIGINT' else signal.SIGTERM if value.get('signal') == 'SIGTERM' else None
                    if not signum or not isinstance(launch_id, str):
                        fail('REMOTE_OPERATION_INVALID')
                    selected = [p for p in inventory(home, executable, journal) if p['managed'] and p['launchId'] == launch_id and p['role'] != 'supervisor']
                    for p in selected:
                        fresh = identity(p['pid'])
                        if fresh is not None:
                            if fresh['creation'] != p['creation']:
                                fail('REMOTE_PID_REUSED')
                            os.kill(p['pid'], signum)
                elif action == 'snapshot':
                    idle()
                    auth = read(os.path.join(home, 'auth.json'), True)
                    result = {'auth': base64.b64encode(auth).decode('ascii') if auth is not None else None, 'active': record(os.path.join(journal, 'active.json'), True), 'transaction': record(os.path.join(journal, 'transaction.json'), True)}
                elif action == 'metadata':
                    idle()
                    name = value.get('name')
                    if name not in ['active', 'transaction']:
                        fail('REMOTE_OPERATION_INVALID')
                    put(os.path.join(journal, name + '.json'), value['value'])
                elif action == 'stage':
                    idle()
                    write(os.path.join(journal, 'selected.json'), base64.b64decode(value['auth'].encode('ascii'), validate=True))
                elif action == 'replace':
                    idle()
                    current_auth = read(os.path.join(home, 'auth.json'), True)
                    expected = base64.b64decode(value['expected'].encode('ascii'), validate=True) if value.get('expected') is not None else None
                    if current_auth != expected:
                        fail('EXTERNAL_REFRESH_CONFLICT')
                    write(os.path.join(home, 'auth.json'), read(os.path.join(journal, 'selected.json')))
                elif action == 'prepare':
                    idle()
                    launch = value['value']
                    if not isinstance(launch.get('id'), str) or not uuid_pattern.match(launch['id']):
                        fail('REMOTE_OPERATION_INVALID')
                    recheck_invocation(invocation)
                    if launch.get('environmentWrapper') != wrapper:
                        fail('REMOTE_ENVIRONMENT_WRAPPER_CHANGED')
                    launch['spawnProject'] = invocation[0]['physical']
                    launch['invocationPaths'] = invocation
                    put(os.path.join(journal, 'launch-' + launch['id'] + '.json'), launch, True)
                elif action == 'release':
                    idle()
                    os.unlink(os.path.join(lock, 'owner.json'))
                    os.rmdir(lock)
                    print(json.dumps({'ok': True, 'result': None}))
                    sys.stdout.flush()
                    return
                else:
                    fail('REMOTE_OPERATION_INVALID')
                print(json.dumps({'ok': True, 'result': result}, separators=(',', ':')))
            except Exception as error:
                print(json.dumps({'ok': False, 'code': str(error) if isinstance(error, Refused) else 'REMOTE_OPERATION_FAILED'}))
            sys.stdout.flush()
        # EOF is only transport loss. Never unlink ownership here or infer child exit.

def launch(home, project, executable, nonce, launch_id, args):
    pinned_paths(home, project, executable)
    journal, lock = os.path.join(home, '.tandem-activation'), os.path.join(home, '.tandem-docker.lock')
    private(journal, True)
    owner = guard_record(record(os.path.join(lock, 'owner.json')), home)
    manager = identity(owner['manager']['pid'])
    if owner.get('nonce') != nonce or manager is None or manager['creation'] != owner['manager']['creation']:
        fail('REMOTE_GUARD_CHANGED')
    prepared = record(os.path.join(journal, 'launch-' + launch_id + '.json'))
    if not uuid_pattern.match(launch_id) or prepared.get('id') != launch_id or prepared.get('home') != home or prepared.get('project') != project or prepared.get('executable') != executable:
        fail('REMOTE_LAUNCH_CHANGED')
    active = record(os.path.join(journal, 'active.json'))
    transaction = record(os.path.join(journal, 'transaction.json'))
    if not isinstance(active, dict) or not isinstance(transaction, dict) or active.get('home') != home or active.get('generation') != prepared.get('generation') or active.get('profileId') != prepared.get('profileId') or active.get('bindingId') != prepared.get('bindingId') or transaction.get('id') != active.get('transactionId') or transaction.get('phase') != 'complete' or transaction.get('resolved') != {'profileId': active.get('profileId'), 'bindingId': active.get('bindingId')}:
        fail('REMOTE_ACTIVE_BINDING_CHANGED')
    def auth_hint(path):
        value = json.loads(read(path).decode('utf8'))
        tokens = value.get('tokens')
        if not isinstance(tokens, dict) or value.get('OPENAI_API_KEY') or value.get('auth_mode') not in [None, 'chatgpt']:
            fail('REMOTE_CREDENTIAL_INVALID')
        claims = json.loads(base64.urlsafe_b64decode((tokens['id_token'].split('.')[1] + '===').encode('ascii')).decode('utf8'))
        hint = claims.get('https://api.openai.com/auth')
        if not isinstance(hint, dict) or hint.get('chatgpt_account_id') != tokens.get('account_id'):
            fail('REMOTE_CREDENTIAL_INVALID')
        subject = hint.get('chatgpt_user_id') or hint.get('user_id')
        if not subject or any(hint.get(key, subject) != subject for key in ['chatgpt_user_id', 'user_id']):
            fail('REMOTE_CREDENTIAL_INVALID')
        return (tokens['account_id'], subject)
    if auth_hint(os.path.join(home, 'auth.json')) != auth_hint(os.path.join(journal, 'selected.json')):
        fail('REMOTE_ACTIVE_BINDING_CHANGED')
    recheck_invocation(prepared.get('invocationPaths'))
    if ctypes.CDLL(None, use_errno=True).prctl(36, 1, 0, 0, 0) != 0:
        fail('REMOTE_SUPERVISION_UNAVAILABLE')
    supervisor = identity(os.getpid())
    process_file = os.path.join(journal, 'process-' + launch_id + '.json')
    process_record = {'schemaVersion': 1, 'home': home, 'nonce': nonce, 'launchId': launch_id, 'supervisor': supervisor, 'state': 'starting'}
    put(process_file, process_record, True)
    child = None
    def interrupt(signum, frame):
        if signum == signal.SIGTERM and child is not None and child.poll() is None:
            os.kill(child.pid, signal.SIGTERM)
        # Ctrl+C reaches the same inherited terminal and the child itself.
    signal.signal(signal.SIGINT, interrupt)
    signal.signal(signal.SIGTERM, interrupt)
    signal.signal(signal.SIGHUP, signal.SIG_IGN)
    wrapper = prepared.get('environmentWrapper')
    command = ([wrapper, executable] if wrapper else [executable]) + args
    child = subprocess.Popen(command, cwd=prepared['spawnProject'])
    process_record['state'] = 'running'
    process_record['child'] = identity(child.pid)
    put(process_file, process_record)
    status = child.wait()
    while True:
        try:
            pid, ignored = os.waitpid(-1, os.WNOHANG)
            if pid == 0:
                time.sleep(0.05)
                continue
        except OSError as error:
            if error.errno == errno.ECHILD:
                break
            raise
    process_record['state'] = 'exited'
    process_record['exitCode'] = status if status >= 0 else 128 - status
    put(process_file, process_record)
    sys.exit(process_record['exitCode'])

try:
    mode, home, project, executable, nonce = sys.argv[1:6]
    if mode == 'control':
        control(home, project, executable, nonce)
    elif mode == 'launch':
        launch(home, project, executable, nonce, sys.argv[6], sys.argv[7:])
    elif mode in ['inspect', 'stop']:
        inspect_or_stop(mode, home, project, executable)
    else:
        fail('REMOTE_OPERATION_INVALID')
except Exception as error:
    if len(sys.argv) > 1 and sys.argv[1] in ['control', 'inspect', 'stop']:
        print(json.dumps({'ok': False, 'code': str(error) if isinstance(error, Refused) else 'REMOTE_OPERATION_FAILED'}))
        sys.stdout.flush()
    else:
        sys.stderr.write('REMOTE_LAUNCH_FAILED\n')
    sys.exit(2)
