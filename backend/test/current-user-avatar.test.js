const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontendRoot = path.join(__dirname, '../../frontend');
const source = (relativePath) => fs.readFileSync(path.join(frontendRoot, relativePath), 'utf8');

test('current-user identity has one canonical Employee-first photo and name resolver', () => {
  const identity = source('components/employee/CurrentUserIdentity.tsx');
  assert.match(identity, /name:\s*session\.employee\?\.name\s*\?\?\s*session\.email/);
  assert.match(identity, /photoUrl:\s*session\.employee\?\.photoUrl\s*\?\?\s*null/);
  assert.match(identity, /<EmployeeAvatar[\s\S]+name=\{identity\.name\}[\s\S]+photoUrl=\{identity\.photoUrl\}/);
});

test('desktop shell, account dialog, mobile identity, profile, and role homes use canonical current-user avatars', () => {
  const shell = source('components/AppShell.tsx');
  const mobile = source('components/employee/MobileIdentityHeader.tsx');
  const profile = source('app/(dashboard)/profile/page.tsx');
  const roleHomes = source('components/phase4/RoleHomes.tsx');
  assert.match(shell, /CurrentUserAvatar/);
  assert.ok((shell.match(/<CurrentUserAvatar/g) ?? []).length >= 2, 'shell trigger and account dialog must share the avatar');
  assert.doesNotMatch(shell, /const initials = \(session\.employee\?\.name \?\? session\.email\)/);
  assert.match(mobile, /CurrentUserAvatar/);
  assert.match(profile, /CurrentUserAvatar/);
  assert.match(roleHomes, /CurrentUserAvatar/);
});

test('session refresh is awaitable and own-profile Save refreshes every current-user surface', () => {
  const provider = source('components/providers/SessionProvider.tsx');
  const managementProfile = source('components/management/ManagementEmployeeProfile.tsx');
  assert.match(provider, /refresh:\s*\(\)\s*=>\s*Promise<void>/);
  assert.match(provider, /apiFetch<unknown>\('\/auth\/me'\)/);
  assert.match(managementProfile, /session\.employee\?\.id\s*===\s*profile\.id/);
  assert.match(managementProfile, /await refresh\(\)/);
  assert.match(managementProfile, /await uploadFile[\s\S]+await onReload\(\)[\s\S]+await refresh\(\)/);
});

test('shared avatar falls back to consistent initials when absent or when image loading fails', () => {
  const avatar = source('components/employee/EmployeeAvatar.tsx');
  assert.match(avatar, /slice\(0, 2\)/);
  assert.match(avatar, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(avatar, /useEffect\([\s\S]+setFailed\(false\)[\s\S]+\[photoUrl\]/);
  assert.match(avatar, /aria-label=\{`Foto profil \$\{name\} belum tersedia`\}/);
});
