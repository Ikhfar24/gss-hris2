const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '../../frontend');
const read = (relative) => fs.readFileSync(path.join(frontend, relative), 'utf8');

function pageFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return pageFiles(target);
    return entry.name === 'page.tsx' ? [target] : [];
  });
}

test('all authenticated routes inherit non-conflicting mobile navigation clearance', () => {
  const shell = read('components/AppShell.tsx');
  const layout = read('app/(dashboard)/layout.tsx');
  const css = read('app/globals.css');
  assert.match(layout, /<AppShell>\{children\}<\/AppShell>/);
  const main = shell.match(/<main id="main-content" className="([^"]+)"/)?.[1] ?? '';
  assert.match(main, /mobile-nav-clearance/);
  assert.doesNotMatch(main, /(?:^|\s)(?:sm:)?py-/);
  assert.doesNotMatch(main, /(?:^|\s)(?:sm:|lg:)?p-\d/);
  assert.match(css, /\.mobile-nav-clearance \{ padding-bottom: calc\(7rem \+ env\(safe-area-inset-bottom\)\); \}/);
  assert.match(css, /scroll-padding-bottom: calc\(7rem \+ env\(safe-area-inset-bottom\)\)/);
});

test('the role-wide mobile route inventory remains inside the shared shell', () => {
  const pages = pageFiles(path.join(frontend, 'app/(dashboard)'));
  assert.ok(pages.length >= 26, `Expected the complete authenticated route inventory, found ${pages.length}`);
  for (const file of pages) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /(?:^|\s)h-screen(?:\s|$)/, `${file} must not establish a fixed viewport page`);
    assert.doesNotMatch(source, /overflow-y-hidden/, `${file} must preserve document scrolling`);
  }
  const navigation = read('lib/navigation.ts');
  for (const role of ['KARYAWAN', 'KOORDINATOR', 'ADMIN_HR', 'KEUANGAN', 'MARKETING', 'DIREKTUR', 'KOMISARIS', 'SYSTEM_ADMIN']) {
    assert.match(navigation, new RegExp(`${role}: \\[`), `${role} needs an audited mobile destination set`);
  }
});

test('mobile dialogs and custom long overlays keep their final actions reachable', () => {
  const dialog = read('components/ui/dialog.tsx');
  const employee = read('app/(dashboard)/employees/page.tsx');
  const attendance = read('app/(dashboard)/attendance/page.tsx');
  const css = read('app/globals.css');
  assert.match(dialog, /100dvh/);
  assert.match(dialog, /overflow-y-auto/);
  assert.match(dialog, /overscroll-contain/);
  assert.match(dialog, /style=\{viewportStyle\}/);
  assert.match(employee, /max-h-\[calc\(100dvh-env\(safe-area-inset-top\)-env\(safe-area-inset-bottom\)-2rem\)\]/);
  assert.match(attendance, /fixed inset-0 z-50 overflow-y-auto overscroll-contain/);
  assert.match(css, /\[role='dialog'\] \.sticky\.bottom-0 \{ position: static; \}/);
});

test('reported Beranda, Pengajuan, and Riwayat routes use normal document flow', () => {
  for (const relative of ['app/(dashboard)/dashboard/page.tsx', 'app/(dashboard)/requests/page.tsx', 'app/(dashboard)/attendance/history/page.tsx']) {
    const source = read(relative);
    assert.doesNotMatch(source, /h-screen|overflow-y-hidden/);
  }
});
