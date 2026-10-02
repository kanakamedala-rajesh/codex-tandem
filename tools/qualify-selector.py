"""Qualify an installed CLI through real ConPTY/PTY, requiring natural exit.
Usage: python tools/qualify-selector.py NODE INSTALLED_PACKAGE --test-deps DIR
Test-only dependencies: pyte; Windows additionally requires pywinpty.
"""
import os, sys, json, time, tempfile, pathlib, subprocess, threading, queue, re, codecs
node, package = sys.argv[1:3]
for option in ('--test-deps', '--windows-deps'):
    if option in sys.argv:
        sys.path.insert(0, sys.argv[sys.argv.index(option) + 1])
import pyte
windows = os.name == 'nt'
if windows:
    from winpty import PtyProcess
else:
    import pty, termios, fcntl, struct, signal
results = []
with tempfile.TemporaryDirectory(prefix='tandem-selector-') as temp:
    root = pathlib.Path(temp)
    observe = root / 'observe.mjs'
    observe.write_text('const write=process.stderr.write.bind(process.stderr);let frame;process.stderr.write=(s,...a)=>{if(frame===undefined&&String(s).includes("Select synthetic"))frame=performance.now();return write(s,...a);};await import(process.env.TANDEM_CLI_URL);process.stderr.write(`\\nFIRST_FRAME_MS:${frame}\\nTERMINAL_RAW:${!!process.stdin.isRaw}\\n`);')
    fail = root / 'fail.mjs'
    fail.write_text("const write=process.stderr.write.bind(process.stderr);let failed=false;process.stderr.write=(s,...a)=>{if(!failed&&String(s).includes('Select synthetic')){failed=true;throw Error('test output failure');}return write(s,...a);};")

    def case(name, profiles, keys='', expected=None, expected_exit=0, resize=False,
             failure=False, child=False, interactive_input=False, direct=False, visible_id=None):
        if os.environ.get('TANDEM_CASE_ONLY') and os.environ['TANDEM_CASE_ONLY'] != name:
            return
        fixture = root / 'profiles.json'
        fixture.write_text(json.dumps({'schemaVersion': 1, 'synthetic': True, 'profiles': profiles}), encoding='utf8')
        env = os.environ.copy()
        child_args = ['--fixture-read-line', '--fixture-exit=7'] if interactive_input else ['--fixture-wait' if child else '--fixture-no-stdin']
        env['TANDEM_CLI_URL'] = (pathlib.Path(package) / ('dist/g0-child.js' if direct else 'dist/cli.js')).resolve().as_uri()
        options = [] if direct else ['--g0-fixture', str(fixture), '--target', 'local']
        if child:
            options += ['--identity', 'alpha']
        args = [node] + (['--import', fail.as_uri()] if failure else []) + [str(observe)] + options + ([] if direct else ['--']) + child_args
        started = time.perf_counter()
        output = queue.Queue()
        screen = pyte.Screen(100, 24)
        stream = pyte.Stream(screen)
        if windows:
            proc = PtyProcess.spawn(args, env=env, dimensions=(24, 100))
            def read():
                try:
                    while True:
                        chunk = proc.read(4096)
                        if not chunk:
                            break
                        output.put(chunk)
                except EOFError:
                    pass
            def write(text): proc.write(text)
            def alive(): return proc.isalive()
            def resize_terminal(rows, cols): proc.setwinsize(rows, cols)
        else:
            master, slave = pty.openpty()
            before = termios.tcgetattr(slave)
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 24, 100, 0, 0))
            def controlling_terminal():
                os.setsid()
                fcntl.ioctl(slave, termios.TIOCSCTTY, 0)
            proc = subprocess.Popen(args, stdin=slave, stdout=slave, stderr=slave, env=env, preexec_fn=controlling_terminal)
            def read():
                decoder = codecs.getincrementaldecoder('utf8')('replace')
                try:
                    while True:
                        chunk = os.read(master, 4096)
                        if not chunk:
                            break
                        output.put(decoder.decode(chunk))
                except OSError:
                    pass
            def write(text): os.write(master, text.encode())
            def alive(): return proc.poll() is None
            def resize_terminal(rows, cols):
                fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
                os.kill(proc.pid, signal.SIGWINCH)
        reader = threading.Thread(target=read, daemon=True)
        reader.start()
        transcript = ''
        selector_sent = False
        confirm_at = None
        input_sent = False
        frame = None
        selected_screen = None
        natural_exit = False
        terminal_assertion = None
        deadline = time.monotonic() + 8
        try:
            while time.monotonic() < deadline:
                try:
                    chunk = output.get(timeout=.02)
                    transcript += chunk
                    stream.feed(chunk)
                except queue.Empty:
                    pass
                if 'Select synthetic' in transcript and not selector_sent:
                    frame = (time.perf_counter() - started) * 1000
                    if resize:
                        screen.resize(lines=12, columns=40)
                        resize_terminal(12, 40)
                    if keys.endswith('\r'):
                        write(keys[:-1])
                        confirm_at = time.monotonic() + .2
                    else:
                        write(keys)
                    selector_sent = True
                if confirm_at is not None and time.monotonic() >= confirm_at:
                    selected_screen = list(screen.display)
                    if visible_id:
                        flattened = ''.join(selected_screen).replace(' ', '')
                        assert 'ID:' + visible_id in flattened, (name, 'full selected ID is not visible before confirmation', selected_screen)
                    write('\r')
                    confirm_at = None
                if 'G0 harmless child' in transcript and not input_sent and (child or interactive_input):
                    # Send only after the child starts reading, through the actual terminal.
                    time.sleep(.1)
                    write('typed α "quotes" ;& $value\r' if interactive_input else '\x03')
                    input_sent = True
                if not alive():
                    natural_exit = True
                    # Collect final terminal output after the process has naturally exited.
                    time.sleep(.05)
                    while not output.empty():
                        chunk = output.get_nowait()
                        transcript += chunk
                        stream.feed(chunk)
                    break
        except BaseException as error:
            terminal_assertion = error
        finally:
            code = proc.exitstatus if windows else proc.poll()
            restored = 'TERMINAL_RAW:false' in transcript
            if not windows:
                restored = restored and termios.tcgetattr(slave) == before
            if alive():
                # Cleanup a failed test only. Forced termination can NEVER pass.
                if windows:
                    proc.terminate(force=True)
                else:
                    os.killpg(proc.pid, signal.SIGKILL)
                    proc.wait(timeout=2)
            if not windows:
                os.close(slave)
                os.close(master)
                reader.join(timeout=1)
        if terminal_assertion:
            raise terminal_assertion
        assert natural_exit, (name, 'process did not exit naturally; forced cleanup is a failure', transcript)
        assert code == expected_exit, (name, 'unexpected natural exit', code, expected_exit, transcript)
        assert restored, (name, 'terminal not restored', transcript)
        if expected:
            assert expected in transcript, (name, expected, transcript)
        if name in ('cancel', 'ctrl-c', 'exception'):
            assert 'G0 harmless child' not in transcript
        input_value = None
        if interactive_input:
            input_match = re.search(r'INPUT:(\{[^\r\n]+\})', transcript)
            assert input_match, (name, 'child did not receive interactive stdin', transcript)
            input_value = json.loads(input_match.group(1))
            assert input_value == {'line': 'typed α "quotes" ;& $value'}, (name, input_value)
        match = re.search(r'FIRST_FRAME_MS:([0-9.]+)', transcript)
        results.append({'case': name, 'firstFrameMs': round(float(match.group(1)), 2) if match else None,
                        'harnessWallMs': round(frame, 2) if frame else None, 'restored': restored,
                        'naturalExit': natural_exit, 'exit': code, 'interactiveInput': input_value,
                        'screenBeforeConfirmation': selected_screen, 'transcript': transcript})

    profiles = [{'id': 'alpha', 'label': '日本語'}, {'id': 'beta', 'label': '同じ'}, {'id': 'gamma', 'label': '同じ'}]
    case('zero', [], expected='NO_PROFILES', expected_exit=2)
    case('one', profiles[:1], '\r', expected='Selected synthetic profile [alpha]')
    case('two', profiles[:2], '\x1b[B\r', expected='Selected synthetic profile [beta]')
    case('many-unicode-duplicate', profiles, '\x1b[B\x1b[B\x1b[A\r', expected='Selected synthetic profile [beta]', resize=True)
    case('long-duplicate-labels', [{'id': 'alpha', 'label': '同じ' * 60}, {'id': 'beta', 'label': '同じ' * 60}], '\x1b[B\r', expected='Selected synthetic profile [beta]', resize=True)
    long_a = 'shared_prefix_' + 'x' * 60 + '_alpha'
    long_b = 'shared_prefix_' + 'x' * 60 + '_beta'
    case('common-prefix-IDs-narrow', [{'id': long_a, 'label': '同じ'}, {'id': long_b, 'label': '同じ'}], '\x1b[B\r', expected='Selected synthetic profile [' + long_b + ']', resize=True, visible_id=long_b)
    case('cancel', profiles, '\x1b', expected='TERMINAL_RAW:false', expected_exit=130)
    case('ctrl-c', profiles, '\x03', expected='TERMINAL_RAW:false', expected_exit=130)
    case('exception', profiles, failure=True, expected='SELECTOR_FAILED', expected_exit=2)
    case('child-ctrl-c', profiles, expected='TERMINAL_RAW:false', expected_exit=130, child=True)
    case('direct-interactive-input', profiles, expected_exit=7, interactive_input=True, direct=True)
    for n in range(3):
        case('wrapped-interactive-input-' + str(n), profiles, '\x1b[B\r', expected_exit=7, interactive_input=True)
    for n in range(20):
        case('timing-' + str(n), profiles, '\x1b', expected='TERMINAL_RAW:false', expected_exit=130)
    times = sorted(r['firstFrameMs'] for r in results if r['case'].startswith('timing'))
    print(json.dumps({'platform': sys.platform, 'node': subprocess.check_output([node, '--version'], text=True).strip(),
                      'harness': 'ConPTY/pywinpty + pyte' if windows else 'POSIX PTY/termios + pyte',
                      'p95FirstFrameMs': times[18] if len(times) >= 20 else None, 'results': results}, ensure_ascii=True, indent=2))
