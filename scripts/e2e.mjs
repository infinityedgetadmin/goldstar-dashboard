#!/usr/bin/env node
/**
 * e2e orchestrator (Plan 3 Task 6): builds goldstar-platform's Functions,
 * starts its Firebase emulators (Firestore/Auth/Functions/Storage),
 * seeds the baseline fixtures via the platform repo's own real
 * `scripts/seed-emulator.ts`, runs this repo's Playwright suite against
 * `next dev` (started by playwright.config.ts's `webServer`), then tears
 * the emulators down — success or failure.
 *
 * Requires goldstar-platform checked out as a sibling directory (default
 * `../goldstar-platform` relative to this repo's root) — override with
 * `GOLDSTAR_PLATFORM_DIR` if that's not where it lives.
 *
 * Usage: npm run e2e
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const PLATFORM_DIR = process.env.GOLDSTAR_PLATFORM_DIR
  ? path.resolve(process.env.GOLDSTAR_PLATFORM_DIR)
  : path.resolve(REPO_ROOT, '..', 'goldstar-platform');

/**
 * Carry #53: these were hardcoded, so this suite could not run concurrently with ANY other
 * emulator work — it always took the default ports. They are now offset by `GOLDSTAR_EMU_OFFSET`,
 * the same variable the platform repo's `scripts/emulator-config.mjs` uses, so an agent can run
 * e2e at their assigned offset.
 *
 * `hub` and `logging` are included because firebase-tools starts them for EVERY invocation
 * regardless of `--only`, and leaving them unconfigured makes two concurrent runs race to
 * auto-discover a free port near 4400/4500 (the platform wrapper found this the hard way). They
 * are written into the temp config below with explicit, offset ports.
 */
const BASE_PORTS = { firestore: 8080, auth: 9099, functions: 5001, storage: 9199, hub: 4400, logging: 4500 };

const OFFSET_RAW = process.env.GOLDSTAR_EMU_OFFSET ?? '0';
const OFFSET = Number(OFFSET_RAW);
if (!Number.isInteger(OFFSET)) {
  console.error(`[e2e] GOLDSTAR_EMU_OFFSET must be an integer, got: ${JSON.stringify(OFFSET_RAW)}`);
  process.exit(1);
}
const PORTS = Object.fromEntries(Object.entries(BASE_PORTS).map(([k, v]) => [k, v + OFFSET]));
// Per-offset project id (platform carry #70, Ruling BZ). firebase-tools keeps ONE hub-locator file
// per project id, machine-wide, deleted whenever ANY instance stops — so offsets isolate ports but a
// shared project id lets one run's teardown kill every other run mid-suite. This expression MIRRORS
// goldstar-platform/scripts/emulator-config.mjs exactly (`demo-goldstar` at offset 0, else
// `demo-goldstar-<offset>`); the platform wrapper is the authority and this must not drift from it.
const PROJECT_ID = OFFSET === 0 ? 'demo-goldstar' : `demo-goldstar-${OFFSET}`;
// Exported on process.env so every child spawned below (seed, Playwright, and through Playwright the
// Next dev server via playwright.config.ts) inherits it from the `...process.env` spreads.
process.env.GOLDSTAR_EMU_PROJECT_ID = PROJECT_ID;
/** The four this orchestrator waits on and wires into env; hub/logging are started but not used here. */
const EMULATOR_PORTS = { firestore: PORTS.firestore, auth: PORTS.auth, functions: PORTS.functions, storage: PORTS.storage };

function log(msg) {
  console.log(`[e2e] ${msg}`);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...opts });
    child.on('exit', (code, signal) => {
      if (signal) return reject(new Error(`${cmd} ${args.join(' ')} killed by ${signal}`));
      if (code !== 0) return reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
      resolve();
    });
    child.on('error', reject);
  });
}

/**
 * Carry #41: pre-flight bind check, ported from the platform repo's `scripts/emulator-config.mjs`.
 *
 * A held port previously surfaced here as "Could not start Firestore Emulator, port taken" buried
 * in firebase's own output — or worse, as a suite of unrelated-looking spec failures. Twice in one
 * session the holder was an ORPHANED emulator JVM from an earlier run: firebase-tools does not
 * reliably reap its Java child processes on an abnormal exit, and the survivor keeps listening.
 *
 * This makes that loud and immediate, naming the port, its emulator and the likely cause. It does
 * NOT fix the leak — that is firebase-tools' child-process handling and stays broken; we only stop
 * it from presenting as a mystery.
 *
 * TOCTOU caveat: the probes close before firebase starts, so something could still take a port in
 * the gap. This converts the overwhelmingly common case — already held when the run begins — from
 * a confusing failure into a named one; it cannot make the race impossible.
 */
function probePort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => resolve({ code: err.code ?? 'UNKNOWN' }));
    // `exclusive` so a probe reports a genuine conflict instead of silently sharing the port.
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => resolve({ server }));
  });
}

async function assertPortsFree(ports, { waitMs = 0 } = {}) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const held = await heldPorts(ports);
    if (held.length === 0) return;
    if (Date.now() >= deadline) throw portsHeldError(held);
    await new Promise((r) => setTimeout(r, 500));
  }
}

/** Probes every port at once and returns the ones that are taken. */
async function heldPorts(ports) {
  const entries = Object.entries(ports);
  const held = [];
  const open = [];
  try {
    // All probes are held open together rather than bind-then-close in turn, so a config that
    // computed the SAME port for two emulators is caught too.
    const results = await Promise.all(entries.map(([, port]) => probePort(port)));
    results.forEach((r, i) => (r.server ? open.push(r.server) : held.push({ name: entries[i][0], port: entries[i][1], code: r.code })));
  } finally {
    await Promise.all(open.map((srv) => new Promise((res) => srv.close(() => res()))));
  }
  return held;
}

function portsHeldError(held) {
  const lines = held.map(({ name, port, code }) => `  ${name.padEnd(10)} ${BASE_PORTS[name]} + ${OFFSET} = ${port}   <-- ${code === 'EADDRINUSE' ? 'IN USE' : code}`);
  return new Error(
    `${held.length} emulator port(s) already in use — firebase would fail partway through startup.\n\n` +
      `${lines.join('\n')}\n\n` +
      `Most likely cause, in the order these actually happen:\n` +
      `  1. An ORPHANED emulator process from an earlier run. firebase-tools does not always reap\n` +
      `     its Java emulators on an abnormal exit and the survivor keeps listening. Find and kill it:\n` +
      `       lsof -nP -iTCP:${held[0].port} -sTCP:LISTEN\n` +
      `       kill <pid>\n` +
      `  2. Another session at this same offset (GOLDSTAR_EMU_OFFSET=${OFFSET}). Pick a different one —\n` +
      `     but avoid an offset whose GAP from another in-flight offset equals a pairwise difference\n` +
      `     of the base ports (1, 5, 100, 400, 500, ...): offset 100 puts auth on 9199, the BASE\n` +
      `     storage port.\n` +
      `  3. Something unrelated to Firebase on that port.`,
  );
}

function portOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForPorts(ports, timeoutMs = 120_000) {
  const start = Date.now();
  const names = Object.entries(ports);
  for (;;) {
    const statuses = await Promise.all(names.map(async ([name, port]) => [name, await portOpen(port)]));
    const notReady = statuses.filter(([, ok]) => !ok).map(([name]) => name);
    if (notReady.length === 0) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for emulator ports to open: ${notReady.join(', ')}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function killTree(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        try {
          child.kill('SIGKILL');
        } catch {
          /* already gone */
        }
      }
      resolve();
    }, 15_000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      // Negative pid targets the whole process group `detached: true` created below —
      // `firebase emulators:start` forks child processes (functions runtime, Firestore/
      // Auth jars) that a plain SIGINT to just the parent pid can leave orphaned.
      process.kill(-child.pid, 'SIGINT');
    } catch {
      try {
        child.kill('SIGINT');
      } catch {
        clearTimeout(timer);
        resolve();
      }
    }
  });
}

/**
 * Carry #53: `next dev` (started by playwright.config.ts's webServer) rewrites `next-env.d.ts` to
 * reference `.next/dev/types`, while `next build` writes `.next/types`. So every e2e run left the
 * tree dirty with a one-line change that flips back for the next person who builds — easy to commit
 * by accident, and confusing for two people once it is.
 *
 * Snapshotted before the run and restored after, so a clean tree stays clean. Deliberately only
 * restores when the content actually changed and we have a snapshot, so this never invents a file
 * or clobbers an intentional edit made during the run.
 */
/**
 * `NEXT_PUBLIC_*` values are INLINED at compile time, and Next's dev cache survives between runs.
 * So switching offsets without clearing it serves the PREVIOUS offset's emulator ports to the
 * browser: the harness and the fixtures talk to the new ports, the app in the page talks to the
 * old ones, and four specs fail for no visible reason. Observed exactly that going 0 -> 250; a
 * cold `.next` then passed 14/14, which is what identified the cache rather than the offset.
 *
 * A stamp file records the offset the dev cache was compiled for. Only `.next/dev` is removed, and
 * only when the offset actually changed — repeat runs at the same offset keep their warm cache,
 * and the production build output `check:guest-bundle` reads is left alone.
 *
 * KNOWN CONSEQUENCE: the first run after an offset change recompiles from cold, and a cold Next
 * dev compile of a dashboard route can exceed a spec's 5s assertion timeout. Observed once — the
 * same run passed 14/14 immediately afterwards with the cache warm. If a run right after an offset
 * switch fails on timeouts rather than assertions, re-run before investigating. Not worked around
 * here: the alternatives are raising every spec's timeout (hides real slowness) or pre-warming
 * routes the harness does not own.
 */
function clearDevCacheIfOffsetChanged() {
  const stampPath = path.join(REPO_ROOT, '.next', '.e2e-emulator-offset');
  let previous = null;
  try {
    previous = readFileSync(stampPath, 'utf8').trim();
  } catch {
    previous = null;
  }
  if (previous === String(OFFSET)) return;

  const devDir = path.join(REPO_ROOT, '.next', 'dev');
  if (existsSync(devDir)) {
    log(`emulator offset changed (${previous ?? 'unknown'} -> ${OFFSET}); clearing .next/dev so the app compiles against the new ports`);
    rmSync(devDir, { recursive: true, force: true });
  }
  try {
    mkdirSync(path.dirname(stampPath), { recursive: true });
    writeFileSync(stampPath, `${OFFSET}\n`);
  } catch {
    // A stamp we cannot write just means the next run clears again — wasteful, never wrong.
  }
}

const NEXT_ENV_PATH = path.join(REPO_ROOT, 'next-env.d.ts');
let nextEnvSnapshot = null;

function snapshotNextEnvTypes() {
  try {
    nextEnvSnapshot = readFileSync(NEXT_ENV_PATH, 'utf8');
  } catch {
    nextEnvSnapshot = null;
  }
}

function restoreNextEnvTypes() {
  if (nextEnvSnapshot === null) return;
  try {
    if (readFileSync(NEXT_ENV_PATH, 'utf8') === nextEnvSnapshot) return;
    writeFileSync(NEXT_ENV_PATH, nextEnvSnapshot);
    log('restored next-env.d.ts (next dev rewrites it; see this script\'s note)');
  } catch {
    // best-effort — a failure here must never mask the suite's real result
  }
}

async function main() {
  snapshotNextEnvTypes();
  if (!existsSync(PLATFORM_DIR)) {
    throw new Error(
      `goldstar-platform not found at ${PLATFORM_DIR}. Set GOLDSTAR_PLATFORM_DIR to the checkout's path.`
    );
  }

  log(`platform repo: ${PLATFORM_DIR}`);
  log(`emulator offset: ${OFFSET} -> ${Object.entries(PORTS).map(([k, v]) => `${k}:${v}`).join(' ')}`);

  // Carry #41: checked TWICE, deliberately. Once here so an already-held port fails in a second
  // rather than after a ~30s functions build, and again immediately before spawning firebase —
  // because that build sits between the two, and a check that far ahead of the bind it protects
  // has a 30-second TOCTOU window. Found by running this: a previous run's emulators were still
  // shutting down, this run's early check saw the port free, and firebase then lost the race to
  // the lingering hub. The second check costs milliseconds and closes almost all of that window.
  await assertPortsFree(PORTS);
  clearDevCacheIfOffsetChanged();

  log('building functions...');
  await run('npm', ['run', 'build'], { cwd: path.join(PLATFORM_DIR, 'functions') });

  // An offset run needs its own firebase.json: the ports live in that file, not on the CLI. Written
  // beside the real one (pid-suffixed so two runs can't collide) and removed in the finally below.
  const realConfigPath = path.join(PLATFORM_DIR, 'firebase.json');
  const tempConfigPath = path.join(PLATFORM_DIR, `firebase.e2e-offset-${process.pid}.json`);
  const config = JSON.parse(readFileSync(realConfigPath, 'utf8'));
  config.emulators = { ...(config.emulators ?? {}) };
  for (const [name, port] of Object.entries(PORTS)) {
    const existing = config.emulators[name];
    config.emulators[name] = typeof existing === 'object' && existing !== null ? { ...existing, port } : { port };
  }
  writeFileSync(tempConfigPath, `${JSON.stringify(config, null, 2)}\n`);

  // Second check — see the note on the first. A previous run's teardown is the common holder here,
  // so wait briefly for a port to clear rather than failing on a straggler that is already going.
  await assertPortsFree(PORTS, { waitMs: 15_000 });

  log('starting emulators (firestore, auth, functions, storage)...');
  const emulators = spawn(
    'firebase',
    ['emulators:start', '--project', PROJECT_ID, '--config', tempConfigPath, '--only', 'firestore,auth,functions,storage'],
    { cwd: PLATFORM_DIR, stdio: 'inherit', detached: true }
  );
  let emulatorExited = false;
  emulators.on('exit', () => {
    emulatorExited = true;
  });

  let playwrightExitCode = 1;
  try {
    log('waiting for emulator ports...');
    await waitForPorts(EMULATOR_PORTS);
    if (emulatorExited) throw new Error('Emulators exited before becoming ready.');

    log('seeding baseline fixtures via goldstar-platform/scripts/seed-emulator.ts...');
    await run('npx', ['tsx', 'scripts/seed-emulator.ts'], {
      cwd: PLATFORM_DIR,
      env: {
        ...process.env,
        FIRESTORE_EMULATOR_HOST: `127.0.0.1:${EMULATOR_PORTS.firestore}`,
        FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${EMULATOR_PORTS.auth}`,
        FIREBASE_STORAGE_EMULATOR_HOST: `127.0.0.1:${EMULATOR_PORTS.storage}`,
        GCLOUD_PROJECT: PROJECT_ID,
        GOLDSTAR_EMU_PROJECT_ID: PROJECT_ID,
      },
    });

    log('running Playwright...');
    await run('npx', ['playwright', 'test', ...process.argv.slice(2)], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        // The test process's own Admin SDK fixtures (e2e/fixtures/*.ts) read these...
        FIRESTORE_EMULATOR_HOST: `127.0.0.1:${EMULATOR_PORTS.firestore}`,
        FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${EMULATOR_PORTS.auth}`,
        FIREBASE_STORAGE_EMULATOR_HOST: `127.0.0.1:${EMULATOR_PORTS.storage}`,
        // ...and these reach the BROWSER, via playwright.config.ts's webServer env. The app
        // connects to the emulators client-side, so it needs the offset ports too — the harness
        // knowing them is not enough.
        NEXT_PUBLIC_EMU_FIRESTORE_PORT: String(EMULATOR_PORTS.firestore),
        NEXT_PUBLIC_EMU_AUTH_PORT: String(EMULATOR_PORTS.auth),
        NEXT_PUBLIC_EMU_FUNCTIONS_PORT: String(EMULATOR_PORTS.functions),
        NEXT_PUBLIC_EMU_STORAGE_PORT: String(EMULATOR_PORTS.storage),
      },
    });
    playwrightExitCode = 0;
  } catch (e) {
    console.error(`[e2e] ${e.message}`);
    playwrightExitCode = 1;
  } finally {
    log('tearing down emulators...');
    await killTree(emulators);
    try {
      rmSync(tempConfigPath, { force: true });
    } catch {
      // best-effort — never mask the real exit status
    }
    restoreNextEnvTypes();
  }

  process.exit(playwrightExitCode);
}

main().catch((e) => {
  console.error('[e2e] fatal:', e);
  process.exit(1);
});
