"""Regression coverage for reference translation and resumable migration guards."""

import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location('migration', Path(__file__).resolve().parents[1] / 'tools/migrate-github.py')
migration = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(migration)


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.mapping = {'issue:3': {'url': 'https://github.com/test/repo/issues/9'},
                        'mr:1': {'url': 'https://github.com/test/repo/issues/10'}}

    def test_references_are_type_specific(self):
        body = f'Blocked by #3. See !1 and {migration.SOURCE}/-/work_items/3.'
        actual = migration.rewrite(body, self.mapping, 'test/repo')
        self.assertIn('[#3](https://github.com/test/repo/issues/9)', actual)
        self.assertIn('[GitLab MR !1](https://github.com/test/repo/issues/10)', actual)
        self.assertIn('and https://github.com/test/repo/issues/9.', actual)

    def test_evidence_and_external_links_remain_historical(self):
        body = f'{migration.SOURCE}/-/pipelines/123 https://example.org/file#123'
        self.assertEqual(migration.rewrite(body, self.mapping, 'test/repo'), body)

    def test_missing_reference_fails(self):
        with self.assertRaises(ValueError):
            migration.rewrite('Blocked by #999', self.mapping, 'test/repo')

    def test_link_labels_and_code_are_not_nested(self):
        body = f'[GitLab #3]({migration.SOURCE}/-/issues/3) and `#3`'
        self.assertEqual(migration.rewrite(body, self.mapping, 'test/repo'),
                         '[GitLab #3](https://github.com/test/repo/issues/9) and `#3`')

    def test_duplicate_and_edited_destinations_fail(self):
        with self.assertRaises(ValueError):
            migration.identify([{'body': 'token'}, {'body': 'token'}], 'token')
        with self.assertRaises(ValueError):
            migration.check_managed('human edit', 'expected', 'previous')
        migration.check_managed('expected', 'expected', 'previous')
        migration.check_managed('previous', 'expected', 'previous')

    def test_verify_mode_refuses_mutations(self):
        api = migration.GitHub('does-not-exist', 'test/repo', False)
        with self.assertRaises(RuntimeError):
            api.write('issues', {'title': 'never created'})

    def test_removed_markers_or_deleted_checkpoint_fail_before_recreation(self):
        for kind in ('issue', 'note'):
            token = migration.marker(kind, 123)
            with self.subTest(kind=kind):
                with self.assertRaises(ValueError):
                    migration.recover([{'id': 456, 'body': 'human edit'}], token, {'id': 456})
                with self.assertRaises(ValueError):
                    migration.recover([], token, {'id': 456})
                with self.assertRaises(ValueError):
                    migration.recover([{'id': 999, 'body': token}], token, {'id': 456})
                self.assertEqual(migration.recover([{'id': 456, 'body': token}], token,
                                                  {'id': 456})['id'], 456)


if __name__ == '__main__':
    unittest.main()
