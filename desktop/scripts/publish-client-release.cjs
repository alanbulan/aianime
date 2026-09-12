#!/usr/bin/env node
// Release automation for Node.js 22+. Passwords/tokens come only from the environment.
const { createReadStream } = require('node:fs');
const { readFile, stat } = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { basename, dirname, resolve, extname } = require('node:path');
const { parseArgs } = require('node:util');
const { spawn } = require('node:child_process');

const prefix = '/api/v1/admin/release';
const help = `Usage: node scripts/operations/publish-client-release.cjs --plan release.json [options]
  --gateway URL                  Default: https://aianime.mingcw.com (or RELEASE_GATEWAY)
  --check-auth                   Log in and verify release-list access; no upload
  --runtime-archive TAR           Import a runtime handoff on a trusted server
  --runtime-dir DIR               Verified extracted handoff directory
  --file-config YAML              Server-side File RPC configuration
  --runtime-importer PATH         Optional prebuilt File importer (otherwise go run)
  --dry-run                      Validate local files without login/upload
  --publish --reason TEXT         Publish after upload and registration
  --version-id UUID --reason TEXT Append missing platforms to an existing version
  --auto-version --reason TEXT  Reuse the exact plan version when it exists; otherwise create it
  --help                         Show this help
RELEASE_PASSWORD supplies the password. RELEASE_TENANT defaults to system; RELEASE_USERNAME to admin.
Alternatively set RELEASE_ADMIN_TOKEN to use an existing JWT without password login.
Optional RELEASE_CAPTCHA_KEY/RELEASE_CAPTCHA_CODE are forwarded if the server requires a captcha.
Plan: {version, notes?, minimumSupportedVersion?, artifacts: [{target, arch, installer, manifest}]}
File paths are relative to the plan. Existing published versions expose appended artifacts immediately.
`;

function gatewayOrigin(value) {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Gateway must be an HTTPS origin without credentials/path/query (HTTP loopback is allowed for tests)');
  }
  return url.origin;
}

async function inspectFile(path, maxSize) {
  const info = await stat(path);
  if (!info.isFile() || info.size <= 0 || info.size > maxSize) {
    throw new Error(`Expected a non-empty file no larger than ${maxSize} bytes: ${path}`);
  }
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of createReadStream(path)) { hash.update(chunk); size += chunk.length; }
  if (size !== info.size) throw new Error(`File changed during hashing: ${path}`);
  return { path, fileName: basename(path), size, sha256: hash.digest('hex') };
}

async function loadPlan(path) {
  const plan = JSON.parse(await readFile(path, 'utf8'));
  if (typeof plan.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(plan.version)) {
    throw new Error('Plan version must be a semantic version such as 1.2.3');
  }
  for (const field of ['notes', 'minimumSupportedVersion']) {
    if (plan[field] !== undefined && typeof plan[field] !== 'string') throw new Error(`${field} must be a string`);
  }
  if (!Array.isArray(plan.artifacts) || !plan.artifacts.length) throw new Error('Plan needs at least one artifact');
  const seen = new Set();
  const artifacts = [];
  for (const item of plan.artifacts) {
    const key = `${item.target}/${item.arch}`;
    if (!['windows/x86_64', 'macos/arm64', 'macos/x86_64'].includes(key) || seen.has(key)) {
      throw new Error(`Unsupported or duplicate platform: ${key}`);
    }
    seen.add(key);
    const windows = item.target === 'windows';
    const installer = await inspectFile(resolve(dirname(path), item.installer), 2 ** 31);
    const manifest = await inspectFile(resolve(dirname(path), item.manifest), 1024 * 1024);
    if (extname(installer.fileName).toLowerCase() !== (windows ? '.exe' : '.zip') ||
        manifest.fileName !== (windows ? 'latest.yml' : 'latest-mac.yml')) {
      throw new Error(`Installer or updater YAML filename does not match ${key}`);
    }
    installer.contentType = windows ? 'application/octet-stream' : 'application/zip';
    manifest.contentType = 'application/x-yaml';
    artifacts.push({ target: item.target, arch: item.arch, installerKind: windows ? 'nsis' : 'zip', installer, manifest });
  }
  return { version: plan.version, notes: plan.notes, minimumSupportedVersion: plan.minimumSupportedVersion, artifacts };
}

function createSession(origin, env) {
  let token = env.RELEASE_ADMIN_TOKEN?.trim();
  let expiresAt = token ? Infinity : 0;
  if (token && /\s/.test(token)) throw new Error('RELEASE_ADMIN_TOKEN must contain a JWT without the Bearer prefix');
  return async function getSession() {
    if (token && Date.now() < expiresAt - 60000) return { token };
    if (!env.RELEASE_PASSWORD) throw new Error('Set RELEASE_PASSWORD or RELEASE_ADMIN_TOKEN in the environment');
    const response = await fetch(origin + '/api/v1/auth/login', {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantCode: env.RELEASE_TENANT || 'system', username: env.RELEASE_USERNAME || 'admin',
        password: env.RELEASE_PASSWORD, captchaKey: env.RELEASE_CAPTCHA_KEY || '', captchaCode: env.RELEASE_CAPTCHA_CODE || '' }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Login failed: HTTP ${response.status}; check credentials and tenant captcha policy`);
    }
    let result;
    try { result = await response.json(); } catch { throw new Error('Login returned invalid JSON'); }
    if (typeof result.accessToken !== 'string' || result.accessToken.split('.').length !== 3 ||
        /\s/.test(result.accessToken) || !Number.isFinite(Number(result.expiresIn)) || Number(result.expiresIn) <= 60 ||
        result.tenant?.isSystem !== true) {
      throw new Error('Login did not return a valid platform administrator session');
    }
    token = result.accessToken;
    expiresAt = Date.now() + Number(result.expiresIn) * 1000;
    console.error(`Login succeeded: tenant=${result.tenant.code}, user=${result.user?.username}, expiresIn=${result.expiresIn}s`);
    return { token, expiresIn: Number(result.expiresIn), tenantCode: result.tenant.code, username: result.user?.username };
  };
}

async function runRuntimeImport(values, env, origin, getSession) {
  if (!values['runtime-dir']) throw new Error('--runtime-dir is required with --runtime-archive');
  if (!values['dry-run'] && !values['file-config']) throw new Error('--file-config is required for runtime import');
  if (values.publish && !values.reason?.trim()) throw new Error('--publish requires --reason');
  const args = ['-archive', resolve(values['runtime-archive']), '-dir', resolve(values['runtime-dir'])];
  const childEnv = { ...env };
  // File imports bytes only; this process owns HTTP authentication after the potentially long import.
  for (const key of ['RELEASE_PASSWORD', 'RELEASE_ADMIN_TOKEN', 'RELEASE_CAPTCHA_KEY', 'RELEASE_CAPTCHA_CODE', 'RUNTIME_ADMIN_TOKEN']) delete childEnv[key];
  if (!values['dry-run']) {
    args.push('-f', resolve(values['file-config']));
    await getSession();
  }
  const binary = values['runtime-importer'] ? resolve(values['runtime-importer']) : 'go';
  const commandArgs = values['runtime-importer'] ? args : ['run', './apps/file/rpc/cmd/runtime-dependencies', ...args];
  const chunks = [];
  let outputSize = 0;
  await new Promise((done, reject) => {
    const child = spawn(binary, commandArgs, { cwd: values['runtime-importer'] ? process.cwd() : resolve(__dirname, '../../backend'), env: childEnv, stdio: ['ignore', 'pipe', 'inherit'], shell: false });
    child.stdout.on('data', chunk => {
      outputSize += chunk.length;
      if (outputSize > 4 * 1024 * 1024) { child.kill(); reject(new Error('File importer output exceeds 4 MiB')); return; }
      chunks.push(chunk);
    });
    child.once('error', () => reject(new Error('Cannot start File runtime importer; check Go or --runtime-importer')));
    child.once('close', (code, signal) => code === 0 ? done() : reject(new Error(`File runtime importer failed: ${signal || code}`)));
  });
  if (values['dry-run']) { console.log('Runtime handoff validation succeeded; no import or publication'); return; }
  let requests;
  try {
    requests = Buffer.concat(chunks).toString('utf8').split('\n').map(line => line.trim())
      .filter(line => line.startsWith('{"package":')).map(line => JSON.parse(line));
  } catch { throw new Error('File importer returned invalid registration JSON'); }
  if (!requests.length || requests.some(item => !['world', 'worldModels', 'matte'].includes(item.package?.id))) {
    throw new Error('File importer returned no valid runtime packages');
  }
  async function post(path, body) {
    const { token } = await getSession();
    const response = await fetch(origin + path, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(35 * 60 * 1000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`POST ${path}: HTTP ${response.status}`); }
    try { return await response.json(); } catch { throw new Error(`POST ${path}: invalid JSON response`); }
  }
  for (const request of requests) {
    let result = await post(prefix + '/runtime-dependencies', request);
    if (typeof result.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(result.id)) throw new Error('Invalid runtime registration response');
    console.error(`Registered runtime ${request.package.id}: id=${result.id}, status=${result.status}`);
    if (values.publish && result.status !== 'PUBLISHED') {
      result = await post(`${prefix}/runtime-dependencies/${result.id}/publish`, { confirmed: true, reason: values.reason });
      if (result.status !== 'PUBLISHED') throw new Error('Runtime publication did not complete');
    }
    console.log(JSON.stringify({ id: result.id, dependency: request.package.id, version: request.package.version,
      target: `${request.package.platform}-${request.package.arch}`, status: result.status }));
  }
}

async function publishClientRelease(values, env = process.env) {
  const modes = [values.plan, values['check-auth'], values['runtime-archive']].filter(Boolean);
  if (modes.length !== 1) throw new Error('Choose exactly one of --plan, --check-auth, --runtime-archive');
  if (!values['runtime-archive'] && (values['runtime-dir'] || values['file-config'] || values['runtime-importer'])) {
    throw new Error('Runtime options require --runtime-archive');
  }
  if (!values.plan && (values['version-id'] || values['auto-version'])) throw new Error('--version-id/--auto-version requires --plan');
  if (values['version-id'] && values['auto-version']) throw new Error('--version-id and --auto-version are mutually exclusive');
  if (values['check-auth'] && (values.publish || values['dry-run'])) throw new Error('--check-auth cannot publish or dry-run');
  const origin = gatewayOrigin(values.gateway || env.RELEASE_GATEWAY || 'https://aianime.mingcw.com');
  const getSession = createSession(origin, env);
  if (values['check-auth']) {
    const session = await getSession();
    const response = await fetch(origin + prefix + '/versions?page=1&pageSize=1', {
      redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${session.token}` },
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Release access check failed: HTTP ${response.status}`); }
    let result;
    try { result = await response.json(); } catch { throw new Error('Release access check returned invalid JSON'); }
    if (!Array.isArray(result.items)) throw new Error('Invalid release list response');
    const summary = { gateway: origin, authenticated: true, releaseListReadable: true,
      expiresIn: session.expiresIn, tenantCode: session.tenantCode, username: session.username };
    console.log(JSON.stringify(summary, null, 2));
    return summary;
  }
  if (values['runtime-archive']) return runRuntimeImport(values, env, origin, getSession);
  let versionID = values['version-id'];
  if (versionID && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(versionID)) throw new Error('--version-id must be a UUID');
  if ((values.publish || versionID || values['auto-version']) && !values.reason?.trim()) throw new Error('Publishing/appending requires --reason');
  const plan = await loadPlan(resolve(values.plan));
  if (values['dry-run']) {
    console.log(JSON.stringify({ dryRun: true, ...plan }, null, 2));
    return;
  }
  async function request(method, path, body, file) {
    const { token } = await getSession();
    const stream = file ? createReadStream(file.path) : undefined;
    try {
      const response = await fetch(origin + path, {
        method, redirect: 'manual', signal: AbortSignal.timeout(35 * 60 * 1000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': file?.contentType || 'application/json',
          ...(file ? { 'Content-Length': String(file.size) } : {}) },
        body: stream || (body === undefined ? undefined : JSON.stringify(body)),
        ...(file ? { duplex: 'half' } : {}),
      });
      if (!response.ok) {
        await response.body?.cancel();
        // Do not echo upstream bodies, which may contain secrets or proxy HTML.
        throw new Error(`${method} ${path}: HTTP ${response.status}; inspect server audit logs before retrying`);
      }
      try { return await response.json(); } catch { throw new Error(`${method} ${path}: invalid JSON response`); }
    } finally { stream?.destroy(); }
  }
  async function findExistingVersion(predicate) {
    const matches = [];
    for (let page = 1; ; page++) {
      const result = await request('GET', `${prefix}/versions?page=${page}&pageSize=100`);
      if (!Array.isArray(result.items) || !Number.isFinite(Number(result.total))) throw new Error('Invalid version list response');
      matches.push(...result.items.filter(predicate));
      if (result.items.length === 0 || page * 100 >= Number(result.total)) break;
    }
    if (matches.length > 1) throw new Error(`Multiple existing versions match plan version ${plan.version}`);
    return matches[0];
  }
  let existingVersion;
  if (values['auto-version']) {
    existingVersion = await findExistingVersion(item => item.version === plan.version);
    if (existingVersion) {
      if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(existingVersion.id)) {
        throw new Error('Existing version list returned an invalid version ID');
      }
      versionID = existingVersion.id;
    }
  }
  // Check existing version before uploading: never overwrite a platform or accidentally edit another version.
  if (versionID) {
    const existing = existingVersion || await findExistingVersion(item => item.id === versionID);
    if (!existing || existing.version !== plan.version) throw new Error('Existing version ID must match the plan version');
    if (existing.status === 'WITHDRAWN') throw new Error('Cannot append to a withdrawn version');
    if (plan.minimumSupportedVersion !== undefined && plan.minimumSupportedVersion !== existing.minimumSupportedVersion) {
      throw new Error('Appending cannot change minimumSupportedVersion');
    }
    for (const artifact of plan.artifacts) {
      if (existing.artifacts?.some(item => item.target === artifact.target && item.arch === artifact.arch)) {
        throw new Error(`Platform already exists: ${artifact.target}/${artifact.arch}`);
      }
    }
    if (plan.notes === undefined) plan.notes = existing.notes;
  }
  async function upload(file) {
    const applied = await request('POST', `${prefix}/artifacts/uploads`, {
      fileName: file.fileName, contentType: file.contentType, size: file.size,
    });
    if (!/^[1-9]\d*$/.test(String(applied.fileId)) ||
        (typeof applied.fileId === 'number' && !Number.isSafeInteger(applied.fileId))) throw new Error('Invalid upload fileId');
    console.error(`Uploading ${file.fileName}: fileId=${applied.fileId}, size=${file.size}`);
    const result = await request('PUT', `${prefix}/artifacts/uploads/${applied.fileId}/content`, undefined, file);
    if (result.success !== true) throw new Error(`Upload did not complete: fileId=${applied.fileId}`);
    return applied.fileId;
  }
  const artifacts = [];
  for (const { target, arch, installerKind, installer, manifest } of plan.artifacts) {
    const fileId = await upload(installer);
    const manifestFileId = await upload(manifest);
    artifacts.push({ target, arch, installerKind, fileId, manifestFileId,
      sha256: installer.sha256, sizeBytes: installer.size,
      manifestSha256: manifest.sha256, manifestSizeBytes: manifest.size });
  }
  let release = versionID
    ? await request('PUT', `${prefix}/versions/${versionID}`, { notes: plan.notes, artifacts, confirmed: true, reason: values.reason })
    : await request('POST', `${prefix}/versions`, { version: plan.version, notes: plan.notes || '',
      minimumSupportedVersion: plan.minimumSupportedVersion || '', artifacts });
  if (typeof release.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(release.id)) throw new Error('Invalid release response');
  console.error(`Registered version ${plan.version}: id=${release.id}, status=${release.status}`);
  if (values.publish && release.status !== 'PUBLISHED') {
    release = await request('POST', `${prefix}/versions/${release.id}/publish`, { confirmed: true, reason: values.reason });
    if (release.status !== 'PUBLISHED') throw new Error('Publication did not complete');
  }
  console.log(JSON.stringify(release, null, 2));
  return release;
}

if (require.main === module) {
  Promise.resolve().then(() => {
    const { values } = parseArgs({ options: {
      plan: { type: 'string' }, gateway: { type: 'string' }, reason: { type: 'string' },
      'version-id': { type: 'string' }, 'auto-version': { type: 'boolean' }, publish: { type: 'boolean' }, 'check-auth': { type: 'boolean' },
      'runtime-archive': { type: 'string' }, 'runtime-dir': { type: 'string' },
      'file-config': { type: 'string' }, 'runtime-importer': { type: 'string' },
      'dry-run': { type: 'boolean' }, help: { type: 'boolean' },
    } });
    if (values.help) { console.log(help); return; }
    return publishClientRelease(values);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { publishClientRelease, loadPlan, gatewayOrigin };
