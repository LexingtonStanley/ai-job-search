# reed-cli

Zero-dependency Bun CLI behind the `reed-search` skill. See `../SKILL.md` for
usage and `../url-reference.md` for the API contract.

```bash
bun install        # optional: dev types only
bun test           # mocked, network-free
bun run typecheck
```

Credentials come from the environment or a `.env` file in the working directory
(the repo root when run by `/scrape`). See `.env.example` at the repo root.
