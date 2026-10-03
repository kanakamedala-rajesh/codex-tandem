"""Representative standard-library build/test for the approved modern target."""
import json
import os
import pathlib
import py_compile
from calculator import summarize

project = pathlib.Path.cwd()
values = json.loads((project / 'input.json').read_text())['values']
result = summarize(values)
assert result == {'count': 4, 'sum': 17, 'sumSquares': 87}
assert summarize([]) == {'count': 0, 'sum': 0, 'sumSquares': 0}
build = project / 'build'
build.mkdir(exist_ok=True)
py_compile.compile(str(project / 'calculator.py'), cfile=str(build / 'calculator.pyc'), doraise=True)
(build / 'result.json').write_text(json.dumps(result, sort_keys=True, separators=(',', ':')) + '\n')
(build / 'environment.json').write_text(json.dumps({'uid': os.getuid(), 'home': os.environ.get('HOME'), 'codexHome': os.environ.get('CODEX_HOME'), 'cwd': str(project)}, sort_keys=True) + '\n')
print('BUILD_OK')
