import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const adrPath = path.resolve(__dirname, '../../../../docs/adr-task-domain-decomposition.md');

test('task domain ADR defines explicit slices and migration controls', () => {
  assert.equal(existsSync(adrPath), true, `expected ADR at ${adrPath}`);

  const adr = readFileSync(adrPath, 'utf8');

  for (const expected of [
    '# ADR: Task Domain Decomposition and Controller Split',
    '## Current Controller Responsibility Map',
    '## Decision',
    '## Extraction Sequence',
    '## Test Ownership',
    '## Rollback Constraints',
    '`task-core`',
    '`comments-mentions`',
    '`attachments`',
    '`reminders`',
    '`dependencies-subtasks`',
    '`timeline`',
  ]) {
    assert.match(adr, new RegExp(escapeRegExp(expected)), `ADR is missing required content: ${expected}`);
  }
});

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
