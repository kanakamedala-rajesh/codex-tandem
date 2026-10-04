"""Exercise profile management through a real POSIX terminal and public CLI."""
import base64
import json
import os
import pathlib
import select
import shutil
import subprocess
import tempfile
import time
import unittest

if os.name == 'posix':
    import fcntl
    import pty
    import struct
    import termios


@unittest.skipUnless(os.name == 'posix', 'native Windows terminal checks run separately')
class ProfileManagementTerminal(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='ct09-management-')
        self.root = pathlib.Path(self.tmp.name)
        self.state = self.root / 'state'
        self.source = self.root / 'auth.json'
        package = pathlib.Path(os.environ.get('TANDEM_TEST_PACKAGE', pathlib.Path(__file__).resolve().parents[1]))
        self.cli = package / 'dist/cli.js'
        self.node = shutil.which('node')
        self.assertIsNotNone(self.node, 'host Node is required')
        claims = {'https://api.openai.com/auth': {'chatgpt_account_id': 'account-A', 'chatgpt_user_id': 'user-A'}}
        payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip('=')
        self.credential = {'tokens': {'account_id': 'account-A', 'id_token': f'e30.{payload}.synthetic', 'access_token': 'SYNTHETIC-SECRET', 'refresh_token': 'SYNTHETIC-SECRET'}}
        self.source.write_text(json.dumps(self.credential))
        self.alpha = self.command('add', '--label', 'Alpha', '--import', str(self.source))['profile']
        self.beta = self.command('add', '--label', 'Beta', '--import', str(self.source))['profile']
        self.master, self.slave = pty.openpty()
        fcntl.ioctl(self.slave, termios.TIOCSWINSZ, struct.pack('HHHH', 30, 100, 0, 0))
        self.original_mode = termios.tcgetattr(self.slave)
        self.pending = b''
        self.transcript = b''
        self.process = subprocess.Popen([self.node, str(self.cli), 'profiles', 'manage', '--state-home', str(self.state)], stdin=self.slave, stdout=self.slave, stderr=self.slave)
        self.until(b'Action: ')

    def tearDown(self):
        process = getattr(self, 'process', None)
        if process is not None and process.poll() is None:
            process.kill()
            process.wait(timeout=5)
        for name in ('master', 'slave'):
            fd = getattr(self, name, None)
            if fd is not None:
                os.close(fd)
        self.tmp.cleanup()

    def command(self, *args):
        result = subprocess.run([self.node, str(self.cli), 'profiles', *args, '--state-home', str(self.state), '--json'], capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertNotIn(b'SYNTHETIC-SECRET', result.stdout + result.stderr)
        return json.loads(result.stdout)

    def send(self, value):
        os.write(self.master, value)

    def until(self, marker):
        deadline = time.monotonic() + 10
        while marker not in self.pending:
            remaining = deadline - time.monotonic()
            self.assertGreater(remaining, 0, f'terminal never reached {marker!r}: {self.pending[-1000:]!r}')
            readable, _, _ = select.select([self.master], [], [], remaining)
            self.assertTrue(readable, f'terminal never reached {marker!r}: {self.pending[-1000:]!r}')
            chunk = os.read(self.master, 65536)
            self.assertTrue(chunk, 'terminal closed before expected prompt')
            self.pending += chunk
            self.transcript += chunk
            self.assertLess(len(self.transcript), 200000)
        end = self.pending.index(marker) + len(marker)
        result, self.pending = self.pending[:end], self.pending[end:]
        return result

    def choose_beta(self, action):
        self.send(action.encode() + b'\r')
        self.until(b'Arrows/Enter; Esc cancels')
        self.send(b'\x1b[B')
        self.until(self.beta['id'].encode())
        self.send(b'\r')
        self.until(b'\x1b[?1049l')

    def finish(self):
        self.send(b'quit\r')
        self.assertEqual(self.process.wait(timeout=5), 0)
        self.assertEqual(termios.tcgetattr(self.slave), self.original_mode)
        self.assertNotIn(b'SYNTHETIC-SECRET', self.transcript)

    def test_cancel_each_identity_selection_preserves_credentials_binding_and_terminal(self):
        paths = [self.state / 'profiles.json', *sorted((self.state / 'credentials').glob('*.json'))]
        original = {path: path.read_bytes() for path in paths}
        for action in ('show', 'rename', 'login', 'remove'):
            with self.subTest(action=action):
                self.send(action.encode() + b'\r')
                self.until(b'Arrows/Enter; Esc cancels')
                self.send(b'\x1b')
                output = self.until(b'Action: ')
                self.assertIn(b'\x1b[?25h\x1b[?1049l', output)
                self.assertEqual({path: path.read_bytes() for path in paths}, original)
        self.finish()

    def test_arrows_choose_the_same_profile_for_show_rename_login_and_remove(self):
        self.choose_beta('show')
        output = self.until(b'Action: ')
        self.assertIn(f"{self.beta['id']} Beta [available]".encode(), output)
        self.choose_beta('rename')
        self.until(b'Display label (empty cancels): ')
        self.send(b'Beta renamed\r')
        self.until(b'Action: ')
        self.assertEqual(self.command('show', '--identity', self.beta['id'])['profile']['label'], 'Beta renamed')
        self.assertEqual(self.command('show', '--identity', self.alpha['id'])['profile'], self.alpha)
        self.credential['tokens']['access_token'] = 'SYNTHETIC-REFRESH'
        self.source.write_text(json.dumps(self.credential))
        self.choose_beta('login')
        self.until(b'Enter for same-account only: ')
        self.send(b'\r')
        self.until(b'initiate existing Codex login: ')
        self.send(str(self.source).encode() + b'\r')
        self.until(b'Action: ')
        renewed = self.command('show', '--identity', self.beta['id'])['profile']
        self.assertEqual(renewed['bindingId'], self.beta['bindingId'])
        saved = self.state / 'credentials' / f"{self.beta['bindingId']}.json"
        self.assertEqual(saved.read_bytes(), self.source.read_bytes())
        self.choose_beta('remove')
        self.until(b'stable profile ID to confirm: ')
        self.send(self.beta['id'].encode() + b'\r')
        self.until(b'Action: ')
        self.assertEqual(self.command('show', '--identity', self.beta['id'])['profile']['status'], 'deleted')
        self.assertFalse(saved.exists())
        self.assertEqual(self.command('show', '--identity', self.alpha['id'])['profile'], self.alpha)
        self.finish()
