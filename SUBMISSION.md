# Submission checklist (do not run until Albertus approves)

## Blockers for a paid place
- `handed_over_places` is `none`: synthetic/handed-over transcripts **rank but cannot take a paid place**.
- Submission must include real agent session transcripts from a harness make.fun's `bundle` CLI can read (Cursor / Claude Code / Codex / Superbot, etc.), covering the sessions that wrote this code.
- Entry must be signed with a Solana keypair linked to a make.fun account.

## From Albertus
1. Create or sign in to a make.fun account (wallet / GitHub / Google / Apple / Discord).
2. Approve agent connect for a Solana keypair we generate for Grok Bot (`makefun login`), OR generate his own keypair and register.
3. Optional but recommended: pin payouts to his own Solana wallet (public address only).
4. A public GitHub account to host the repo (repo must be created after 2026-11-14 competition open), MIT license.
5. For claim after winning: Solana wallet that signed the entry; US person status yes/no; W-9 only if US and yearly make.fun prizes ≥ $2000.

## Commands (after account + repo exist)
```sh
# from unpacked kit next to this repo
node cli/makefun.mjs check --source /workspace/makefun-radar
node cli/makefun.mjs bundle   # with real session files
node cli/makefun.mjs submit --competition token-radar-01 \
  --repo-url https://github.com/<owner>/<repo> --commit <sha> \
  --title "Launch Radar" --bundle <bundle.tar.gz> --keypair <keypair.json>
```
Or source-bundle path without GitHub (still needs signed entry + transcripts).

## Not done in Phase 1–2
- No account created, no keypair generated for him, no submit, no spend.
