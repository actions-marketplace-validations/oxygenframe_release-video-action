// GitHub Action entry. Release notes become a project, `oxframe check`
// splits a card that does not fit, then `oxframe render --cpu` writes the MP4.
// With ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN, Claude designs the scene
// instead (storyboard.mjs);
// the template is the fallback.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { overflowNames, parseNotes, renderSource, splitOverflow, storyboard } from './notes.mjs';

// A Claude Code token (`claude setup-token`) passed as the API key: use it
// as what it is.
if (process.env.ANTHROPIC_API_KEY?.trim().startsWith('sk-ant-oat')) {
  process.env.CLAUDE_CODE_OAUTH_TOKEN ||= process.env.ANTHROPIC_API_KEY.trim();
  delete process.env.ANTHROPIC_API_KEY;
}

const repo = process.env.RELEASE_REPO || 'oxygenframe/oxframe';
const version = process.env.RELEASE_TAG || 'release';
// With only a tag (`tag:` input), read the notes of that release.
const body = process.env.RELEASE_BODY || releaseNotes(version);
const portrait = process.env.PORTRAIT === 'true';
const credit = process.env.CREDIT !== 'false';

function releaseNotes(tag) {
  if (!process.env.GITHUB_TOKEN || tag === 'release') return '';
  const r = spawnSync('gh', ['release', 'view', tag, '--json', 'body', '-q', '.body'], {
    encoding: 'utf8',
  });
  return r.status === 0 ? r.stdout : '';
}

const root = mkdtempSync(join(tmpdir(), 'oxframe-release-'));
const bin = process.env.OXFRAME_BIN || 'oxframe';

run('init', [bin, 'init', 'release'], root);
const project = join(root, 'release');
copyTheme(process.cwd(), project);

let cards = storyboard(parseNotes(body), { portrait });
for (let attempt = 0; attempt < 6; attempt++) {
  writeFileSync(join(project, 'src', 'main.rs'), renderSource({ repo, version, cards, credit, portrait }));
  const check = run('check', [bin, 'check'], project);
  if (check.status === 0) break;
  const report = readReport(project);
  const names = overflowNames(report);
  const smaller = names.length ? splitOverflow(cards, names) : null;
  if (!smaller) {
    process.stderr.write(check.stdout + check.stderr);
    process.exit(check.status || 1);
  }
  cards = smaller;
}

const agent =
  process.env.AGENT_COMMAND || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN;
if (agent && body.trim()) {
  const template = readFileSync(join(project, 'src', 'main.rs'), 'utf8');
  const { storyboardScene } = await import('./storyboard.mjs');
  let designed = false;
  try {
    designed = await storyboardScene({
      notes: body,
      repo,
      version,
      portrait,
      credit,
      project,
      bin,
      template,
      model: process.env.MODEL || 'claude-opus-5-5',
    });
  } catch (err) {
    console.error(`storyboard: ${err?.message ?? err}`);
  }
  if (!designed) {
    console.error('storyboard: rendering the template instead');
    writeFileSync(join(project, 'src', 'main.rs'), template);
  }
}

run('render', [bin, 'render', '--cpu'], project);
const mp4 = join(project, 'out', 'release.mp4');
if (!existsSync(mp4)) {
  console.error('oxframe render did not write out/release.mp4');
  process.exit(1);
}
mkdirSync('out', { recursive: true });
cpSync(mp4, 'out/release.mp4');
if (process.env.GITHUB_TOKEN && process.env.RELEASE_TAG) {
  run('upload', ['gh', 'release', 'upload', version, 'out/release.mp4', '--clobber'], process.cwd());
}

/** Copy `[theme]` from the repository that is releasing, when it has one. */
function copyTheme(from, project) {
  const path = join(from, 'oxframe.toml');
  if (!existsSync(path)) return;
  const source = readFileSync(path, 'utf8');
  const theme = source.match(/\[theme\][\s\S]*?(?=\n\[|$)/);
  if (!theme) return;
  const dest = join(project, 'oxframe.toml');
  const current = existsSync(dest) ? readFileSync(dest, 'utf8') : '';
  const replaced = current.match(/\[theme\][\s\S]*?(?=\n\[|$)/)
    ? current.replace(/\[theme\][\s\S]*?(?=\n\[|$)/, theme[0].trimEnd() + '\n')
    : `${current.trimEnd()}\n\n${theme[0].trimEnd()}\n`;
  writeFileSync(dest, replaced);
}

function readReport(project) {
  const path = join(project, 'out', 'check', 'report.json');
  if (!existsSync(path)) return { issues: [] };
  return JSON.parse(readFileSync(path, 'utf8'));
}

function run(label, cmd, cwd) {
  const result = spawnSync(cmd[0], cmd.slice(1), { cwd, encoding: 'utf8' });
  if (result.error) {
    console.error(`${label}: ${result.error.message}`);
    process.exit(1);
  }
  if (label !== 'check' && result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    process.exit(result.status || 1);
  }
  return result;
}
