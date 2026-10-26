# Release video

[![release](https://img.shields.io/github/v/release/oxygenframe/release-video-action)](https://github.com/oxygenframe/release-video-action/releases)
[![license](https://img.shields.io/badge/license-MIT%20or%20Apache--2.0-blue)](#license)
[![made with oxframe](https://img.shields.io/badge/made%20with-oxframe-e13238)](https://oxframe.dev)

[![A release video made by this Action: the Added section in green, its changes written on word by word](https://oxframe.dev/media/0.20.3/gallery/release.jpg)](https://oxframe.dev/media/0.20.3/gallery/release.mp4)

A GitHub Action that turns a release's notes into a short oxframe video and
attaches the MP4 to the release. By default there is no model call: the version opens it, each
section gets its heading in its color (added green, fixed blue, changed
yellow, breaking red), and its changes are written on word by word, with a
short halo over each one as it completes, over a calm sea along the bottom.

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
      - uses: oxygenframe/release-video-action@v1.3.1
        with:
          portrait: true
```

`oxframe check` runs first. Changes share a card only while they fit above
the sea; a card that still cannot fit its text is split into two cards and
checked again, not clipped. Each change holds long enough to read. The end card says
"made with oxframe" unless `credit` is `false`. A `[theme]` table in the
repository's `oxframe.toml` is copied onto the generated project.

The frame is 16:9. `portrait: true` renders 1080×1920 instead.

A release created with `GITHUB_TOKEN` does not start other workflows, so
`on: release` never runs for it. Render it in the job that creates it, or
any time later, with `tag`; the notes are read from the release:

```yaml
      - run: gh release create "$GITHUB_REF_NAME" --notes-file notes.md
      - uses: oxygenframe/release-video-action@v1.3.1
        with:
          tag: ${{ github.ref_name }}
```

`notes` renders text of your own instead of the release's notes.

## A scene designed by Claude

With `anthropic-api-key`, Claude reads the notes, comes up with a visual
treatment for them (a diagram of what was fixed, a before and after, a
counter) and writes the scene from the generated project's agent docs.
`oxframe check` reviews each version, and its report goes back to Claude
until the scene passes (at most five tries). If none passes, or the call
fails, the template above renders the notes as usual. The treatment is
printed in the job log.

```yaml
      - uses: oxygenframe/release-video-action@v1.4.0
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          # model: claude-opus-5-5
```

Each video is one to five Claude requests with the oxframe docs as a cached
prompt.

The generated project builds the oxframe SDK. The build is cached between
runs (per CLI version), so only the first video after a new oxframe release
compiles it.

## License

Licensed under either of MIT or Apache-2.0 at your option.
