# Existing target Python 3.5+ standard library. Invoked inline; never installed.
import sys
prefix = getattr(sys, 'base_prefix', sys.prefix).rstrip('/')
version = '%d.%d' % sys.version_info[:2]
stdlib = [prefix + '/lib/python' + version, prefix + '/lib64/python' + version]
sys.path[:] = [p.rstrip('/') for p in sys.path if p.startswith('/') and p.rstrip('/') in stdlib + [s + '/lib-dynload' for s in stdlib] + [prefix + '/lib/python%d%d.zip' % sys.version_info[:2]]]
import os, json, stat, errno, base64, uuid, time, signal, subprocess, ctypes, select, re, datetime, calendar, contextlib, unicodedata, hashlib

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

def resume_path(value):
    return isinstance(value, str) and 0 < len(value) <= 4096 and value.startswith('/') and os.path.normpath(value) == value and not any(unicodedata.category(c) in ['Cc', 'Cf'] for c in value)

def resume_witness(path, identity_only=False, data=False):
    if not resume_path(path):
        fail('RESUME_SOURCE_UNSAFE')
    try:
        before = os.lstat(path)
        physical, info = os.path.realpath(path), os.stat(path)
    except OSError as error:
        if error.errno == errno.ENOENT:
            # A dangling link is not an absent native source.
            if os.path.lexists(path):
                fail('RESUME_SOURCE_UNSAFE')
            return {'path': path, 'kind': 'missing'}
        fail('RESUME_SOURCE_UNAVAILABLE')
    if not stat.S_ISDIR(info.st_mode) and not stat.S_ISREG(info.st_mode):
        fail('RESUME_SOURCE_UNSAFE')
    if data and (not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or physical != path or (before.st_dev, before.st_ino) != (info.st_dev, info.st_ino)):
        fail('RESUME_SOURCE_UNSAFE')
    value = {'path': path, 'physical': physical, 'kind': 'directory' if stat.S_ISDIR(info.st_mode) else 'file', 'device': str(info.st_dev), 'inode': str(info.st_ino), 'mode': str(info.st_mode)}
    if stat.S_ISREG(info.st_mode):
        value['links'] = str(info.st_nlink)
        modified, changed = getattr(info, 'st_mtime_ns', None), getattr(info, 'st_ctime_ns', None)
        if (data or not identity_only) and (type(modified) is not int or type(changed) is not int):
            fail('RESUME_WITNESS_PRECISION_UNSUPPORTED')
        if identity_only:
            value['identityOnly'] = True
        else:
            # Never round float timestamps into an apparently exact generation.
            value.update({'size': str(info.st_size), 'modified': str(modified), 'changed': str(changed)})
    return value

def resume_database(sqlite_home):
    result = [resume_witness(os.path.join(sqlite_home, 'state_5.sqlite' + suffix), suffix == '-shm', True) for suffix in ['', '-wal', '-shm', '-journal']]
    if result[0]['kind'] != 'file':
        fail('RESUME_INDEX_UNAVAILABLE')
    return result

def resume_database_unchanged(previous, sqlite_home):
    current = resume_database(sqlite_home)
    def empty_wal(entry):
        return entry['kind'] == 'missing' or (entry['kind'] == 'file' and entry.get('size') == '0')
    # Fresh safety/precision checks above apply even to disposable coordination
    # caches. Only absent/exactly empty WAL files are equivalent; data stays strict.
    return all(index == 2 or (index == 1 and empty_wal(before) and empty_wal(current[index])) or before == current[index] for index, before in enumerate(previous))

def resume_ancestors(paths):
    parents = set()
    for path in paths:
        parent = os.path.dirname(path)
        for depth in range(64):
            parents.add(parent)
            if len(parents) > 256:
                fail('RESUME_METADATA_LIMIT')
            if parent == '/':
                break
            parent = os.path.dirname(parent)
        else:
            fail('RESUME_METADATA_LIMIT')
    return [resume_witness(path) for path in sorted(parents)]

def resume_policy(config, layers, home, project, wrapper):
    configured = config.get('sqlite_home')
    if configured is not None and not resume_path(configured):
        fail('RESUME_CONFIG_UNSUPPORTED')
    # A wrapper's private environment cannot be inferred from the controller.
    if wrapper and configured is None:
        fail('RESUME_CONFIG_UNSUPPORTED')
    sqlite_home = os.path.realpath(configured or os.environ.get('CODEX_SQLITE_HOME', '').strip() or home)
    if not os.path.isdir(sqlite_home):
        fail('RESUME_INDEX_UNAVAILABLE')
    features = config.get('features')
    if features is None:
        features = {}
    if not isinstance(features, dict) or len(features) > 256 or any(not isinstance(k, str) or not re.match(r'^[a-z][a-z0-9_]{0,63}$', k) or type(v) is not bool for k, v in features.items()):
        fail('RESUME_CONFIG_UNSUPPORTED')
    files = set([os.path.join(home, 'config.toml')])
    for layer in layers:
        source = layer.get('name') if isinstance(layer, dict) else None
        if not isinstance(source, dict):
            fail('RESUME_CONFIG_UNSUPPORTED')
        kind = source.get('type')
        if kind == 'sessionFlags':
            continue
        path = os.path.join(source['dotCodexFolder'], 'config.toml') if kind == 'project' and isinstance(source.get('dotCodexFolder'), str) else source.get('file') if kind in ['system', 'user', 'packagedDefaults', 'legacyManagedConfigTomlFromFile'] else None
        if not resume_path(path):
            fail('RESUME_CONFIG_UNSUPPORTED')
        files.add(path)
    if len(files) > 128:
        fail('RESUME_CONFIG_UNSUPPORTED')
    return {'sqliteHome': sqlite_home, 'features': features, 'files': sorted(files)}

def resume_configuration_paths(context, project):
    # Missing applicable inputs must stay absent through the final spawn fence;
    # the native policy response only lists project/managed layers that exist.
    files = set(context['files'])
    files.update(['/etc/codex/requirements.toml', '/etc/codex/managed_config.toml'])
    current = project
    for depth in range(64):
        files.add(os.path.join(current, '.codex', 'config.toml'))
        files.add(os.path.join(current, '.git'))
        if current == '/':
            break
        current = os.path.dirname(current)
    else:
        fail('RESUME_METADATA_LIMIT')
    if len(files) > 256:
        fail('RESUME_METADATA_LIMIT')
    return sorted(files)

def resume_revalidate(value, home, project, executable, wrapper, context=None, check_current=True):
    keys = ['schemaVersion', 'nativeVersion', 'id', 'preparedAt', 'home', 'project', 'cwd', 'nativeCwd', 'source', 'command', 'policy', 'configuration', 'database', 'ancestors']
    try:
        if not isinstance(value, dict) or set(value) != set(keys) or (type(value['schemaVersion']) is not int or value['schemaVersion'] != 1) or value['nativeVersion'] != '0.163.0' or not isinstance(value['id'], str) or not uuid_pattern.match(value['id']) or not isinstance(value['preparedAt'], str) or not re.match(r'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$', value['preparedAt']):
            fail('RESUME_PREPARATION_INVALID')
        policy_context = value['policy']
        if not isinstance(policy_context, dict) or set(policy_context) != set(['sqliteHome', 'features', 'files']) or not resume_path(policy_context['sqliteHome']) or not isinstance(policy_context['features'], dict) or len(policy_context['features']) > 256 or any(not isinstance(k, str) or not re.match(r'^[a-z][a-z0-9_]{0,63}$', k) or type(v) is not bool for k, v in policy_context['features'].items()) or not isinstance(policy_context['files'], list) or len(policy_context['files']) > 128 or policy_context['files'] != sorted(set(policy_context['files'])) or not all(resume_path(path) for path in policy_context['files']):
            fail('RESUME_PREPARATION_INVALID')
        if value['home']['path'] != home or value['project']['path'] != project or value['cwd']['physical'] != project or value['nativeCwd']['physical'] != project:
            fail('RESUME_PROJECT_MISMATCH')
        source = value['source']['path']
        if not resume_path(source) or not any(source.startswith(os.path.join(home, name) + '/') for name in ['sessions', 'archived_sessions']):
            fail('RESUME_SOURCE_UNSAFE')
        expected_command = [executable] + ([wrapper] if wrapper else [])
        if [entry['path'] for entry in value['command']] != expected_command or [entry['path'] for entry in value['configuration']] != resume_configuration_paths(policy_context, project) or [entry['path'] for entry in value['database']] != [os.path.join(policy_context['sqliteHome'], 'state_5.sqlite' + suffix) for suffix in ['', '-wal', '-shm', '-journal']]:
            fail('RESUME_PREPARATION_INVALID')
        if not check_current:
            return
        entries = [value[k] for k in ['home', 'project', 'cwd', 'nativeCwd']] + value['command'] + value['configuration']
        if any(resume_witness(entry['path']) != entry for entry in entries) or resume_witness(source, data=True) != value['source'] or not resume_database_unchanged(value['database'], policy_context['sqliteHome']):
            fail('RESUME_PREPARATION_STALE')
        expected_ancestors = resume_ancestors([entry['path'] for entry in entries] + [source] + [entry['path'] for entry in value['database']])
        if expected_ancestors != value['ancestors'] or (context is not None and context != policy_context):
            fail('RESUME_PREPARATION_STALE')
    except Refused:
        raise
    except Exception:
        fail('RESUME_PREPARATION_INVALID')

def resume_record_path(home, project, selection):
    directory = os.path.join(home, '.tandem-activation', 'resume')
    if selection != 'last':
        return os.path.join(directory, selection + '.json')
    current = resume_witness(project)
    key = '\0'.join([current['physical'], current['device'], current['inode']]).encode('utf8')
    return os.path.join(directory, 'last-' + hashlib.sha256(key).hexdigest() + '.json')

def resume_store(home, project, executable, wrapper, value, selection):
    resume_revalidate(value, home, project, executable, wrapper)
    if selection != 'last' and selection != value['id']:
        fail('RESUME_ID_INVALID')
    directory = os.path.join(home, '.tandem-activation', 'resume')
    folder(directory)
    path = resume_record_path(home, project, value['id'])
    previous = record(path, True)
    if previous is not None:
        try:
            commands = previous['command']
            resume_revalidate(previous, home, project, commands[0]['path'], commands[1]['path'] if len(commands) == 2 else None, check_current=False)
            if any(previous['project'][key] != value['project'][key] for key in ['path', 'physical', 'device', 'inode']):
                fail('RESUME_PROJECT_MISMATCH')
        except Refused:
            raise
        except Exception:
            fail('RESUME_PREPARATION_INVALID')
    put(path, value)
    # Only a native latest-selection proof may replace project-last. Preparing
    # an older explicit UUID does not prove that UUID is the latest conversation.
    if selection == 'last':
        put(resume_record_path(home, project, 'last'), value)

def resume_session(home, project, executable, wrapper, selection):
    if selection != 'last' and (not isinstance(selection, str) or not uuid_pattern.match(selection)):
        fail('RESUME_ID_INVALID')
    try:
        value = record(resume_record_path(home, project, selection), True)
    except Exception:
        fail('RESUME_PREPARATION_INVALID')
    if value is None:
        fail('RESUME_PREPARATION_REQUIRED')
    resume_revalidate(value, home, project, executable, wrapper)
    if selection != 'last' and selection != value['id']:
        fail('RESUME_PREPARATION_REQUIRED')
    return value

def resume_indexed_metadata(home, project, row, budget):
    if not isinstance(row, dict) or not isinstance(row.get('id'), str) or not uuid_pattern.match(row['id']) or not resume_path(row.get('cwd')):
        fail('RESUME_METADATA_INVALID')
    if os.path.realpath(row['cwd']) != project:
        return None
    source = row.get('path')
    if not resume_path(source) or not any(source.startswith(os.path.join(home, name) + '/') for name in ['sessions', 'archived_sessions']):
        fail('RESUME_SOURCE_UNSAFE')
    before = resume_witness(source, data=True)
    if before['kind'] != 'file':
        fail('RESUME_SOURCE_UNAVAILABLE')
    fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW)
    first, complete = b'', False
    try:
        opened = os.fstat(fd)
        if str(opened.st_dev) != before['device'] or str(opened.st_ino) != before['inode']:
            fail('RESUME_SOURCE_CHANGED')
        while len(first) < 65536:
            chunk = os.read(fd, min(1024, 65536 - len(first)))
            budget[0] += len(chunk)
            if budget[0] > 16777216:
                fail('RESUME_METADATA_LIMIT')
            if not chunk:
                break
            if b'\n' in chunk:
                first += chunk.split(b'\n', 1)[0]
                complete = True
                break
            first += chunk
    finally:
        os.close(fd)
    if not complete or len(first) >= 65536:
        fail('RESUME_METADATA_INCOMPLETE')
    try:
        value = json.loads(first.decode('utf8'))
        meta = value.get('payload')
        if value.get('type') != 'session_meta' or not isinstance(meta, dict) or meta.get('id') != row['id'] or not resume_path(meta.get('cwd')) or os.path.realpath(meta['cwd']) != project or not isinstance(meta.get('timestamp'), str):
            fail('RESUME_METADATA_CONFLICT')
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
    if resume_witness(source, data=True) != before:
        fail('RESUME_SOURCE_CHANGED')
    return {'id': row['id'], 'timestamp': stamp, 'source': before, 'cwd': resume_witness(meta['cwd']), 'nativeCwd': resume_witness(row['cwd'])}

def policy(project, executable, arguments, wrapper, resume_selection=None, include_resume=False, home=None):
    if not isinstance(arguments, list) or len(arguments) % 2 or any(arguments[i] not in ['-c', '--config', '--enable', '--disable'] for i in range(0, len(arguments), 2)):
        fail('REMOTE_POLICY_ARGUMENTS_INVALID')
    if wrapper and (os.path.realpath(wrapper) != wrapper or not os.path.isfile(wrapper) or not os.access(wrapper, os.X_OK)):
        fail('REMOTE_ENVIRONMENT_WRAPPER_CHANGED')
    child = subprocess.Popen(([wrapper, executable] if wrapper else [executable]) + ['app-server'] + arguments, cwd=project, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    initial = identity(child.pid)
    def send(value):
        child.stdin.write((json.dumps(value) + '\n').encode('utf8'))
        child.stdin.flush()
    preparing = resume_selection is not None
    if preparing and resume_selection != 'last' and (not isinstance(resume_selection, str) or not uuid_pattern.match(resume_selection)):
        fail('RESUME_ID_INVALID')
    config, layers, requirements = None, None, None
    result, buffer, size = None, b'', 0
    prepared, selected, budget, seen, archived, cursor, request_id, rows_seen = None, {}, [0], set(), False, None, 3, 0
    def list_page():
        send({'id': request_id, 'method': 'thread/list', 'params': {'limit': 8, 'cursor': cursor, 'sortKey': 'created_at', 'sortDirection': 'desc', 'modelProviders': [], 'sourceKinds': ['cli', 'vscode', 'exec', 'appServer', 'subAgent', 'subAgentReview', 'subAgentCompact', 'subAgentThreadSpawn', 'subAgentOther', 'unknown'], 'archived': archived, 'useStateDbOnly': True}})
    limit = 16777216 if preparing else 1048576
    def wait_for_exit(seconds):
        nonlocal size
        until = min(time.monotonic() + seconds, deadline)
        streams = [child.stdout, child.stderr]
        while True:
            exited = child.poll() is not None
            remaining = until - time.monotonic()
            if not exited and remaining <= 0:
                return False
            readers, _, _ = select.select(streams, [], [], 0 if exited else min(0.02, remaining))
            if exited and not readers:
                return True
            for reader in readers:
                chunk = os.read(reader.fileno(), 65536)
                if chunk:
                    size += len(chunk)
                else:
                    streams.remove(reader)
            if exited and size > limit:
                return True
    # RPC and shutdown share the host request budget; reserve time for the
    # final ownership/revalidation checks and response instead of restarting it.
    deadline = time.monotonic() + (60 if preparing else 15) - 0.5
    try:
        send({'id': 0, 'method': 'initialize', 'params': {'clientInfo': {'name': 'codex-tandem', 'version': '0.1.0'}, 'capabilities': {'experimentalApi': True}}})
        while result is None:
            if time.monotonic() >= deadline:
                fail('REMOTE_POLICY_INSPECTION_FAILED')
            readers, _, _ = select.select([child.stdout, child.stderr], [], [], min(0.1, deadline - time.monotonic()))
            for reader in readers:
                chunk = os.read(reader.fileno(), 65536)
                size += len(chunk)
                if not chunk or size > limit:
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
                        if preparing:
                            agent = message.get('result', {}).get('userAgent')
                            # The pinned 0.163 implementation awaits complete backfill
                            # before serving and defines the no-fallback DB-only flag.
                            if not isinstance(agent, str) or len(agent) > 4096 or not re.search(r'(?:^|[ /])0\.163\.0(?:[ (]|$)', agent):
                                fail('RESUME_INDEX_UNSUPPORTED')
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
                        if preparing or include_resume:
                            result['resume'] = resume_policy(config, layers, home, project, wrapper)
                        if preparing:
                            context = result['resume']
                            prepared = {'schemaVersion': 1, 'nativeVersion': '0.163.0', 'id': None, 'preparedAt': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'home': resume_witness(home), 'project': resume_witness(project), 'command': [resume_witness(path) for path in [executable] + ([wrapper] if wrapper else [])], 'policy': context, 'configuration': [resume_witness(path) for path in resume_configuration_paths(context, project)], 'database': resume_database(context['sqliteHome'])}
                            result = None
                            list_page()
                    elif preparing and message.get('id') == request_id:
                        payload = message.get('result')
                        if not isinstance(payload, dict) or not isinstance(payload.get('data'), list) or len(payload['data']) > 8 or 'nextCursor' not in payload:
                            fail('RESUME_METADATA_INVALID')
                        for row in payload['data']:
                            rows_seen += 1
                            if rows_seen > 10000:
                                fail('RESUME_METADATA_LIMIT')
                            if resume_selection != 'last' and isinstance(row, dict) and row.get('id') != resume_selection:
                                continue
                            if resume_selection != 'last' and isinstance(row, dict) and resume_path(row.get('cwd')) and os.path.realpath(row['cwd']) != project:
                                fail('RESUME_PROJECT_MISMATCH')
                            entry = resume_indexed_metadata(home, project, row, budget)
                            if entry is not None:
                                previous = selected.get(entry['id'])
                                if previous is not None and previous != entry:
                                    fail('RESUME_METADATA_CONFLICT')
                                selected[entry['id']] = entry
                        next_cursor = payload['nextCursor']
                        if next_cursor is not None:
                            if not isinstance(next_cursor, str) or len(next_cursor) > 4096 or (archived, next_cursor) in seen:
                                fail('RESUME_METADATA_INVALID')
                            seen.add((archived, next_cursor))
                            cursor = next_cursor
                        elif not archived:
                            archived, cursor = True, None
                        else:
                            choices = sorted(selected.values(), key=lambda entry: entry['timestamp'], reverse=True)
                            if not choices:
                                fail('RESUME_UNAVAILABLE')
                            if resume_selection == 'last' and len(choices) > 1 and choices[0]['timestamp'] == choices[1]['timestamp']:
                                fail('RESUME_LAST_AMBIGUOUS')
                            chosen = choices[0]
                            prepared.update({key: chosen[key] for key in ['id', 'source', 'cwd', 'nativeCwd']})
                            entries = [prepared[k] for k in ['home', 'project', 'cwd', 'nativeCwd', 'source']] + prepared['command'] + prepared['configuration'] + prepared['database']
                            prepared['ancestors'] = resume_ancestors([entry['path'] for entry in entries])
                            result = prepared
                            continue
                        request_id += 1
                        list_page()
    finally:
        # Prepare fences include helper shutdown. EOF can trigger a checkpoint,
        # so use the same owned SIGTERM lifecycle as a bounded policy helper.
        if (preparing or include_resume) and child.poll() is None:
            fresh = identity(child.pid)
            if fresh is None or initial is None or fresh['creation'] != initial['creation']:
                fail('REMOTE_POLICY_PROCESS_CHANGED')
            child.terminate()
        child.stdin.close()
        try:
            # Drain both pipes while awaiting exit: shutdown output can otherwise
            # fill a pipe and prevent an owned helper from finishing. Discard it,
            # but retain the cumulative output limit. Native Codex can need five
            # seconds to finish shutdown; all waits share the operation deadline.
            if not wait_for_exit(6):
                fresh = identity(child.pid)
                if fresh is None or initial is None or fresh['creation'] != initial['creation']:
                    fail('REMOTE_POLICY_PROCESS_CHANGED')
                child.terminate()
                if not wait_for_exit(1.5):
                    fail('REMOTE_POLICY_PROCESS_RETAINED')
        finally:
            child.stdout.close()
            child.stderr.close()
    if size > limit:
        fail('REMOTE_POLICY_INSPECTION_FAILED')
    if preparing:
        if child.returncode not in [0, -signal.SIGTERM]:
            fail('RESUME_METADATA_PROCESS_FAILED')
        resume_revalidate(result, home, project, executable, wrapper)
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
        invocation, wrapper, resume_proof = [], None, None
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
                    result = policy(project, executable, value.get('arguments'), value.get('wrapper'), include_resume=resume_proof is not None, home=home)
                    idle()
                    if resume_proof is not None:
                        resume_revalidate(resume_proof, home, project, executable, wrapper, result.pop('resume'))
                elif action == 'inventory':
                    result = inventory(home, executable, journal)
                elif action == 'resume':
                    idle()
                    resume_proof = resume_session(home, project, executable, wrapper, value.get('selection'))
                    result = resume_proof['id']
                elif action == 'resume-prepare':
                    idle()
                    if not invocation:
                        fail('REMOTE_INVOCATION_UNPROVEN')
                    selection = value.get('selection')
                    if selection != 'last' and (not isinstance(selection, str) or not uuid_pattern.match(selection)):
                        fail('RESUME_ID_INVALID')
                    prepared_resume = policy(project, executable, value.get('arguments'), wrapper, resume_selection=selection, home=home)
                    idle()
                    resume_store(home, project, executable, wrapper, prepared_resume, selection)
                    result = prepared_resume['id']
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
                    if resume_proof is not None:
                        resume_revalidate(resume_proof, home, project, executable, wrapper)
                        launch['resumeProof'] = resume_proof
                    elif 'resumeProof' in launch:
                        fail('RESUME_PREPARATION_INVALID')
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
    try:
        if 'resumeProof' in prepared:
            resume_revalidate(prepared['resumeProof'], home, project, executable, wrapper)
    except Exception:
        # No child was started. Publish this supervisor's refusal so a known
        # pre-execution failure cannot masquerade as an unobserved survivor.
        process_record['state'], process_record['exitCode'] = 'exited', 2
        put(process_file, process_record)
        raise
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
