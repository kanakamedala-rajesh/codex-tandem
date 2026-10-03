"""Isolate the approved file-backed authentication source for a bounded launch."""


def prepare_launch_environment(inherited, codex_home, context_path):
    environment = {
        key: value for key, value in inherited.items()
        if key not in ('OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL',
                       'CODEX_HOME', 'TANDEM_CT06_CONTEXT')
    }
    environment['CODEX_HOME'] = codex_home
    if context_path is not None:
        environment['TANDEM_CT06_CONTEXT'] = context_path
    return environment
