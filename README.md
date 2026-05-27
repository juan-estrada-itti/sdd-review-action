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

## Secrets

- `ANTHROPIC_API_KEY` (required)
- `OPENAI_API_KEY` (required)

## Outputs

- `p1_count`, `p2_count`, `p3_count`
- `agreement_score` (0-1, or null if one critic failed)
- `report_url`

See [docs/PROMPT.md](docs/PROMPT.md) for the adversarial prompt and rationale.
See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for how to iterate locally.
