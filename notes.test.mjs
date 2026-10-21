import assert from 'node:assert/strict';
import test from 'node:test';

import { overflowNames, parseNotes, renderSource, splitOverflow, storyboard } from './notes.mjs';

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
