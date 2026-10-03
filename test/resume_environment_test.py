"""Public launch-environment contract; synthetic values only, no Codex process."""
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'tools' / 'capture'))
from experiment_environment import prepare_launch_environment


class ResumeEnvironmentTest(unittest.TestCase):
    def test_only_controlled_file_auth_and_launch_context_reach_child(self):
        inherited = {
            'PATH': '/existing/bin',
            'OPENAI_API_KEY': 'SYNTHETIC_API_KEY',
            'CODEX_API_KEY': 'SYNTHETIC_CODEX_KEY',
            'OPENAI_BASE_URL': 'https://invalid.example',
            'CODEX_HOME': '/unapproved/home',
            'TANDEM_CT06_CONTEXT': '/unapproved/context',
        }
        for context in ('/private/context-A.json', '/private/context-B.json', None):
            environment = prepare_launch_environment(inherited, '/private/codex-home', context)
            expected = {'PATH': '/existing/bin', 'CODEX_HOME': '/private/codex-home'}
            if context is not None:
                expected['TANDEM_CT06_CONTEXT'] = context
            self.assertEqual(environment, expected)
        self.assertEqual(inherited['OPENAI_API_KEY'], 'SYNTHETIC_API_KEY')
        self.assertEqual(inherited['TANDEM_CT06_CONTEXT'], '/unapproved/context')


if __name__ == '__main__':
    unittest.main()
