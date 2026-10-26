// Turns GitHub release notes into an oxframe scene.
//
// The version, then one scene per section: its heading in the section's
// color and the changes written on word by word, a short halo over each one,
// earlier ones stepping back; then an end card. A paragraph longer than a
// card holds is split on sentences up front. A card that `oxframe check`
// rejects (text_overflow, or text out of the frame) is split in half and
// generated again.

/** @typedef {{ heading: string, items: string[] }} Section */
/** @typedef {{ name: string, kind: 'title' | 'list' | 'end', title: string, subtitle: string, items: string[] }} Card */

const MAX_ITEMS = 3;

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
  // A line that follows a bullet continues it (notes are often wrapped at
  // 80 columns), and so does an indented line after a blank one. Code
  // blocks are left out: they do not read on a card.
  let inItem = false;
  let afterBlank = false;
  let inFence = false;
  for (const raw of String(markdown ?? '').split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const line = raw.trim();
    if (!line) {
      afterBlank = true;
      continue;
    }
    const wasBlank = afterBlank;
    afterBlank = false;
    if (line.startsWith('# ')) {
      inItem = false;
      continue;
    }
    const heading = /^#{2,3}\s+(.+?)\s*#*$/.exec(line);
    if (heading) {
      open(inline(heading[1]));
      inItem = false;
      continue;
    }
    const item = /^(?:[-*+]|\d+[.)])\s+(.+)$/.exec(line);
    if (item) {
      if (!current) open('');
      current.items.push(inline(item[1]));
      inItem = true;
      continue;
    }
    if (inItem && (!wasBlank || /^\s{2,}/.test(raw))) {
      const items = current.items;
      items[items.length - 1] += ` ${inline(line)}`;
      continue;
    }
    inItem = false;
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

/** Cards in play order. Long lists become several cards; nothing is clipped.
 * Text before the first heading follows the card with the version, so it is
 * titled "What's new" rather than repeating the version. */
/**
 * How tall a list of changes is, in pixels, before it is drawn: lines of
 * 56 px text wrap at about 52 characters in 16:9 and 24 in 9:16.
 * @param {string[]} items @param {boolean} portrait
 */
export function listHeight(items, portrait = false) {
  const perLine = portrait ? 24 : 52;
  const lines = items.map((item) => Math.max(1, Math.ceil(item.length / perLine)));
  return lines.reduce((sum, n) => sum + n * 70, 0) + Math.max(0, items.length - 1) * 44;
}

/** Room for the list between the heading and the sea, in pixels. */
const ROOM = { landscape: 640, portrait: 1200 };

export function storyboard(sections, { maxItems = MAX_ITEMS, portrait = false } = {}) {
  const room = portrait ? ROOM.portrait : ROOM.landscape;
  /** @type {Card[]} */
  const cards = [];
  let n = 0;
  for (const section of sections) {
    const heading = section.heading || "What's new";
    if (!section.items.length) {
      cards.push(titleCard(`section_${n++}`, heading, ''));
      continue;
    }
    if (section.items.length === 1 && listHeight(section.items, portrait) > room) {
      // A paragraph taller than the room goes on several cards, cut between
      // sentences.
      const perCard = Math.floor(room / 70) * (portrait ? 24 : 52);
      for (const part of chunks(section.items[0], perCard)) {
        cards.push(titleCard(`section_${n++}`, heading, part));
      }
      continue;
    }
    // As many changes per card as fit above the sea, at most `maxItems`.
    let group = [];
    const flush = () => {
      if (!group.length) return;
      cards.push({ name: `section_${n++}`, kind: 'list', title: heading, subtitle: '', items: group });
      group = [];
    };
    for (const item of section.items) {
      if (listHeight([item], portrait) > room) {
        // One change taller than the room: its own cards, cut between
        // sentences, one bullet each.
        flush();
        const perCard = Math.floor(room / 70) * (portrait ? 24 : 52);
        for (const part of chunks(item, perCard)) {
          cards.push({ name: `section_${n++}`, kind: 'list', title: heading, subtitle: '', items: [part] });
        }
        continue;
      }
      if (group.length && (group.length >= maxItems || listHeight([...group, item], portrait) > room))
        flush();
      group.push(item);
    }
    flush();
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
  if (card.kind === 'list' && card.items.length === 1) {
    // One bullet that does not fit: split the bullet, keep the heading.
    const split = splitWords(card.items[0]);
    if (!split) return null;
    return [
      { ...card, items: [split[0]] },
      { ...card, items: [split[1]] },
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

/**
 * `text` in pieces of at most `max` characters, cut between sentences, or
 * between words inside a sentence that is longer than that.
 * @param {string} text @param {number} max @returns {string[]}
 */
export function chunks(text, max) {
  const pieces = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/).filter(Boolean)) {
    let rest = sentence;
    while (rest.length > max) {
      const cut = rest.lastIndexOf(' ', max);
      if (cut <= 0) break;
      pieces.push(rest.slice(0, cut));
      rest = rest.slice(cut + 1);
    }
    pieces.push(rest);
  }
  const out = [];
  for (const piece of pieces) {
    const last = out.length - 1;
    if (last >= 0 && out[last].length + 1 + piece.length <= max) out[last] += ` ${piece}`;
    else out.push(piece);
  }
  return out.length ? out : [text];
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
    const fits = ['text_overflow', 'out_of_frame', 'text_overlap'];
    if (!fits.includes(issue.rule) || issue.severity === 'warning')
      continue;
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
  const names = ['version', ...spec.cards.map((card) => card.name), 'credits'];
  return `//! Release notes, rendered.
use oxframe::nodes::Ink;
use oxframe::prelude::*;

${HELPERS}

${scenes.join('\n\n')}

fn main() {
    Project::new("release")${size}
        ${names.map((name) => `.scene(${name}())`).join('\n        ')}
        .main();
}
`;
}

/** The section's color, from its heading. */
export function tone(heading) {
  const h = heading.toLowerCase();
  if (/break|remov|deprecat|security|danger/.test(h)) return 'Danger';
  if (/add|new|feature/.test(h)) return 'Success';
  if (/fix|bug/.test(h)) return 'Accent';
  if (/chang|improv|updat|perf|faster/.test(h)) return 'Warning';
  return 'Accent';
}

// The same helpers as the `release` example in oxframe-sdk.
const HELPERS = `/// Where each word of \`text\` ends, as a fraction of its drawn glyphs
/// (\`end\` counts glyphs, and spaces draw none).
fn word_ends(text: &str) -> Vec<f64> {
    let total = text.chars().filter(|c| !c.is_whitespace()).count().max(1) as f64;
    let mut seen = 0;
    text.split_whitespace()
        .map(|word| {
            seen += word.chars().count();
            seen as f64 / total
        })
        .collect()
}

/// The text color at rest: a step towards the background, so a halo can
/// brighten it.
fn rest() -> Color {
    let theme = oxframe::nodes::current_theme();
    theme.ink(Text).mix(theme.ink(Background), 0.18)
}

/// A short halo over \`line\`: its glow and brightness go up, then back.
async fn halo(line: Txt, glow: Color) {
    let peak = oxframe::nodes::current_theme().ink(Text);
    all((
        line.shadow_blur().to(16.0, 0.16),
        line.shadow_color().to(glow, 0.16),
        line.fill().to(peak, 0.16),
    ))
    .await;
    all((
        line.shadow_blur().to(0.0, 0.34),
        line.shadow_color().to(glow.with_alpha(0.0), 0.34),
        line.fill().to(rest(), 0.34),
    ))
    .await;
}

/// A calm sea along the bottom edge; it keeps moving while the text holds.
fn sea(view: View) {
    let h = f64::from(view.size().1);
    view.add(
        shaders::waves()
            .amp(0.06)
            .speed(0.5)
            .deep(Accent)
            .foam(Background)
            .width(pct(100))
            .height(h * 0.11)
            .y(h / 2.0 - h * 0.055)
            .opacity(0.35),
    );
}

/// One section: its heading in its color, then the changes one by one,
/// written on word by word with a halo, earlier ones stepping back.
async fn section(view: View, name: &str, heading: &str, tone: Ink, items: &[&str]) {
    let (w, h) = view.size();
    let (w, h) = (f64::from(w), f64::from(h));
    let width = w - 280.0;
    let glow = oxframe::nodes::current_theme().ink(tone);
    // Added before the transition, so the heading comes in with the scene.
    let title = view.add(
        Txt::new()
            .text(heading)
            .font_size(72.0)
            .weight(800.0)
            .fill(tone)
            .max_width(width)
            .to_edge(Edge::Left)
            .y(-h * 0.34)
            .name(name),
    );
    transition(Transition::slide(Dir::Left)).await;
    let list = view.add(
        Layout::new()
            .column()
            .gap(44.0)
            .align(LayoutAlign::Start)
            .width(width)
            .to_edge(Edge::Left)
            .name(name),
    );
    let mut rows = Vec::new();
    for &text in items {
        let row = list.add(
            Layout::new()
                .row()
                .gap(30.0)
                .align(LayoutAlign::Start)
                .justify(Justify::Start)
                .width(width),
        );
        let mark = row.add(Rect::new().size(20.0).radius(5.0).fill(tone).margin(20.0).scale(0.0));
        let line = row.add(
            Txt::new()
                .text(text)
                .font_size(56.0)
                .weight(600.0)
                .line_height(1.25)
                .max_width(width - 110.0)
                .fill(rest())
                .end(0.0)
                .glow(glow.with_alpha(0.0), 0.0)
                .name(name),
        );
        rows.push((row, mark, line, text));
    }
    // The list hangs under the heading, so a long one grows downwards.
    let top = title.y().get() + title.size().1 / 2.0 + 56.0;
    list.y().set(top + list.size().1 / 2.0);
    for (i, &(_, mark, line, text)) in rows.iter().enumerate() {
        if i > 0 {
            rows[i - 1].0.opacity().to(0.45, 0.3).await;
        }
        mark.scale().to(Vec2::new(1.0, 1.0), 0.25).ease(presets::OUT_BACK).await;
        for end in word_ends(text) {
            line.end().to(end, 0.06).ease(presets::OUT_CUBIC).await;
        }
        halo(line, glow).await;
        // Time to read the rest of it.
        wait_for((text.chars().count() as f64 / 22.0).clamp(1.2, 4.0)).await;
    }
    if rows.is_empty() {
        wait_for(1.2).await;
    }
}

/// "made by", the oxframe logo and "Oxframe" on one line, faded in.
async fn made_by(view: View, y: f64) {
    let row = view.add(Group::new().y(y).opacity(0.0));
    let lead = row.add(Txt::new().text("made by").h2().fill(Muted));
    let name = row.add(Txt::new().text("Oxframe").h2().weight(700.0).fill(Text));
    // The logo: the favicon's square and the circle that overlaps it.
    let line = lead.size().1;
    let (height, gap) = (line * 0.6, line * 0.26);
    let unit = height / 14.0;
    let (lw, nw, mark) = (lead.size().0, name.size().0, 26.0 * unit);
    let left = -(lw + gap + mark + gap + nw) / 2.0;
    lead.x().set(left + lw / 2.0);
    let x = left + lw + gap;
    row.add(Rect::new().size(height).radius(3.0 * unit).fill(color!("#e13238")).x(x + height / 2.0));
    row.add(Circle::new().size(height).fill(color!("#68abdf")).x(x + 19.0 * unit));
    name.x().set(x + mark + gap + nw / 2.0);
    row.fade_in().await;
}

/// The version in large type, its halo, and a line under it.
async fn big(view: View, above: &str, version: &str, credit: bool) {
    let top = view.add(Txt::new().text(above).h2().fill(Muted).y(-110.0).opacity(0.0));
    let label = view.add(
        Txt::new()
            .text(version)
            .font_size(150.0)
            .weight(800.0)
            .max_width(f64::from(view.size().0) - 200.0)
            .y(20.0)
            .fill(rest())
            .opacity(0.0),
    );
    all((top.fade_in(), label.slide_in(Side::Bottom))).await;
    halo(label, oxframe::nodes::current_theme().ink(Accent)).await;
    if credit {
        made_by(view, 150.0).await;
    }
    // oxframe check flags text that is readable and on screen for under 0.8s.
    wait_for(1.2).await;
}`;

function opening(repo, version) {
  return `#[oxframe::scene]
async fn version(view: View) {
    sea(view);
    big(view, ${rust(repo)}, ${rust(version)}, false).await;
}`;
}

/** @param {Card} card */
function scene(card) {
  const items =
    card.kind === 'list' ? card.items : card.subtitle ? [card.subtitle] : [];
  return `#[oxframe::scene]
async fn ${card.name}(view: View) {
    sea(view);
    section(view, ${rust(card.name)}, ${rust(card.title)}, ${tone(card.title)}, &[${items.map(rust).join(', ')}]).await;
}`;
}

/** @param {string} version @param {boolean} credit */
function closing(version, credit) {
  return `#[oxframe::scene]
async fn credits(view: View) {
    sea(view);
    transition(Transition::fade()).await;
    big(view, "", ${rust(version)}, ${credit}).await;
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
