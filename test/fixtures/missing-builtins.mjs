// System boundary fixture: emulate a host without optional built-ins.
import { register } from 'node:module';
register('./missing-builtins-loader.mjs', import.meta.url);
