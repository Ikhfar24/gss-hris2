const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/app/(dashboard)/employees/page.tsx'), 'utf8');

test('employee list loads even when optional location or attendance requests fail', () => {
  assert.match(page, /Promise\.allSettled\(\[/);
  assert.match(page, /if \(emps\.status === "rejected"\) throw emps\.reason/);
  assert.match(page, /setEmployees\(emps\.value\.data\)/);
  assert.match(page, /locs\.status === "fulfilled" \? locs\.value : \[\]/);
  assert.match(page, /attendanceRows\.status === "fulfilled" \? attendanceRows\.value : \[\]/);
  assert.match(page, /setError\(locs\.status === "rejected" \|\| attendanceRows\.status === "rejected"/);
});
