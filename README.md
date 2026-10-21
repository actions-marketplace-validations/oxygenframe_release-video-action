# Release video

A GitHub Action that turns a release's notes into a short oxframe video and
attaches the MP4 to the release. No model call: headings and lists become
title cards and bullet lists, with a slide between them.

```yaml
on:
  release:
    types: [published]
jobs:
  video:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: oxygenframe/release-video-action@v1.1.0
        with:
          portrait: true
```

`oxframe check` runs first. A card that cannot fit its text is split into two
cards and checked again, not clipped. Each card then holds for a second, so a
line that is long enough to read is not flagged as too fast. The end card says
"made with oxframe" unless `credit` is `false`. A `[theme]` table in the
repository's `oxframe.toml` is copied onto the generated project.

The frame is 16:9. `portrait: true` renders 1080×1920 instead.

A release created with `GITHUB_TOKEN` does not start other workflows, so
`on: release` never runs for it. Render it in the job that creates it, or
any time later, with `tag`; the notes are read from the release:

```yaml
      - run: gh release create "$GITHUB_REF_NAME" --notes-file notes.md
      - uses: oxygenframe/release-video-action@v1.1.0
        with:
          tag: ${{ github.ref_name }}
```

`notes` renders text of your own instead of the release's notes.

Licensed under either of MIT or Apache-2.0 at your option.
