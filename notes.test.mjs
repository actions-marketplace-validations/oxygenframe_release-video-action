import assert from 'node:assert/strict';
import test from 'node:test';

import { chunks, overflowNames, parseNotes, renderSource, splitOverflow, storyboard } from './notes.mjs';

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

test('a long list is several cards and a short one is a title', () => {
  const cards = storyboard(parseNotes(notes), { maxItems: 2 });
  assert.equal(cards[0].kind, 'title');
  assert.equal(cards[0].title, 'Added');
  assert.equal(cards[1].kind, 'list');
  assert.deepEqual(cards[1].items, ['fade between scenes', 'slide left']);
  assert.deepEqual(cards[2].items, ['a wipe']);
  assert.equal(cards[3].kind, 'title');
  assert.equal(cards[3].subtitle, 'One crash on the canvas.');
});

test('the scene waits on a transition and names every card', () => {
  const source = renderSource({
    repo: 'oxygenframe/oxframe',
    version: 'v0.6.0',
    cards: storyboard(parseNotes(notes), { maxItems: 4 }),
    portrait: true,
  });
  assert.match(source, /TitleCard::new\("v0\.6\.0"\)\.subtitle\("oxygenframe\/oxframe"\)/);
  assert.match(source, /transition\(Transition::slide\(Dir::Left\)\)\.await/);
  assert.match(source, /BulletList::new\(\[/);
  assert.match(source, /EndCard::new\("v0\.6\.0"\)\.note\("made with oxframe"\)/);
  assert.match(source, /transition\(Transition::fade\(\)\)\.await/);
  assert.match(source, /\.size\(1080, 1920\)/);
  assert.match(source, /\.main\(\);/);
  assert.match(source, /\.name\("section_0"\)/);
  assert.doesNotMatch(source, /wait_for\(0\.[0-9]/);
  assert.match(source, /wait_for\(1\.0\)\.await/);
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
  assert.match(source, /TitleCard::new\("Say \\"hi\\""\)/);
  assert.match(source, /\.subtitle\("a \\"b\\""\)/);
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
    ['section_0', 'section_1', 'section_2'],
  );
});

test('only text_overflow on a section card asks for a split', () => {
  const names = overflowNames({
    issues: [
      { rule: 'text_overflow', severity: 'error', node: 'section_1' },
      { rule: 'text_overflow', severity: 'warning', node: 'section_2' },
      { rule: 'low_contrast', severity: 'error', node: 'section_0' },
    ],
  });
  assert.deepEqual(names, ['section_1']);
});

test('a long paragraph becomes several title cards, cut between sentences', () => {
  const long =
    'Shaders can read what is already drawn. A lens gets wet over the frame, a node ripples, and a scene gives way through rising water. All three run on the CPU, so a check and a render without a GPU paint them.';
  const cards = storyboard([{ heading: 'Release', items: [long] }]);
  assert.ok(cards.length > 1);
  for (const card of cards) {
    assert.equal(card.kind, 'title');
    assert.equal(card.title, 'Release');
    assert.ok(card.subtitle.length <= 160, card.subtitle);
  }
  assert.equal(cards.map((c) => c.subtitle).join(' '), long);
  assert.ok(cards[0].subtitle.endsWith('.'));
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
