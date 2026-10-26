# Release video

[![release](https://img.shields.io/github/v/release/oxygenframe/release-video-action)](https://github.com/oxygenframe/release-video-action/releases)
[![license](https://img.shields.io/badge/license-MIT%20or%20Apache--2.0-blue)](#license)
[![made with oxframe](https://img.shields.io/badge/made%20with-oxframe-e13238)](https://oxframe.dev)

[![A release video made by this Action: the Added section in green, its changes written on word by word](https://oxframe.dev/media/0.20.3/gallery/release.jpg)](https://oxframe.dev/media/0.20.3/gallery/release.mp4)

A GitHub Action that turns a release's notes into a short oxframe video and
attaches the MP4 to the release.

**Connect an LLM agent for a video worth watching.** With one (Claude Code,
Codex, the Anthropic API or any agent CLI), the agent reads the notes, comes
up with a visual treatment for this release (a diagram of what was fixed, a
before and after, a counter) and writes the oxframe scene; `oxframe check`
reviews it until it passes. See [Connect an agent](#connect-an-agent). Without
one, a template renders the notes: the version opens it, each section gets
its heading in its color (added green, fixed blue, changed yellow, breaking
red), and its changes are written on word by word over a calm sea.

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
      - uses: oxygenframe/release-video-action@v1.6.0
        with:
          # From `claude setup-token` (a Claude subscription); or see below.
          claude-code-oauth-token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
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
      - uses: oxygenframe/release-video-action@v1.6.0
        with:
          tag: ${{ github.ref_name }}
```

`notes` renders text of your own instead of the release's notes.

## Connect an agent

The agent gets the release notes, the generated project's agent docs
(AGENTS.md and the oxframe skill, for the SDK version it builds with) and
the template scene as an example, with the request: come up with a visual
treatment of this changelog that can be built in oxframe, then build it.
`oxframe check` reviews each version, and its report goes back to the agent
until the scene passes (at most five tries). If none passes, or the agent
fails, the template renders the notes as usual. The treatment is printed in
the job log. Pick one of:

**Claude Code with a Claude subscription.** Run `claude setup-token` once on
your machine and store the token it prints (`sk-ant-oat…`) as a secret. The
action installs Claude Code and asks with `claude -p`, no tools.

```yaml
          claude-code-oauth-token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
```

**The Anthropic API.** An API key from the Claude Console:

```yaml
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          # model: claude-opus-5-5
```

**Any other agent CLI** (Codex, Gemini CLI, …). Install and sign it in in an
earlier step; `agent-command` runs in bash, gets the prompt on stdin and
answers on stdout, or writes the answer to `$REPLY_FILE`:

```yaml
      - run: npm install -g @openai/codex
      - uses: oxygenframe/release-video-action@v1.6.0
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        with:
          agent-command: codex exec --skip-git-repo-check --ephemeral -s read-only -o "$REPLY_FILE"
```

A video is one to five agent requests. Use a strong model: the scene is a
whole Rust program against the oxframe API.

The generated project builds the oxframe SDK. The build is cached between
runs (per CLI version), so only the first video after a new oxframe release
compiles it.

## License

Licensed under either of MIT or Apache-2.0 at your option.
