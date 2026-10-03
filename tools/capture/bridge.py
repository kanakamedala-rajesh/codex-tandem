#!/usr/bin/env python3
"""G0 turn-start feasibility bridge. No accounts, transcripts, subprocesses or network.

Requires qualified Python 3 and a pre-created private local POSIX spool. This
experiment deliberately supports only UserPromptSubmit, not full tracking.
"""
import argparse
import datetime
import json
import os
import re
import stat
import sys
import uuid


def capture(context_path, spool):
    context_fd = os.open(context_path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(context_fd, 'r', encoding='utf-8') as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
            raise ValueError()
        raw_context = source.read(4097)
        if len(raw_context) > 4096:
            raise ValueError()
        context = json.loads(raw_context)
    raw = sys.stdin.buffer.read(65537)
    if len(raw) > 65536:
        raise ValueError()
    payload = json.loads(raw.decode('utf-8'))
    if not isinstance(payload, dict) or payload.get('hook_event_name') != 'UserPromptSubmit':
        raise ValueError()
    for key in ('session_id', 'turn_id'):
        value = payload.get(key)
        if not isinstance(value, str) or not re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', value):
            raise ValueError()
    for key in ('launchId', 'targetGeneration'):
        value = context.get(key)
        if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', value):
            raise ValueError()
    event = {'schemaVersion': 1, 'eventId': str(uuid.uuid4()),
             'kind': 'turn.started', 'launchId': context['launchId'],
             'targetGeneration': context['targetGeneration'],
             'sessionId': payload['session_id'], 'turnId': payload['turn_id'],
             'capturedAt': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}
    data = json.dumps(event, separators=(',', ':')).encode('ascii')
    directory = os.open(spool, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    temporary = event['eventId'] + '.tmp'
    try:
        info = os.fstat(directory)
        if info.st_uid != os.geteuid() or info.st_mode & 0o077:
            raise ValueError()
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
        with os.fdopen(fd, 'wb') as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        os.rename(temporary, event['eventId'] + '.json', src_dir_fd=directory, dst_dir_fd=directory)
        os.fsync(directory)
    finally:
        os.close(directory)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--context', required=True)
    parser.add_argument('--spool', required=True)
    args = parser.parse_args()
    try:
        capture(args.context, args.spool)
    except Exception:
        # Fixed redacted diagnostic; no exception or raw input enters output.
        sys.stderr.write('CAPTURE_DEGRADED\n')
        return 1
    return 0

if __name__ == '__main__':
    sys.exit(main())
