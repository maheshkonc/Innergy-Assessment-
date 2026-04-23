# Innergy — Full-Spectrum Leadership Coach (V1 MVP)

Multi-tenant, WhatsApp-delivered AI leadership diagnostic. V1 = diagnostic + results + coach handoff for the Innergy tenant (coach: Rashmi Sharma), architected so V2 real-time AI coaching can sit on top without re-platforming.

Source of truth: [`prd phase 1.pdf`](./prd%20phase%201.pdf) (PRD v3.0, 20 April 2026). When PRD and this file conflict, PRD wins — update this file.

## Product shape

- **Channel**: WhatsApp (Meta Cloud API). V1 is WhatsApp-only — no mobile app, no web chat.
- **Users**: Leader (end user), Coach, Tenant admin, Super admin (Innergy ops).
- **Flow**: QR scan → welcome (3 msgs) → name + org capture → 25 Qs across 3 sections → results (3 dimension msgs + overall + circle image) → debrief CTA → coach booking → LinkedIn close.
- **Instrument**: `innergy_fls_v1` — 25 Qs (Cognitive Clarity 8, Relational Influence 9, Inner Mastery 8). Max 123 (38 + 45 + 40) pending §12 open items.

## Architectural rules

1. **Nothing hardcoded** (PRD §6). Every question, option, score, band, template, LLM prompt, brand asset lives in the DB and is editable via admin UI. Code holds only the state machine, scoring arithmetic, provider integrations, and tenancy enforcement.
2. **Multi-tenant by default** (FR-1.1). Every domain row carries `tenant_id`. No cross-tenant reads except super admin. Enforce at app layer AND Postgres RLS.
3. **Scoring is pure** (FR-4.4/4.5). Given answers + `instrument_version_id`, results are deterministic and reproducible. Every `result` row pins the `instrument_version_id` — retroactive content edits create a new version, not mutation.
4. **Providers behind interfaces**: `MessagingProvider`, `LLMProvider`, `STTProvider`, `TTSProvider`. Swappable without touching the state machine.
5. **Template engine fails loud**: missing variables error at render time (§6.3). Never silently ship `{{name}}` to a user.
6. **LLM interpretation has a hard contract + fallback**: JSON schema from §6.4, per-message char cap, fallback to Template mode on any deviation (FR-5.2).

## Tech stack (V1)

| Concern | Choice |
|---|---|
| Runtime | Node 20 + TypeScript |
| Framework | Next.js 15 (App Router) — API routes for WhatsApp webhook + admin UI in one app |
| DB | PostgreSQL 16 + Prisma, RLS policies per tenant |
| Queue | BullMQ + Redis — abandonment reminders, coach notifications, LLM retries |
| LLM | Anthropic Claude (`@anthropic-ai/sdk`) |
| WhatsApp | Meta Cloud API (direct HTTP) |
| STT | OpenAI Whisper (swappable) |
| TTS | ElevenLabs (swappable) |
| Image | `sharp` + SVG template → PNG |
| Auth | NextAuth (OIDC-ready for SSO; MFA for super admin) |
| UI | Tailwind + shadcn/ui |
| Validation | Zod |
| Testing | Vitest + Playwright (for admin UI) |
| Observability | Pino structured logs, OpenTelemetry hooks |

## Repo layout

```
src/
  app/
    api/
      whatsapp/webhook/route.ts   # inbound webhook + tenant routing
      whatsapp/verify/route.ts    # Meta webhook verification
      admin/.../route.ts          # admin REST endpoints
    admin/                        # admin dashboard pages
    (auth)/                       # sign-in pages
  core/
    state-machine/                # deterministic bot FSM (welcome → ... → close)
    scoring/                      # pure scoring + band lookup
    interpretation/               # template engine + LLM mode + fallback
    templates/                    # template resolver (tenant override → global)
    tenancy/                      # tenant resolver from inbound payload
    safety/                       # escalation detector (keywords + LLM classifier)
  providers/
    messaging/                    # WhatsApp Cloud API adapter
    llm/                          # Anthropic adapter
    stt/                          # Whisper adapter
    tts/                          # ElevenLabs adapter
    image/                        # SVG → PNG renderer
  workers/
    abandonment.ts                # 24h / 48h timers
    notifications.ts              # coach notification with retry
    llm.ts                        # LLM calls with timeout + fallback
  db/
    schema.prisma
    seed/
      innergy_fls_v1.ts           # seeds §7 content
prisma/
  migrations/
tests/
  scoring.spec.ts                 # §11 acceptance #3 fixture
  state-machine.spec.ts
docs/
  prd.md -> link to PRD PDFs
```

## Data model (reference — see PRD §8 for full)

Core entities: `tenant`, `coach`, `tenant_coach`, `feature_flag`, `instrument`, `instrument_version`, `tenant_instrument`, `dimension`, `section`, `question`, `option`, `dimension_band`, `overall_band`, `message_template` (with `tenant_id` nullable = global default), `llm_prompt_template`, `user`, `session`, `answer`, `result`, `notification`, `audit_log`, `event`.

Template lookup precedence: **tenant override → global default**. Missing both = render error.

## V1 seed content (Innergy)

- **Instrument**: `innergy_fls_v1`, version 1.
- **Dimensions** in display order: Cognitive Clarity, Relational Influence, Inner Mastery.
- **Questions + scores**: exactly as PRD §7.1 / §7.2 / §7.3.
- **Bands**: §7.1 Section A scaled to max 38 (pending §12.1), §7.2 source-direct, §7.3 scaled-to-40, §7.4 overall scaled-to-123.
- **Coach**: Rashmi Sharma. Booking URL + notification channel TBC (§12.9).
- **Feature flags (Innergy V1)**: `voice_enabled=true`, `llm_interpretation=false` (Template mode for launch, per §12.5 recommendation), `email_capture=false`, `dynamic_image_gen=false` (static fallback first, §12.10).

## Non-negotiables (acceptance criteria — PRD §11)

1. Two tenants, two QR codes, zero cross-tenant leakage.
2. End-to-end flow: scan → 25 Qs → 3 dimension msgs + overall + circle + CTA + coaching-interest + close.
3. Scoring matches the reference fixture exactly.
4. Template mode renders. LLM mode conforms to JSON schema, forced failure falls back in time.
5. Voice input answers any Q (incl. name/org) including "option B" / "bee" / "I'd say B" normalisation.
6. `VOICE ON` toggles TTS for long-form msgs; short msgs stay text-only.
7. Publishing a new instrument version: new sessions use new; in-flight sessions stay on their pinned version.
8. Coach notified within 5 min of coaching-interest YES.
9. 24h idle → one reminder; +48h silence → session closes.
10. `RESULTS` re-sends latest results.
11. Escalation phrases halt flow, send safe-handoff, notify super admin + coach.
12. Every content/config edit hits `audit_log` with before/after diff.
13. Admin analytics show tenant-scoped funnel + distributions within 15 min.

## Out of scope for V1 (PRD §13)

AI coaching conversations, KB upload + RAG, manager/360, team aggregates, payments, mobile app, Slack/Teams, cross-tenant benchmarks, tenant self-signup.

## Open items blocking production seed (PRD §12)

Captured as TODO comments in [`src/db/seed/innergy_fls_v1.ts`](./src/db/seed/innergy_fls_v1.ts). Don't publish the Innergy instrument to production until Rashmi signs off on §12.1 (Section A max), §12.2 (Inner Mastery Q8 variant), §12.3/12.4 (band calibration), §12.7 (escalation phrases), §12.9 (coach notification channel).

## Conventions

- **Commits**: conventional commits (`feat:`, `fix:`, `chore:`).
- **Branches**: `main` is deployable; feature branches `feat/<short-name>`.
- **Env**: `.env.example` tracked; real `.env` never committed. Secrets via secrets manager in prod (PRD §9.2).
- **Logs**: structured JSON, `tenant_id` + `session_id` + `user_id_hash` on every line.
- **PII**: phone numbers stored as salted SHA-256 hash (`whatsapp_phone_hash`); raw retained only for in-flight routing. Voice transcripts retained 30 days by default.

## Commands (once scaffolded)

```bash
pnpm install
pnpm db:migrate             # prisma migrate dev
pnpm db:seed                # seed Innergy v1 content
pnpm dev                    # Next.js + workers (turbo)
pnpm test                   # vitest
pnpm lint
```

## Coding principles (Karpathy)

Behavioural guidelines — bias toward caution over speed. For trivial tasks, use judgement. Full source: [`andrej-karpathy-skills/CLAUDE.md`](./andrej-karpathy-skills/CLAUDE.md).

### 1. Think before coding — don't assume, don't hide confusion, surface tradeoffs

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.
- **Before altering the schema, adding a new column, or introducing a new abstraction: surface the tradeoff to the user first.**

### 2. Simplicity first — minimum code that solves the problem, nothing speculative

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
- Ask: *"Would a senior engineer say this is overcomplicated?"* If yes, simplify.
- **In this repo specifically: prefer DB-driven `MessageTemplate` rows over hardcoded string-building when user-facing copy is involved (see PRD §6: nothing hardcoded).**

### 3. Surgical changes — touch only what you must, clean up only your own mess

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables/functions that YOUR changes made unused. Don't remove pre-existing dead code unless asked.
- The test: every changed line should trace directly to the user's request.

### 4. Goal-driven execution — define success criteria, loop until verified

- Transform tasks into verifiable goals:
  - "Add validation" → "Write tests for invalid inputs, then make them pass"
  - "Fix the bug" → "Write a test that reproduces it, then make it pass"
  - "Refactor X" → "Ensure tests pass before and after"
- For multi-step tasks, state a brief plan:
  1. [Step] → verify: [check]
  2. [Step] → verify: [check]
- **Verification bar for this repo: `npx tsc --noEmit` clean AND `npx vitest run` all green before reporting a task done.**

**These principles are working if:** fewer unnecessary diff lines, fewer rewrites from overcomplication, and clarifying questions arrive before implementation — not after mistakes.
