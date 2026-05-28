# sdd-review-action

Adversarial review of SDD RFCs as a GitHub reusable workflow. Runs Claude and Codex critics in parallel, merges findings, and posts a unified PR comment.

## Usage

In any SDD repo, add `.github/workflows/sdd-review.yml`:

```yaml
name: SDD review
on:
  pull_request:
    paths: ['arch/RFC.md']

jobs:
  review:
    uses: ittidigital/sdd-review-action/.github/workflows/review-rfc.yml@v1
    with:
      rfc_path: arch/RFC.md
      criteria_path: criteria/eval-criteria.yaml
    secrets:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      OPENAI_API_KEY:    ${{ secrets.OPENAI_API_KEY }}
```

## Inputs

| Input | Default | Description |
|---|---|---|
| `rfc_path` | `arch/RFC.md` | Path to RFC to review |
| `criteria_path` | `criteria/eval-criteria.yaml` | Rubric YAML |
| `comment_mode` | `summary` | `summary` (post merged PR comment) / `none` (artifact only) |
| `fail_on_p1` | `false` | Exit non-zero when P1 findings exist |
| `reasoning` | `medium` | `low` / `medium` / `high` |
| `claude_model` | `claude-sonnet-4-6` | Override Claude model |
| `codex_model` | `gpt-5` | Override Codex model |
| `enable_claude` | `true` | Set `false` to skip Claude critic (e.g. no `ANTHROPIC_API_KEY`) |
| `enable_codex` | `true` | Set `false` to skip Codex critic (e.g. no `OPENAI_API_KEY`) |

## Secrets

- `ANTHROPIC_API_KEY` — required only when `enable_claude: true` (default)
- `OPENAI_API_KEY` — required only when `enable_codex: true` (default)

### Running with only one critic

If you only have one of the two API keys, set the corresponding `enable_*: false`:

```yaml
jobs:
  review:
    uses: ittidigital/sdd-review-action/.github/workflows/review-rfc.yml@v1
    with:
      rfc_path: arch/RFC.md
      enable_claude: false   # only run Codex
    secrets:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

The merged report will indicate the unavailable critic and `agreement_score` will be `null` (no second opinion to compare against).

## Outputs

- `p1_count`, `p2_count`, `p3_count`
- `agreement_score` (0-1, or null if one critic failed)
- `report_url`

## Docs

- **[docs/COMO-FUNCIONA.md](docs/COMO-FUNCIONA.md)** — **empezá acá** · explicación para equipos técnicos desde primeros principios (15-20 min)
- [docs/AGENTES-Y-HARNESS.md](docs/AGENTES-Y-HARNESS.md) — arquitectura técnica detallada de los agentes y sus harnesses
- [docs/PROMPT.md](docs/PROMPT.md) — el prompt adversarial y por qué está escrito así
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — cómo iterar localmente y releasing
- [docs/WORKSHOP-1H.md](docs/WORKSHOP-1H.md) — guía facilitador-ready de 1h para onboardar equipos (metodología Stanford d.school + Karpathy)
