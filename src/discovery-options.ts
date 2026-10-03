import type { DiscoveryOptions } from './discovery.js';
/**
 * Parse doctor flag/value pairs, ignoring --json. Infer docker when a container
 * is supplied, otherwise local; return undefined when no discovery flags exist.
 * Throws INVALID_ARGUMENTS for unknown, duplicate, missing or incompatible flags.
 * Does not persist target registration.
 */
export function parseDiscoveryOptions(
  args: string[],
): DiscoveryOptions | undefined {
  const options: Partial<DiscoveryOptions> = {};
  const names: Record<string, keyof DiscoveryOptions> = {
    '--target': 'target',
    '--container': 'container',
    '--docker-context': 'dockerContext',
    '--expected-generation': 'expectedGeneration',
    '--user': 'user',
    '--project-root': 'projectRoot',
    '--project': 'project',
    '--codex-home': 'codexHome',
    '--codex-executable': 'codexExecutable',
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') continue;
    const key = names[args[i]],
      value = args[++i];
    if (
      !key ||
      !value ||
      value.startsWith('--') ||
      // eslint-disable-next-line no-control-regex -- Reject control characters in untrusted input.
      /[\x00-\x1f]/.test(value) ||
      key in options
    )
      throw new Error('INVALID_ARGUMENTS');
    Object.assign(options, { [key]: value });
  }
  if (Object.keys(options).length === 0) return undefined;
  if (!options.target) options.target = options.container ? 'docker' : 'local';
  if (options.target !== 'local' && options.target !== 'docker')
    throw new Error('INVALID_ARGUMENTS');
  if (
    options.target === 'local' &&
    (options.container ||
      options.dockerContext ||
      options.expectedGeneration ||
      options.user)
  )
    throw new Error('INVALID_ARGUMENTS');
  return options as DiscoveryOptions;
}
