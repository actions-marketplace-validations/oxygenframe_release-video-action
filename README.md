# Release video

[![release](https://img.shields.io/github/v/release/oxygenframe/release-video-action)](https://github.com/oxygenframe/release-video-action/releases)
[![license](https://img.shields.io/badge/license-MIT%20or%20Apache--2.0-blue)](#license)
[![made with oxframe](https://img.shields.io/badge/made%20with-oxframe-e13238)](https://oxframe.dev)

[![A release video made by this Action: the version as a title, the changes as a list, then an end card](https://oxframe.dev/media/0.20.0/gallery/release.jpg)](https://oxframe.dev/media/0.20.0/gallery/release.mp4)

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
      - uses: oxygenframe/release-video-action@v1.2.0
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
      - uses: oxygenframe/release-video-action@v1.2.0
        with:
          tag: ${{ github.ref_name }}
```

`notes` renders text of your own instead of the release's notes.

The generated project builds the oxframe SDK. The build is cached between
runs (per CLI version), so only the first video after a new oxframe release
compiles it.

## License

Licensed under either of MIT or Apache-2.0 at your option.
