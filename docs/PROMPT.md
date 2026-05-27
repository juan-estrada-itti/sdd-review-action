# Why this prompt looks like this

## Adversarial stance, not "helpful assistant"

LLMs default to praise and politeness. For review, that's a bug. The prompt explicitly tells the critic to assume bad faith on the author's part. This was validated in a prior experiment: adversarial framing surfaced 7 real contradictions in a production RFC that a neutral review missed (ADR ID swap, schema contradictions, duplicate section numbers, PRD acceptance criteria with no architectural answer).

## JSON output, not prose

Two critics need to be merged. Free-form prose can't be matched. The JSON schema forces both critics into a comparable shape (`assertion_id` as the matching key).

## `assertion_id` from rubric, not invented

The rubric is the contract between the SDD framework and the review. Letting the critic invent assertion IDs would break the merger's matching logic.

## Why "evidence" is mandatory

A finding without a quote is a hallucination risk. Requiring a literal quote forces the critic to ground its claim in the document, and makes it auditable by the human reviewer.

## Why "suggested_fix" must be specific

"Add more detail" is useless. The fix is the actionable output of the review. It must name what to change and where. The prompt rejects generic phrasing.

## Why the prompt is the same for Claude and Codex

The `agreement_score` metric (% of findings where both critics coincide) is only meaningful if both critics evaluate against identical criteria. Different prompts = different signals = uninterpretable metric.

## Why placeholders use `{{NAME}}` syntax

The reusable workflow renders `{{RFC_PATH}}` and `{{CRITERIA_PATH}}` per consumer-repo configuration. Mustache-style placeholders are unambiguous and easy to `sed` in shell.
