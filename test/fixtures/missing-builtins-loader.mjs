export async function resolve(specifier, context, nextResolve) {
  if (['node:sqlite', 'node:zlib'].includes(specifier)) throw new Error('synthetic private path must not leak');
  return nextResolve(specifier, context);
}
