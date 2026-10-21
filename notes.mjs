// Turns GitHub release notes into an oxframe scene.
//
// Title card, one card per section, bullet lists when a section has several
// lines, then an end card. A list that `oxframe check` rejects as
// text_overflow is split in half and generated again.

/** @typedef {{ heading: string, items: string[] }} Section */
/** @typedef {{ name: string, kind: 'title' | 'list' | 'end', title: string, subtitle: string, items: string[] }} Card */

const MAX_ITEMS = 4;

/** Release notes as sections. A heading owns the bullets (or the paragraph) under it. */
export function parseNotes(markdown) {
  /** @type {{ heading: string, items: string[], prose: string[] }[]} */
  const sections = [];
  /** @type {{ heading: string, items: string[], prose: string[] } | null} */
  let current = null;
  const open = (heading) => {
    current = { heading, items: [], prose: [] };
    sections.push(current);
  };
  for (const raw of String(markdown ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('# ')) continue;
    const heading = /^#{2,3}\s+(.+?)\s*#*$/.exec(line);
    if (heading) {
      open(inline(heading[1]));
      continue;
    }
    const item = /^(?:[-*+]|\d+[.)])\s+(.+)$/.exec(line);
    if (item) {
      if (!current) open('');
      current.items.push(inline(item[1]));
      continue;
    }
    if (!current) open('');
    current.prose.push(inline(line));
  }
  return sections
    .map((section) => ({
      heading: section.heading,
      items: section.items.length ? section.items : section.prose.length ? [section.prose.join(' ')] : [],
    }))
    .filter((section) => section.heading || section.items.length);
}

/** Cards in play order. Long lists become several cards; nothing is clipped. */
export function storyboard(sections, { maxItems = MAX_ITEMS } = {}) {
  /** @type {Card[]} */
  const cards = [];
  let n = 0;
  for (const section of sections) {
    const heading = section.heading || 'Release';
    if (!section.items.length) {
      cards.push(titleCard(`section_${n++}`, heading, ''));
      continue;
    }
    if (section.items.length === 1) {
      cards.push(titleCard(`section_${n++}`, heading, section.items[0]));
      continue;
    }
    cards.push(titleCard(`section_${n++}`, heading, ''));
    for (let i = 0; i < section.items.length; i += maxItems) {
      cards.push({
        name: `section_${n++}`,
        kind: 'list',
        title: heading,
        subtitle: '',
        items: section.items.slice(i, i + maxItems),
      });
    }
  }
  return cards;
}

/**
 * @param {string} name
 * @param {string} title
 * @param {string} subtitle
 * @returns {Card}
 */
function titleCard(name, title, subtitle) {
  return { name, kind: 'title', title, subtitle, items: [] };
}

/** Halve the list `oxframe check` could not fit. A single long line is split on a word. */
export function splitOverflow(cards, names) {
  const wanted = new Set(names);
  /** @type {Card[]} */
  const next = [];
  let changed = false;
  for (const card of cards) {
    if (!wanted.has(card.name)) {
      next.push(card);
      continue;
    }
    const parts = halves(card);
    if (!parts) {
      next.push(card);
      continue;
    }
    changed = true;
    next.push(...parts);
  }
  return changed ? rename(next) : null;
}

/** @param {Card} card @returns {Card[] | null} */
function halves(card) {
  if (card.kind === 'list' && card.items.length > 1) {
    const mid = Math.ceil(card.items.length / 2);
    return [
      { ...card, items: card.items.slice(0, mid) },
      { ...card, kind: 'list', items: card.items.slice(mid) },
    ];
  }
  const text = card.subtitle || card.title;
  const split = splitWords(text);
  if (!split) return null;
  if (card.subtitle) return [{ ...card, subtitle: split[0] }, { ...card, kind: 'title', title: split[1], subtitle: '' }];
  return [
    { ...card, title: split[0] },
    { ...card, title: split[1] },
  ];
}

/** @param {string} text @returns {[string, string] | null} */
function splitWords(text) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}

/** @param {Card[]} cards */
function rename(cards) {
  return cards.map((card, i) => ({ ...card, name: `section_${i}` }));
}

/** Scene names whose `text_overflow` error points at a named card. */
export function overflowNames(report) {
  const names = [];
  for (const issue of report?.issues ?? []) {
    if (issue.rule !== 'text_overflow' || issue.severity === 'warning') continue;
    if (typeof issue.node === 'string' && issue.node.startsWith('section_')) names.push(issue.node);
  }
  return [...new Set(names)];
}

/**
 * @param {{ repo: string, version: string, cards: Card[], credit?: boolean, portrait?: boolean }} spec
 */
export function renderSource(spec) {
  const credit = spec.credit !== false;
  const scenes = [
    opening(spec.repo, spec.version),
    ...spec.cards.map(scene),
    closing(spec.version, credit),
  ];
  const size = spec.portrait ? '\n    .size(1080, 1920)' : '';
  const names = ['opening', ...spec.cards.map((card) => card.name), 'closing'];
  return `//! Release notes, rendered.
use oxframe::prelude::*;

${scenes.join('\n\n')}

fn main() {
    Project::new("release")${size}
        ${names.map((name) => `.scene(${name}())`).join('\n        ')}
        .main();
}
`;
}

/** @param {string} repo @param {string} version */
function opening(repo, version) {
  return `#[oxframe::scene]
async fn opening(view: View) {
    let card = view.add(TitleCard::new(${rust(version)}).subtitle(${rust(repo)}).name("opening"));
    card.enter().await;
    card.next().await;
    wait_for(0.4).await;
}`;
}

/** @param {Card} card */
function scene(card) {
  const built = card.kind === 'list' ? listBody(card) : titleBody(card);
  const reveals =
    card.kind === 'list'
      ? card.items.map(() => '    card.next().await;\n').join('')
      : card.subtitle
        ? '    card.next().await;\n'
        : '';
  return `#[oxframe::scene]
async fn ${card.name}(view: View) {
    transition(Transition::slide(Dir::Left)).await;
    ${built}
    card.enter().await;
${reveals}    wait_for(0.3).await;
}`;
}

/** @param {Card} card */
function titleBody(card) {
  const subtitle = card.subtitle ? `.subtitle(${rust(card.subtitle)})` : '';
  return `let card = view.add(TitleCard::new(${rust(card.title)})${subtitle}.name(${rust(card.name)}));`;
}

/** @param {Card} card */
function listBody(card) {
  const items = card.items.map((item) => rust(item)).join(', ');
  return `let card = view.add(BulletList::new([${items}]).name(${rust(card.name)}));`;
}

/** @param {string} version @param {boolean} credit */
function closing(version, credit) {
  const note = credit ? `.note("made with oxframe")` : '';
  const next = credit ? '    card.next().await;\n' : '';
  return `#[oxframe::scene]
async fn closing(view: View) {
    let card = view.add(EndCard::new(${rust(version)})${note}.name("closing"));
    transition(Transition::fade()).await;
    card.enter().await;
${next}    wait_for(0.6).await;
}`;
}

/** A Rust string literal. */
export function rust(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;
}

/** Undo the inline markdown a card cannot draw. */
function inline(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    .trim();
}
