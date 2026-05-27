# Development guide

## Repository layout

```
sdd-review-action/
├── .github/workflows/
│   ├── review-rfc.yml      ← reusable workflow (public entry point)
│   ├── ci.yml              ← unit tests, syntax check
│   └── smoke-e2e.yml       ← manual end-to-end smoke against fixture
├── jobs/
│   ├── codex/              ← Codex critic Bun script
│   └── merge/              ← deterministic merger + PR comment renderer
├── prompts/
│   └── adversarial-rfc.md  ← shared adversarial prompt (v1)
├── tests/
│   ├── fixtures/           ← sample RFC + rubric + oracle
│   └── snapshot/           ← prompt SHA256 snapshot test
└── docs/
```

## Local iteration

### Unit tests only (no LLM)

```bash
cd jobs/codex && bun test
cd jobs/merge && bun test
cd tests/snapshot && bun test
```

### Run the Codex critic locally against the fixture

```bash
cd jobs/codex
bun run review-rfc.ts \
  --rfc ../../tests/fixtures/sample-rfc.md \
  --criteria ../../tests/fixtures/eval-criteria.yaml \
  --prompt ../../prompts/adversarial-rfc.md \
  --out /tmp/codex.json \
  --reasoning medium
cat /tmp/codex.json | jq .
```

Requires `OPENAI_API_KEY` in env or `~/.codex/.env`.

### Run the merger locally with two reports

```bash
cd jobs/merge
bun run merge-cli.ts \
  --claude /tmp/claude.json \
  --codex /tmp/codex.json \
  --out-md /tmp/merged.md \
  --out-json /tmp/merged.json
cat /tmp/merged.md
```

### Simulate the full workflow locally with `act`

Install: `brew install act` (or see https://github.com/nektos/act)

```bash
# Create .secrets file (gitignored)
cat > .secrets <<EOF
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
EOF

act workflow_dispatch -W .github/workflows/smoke-e2e.yml \
  --secret-file .secrets \
  -P ubuntu-latest=catthehacker/ubuntu:act-latest
```

## Editing the prompt

`prompts/adversarial-rfc.md` is protected by a SHA256 snapshot test (`tests/snapshot/prompt-snapshot.test.ts`). Workflow:

1. Edit `prompts/adversarial-rfc.md`.
2. Run `shasum -a 256 prompts/adversarial-rfc.md`.
3. Update `EXPECTED_HASH` in the snapshot test with the new value.
4. In the PR description, explain *why* the prompt changed (what was unclear, what was over-specified, what new failure mode was caught).
5. Run smoke E2E manually before merging to confirm the new prompt still surfaces oracle findings.

## Releasing

The release process uses two tags:
- **Immutable patch tag** (`v1.0.X`) — created once per release, never moved.
- **Floating major tag** (`v1`) — repointed at each new release so consumers tracking `@v1` get updates automatically.

### Steps

1. Confirm `main` is green on CI and smoke E2E has passed against the fixture.
2. Create the immutable patch tag:
   ```bash
   git tag -a v1.0.X -m "Release notes summary"
   git push origin v1.0.X
   ```
3. Reassign the floating `v1` tag to the new commit. This is a force-update of an existing tag and **requires explicit confirmation** before pushing — overwrites the previous `v1` for all downstream consumers. Use `gh release create` to handle this safely (it creates a release that can be edited), or coordinate the tag move manually with the team.
4. Create a GitHub Release pointing to `v1.0.X` so consumers see the changelog.

### Bumping rules

- `v1.0.x` patch: bug fixes in merger, prompt tweaks, no contract change.
- `v1.x.0` minor: new optional inputs added (default keeps prior behavior).
- `v2.0.0` major: breaking change to inputs/outputs schema, removal of a critic, etc.
