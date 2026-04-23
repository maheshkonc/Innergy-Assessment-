# Innergy — Full-Spectrum Leadership Coach (V1)

Multi-tenant WhatsApp-delivered leadership diagnostic + admin dashboard. See [`CLAUDE.md`](./CLAUDE.md) for the engineering guide and [`prd phase 1.pdf`](./prd%20phase%201.pdf) for the product spec (PRD v3.0).

## Quick start

```bash
pnpm install
cp .env.example .env          # fill in WhatsApp / Anthropic / DB creds
pnpm db:migrate
pnpm db:seed                  # seeds Innergy FLS v1 content
pnpm dev                      # Next.js at http://localhost:3000
```

In a second shell:

```bash
pnpm worker:abandonment
pnpm worker:notifications
```

## Layout

See `CLAUDE.md` — §Repo layout.

## Tests

```bash
pnpm test
```

Scoring fixture (`tests/scoring.spec.ts`) is the authoritative check for PRD §11 acceptance #3.
# Innergy-Assessment-
