// With an Anthropic API key: Claude reads the release notes, comes up with a
// visual treatment for them, and writes the scene; `oxframe check` reviews
// each version and its report goes back to Claude until the scene passes.
// Returns false when no scene passed, and the caller renders the template.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ATTEMPTS = 5;

/**
 * @param {{ notes: string, repo: string, version: string, portrait: boolean,
 *   credit: boolean, project: string, bin: string, template: string, model: string }} spec
 */
export async function storyboardScene(spec) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();

  // The project's own agent docs (written by `oxframe init`) teach the API
  // of the SDK version it builds with.
  const docs = ['AGENTS.md', '.claude/skills/oxframe/SKILL.md', '.claude/skills/oxframe/reference.md']
    .map((path) => join(spec.project, path))
    .filter(existsSync)
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n\n---\n\n');
  const system = [
    {
      type: 'text',
      text:
        'You make short release videos with oxframe, a Rust library for code-driven ' +
        'video. Everything you write is the src/main.rs of a project created by ' +
        '`oxframe init`; it builds against the oxframe version these docs describe, ' +
        'with no extra features or crates, and must pass `oxframe check`.\n\n' +
        docs,
      cache_control: { type: 'ephemeral' },
    },
  ];

  const frame = spec.portrait ? '1080×1920 (portrait: `.size(1080, 1920)`)' : '1920×1080';
  const messages = [
    {
      role: 'user',
      content: `Come up with a visual treatment of this changelog that can be built in oxframe, then build it.

Release: ${spec.repo} ${spec.version}

<changelog>
${spec.notes.trim()}
</changelog>

First write the treatment: for each scene, what is on screen, what moves and why it shows the change (a diagram of what was fixed, a before and after, a counter, a timeline), and how long it holds. Make it something a developer would watch to the end, not a list of bullets; every change in the notes still gets its moment, in words a viewer can read.

Then write the whole src/main.rs in one \`\`\`rust block.
- ${frame}, 20 to 60 seconds; text holds long enough to read.
- Open on ${spec.repo} ${spec.version}.${spec.credit ? ' End on a card that says "made with oxframe".' : ''}
- Only the API in the docs above; no files, images, fonts, voice, video or network.
- Colors from the theme, so a repository's [theme] applies.

This is the plain version the action renders without you, a scene that builds and passes check:

\`\`\`rust
${spec.template}
\`\`\``,
    },
  ];

  const main = join(spec.project, 'src', 'main.rs');
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const reply = await client.beta.messages
      .stream({
        model: spec.model,
        max_tokens: 64000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
        system,
        messages,
        betas: ['server-side-fallback-2026-07-01'],
        // @ts-expect-error The SDK's types may not know the default fallback yet.
        fallbacks: 'default',
      })
      .finalMessage();
    if (reply.stop_reason === 'refusal') {
      console.error('storyboard: the model declined the request');
      return false;
    }
    const text = reply.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    if (attempt === 1) console.log(`storyboard (${spec.model}):\n${text.split('```rust')[0].trim()}\n`);
    const code = lastRustBlock(text);
    if (!code) {
      console.error(`storyboard: attempt ${attempt} has no rust block`);
      if (reply.stop_reason === 'max_tokens') return false;
      messages.push({ role: 'assistant', content: reply.content });
      messages.push({ role: 'user', content: 'Send the whole src/main.rs in one ```rust block.' });
      continue;
    }
    writeFileSync(main, code);
    const check = spawnSync(spec.bin, ['check'], { cwd: spec.project, encoding: 'utf8' });
    if (check.status === 0) {
      console.log(`storyboard: the scene passed oxframe check (attempt ${attempt})`);
      return true;
    }
    const report = (check.stdout + check.stderr).slice(-12000);
    console.error(`storyboard: attempt ${attempt} failed oxframe check`);
    messages.push({ role: 'assistant', content: reply.content });
    messages.push({
      role: 'user',
      content: `\`oxframe check\` failed:\n\n\`\`\`\n${report}\n\`\`\`\n\nFix it and send the whole src/main.rs again in one \`\`\`rust block.`,
    });
  }
  return false;
}

/** The last ```rust block of a reply. */
export function lastRustBlock(text) {
  const blocks = [...String(text).matchAll(/```rust[^\n]*\n([\s\S]*?)```/g)];
  return blocks.length ? blocks[blocks.length - 1][1] : null;
}
