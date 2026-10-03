import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import ts from 'typescript';

const policy = 'scripts/check-repo.mjs';
const git = (...args) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const lines = (text) => text.trim().split('\n').filter(Boolean);
const commit = (ref) => {
  if (!ref || ref.startsWith('-'))
    throw new Error(`Invalid commit reference: ${ref}`);
  return git('rev-parse', '--verify', `${ref}^{commit}`).trim();
};
const forbidden =
  /(^|\/)(node_modules|__pycache__)(\/|$)|^(dist|\.worktrees|\.npm-cache|\.runtime|\.scratch|\.cache|coverage|tmp|temp|logs|backups|ci-evidence)(\/|$)|\.(log|bak|tmp|swp)$|~$|^docs\/(evidence|migration|qualification|validation)(\/|$)/i;
const transient = (path) =>
  forbidden.test(path) ||
  (/\.(tgz|zip|tar|gz|zst)$/i.test(path) && !path.startsWith('test/fixtures/'));
const treePaths = (sha) =>
  git('ls-tree', '-r', '--name-only', '-z', sha).split('\0').filter(Boolean);
const textPath = (path) =>
  path.endsWith('.md') ||
  /^src\/.*\.[cm]?tsx?$/.test(path) ||
  path === 'package.json';

function inspect(paths, read, label, required = false) {
  const errors = [];
  const fail = (path, reason) => errors.push(`${label}: ${path}: ${reason}`);
  const names = new Set(paths);
  if (required && !names.has(policy))
    fail(policy, 'repository policy cannot be removed after introduction');
  const texts = new Map();
  for (const path of paths) {
    if (transient(path))
      fail(path, 'generated or transient artifact is not repository source');
    if (textPath(path)) texts.set(path, read(path));
  }
  if (!texts.has('package.json'))
    fail('package.json', 'package manifest is missing');
  else {
    const manifest = JSON.parse(texts.get('package.json'));
    if (
      !Array.isArray(manifest.files) ||
      !['dist', 'README.md'].every((entry) => manifest.files.includes(entry))
    )
      fail('package.json', 'files must include dist and README.md');
    else
      for (const entry of manifest.files) {
        if (
          typeof entry !== 'string' ||
          !entry ||
          /(^|\/)(src|test|docs|scripts|tools|\.git|\.github|\.githooks|\.codex)(\/|$)|[*!?{}[\]\\:]|^\/|(^|\/)\.\.?($|\/)/.test(
            entry,
          ) ||
          (entry !== 'dist' && transient(entry))
        )
          fail(
            'package.json',
            `files exposes development or transient content: ${entry}`,
          );
      }
  }
  for (const [path, content] of texts) {
    if (!path.endsWith('.md')) continue;
    // Inline links/images and reference definitions; anchors and URI schemes are external.
    const withoutCode = content.replace(/```[\s\S]*?```|`[^`\n]*`/g, '');
    const links = [
      ...withoutCode.matchAll(
        /!?\[[^\]\n]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\)|^\s{0,3}\[[^\]\n]+\]:\s*(<[^>]+>|\S+)/gm,
      ),
    ];
    for (const link of links) {
      const target = (link[1] ?? link[2]).replace(/^<|>$/g, '');
      if (/^(#|[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) continue;
      const local = decodeURIComponent(target.split(/[?#]/)[0]);
      if (!local) continue;
      const resolved = posix.normalize(
        local.startsWith('/')
          ? local.slice(1)
          : posix.join(posix.dirname(path), local),
      );
      if (
        !names.has(resolved) &&
        !paths.some((name) =>
          name.startsWith(`${resolved.replace(/\/$/, '')}/`),
        )
      )
        fail(path, `broken local Markdown link: ${target}`);
    }
  }
  const sources = new Map(
    [...texts]
      .filter(([path]) => path.startsWith('src/') && !path.endsWith('.md'))
      .map(([path, value]) => [`/repo/${path}`, value]),
  );
  const options = {
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noLib: true,
  };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (name) =>
    sources.has(name)
      ? ts.createSourceFile(name, sources.get(name), options.target, true)
      : undefined;
  host.fileExists = (name) => sources.has(name);
  host.readFile = (name) => sources.get(name);
  host.directoryExists = (name) =>
    [...sources.keys()].some((path) => path.startsWith(`${name}/`));
  host.getCurrentDirectory = () => '/repo';
  const program = ts.createProgram([...sources.keys()], options, host);
  const checker = program.getTypeChecker();
  const seen = new Set();
  const documented = (node) => {
    if (seen.has(node)) return;
    seen.add(node);
    const owner = ts.isVariableDeclaration(node) ? node.parent.parent : node;
    const summary = (owner.jsDoc ?? [])
      .map((doc) =>
        typeof doc.comment === 'string'
          ? doc.comment
          : (doc.comment ?? []).map((part) => part.text).join(''),
      )
      .join(' ')
      .trim();
    if (!summary) {
      const source = node.getSourceFile();
      const line =
        source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      fail(
        source.fileName.slice(6),
        `public API ${node.name?.getText() ?? 'default'} at line ${line} needs a JSDoc prose summary before tags`,
      );
    }
    if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node))
      for (const member of node.members) {
        if (member.name && ts.isPrivateIdentifier(member.name)) continue;
        if (ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Private)
          continue;
        if (
          ts.isMethodDeclaration(member) ||
          ts.isMethodSignature(member) ||
          ts.isGetAccessorDeclaration(member) ||
          ts.isSetAccessorDeclaration(member) ||
          ts.isConstructorDeclaration(member) ||
          ((ts.isPropertyDeclaration(member) ||
            ts.isPropertySignature(member)) &&
            ((member.initializer &&
              (ts.isArrowFunction(member.initializer) ||
                ts.isFunctionExpression(member.initializer))) ||
              (member.type && ts.isFunctionTypeNode(member.type))))
        )
          documented(member);
      }
  };
  for (const source of program.getSourceFiles()) {
    for (const diagnostic of source.parseDiagnostics)
      fail(
        source.fileName.slice(6),
        ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
      );
    const module = checker.getSymbolAtLocation(source);
    if (!module) continue;
    for (const exported of checker.getExportsOfModule(module)) {
      const symbol =
        exported.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(exported)
          : exported;
      if (!symbol.declarations?.length)
        fail(
          source.fileName.slice(6),
          `cannot resolve public export ${exported.name}`,
        );
      for (const declaration of symbol.declarations ?? [])
        documented(declaration);
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Repository policy passed: ${label} (${paths.length} files).`);
}

function inspectTree(sha, required = false) {
  inspect(
    treePaths(sha),
    (path) => git('show', `${sha}:${path}`),
    sha,
    required,
  );
}

function inspectRange(head, excluded) {
  // Historical trees predate this policy. Once introduced, every outgoing tree is checked.
  let enabled = excluded.some((sha) => treePaths(sha).includes(policy));
  let skipped = 0;
  const commits = lines(
    git(
      'rev-list',
      '--reverse',
      '--topo-order',
      head,
      ...excluded.map((sha) => `^${sha}`),
    ),
  );
  for (const sha of commits) {
    enabled ||= treePaths(sha).includes(policy);
    if (enabled || sha === head) inspectTree(sha, enabled);
    else skipped++;
  }
  if (!commits.includes(head)) inspectTree(head, enabled);
  if (skipped)
    console.log(
      `Initial policy rollout: skipped ${skipped} historical commits before ${policy} existed; final candidate checked.`,
    );
}

try {
  const args = process.argv.slice(2);
  if (!args.length) {
    const paths = [
      ...new Set(
        git('ls-files', '-z', '--cached', '--others', '--exclude-standard')
          .split('\0')
          .filter((path) => path && existsSync(path)),
      ),
    ];
    inspect(paths, (path) => readFileSync(path, 'utf8'), 'working candidate');
  } else if (args[0] === '--tree' && args.length === 2)
    inspectTree(commit(args[1]));
  else if (
    args[0] === '--range' &&
    args.length === 2 &&
    args[1].split('..').length === 2
  ) {
    const [base, head] = args[1].split('..');
    inspectRange(commit(head), /^0{40,64}$/.test(base) ? [] : [commit(base)]);
  } else if (args[0] === '--pre-push' && args.length <= 2) {
    const updates = lines(readFileSync(0, 'utf8')).map((line) => {
      const parts = line.trim().split(/\s+/);
      if (
        parts.length !== 4 ||
        !/^[\da-f]{40,64}$/.test(parts[1]) ||
        !/^[\da-f]{40,64}$/.test(parts[3])
      )
        throw new Error('Malformed pre-push input');
      return parts;
    });
    const active = updates.filter((parts) => !/^0+$/.test(parts[1]));
    const excluded = active
      .filter((parts) => !/^0+$/.test(parts[3]))
      .map((parts) => commit(parts[3]));
    if (args[1] && lines(git('remote')).includes(args[1]))
      excluded.push(
        ...lines(
          git(
            'for-each-ref',
            '--format=%(objectname)',
            `refs/remotes/${args[1]}/`,
          ),
        ).map(commit),
      );
    for (const [, local] of active)
      inspectRange(commit(local), [...new Set(excluded)]);
  } else
    throw new Error(
      'Usage: check-repo.mjs [--tree COMMIT | --range BASE..HEAD | --pre-push [REMOTE]]',
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
