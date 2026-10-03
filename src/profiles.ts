import {
  acquireBindingLease,
  acquireProfileMutex,
  type BindingLease,
} from './binding-lock.js';
import { claimPrivateState } from './private-state.js';
import { open, rm, lstat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import {
  stagedCredential,
  previewLogin,
  type StagedLoginOptions,
} from './profile-login.js';
import { discoverTarget } from './discovery.js';
import { selectProfile } from './selector.js';
import {
  privateDirectory,
  verifyPrivate,
  writePrivate,
} from './private-files.js';
type Profile = {
  id: string;
  label: string;
  description: string;
  bindingId: string;
  createdAt: string;
  updatedAt: string;
  status: 'available' | 'deleted';
};
type Binding = {
  id: string;
  profileId: string;
  account: string;
  subject: string;
  retired: boolean;
  createdAt: string;
};
type Manifest = { schemaVersion: 1; profiles: Profile[]; bindings: Binding[] };
const text = (value: unknown, limit = 200): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= limit &&
  !/[\p{Cc}\p{Cf}]/u.test(value);
const id = (value: unknown): value is string =>
  typeof value === 'string' && /^(profile|binding)_[a-f0-9-]{36}$/.test(value);
const defaultStateHome = join(
  homedir(),
  process.platform === 'win32' ? '.codex-tandem-windows' : '.codex-tandem',
);
async function bounded(path: string, limit = 65536): Promise<Buffer> {
  if (!(await lstat(path)).isFile()) throw new Error('INPUT_INVALID');
  const handle = await open(path, 'r');
  try {
    if ((await handle.stat()).size > limit) throw new Error('INPUT_INVALID');
    const buffer = Buffer.alloc(limit + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > limit) throw new Error('INPUT_INVALID');
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
function identity(bytes: Buffer): { account: string; subject: string } {
  try {
    const auth = JSON.parse(bytes.toString('utf8'));
    const tokens = auth.tokens;
    if (
      !auth ||
      Object.keys(auth).some(
        (key) =>
          !['auth_mode', 'OPENAI_API_KEY', 'tokens', 'last_refresh'].includes(
            key,
          ),
      ) ||
      (auth.auth_mode && auth.auth_mode !== 'chatgpt') ||
      !tokens ||
      Object.keys(tokens).some(
        (key) =>
          !['id_token', 'access_token', 'refresh_token', 'account_id'].includes(
            key,
          ),
      )
    )
      throw new Error();
    if (
      !text(tokens.account_id, 256) ||
      !text(tokens.access_token, 16384) ||
      !text(tokens.refresh_token, 16384) ||
      !text(tokens.id_token, 16384) ||
      auth.OPENAI_API_KEY
    )
      throw new Error();
    const parts = tokens.id_token.split('.');
    if (parts.length !== 3) throw new Error();
    const claims = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    );
    const account = claims['https://api.openai.com/auth']?.chatgpt_account_id;
    const subject =
      claims['https://api.openai.com/auth']?.chatgpt_user_id ??
      claims['https://api.openai.com/auth']?.user_id;
    if (!text(subject, 256) || account !== tokens.account_id) throw new Error();
    for (const alias of ['chatgpt_user_id', 'user_id']) {
      const hint = claims['https://api.openai.com/auth']?.[alias];
      if (hint !== undefined && hint !== subject) throw new Error();
    }
    // Access tokens may be opaque; only a readable JWT payload supplies hints.
    let accessClaims;
    const accessParts = tokens.access_token.split('.');
    if (accessParts.length === 3) {
      try {
        accessClaims = JSON.parse(
          Buffer.from(accessParts[1], 'base64url').toString('utf8'),
        );
      } catch {
        // Decoding is optional and does not establish token validity.
      }
    }
    const accessHints = accessClaims?.['https://api.openai.com/auth'];
    for (const [key, expected] of [
      ['chatgpt_account_id', account],
      ['chatgpt_user_id', subject],
      ['user_id', subject],
    ]) {
      const hint = accessHints?.[key];
      if (hint !== undefined && hint !== expected) throw new Error();
    }
    return { account, subject };
  } catch {
    throw new Error('IDENTITY_FORMAT_UNSUPPORTED');
  }
}
function validate(manifest: Manifest) {
  const only = (value: object, keys: string[]) =>
    Object.keys(value).every((key) => keys.includes(key));
  if (!manifest || !only(manifest, ['schemaVersion', 'profiles', 'bindings']))
    throw new Error('PROFILE_STATE_INVALID');
  if (
    manifest.schemaVersion !== 1 ||
    !Array.isArray(manifest.profiles) ||
    !Array.isArray(manifest.bindings) ||
    manifest.profiles.length > 500 ||
    manifest.bindings.length > 5000
  )
    throw new Error('PROFILE_STATE_INVALID');
  if (
    manifest.profiles.some(
      (p) =>
        !p ||
        !only(p, [
          'id',
          'label',
          'description',
          'bindingId',
          'createdAt',
          'updatedAt',
          'status',
        ]) ||
        !id(p.id) ||
        !id(p.bindingId) ||
        !text(p.label) ||
        typeof p.description !== 'string' ||
        p.description.length > 1000 ||
        /[\p{Cc}\p{Cf}]/u.test(p.description) ||
        !['available', 'deleted'].includes(p.status) ||
        !text(p.createdAt) ||
        !text(p.updatedAt),
    ) ||
    manifest.bindings.some(
      (b) =>
        !b ||
        !only(b, [
          'id',
          'profileId',
          'account',
          'subject',
          'retired',
          'createdAt',
        ]) ||
        !id(b.id) ||
        !id(b.profileId) ||
        !text(b.account, 256) ||
        !text(b.subject, 256) ||
        typeof b.retired !== 'boolean' ||
        !text(b.createdAt),
    )
  )
    throw new Error('PROFILE_STATE_INVALID');
  if (
    new Set(manifest.profiles.map((p) => p.id)).size !==
      manifest.profiles.length ||
    new Set(manifest.bindings.map((b) => b.id)).size !==
      manifest.bindings.length ||
    manifest.profiles.some(
      (p) =>
        !manifest.bindings.some(
          (b) => b.id === p.bindingId && b.profileId === p.id,
        ),
    )
  )
    throw new Error('PROFILE_STATE_INVALID');
}
async function readManifest(root: string): Promise<Manifest> {
  const path = join(root, 'profiles.json');
  try {
    await verifyPrivate(path);
    const manifest = JSON.parse(
      (await bounded(path, 1048576)).toString('utf8'),
    );
    validate(manifest);
    return manifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return { schemaVersion: 1, profiles: [], bindings: [] };
  }
}
/** Manage stable local profiles. Commands return non-secret profile/binding references; imported credentials stay private. Mutations use a verified profile mutex, then canonical binding leases for credential changes; ambiguous ownership blocks cleanup and recovery. */
export async function profilesCommand(args: string[]): Promise<number> {
  const json = args.includes('--json');
  try {
    const command = args[0] ?? 'list';
    if (command === 'manage') return await manageProfiles(args.slice(1));
    const options = new Map<string, string>();
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--json') continue;
      if (
        ![
          '--state-home',
          '--identity',
          '--label',
          '--description',
          '--import',
          '--confirm',
          '--new-binding',
          '--codex-home',
          '--codex-executable',
          '--codex-script',
          '--approve-file-mode',
        ].includes(args[i]) ||
        !args[i + 1] ||
        options.has(args[i])
      )
        throw new Error('INVALID_ARGUMENTS');
      options.set(args[i], args[++i]);
    }
    if (
      !['add', 'list', 'show', 'rename', 'remove', 'login', 'policy'].includes(
        command,
      )
    )
      throw new Error('INVALID_ARGUMENTS');
    const root = await claimPrivateState(
      resolve(options.get('--state-home') ?? defaultStateHome),
      'installation',
    );
    const credentials = await privateDirectory(join(root, 'credentials'));
    const loginOptions = async (): Promise<StagedLoginOptions> => {
      const discovery = await discoverTarget({
        target: 'local',
        codexHome: options.get('--codex-home'),
        codexExecutable: options.get('--codex-executable'),
      });
      if (!discovery.ok || !discovery.paths)
        throw new Error('CODEX_TARGET_UNAVAILABLE');
      return {
        command: {
          executable: discovery.paths.executable,
          ...(options.get('--codex-script')
            ? { prefix: [resolve(options.get('--codex-script')!)] }
            : {}),
        },
        codexHome: discovery.paths.codexHome,
        stateHome: root,
        cwd: process.cwd(),
        approveFileMode: options.get('--approve-file-mode') === 'staging-file',
      };
    };
    if (command === 'policy') {
      const preview = await previewLogin(await loginOptions());
      process.stdout.write(
        JSON.stringify({ schemaVersion: 1, ok: true, ...preview }) + '\n',
      );
      return 0;
    }
    const mutating = !['list', 'show', 'policy'].includes(command);
    const profileMutex = mutating ? await acquireProfileMutex(root) : undefined;
    const bindingLeases: BindingLease[] = [];
    const protectBinding = async (bindingId: string) => {
      bindingLeases.push(
        await acquireBindingLease(join(credentials, bindingId + '.json')),
      );
    };
    try {
      const path = join(root, 'profiles.json');
      const manifest = await readManifest(root);
      const profile = manifest.profiles.find(
        (p) => p.id === options.get('--identity'),
      );
      const now = new Date().toISOString();
      if (
        (command === 'add' && manifest.profiles.length >= 500) ||
        (['add', 'login'].includes(command) && manifest.bindings.length >= 5000)
      )
        throw new Error('PROFILE_STORE_FULL');
      let selected = profile;
      if (
        command === 'show' ||
        command === 'rename' ||
        command === 'remove' ||
        command === 'login'
      ) {
        if (!profile) throw new Error('IDENTITY_UNKNOWN');
      }
      if (command === 'add') {
        if (!text(options.get('--label'))) throw new Error('LABEL_REQUIRED');
        if (
          manifest.profiles.some(
            (p) =>
              p.status === 'available' && p.label === options.get('--label'),
          )
        )
          throw new Error('LABEL_DUPLICATE');
        const bytes = options.get('--import')
          ? await bounded(resolve(options.get('--import')!))
          : await stagedCredential(await loginOptions());
        const hints = identity(bytes);
        const bindingId = `binding_${randomUUID()}`;
        selected = {
          id: `profile_${randomUUID()}`,
          label: options.get('--label')!,
          description: '',
          bindingId,
          createdAt: now,
          updatedAt: now,
          status: 'available',
        };
        await protectBinding(bindingId);
        await writePrivate(join(credentials, `${bindingId}.json`), bytes);
        manifest.profiles.push(selected);
        manifest.bindings.push({
          id: bindingId,
          profileId: selected.id,
          ...hints,
          retired: false,
          createdAt: now,
        });
      } else if (command === 'rename') {
        if (!text(options.get('--label')) || profile!.status !== 'available')
          throw new Error('LABEL_REQUIRED');
        if (
          manifest.profiles.some(
            (p) =>
              p.id !== profile!.id &&
              p.status === 'available' &&
              p.label === options.get('--label'),
          )
        )
          throw new Error('LABEL_DUPLICATE');
        const description =
          options.get('--description') ?? profile!.description;
        if (description.length > 1000 || /[\p{Cc}\p{Cf}]/u.test(description))
          throw new Error('INVALID_METADATA');
        profile!.label = options.get('--label')!;
        profile!.description = description;
        profile!.updatedAt = now;
      } else if (command === 'remove') {
        if (options.get('--confirm') !== profile!.id)
          throw new Error('CONFIRMATION_REQUIRED');
        for (const binding of manifest.bindings
          .filter((b) => b.profileId === profile!.id)
          .sort((a, b) => a.id.localeCompare(b.id)))
          await protectBinding(binding.id);
        // Retire metadata first: interruption cannot leave removed credentials selectable.
        profile!.status = 'deleted';
        profile!.updatedAt = now;
        for (const binding of manifest.bindings.filter(
          (b) => b.profileId === profile!.id,
        ))
          binding.retired = true;
        await writePrivate(path, JSON.stringify(manifest));
        for (const binding of manifest.bindings.filter(
          (b) => b.profileId === profile!.id,
        ))
          await rm(join(credentials, `${binding.id}.json`), { force: true });
      } else if (command === 'login') {
        if (profile!.status !== 'available') throw new Error('PROFILE_DELETED');
        await protectBinding(profile!.bindingId);
        const bytes = options.get('--import')
          ? await bounded(resolve(options.get('--import')!))
          : await stagedCredential(await loginOptions());
        const hints = identity(bytes);
        const previous = manifest.bindings.find(
          (b) => b.id === profile!.bindingId,
        )!;
        if (
          previous.account === hints.account &&
          previous.subject === hints.subject
        ) {
          await writePrivate(join(credentials, `${previous.id}.json`), bytes);
        } else {
          if (options.get('--new-binding') !== profile!.id)
            throw new Error('NEW_BINDING_CONFIRMATION_REQUIRED');
          const bindingId = `binding_${randomUUID()}`;
          await protectBinding(bindingId);
          await writePrivate(join(credentials, `${bindingId}.json`), bytes);
          previous.retired = true;
          profile!.bindingId = bindingId;
          manifest.bindings.push({
            id: bindingId,
            profileId: profile!.id,
            ...hints,
            retired: false,
            createdAt: now,
          });
          await writePrivate(path, JSON.stringify(manifest));
          await rm(join(credentials, `${previous.id}.json`), { force: true });
        }
        profile!.updatedAt = now;
      }
      if (mutating) await writePrivate(path, JSON.stringify(manifest));
      const safeBindings = manifest.bindings
        .filter((b) => !selected || b.profileId === selected.id)
        .map((b) => ({
          id: b.id,
          profileId: b.profileId,
          retired: b.retired,
          createdAt: b.createdAt,
        }));
      const result = {
        schemaVersion: 1,
        ok: true,
        ...(command === 'list'
          ? { profiles: manifest.profiles }
          : { profile: selected, bindings: safeBindings }),
      };
      process.stdout.write(
        json
          ? JSON.stringify(result) + '\n'
          : (command === 'list'
              ? manifest.profiles
                  .map((p) => `${p.id} ${p.label} [${p.status}]`)
                  .join('\n')
              : `${selected!.id} ${selected!.label} [${selected!.status}]`) +
              '\n',
      );
      return 0;
    } finally {
      try {
        for (const lease of bindingLeases.reverse()) await lease.release();
      } finally {
        await profileMutex?.release();
      }
    }
  } catch (error) {
    const message = (error as Error).message;
    const code = /^[A-Z_]+$/.test(message)
      ? message
      : 'PROFILE_OPERATION_FAILED';
    process.stderr.write(
      json
        ? JSON.stringify({ schemaVersion: 1, ok: false, code }) + '\n'
        : code + '\n',
    );
    return code === 'LOGIN_CANCELED' ? 130 : 2;
  }
}

async function manageProfiles(options: string[]): Promise<number> {
  if (
    !(process.stdin.isTTY && process.stdout.isTTY && process.stderr.isTTY) ||
    options.includes('--json')
  )
    throw new Error('TERMINAL_REQUIRED');
  const { createInterface } = await import('node:readline/promises');
  const createTerminal = () =>
    createInterface({ input: process.stdin, output: process.stderr });
  let terminal = createTerminal();
  try {
    while (true) {
      process.stderr.write(
        '\nManage profiles: list / show / add / rename / login / remove / policy / quit\n',
      );
      const action = (await terminal.question('Action: ')).trim();
      if (action === 'quit' || action === '') return 0;
      if (
        ![
          'list',
          'show',
          'add',
          'rename',
          'login',
          'remove',
          'policy',
        ].includes(action)
      ) {
        process.stderr.write('Choose a displayed action.\n');
        continue;
      }
      const args = [action, ...options];
      if (['show', 'rename', 'login', 'remove'].includes(action)) {
        if ((await profilesCommand(['list', ...options])) !== 0) continue;
        const stateIndex = options.indexOf('--state-home');
        const root = await claimPrivateState(
          resolve(stateIndex >= 0 ? options[stateIndex + 1] : defaultStateHome),
          'installation',
        );
        const profiles = (await readManifest(root)).profiles.filter(
          (profile) => action === 'show' || profile.status === 'available',
        );
        if (profiles.length === 0) {
          process.stderr.write('No saved profiles available.\n');
          continue;
        }
        // Release readline completely so selector keys cannot answer a question.
        terminal.close();
        let identity: string | null;
        try {
          identity = await selectProfile(profiles);
        } finally {
          terminal = createTerminal();
        }
        if (!identity) continue;
        args.push('--identity', identity);
        if (action === 'remove') {
          await profilesCommand(['show', '--identity', identity, ...options]);
          const confirm = await terminal.question(
            'Remove saved credentials and retain history? Type the stable profile ID to confirm: ',
          );
          if (confirm !== identity) continue;
          args.push('--confirm', confirm);
        }
        if (action === 'login') {
          const replacement = await terminal.question(
            'Allow a different account/workspace as a new binding? Type the stable profile ID to consent, or Enter for same-account only: ',
          );
          if (replacement === identity) args.push('--new-binding', identity);
        }
      }
      if (action === 'add' || action === 'rename') {
        const label = await terminal.question(
          'Display label (empty cancels): ',
        );
        if (!label) continue;
        args.push('--label', label);
      }
      if (action === 'add' || action === 'login') {
        const source = await terminal.question(
          'Import credential file path, or Enter to initiate existing Codex login: ',
        );
        if (source) args.push('--import', source);
        else {
          const preview = await profilesCommand(['policy', ...options]);
          if (preview !== 0) continue;
          const consent = await terminal.question(
            'Initiate isolated Codex login with staging file mode and a private config backup if required? Type staging-file to consent: ',
          );
          if (consent !== 'staging-file') continue;
          args.push('--approve-file-mode', 'staging-file');
          // Release the readline input consumer while the existing Codex login owns stdin.
          terminal.pause();
          try {
            await profilesCommand(args);
          } finally {
            terminal.resume();
          }
          continue;
        }
      }
      await profilesCommand(args);
    }
  } finally {
    terminal.close();
  }
}
