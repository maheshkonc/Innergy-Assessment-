// Seeds baseline content: dimensions, both instruments (the individual FLS
// diagnostic and the team edition), global + team message templates, the active
// LLM prompt, and one Innergy tenant bound to both instruments.
// Idempotent — safe to rerun.

import { prisma } from "../client";
import {
  DIM_COGNITIVE,
  DIM_RELATIONAL,
  DIM_INNER,
  INSTRUMENT_ID,
  INSTRUMENT_VERSION_ID,
  INNERGY_V1_SECTIONS,
  SECTION_A_BANDS,
  SECTION_B_BANDS,
  SECTION_C_BANDS,
  OVERALL_BANDS,
} from "./fixtures/innergy_fls_v1";
import {
  TEAM_INSTRUMENT_ID,
  TEAM_INSTRUMENT_VERSION_ID,
  TEAM_TEMPLATE_VARIANT,
  TEAM_V1_SECTIONS,
  TEAM_QUESTION_COUNT,
  TEAM_SECTION_A_BANDS,
  TEAM_SECTION_B_BANDS,
  TEAM_SECTION_C_BANDS,
  TEAM_OVERALL_BANDS,
} from "./fixtures/innergy_team_v1";
import { GLOBAL_MESSAGE_TEMPLATES, type TemplateSeed } from "./fixtures/message_templates";
import { TEAM_MESSAGE_TEMPLATES } from "./fixtures/team_message_templates";
import { LLM_INTERPRETATION_PROMPT_V1 } from "./fixtures/llm_prompt";

// Shape shared by both instrument fixtures — enough for the generic seeder.
interface SeedSection {
  id: string;
  dimensionId: string;
  displayOrder: number;
  introTemplateKey: string;
  questions: ReadonlyArray<{
    id: string;
    sectionId: string;
    stem: string;
    displayOrder: number;
    internalTag?: string;
    options: ReadonlyArray<{
      label: string;
      text: string;
      score: number;
      displayOrder: number;
    }>;
  }>;
}

interface SeedBand {
  minScore: number;
  maxScore: number;
  bandLabel: string;
  interpretationTemplate: string;
  colorHex?: string;
}

async function seedDimensions() {
  const dimensions = [
    // Display names — shown to users and admins. Code keys off internalTag
    // (see core/dimensions.ts), never these strings.
    { id: DIM_COGNITIVE, name: "Cognitive Clarity", internalTag: "cognitive" },
    { id: DIM_RELATIONAL, name: "Relational Influence", internalTag: "relational" },
    { id: DIM_INNER, name: "Inner Mastery", internalTag: "inner" },
  ];
  for (const d of dimensions) {
    await prisma.dimension.upsert({
      where: { id: d.id },
      update: { name: d.name, internalTag: d.internalTag },
      create: d,
    });
  }
  console.log(`✓ seeded ${dimensions.length} dimensions`);
}

/**
 * Seeds one instrument + version + its sections, questions, options and bands.
 * Shared by the individual and team diagnostics — they differ only in content.
 */
async function seedInstrumentVersion(args: {
  instrumentId: string;
  instrumentVersionId: string;
  name: string;
  description: string;
  metadata: Record<string, unknown>;
  sections: ReadonlyArray<SeedSection>;
  bands: ReadonlyArray<{ bands: ReadonlyArray<SeedBand>; dimensionId: string }>;
  overallBands: ReadonlyArray<SeedBand>;
  label: string;
}) {
  const { instrumentId, instrumentVersionId } = args;

  await prisma.instrument.upsert({
    where: { id: instrumentId },
    update: { name: args.name, description: args.description },
    create: { id: instrumentId, name: args.name, description: args.description },
  });

  await prisma.instrumentVersion.upsert({
    where: { id: instrumentVersionId },
    update: { metadata: args.metadata as object },
    create: {
      id: instrumentVersionId,
      instrumentId,
      versionNumber: 1,
      publishedAt: new Date(),
      publishedBy: "seed",
      metadata: args.metadata as object,
    },
  });

  // Mark this as the current version.
  await prisma.instrument.update({
    where: { id: instrumentId },
    data: { currentVersionId: instrumentVersionId },
  });

  for (const section of args.sections) {
    await prisma.section.upsert({
      where: { id: section.id },
      update: {
        dimensionId: section.dimensionId,
        displayOrder: section.displayOrder,
        introTemplateKey: section.introTemplateKey,
      },
      create: {
        id: section.id,
        instrumentVersionId,
        dimensionId: section.dimensionId,
        displayOrder: section.displayOrder,
        introTemplateKey: section.introTemplateKey,
      },
    });

    for (const q of section.questions) {
      await prisma.question.upsert({
        where: { id: q.id },
        update: { stem: q.stem, displayOrder: q.displayOrder, internalTag: q.internalTag ?? null },
        create: {
          id: q.id,
          sectionId: q.sectionId,
          stem: q.stem,
          displayOrder: q.displayOrder,
          internalTag: q.internalTag ?? null,
        },
      });

      for (const o of q.options) {
        const optId = `${q.id}_${o.label.toLowerCase()}`;
        await prisma.option.upsert({
          where: { id: optId },
          update: { text: o.text, score: o.score, displayOrder: o.displayOrder },
          create: {
            id: optId,
            questionId: q.id,
            label: o.label as "A" | "B" | "C" | "D" | "E",
            text: o.text,
            score: o.score,
            displayOrder: o.displayOrder,
          },
        });
      }
    }
  }

  // Clear + reseed bands (cheap; always 3 × 4 + 1 × 4 rows).
  await prisma.dimensionBand.deleteMany({ where: { instrumentVersionId } });
  await prisma.overallBand.deleteMany({ where: { instrumentVersionId } });

  for (const group of args.bands) {
    for (const b of group.bands) {
      await prisma.dimensionBand.create({
        data: {
          instrumentVersionId,
          dimensionId: group.dimensionId,
          minScore: b.minScore,
          maxScore: b.maxScore,
          bandLabel: b.bandLabel,
          interpretationTemplate: b.interpretationTemplate,
          bandColorHex: b.colorHex,
        },
      });
    }
  }
  for (const b of args.overallBands) {
    await prisma.overallBand.create({
      data: {
        instrumentVersionId,
        minScore: b.minScore,
        maxScore: b.maxScore,
        bandLabel: b.bandLabel,
        interpretationTemplate: b.interpretationTemplate,
      },
    });
  }
  console.log(`✓ seeded ${args.label}`);
}

// Individual diagnostic — the original instrument (25 Qs, A–D, max 123).
async function seedIndividualInstrument() {
  await seedInstrumentVersion({
    instrumentId: INSTRUMENT_ID,
    instrumentVersionId: INSTRUMENT_VERSION_ID,
    name: "Innergy FLS",
    description: "Full-Spectrum Leadership diagnostic",
    metadata: {
      audience: "individual",
      durationEstimate: "10–12 minutes",
      questionCount: 25,
      dimensionOrder: [DIM_COGNITIVE, DIM_RELATIONAL, DIM_INNER],
    },
    sections: INNERGY_V1_SECTIONS as unknown as ReadonlyArray<SeedSection>,
    bands: [
      { bands: SECTION_A_BANDS, dimensionId: DIM_COGNITIVE },
      { bands: SECTION_B_BANDS, dimensionId: DIM_RELATIONAL },
      { bands: SECTION_C_BANDS, dimensionId: DIM_INNER },
    ],
    overallBands: OVERALL_BANDS,
    label: "Innergy FLS v1 (25 questions + bands)",
  });
}

// Team diagnostic — 15 Likert statements scored 1–5, max 75.
async function seedTeamInstrument() {
  await seedInstrumentVersion({
    instrumentId: TEAM_INSTRUMENT_ID,
    instrumentVersionId: TEAM_INSTRUMENT_VERSION_ID,
    name: "Innergy FLS — Team",
    description: "Full Spectrum Leadership Diagnostic for teams",
    metadata: {
      audience: "team",
      templateVariant: TEAM_TEMPLATE_VARIANT,
      durationEstimate: "7 minutes",
      questionCount: TEAM_QUESTION_COUNT,
      dimensionOrder: [DIM_COGNITIVE, DIM_RELATIONAL, DIM_INNER],
    },
    sections: TEAM_V1_SECTIONS as unknown as ReadonlyArray<SeedSection>,
    bands: [
      { bands: TEAM_SECTION_A_BANDS, dimensionId: DIM_COGNITIVE },
      { bands: TEAM_SECTION_B_BANDS, dimensionId: DIM_RELATIONAL },
      { bands: TEAM_SECTION_C_BANDS, dimensionId: DIM_INNER },
    ],
    overallBands: TEAM_OVERALL_BANDS,
    label: `Innergy FLS Team v1 (${TEAM_QUESTION_COUNT} questions + bands)`,
  });
}

async function seedMessageTemplates() {
  const all: TemplateSeed[] = [...GLOBAL_MESSAGE_TEMPLATES, ...TEAM_MESSAGE_TEMPLATES];
  for (const t of all) {
    // Global default: tenantId null. Upsert via a compound unique (key, tenantId, locale).
    const existing = await prisma.messageTemplate.findFirst({
      where: { key: t.key, tenantId: null, locale: "en" },
    });
    if (existing) {
      await prisma.messageTemplate.update({
        where: { id: existing.id },
        data: { body: t.body, updatedBy: "seed" },
      });
    } else {
      await prisma.messageTemplate.create({
        data: { key: t.key, tenantId: null, locale: "en", body: t.body, updatedBy: "seed" },
      });
    }
  }
  console.log(
    `✓ seeded ${GLOBAL_MESSAGE_TEMPLATES.length} global + ${TEAM_MESSAGE_TEMPLATES.length} team message templates`,
  );
}

async function seedLlmPrompt() {
  const { key, version, body, maxNarrativeChars, responseSchema } =
    LLM_INTERPRETATION_PROMPT_V1;

  // Deactivate any older active versions, make this one active.
  await prisma.llmPromptTemplate.updateMany({
    where: { key, isActive: true },
    data: { isActive: false },
  });
  await prisma.llmPromptTemplate.upsert({
    where: { key_version: { key, version } },
    update: { body, maxNarrativeChars, isActive: true, responseSchema },
    create: { key, version, body, maxNarrativeChars, isActive: true, responseSchema },
  });
  console.log("✓ seeded LLM interpretation prompt v1");
}

async function seedInnergyTenant() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "innergy" },
    update: {},
    create: {
      slug: "innergy",
      name: "Innergy",
      whatsappMode: "shared",
      triggerPayload: "START_innergy",
      primaryColor: "#1f2937",
      secondaryColor: "#0ea5e9",
    },
  });

  const coach = await prisma.coach.upsert({
    where: { id: "coach_rashmi" },
    update: {
      bookingUrl: "https://calendly.com/rashmii-sharma/meeting",
      // Seeded, not just set by hand in one database: the closing message
      // renders "Connect with … on LinkedIn: {{coach_linkedin_url}}"
      // unconditionally, so an unset value ships a dangling label to the user.
      linkedinUrl: "https://linkedin.com/in/rashmisharmaofficial",
    },
    create: {
      id: "coach_rashmi",
      name: "Rashmi Sharma",
      // Placeholders — replace with real values (§12.9).
      bookingUrl: "https://calendly.com/rashmii-sharma/meeting",
      linkedinUrl: "https://linkedin.com/in/rashmisharmaofficial",
      notificationChannel: "email",
      notificationAddress: "rashmi@innergy.example",
    },
  });

  await prisma.tenantCoach.upsert({
    where: { tenantId_coachId: { tenantId: tenant.id, coachId: coach.id } },
    update: { isPrimary: true },
    create: { tenantId: tenant.id, coachId: coach.id, isPrimary: true },
  });

  // The tenant offers both diagnostics; /take lets the visitor pick which.
  for (const versionId of [INSTRUMENT_VERSION_ID, TEAM_INSTRUMENT_VERSION_ID]) {
    await prisma.tenantInstrument.upsert({
      where: {
        tenantId_instrumentVersionId: {
          tenantId: tenant.id,
          instrumentVersionId: versionId,
        },
      },
      update: {},
      create: { tenantId: tenant.id, instrumentVersionId: versionId },
    });
  }

  // Feature flags (see CLAUDE.md §V1 seed content).
  const flags: Array<[string, string]> = [
    ["voice_enabled", "true"],
    ["llm_interpretation", "false"],
    ["email_capture", "false"],
    ["dynamic_image_gen", "false"],
    // Where the name/company/email step sits: before_questions |
    // after_questions | after_results. Editable from the admin Questions page.
    ["contact_capture_position", "after_questions"],
  ];
  for (const [key, value] of flags) {
    await prisma.featureFlag.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key } },
      update: { value },
      create: { tenantId: tenant.id, key, value },
    });
  }

  console.log("✓ seeded Innergy tenant + coach + flags");
}

async function main() {
  await seedDimensions();
  await seedIndividualInstrument();
  await seedTeamInstrument();
  await seedMessageTemplates();
  await seedLlmPrompt();
  await seedInnergyTenant();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
