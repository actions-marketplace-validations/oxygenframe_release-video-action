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
      - uses: oxygenframe/release-video-action@v1.0.2
        with:
          portrait: true
```

`oxframe check` runs first. A card that cannot fit its text is split into two
cards and checked again, not clipped. Each card then holds for a second, so a
line that is long enough to read is not flagged as too fast. The end card says
"made with oxframe" unless `credit` is `false`. A `[theme]` table in the
repository's `oxframe.toml` is copied onto the generated project.

The frame is 16:9. `portrait: true` renders 1080×1920 instead.

Licensed under either of MIT or Apache-2.0 at your option.
