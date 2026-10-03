import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const register = JSON.parse(
  read('docs/requirements/Codex-Tandem-Requirements-Register.json'),
);
const tickets = JSON.parse(read('docs/planning/gitlab-map.json')).tickets;
const traceability = read('docs/planning/traceability.md');
const unique = (items) =>
  new Set(items.map((item) => item.id)).size === items.length;
assert(unique(register.requirements), 'duplicate requirement IDs');
assert(unique(register.acceptanceTests), 'duplicate acceptance IDs');
assert(unique(register.sources), 'duplicate source IDs');
const tests = new Set(register.acceptanceTests.map((test) => test.id));
const referenced = new Set();
let must = 0;
for (const requirement of register.requirements) {
  if (requirement.priority === 'MUST') must++;
  assert(
    requirement.acceptance_tests.length > 0,
    `${requirement.id}: missing tests`,
  );
  for (const id of requirement.acceptance_tests) {
    assert(tests.has(id), `${requirement.id}: unknown test ${id}`);
    referenced.add(id);
  }
  const rows = traceability
    .split('\n')
    .filter((line) => line.split('|')[1]?.trim() === requirement.id);
  assert.equal(
    rows.length,
    1,
    `${requirement.id}: absent or duplicate planning row`,
  );
  const cells = rows[0].split('|');
  assert.deepEqual(
    cells[3].trim().split(/,\s*/),
    requirement.acceptance_tests,
    `${requirement.id}: mapping drift`,
  );
  const allocations = [...cells[4].matchAll(/\[(CT-\d+)\]/g)].map(
    (match) => match[1],
  );
  assert(allocations.length > 0, `${requirement.id}: orphan task allocation`);
  for (const id of allocations)
    assert(tickets[id], `${requirement.id}: unknown task ${id}`);
}
assert.equal(referenced.size, tests.size, 'unreferenced acceptance family');
let links = 0;
for (const name of readdirSync(directory).filter((name) =>
  name.endsWith('.md'),
)) {
  const body = readFileSync(resolve(directory, name), 'utf8');
  for (const match of body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    assert(
      existsSync(resolve(directory, target)),
      `${name}: missing ${target}`,
    );
    links++;
  }
}
console.log(
  JSON.stringify(
    {
      platform: process.platform,
      node: process.version,
      requirements: register.requirements.length,
      must,
      acceptanceFamilies: tests.size,
      publishedTasks: Object.keys(tickets).length,
      sourceRecords: register.sources.length,
      localLinks: links,
      status: 'PASS',
      scope: 'Document integrity only; no product acceptance executed',
    },
    null,
    2,
  ),
);
