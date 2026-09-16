const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '../../frontend');
const read = (relative) => fs.readFileSync(path.join(frontend, relative), 'utf8');

test('attendance person cards stack status outside the long identity row', () => {
  const source = read('components/attendance/PeopleAttendanceMonitoring.tsx');
  const personRow = source.slice(source.indexOf('function PersonRow'), source.indexOf('function State'));
  assert.match(personRow, /<article className="flex min-w-0/);
  assert.match(personRow, /overflow-wrap:anywhere/);
  assert.match(personRow, /<\/div><div className="mt-2 flex min-w-0 flex-wrap"><State person=\{person\}/);
  assert.doesNotMatch(personRow, /justify-between/);
  assert.doesNotMatch(personRow, /truncate/);
});

test('every attendance state uses the same readable contained chip contract', () => {
  const source = read('components/attendance/PeopleAttendanceMonitoring.tsx');
  const state = source.slice(source.indexOf('function State'));
  for (const label of ['Perlu tinjau', 'Cuti/Izin', 'Belum hadir', 'Terlambat', 'Hadir']) {
    assert.match(state, new RegExp(label.replace('/', '\\/')));
  }
  assert.match(state, /inline-flex max-w-full min-w-0/);
  assert.match(state, /whitespace-normal break-words/);
  assert.match(state, /overflow-wrap:anywhere/);
});

test('attendance filters are intentional contained horizontal scrollers', () => {
  const monitoring = read('components/attendance/PeopleAttendanceMonitoring.tsx');
  const segmented = read('components/ui/segmented-control.tsx');
  assert.match(monitoring, /max-w-full overflow-x-auto overscroll-x-contain[^>]+><SegmentedControl aria-label="Filter status absensi"/);
  assert.match(monitoring, /max-w-full overflow-x-auto overscroll-x-contain[^>]+><SegmentedControl aria-label="Filter jenis tenaga"/);
  assert.match(segmented, /inline-flex max-w-full overscroll-x-contain overflow-x-auto/);
  assert.match(segmented, /shrink-0 whitespace-nowrap/);
});

test('shared badges and alerts cannot force long content outside their parent', () => {
  const badge = read('components/ui/badge.tsx');
  const feedback = read('components/ui/feedback.tsx');
  assert.match(badge, /inline-flex max-w-full min-w-0/);
  assert.match(badge, /whitespace-normal break-words/);
  assert.match(feedback, /min-w-0 flex-1 break-words/);
  assert.match(feedback, /overflow-wrap:anywhere/);
});

test('analogous mobile identity and status cards reflow long content', () => {
  const files = [
    'app/(dashboard)/temporary-assignments/page.tsx',
    'app/(dashboard)/placement-requests/page.tsx',
    'app/(dashboard)/profile-change-requests/page.tsx',
    'app/(dashboard)/activity/page.tsx',
    'components/attendance/AttendanceHistoryView.tsx',
    'components/attendance/AttendanceDetailView.tsx',
  ];
  for (const file of files) {
    const source = read(file);
    assert.match(source, /min-w-0/, `${file} needs a shrinkable content boundary`);
    assert.match(source, /break-words/, `${file} needs readable long-text reflow`);
  }
});

test('authenticated routes do not establish viewport-width content', () => {
  const app = path.join(frontend, 'app/(dashboard)');
  const files = [];
  const visit = (directory) => fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(target);
    else if (entry.name.endsWith('.tsx')) files.push(target);
  });
  visit(app);
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /w-screen|100vw|min-w-screen/, `${file} must remain bounded by the authenticated shell`);
  }
});
