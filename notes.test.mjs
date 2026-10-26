import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chunks,
  overflowNames,
  parseNotes,
  renderSource,
  splitOverflow,
  storyboard,
  tone,
  listHeight,
} from './notes.mjs';

const notes = `
# oxframe 0.6.0

## Added
- fade between scenes
- [slide](https://oxframe.dev) left
- a \`wipe\`

## Fixed
One crash on the canvas.
`;

test('release notes become a heading and its bullets', () => {
  const sections = parseNotes(notes);
  assert.deepEqual(sections, [
    { heading: 'Added', items: ['fade between scenes', 'slide left', 'a wipe'] },
    { heading: 'Fixed', items: ['One crash on the canvas.'] },
  ]);
});

test('a bullet wrapped onto the next lines stays one bullet', () => {
  const wrapped = `
## Added
- Every issue in \`report.json\` has \`docs\`: the link to its rule on
  https://oxframe.dev/docs/check-rules, with how to fix it.
- A second change.

## Breaking
- \`code.code()\` is no longer a signal:

  \`\`\`rust
  code.code().to(next, 1.0).await;
  \`\`\`

  The old \`.to()\` typed the text.

Upgrade with \`oxframe upgrade\`.
`;
  assert.deepEqual(parseNotes(wrapped), [
    {
      heading: 'Added',
      items: [
        'Every issue in report.json has docs: the link to its rule on https://oxframe.dev/docs/check-rules, with how to fix it.',
        'A second change.',
      ],
    },
    {
      heading: 'Breaking',
      items: ['code.code() is no longer a signal: The old .to() typed the text.'],
    },
  ]);
});

test('a long list is several cards and a paragraph is one line', () => {
  const cards = storyboard(parseNotes(notes), { maxItems: 2 });
  assert.equal(cards[0].kind, 'list');
  assert.equal(cards[0].title, 'Added');
  assert.deepEqual(cards[0].items, ['fade between scenes', 'slide left']);
  assert.deepEqual(cards[1].items, ['a wipe']);
  assert.equal(cards[1].title, 'Added');
  assert.equal(cards[2].title, 'Fixed');
  assert.deepEqual(cards[2].items, ['One crash on the canvas.']);
});

test('long changes share a card only while they fit above the sea', () => {
  const long = 'x'.repeat(250);
  const short = 'a short change';
  const cards = storyboard([{ heading: 'Added', items: [long, long, short, short] }]);
  assert.deepEqual(
    cards.map((card) => card.items.length),
    [1, 3],
  );
  assert.ok(listHeight([long]) <= 640);
  // A 9:16 frame is narrower: lines wrap sooner, and it is taller.
  assert.ok(listHeight([short], true) >= listHeight([short]));
  assert.deepEqual(
    storyboard([{ heading: 'Added', items: [short, short, short, short] }], { maxItems: 3 }).map(
      (card) => card.items.length,
    ),
    [3, 1],
  );
});

test('a section takes its color from its heading', () => {
  assert.equal(tone('Added'), 'Success');
  assert.equal(tone('New features'), 'Success');
  assert.equal(tone('Fixed'), 'Accent');
  assert.equal(tone('Changed'), 'Warning');
  assert.equal(tone('Breaking changes'), 'Danger');
  assert.equal(tone("What's new"), 'Success');
  assert.equal(tone('Notes'), 'Accent');
});

test('the scene waits on a transition and names every card', () => {
  const source = renderSource({
    repo: 'oxygenframe/oxframe',
    version: 'v0.6.0',
    cards: storyboard(parseNotes(notes), { maxItems: 4 }),
    portrait: true,
  });
  assert.match(source, /big\(view, "oxygenframe\/oxframe", "v0\.6\.0", ""\)/);
  assert.match(source, /transition\(Transition::slide\(Dir::Left\)\)\.await/);
  assert.match(source, /section\(view, "section_0", "Added", Success, &\["fade between scenes", /);
  assert.match(source, /big\(view, "", "v0\.6\.0", "made with oxframe"\)/);
  assert.match(source, /transition\(Transition::fade\(\)\)\.await/);
  assert.match(source, /\.size\(1080, 1920\)/);
  assert.match(source, /\.main\(\);/);
  assert.match(source, /\.name\(name\)/);
  assert.doesNotMatch(source, /wait_for\(0\.[0-9]/);
  assert.match(source, /wait_for\(1\.2\)\.await/);
});

test('the credit can be left off', () => {
  const source = renderSource({
    repo: 'oxygenframe/oxframe',
    version: 'v0.6.0',
    cards: [],
    credit: false,
  });
  assert.doesNotMatch(source, /made with oxframe/);
});

test('quotes in a note stay inside the Rust string', () => {
  const source = renderSource({
    repo: 'a "b"',
    version: 'v1',
    cards: storyboard([{ heading: 'Say "hi"', items: [] }]),
  });
  assert.match(source, /section\(view, "section_0", "Say \\"hi\\"", Accent, &\[\]\)/);
  assert.match(source, /big\(view, "a \\"b\\"", "v1", ""\)/);
});

test('a list check failed is split in half and renamed', () => {
  const cards = storyboard([{ heading: 'Added', items: ['a', 'b', 'c', 'd'] }], { maxItems: 4 });
  const list = cards.find((card) => card.kind === 'list');
  const next = splitOverflow(cards, [list.name]);
  assert.ok(next);
  const lists = next.filter((card) => card.kind === 'list');
  assert.deepEqual(lists[0].items, ['a', 'b']);
  assert.deepEqual(lists[1].items, ['c', 'd']);
  assert.deepEqual(
    next.map((card) => card.name),
    ['section_0', 'section_1'],
  );
});

test('text that does not fit a section card asks for a split', () => {
  const names = overflowNames({
    issues: [
      { rule: 'text_overflow', severity: 'error', node: 'section_1' },
      { rule: 'out_of_frame', severity: 'error', node: 'section_3' },
      { rule: 'text_overlap', severity: 'error', node: 'section_4' },
      { rule: 'text_overflow', severity: 'warning', node: 'section_2' },
      { rule: 'low_contrast', severity: 'error', node: 'section_0' },
    ],
  });
  assert.deepEqual(names, ['section_1', 'section_3', 'section_4']);
});

test('a paragraph taller than a card is cut between sentences', () => {
  const sentence =
    'Shaders can read what is already drawn, and a lens gets wet over the whole frame. ';
  const long = sentence.repeat(12).trim();
  const cards = storyboard([{ heading: 'Release', items: [long] }]);
  assert.ok(cards.length > 1);
  for (const card of cards) {
    assert.equal(card.kind, 'title');
    assert.equal(card.title, 'Release');
    assert.ok(listHeight([card.subtitle]) <= 640, card.subtitle);
    assert.ok(card.subtitle.endsWith('.'), card.subtitle);
  }
  assert.equal(cards.map((c) => c.subtitle).join(' '), long);
  // One that fits stays whole.
  assert.deepEqual(storyboard([{ heading: 'Release', items: [sentence.trim()] }])[0].items, [
    sentence.trim(),
  ]);
});

test('a sentence longer than a card is cut between words', () => {
  const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
  const parts = chunks(words, 50);
  assert.ok(parts.every((p) => p.length <= 50));
  assert.equal(parts.join(' '), words);
});

test('text before the first heading is "What\'s new", not a second version card', () => {
  const cards = storyboard(parseNotes('Parallel rendering.\n\n### Added\n\n- jobs'));
  assert.equal(cards[0].title, "What's new");
});

test('one change taller than a card among short ones gets its own cards', () => {
  const long = Array.from({ length: 12 }, (_, i) => `Sentence ${i} says a fair amount about the change.`).join(' ');
  const cards = storyboard([{ heading: 'Added', items: ['short one', long, 'short two'] }]);
  const lists = cards.filter((card) => card.kind === 'list');
  assert.ok(lists.length >= 4, `${lists.length} cards`);
  assert.deepEqual(lists[0].items, ['short one']);
  assert.deepEqual(lists.at(-1).items, ['short two']);
  for (const card of lists.slice(1, -1)) {
    assert.equal(card.items.length, 1);
    assert.equal(card.title, 'Added');
  }
  assert.equal(lists.slice(1, -1).map((card) => card.items[0]).join(' '), long);
});

test('a one-bullet card that check rejects splits the bullet, not the heading', () => {
  const cards = [{ name: 'section_0', kind: 'list', title: 'Added', subtitle: '', items: ['alpha beta gamma delta'] }];
  const next = splitOverflow(cards, ['section_0']);
  assert.ok(next);
  assert.deepEqual(
    next.map((card) => [card.title, card.items]),
    [
      ['Added', ['alpha beta']],
      ['Added', ['gamma delta']],
    ],
  );
});

test('the last rust block of a reply is the scene', async () => {
  const { lastRustBlock } = await import('./storyboard.mjs');
  const reply = 'Plan\n```rust\nfn a() {}\n```\nFixed:\n```rust\nfn main() {}\n```\n';
  assert.equal(lastRustBlock(reply), 'fn main() {}\n');
  assert.equal(lastRustBlock('no code'), null);
});
