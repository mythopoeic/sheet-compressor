# sheet-compressor

Pluggable, multi-language implementations of the SpreadsheetLLM paper's **SheetCompressor**
encoding. Compression core + LLM-reader prompt templates only — no LLM calls, no provider SDKs.
See [README.md](./README.md) and the spec in [`spec/`](./spec).

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues in `mythopoeic/sheet-compressor`; use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary — role name equals label string (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root (created lazily). See `docs/agents/domain.md`.
