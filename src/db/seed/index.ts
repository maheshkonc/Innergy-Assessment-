// Seeds baseline content: dimensions, the Innergy FLS v1 instrument (v1),
// global message templates, the active LLM prompt, and one Innergy tenant
// bound to the instrument. Idempotent — safe to rerun.

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
import { GLOBAL_MESSAGE_TEMPLATES } from "./fixtures/message_templates";
import { LLM_INTERPRETATION_PROMPT_V1 } from "./fixtures/llm_prompt";

async function seedDimensions() {
  const dimensions = [
    { id: DIM_COGNITIVE, name: "Section 1", internalTag: "cognitive" },
    { id: DIM_RELATIONAL, name: "Section 2", internalTag: "relational" },
    { id: DIM_INNER, name: "Section 3", internalTag: "inner" },
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

async function seedInstrument() {
  await prisma.instrument.upsert({
    where: { id: INSTRUMENT_ID },
    update: { name: "Innergy FLS", description: "Full-Spectrum Leadership diagnostic" },
    create: {
      id: INSTRUMENT_ID,
      name: "Innergy FLS",
      description: "Full-Spectrum Leadership diagnostic",
    },
  });

  await prisma.instrumentVersion.upsert({
    where: { id: INSTRUMENT_VERSION_ID },
    update: {},
    create: {
      id: INSTRUMENT_VERSION_ID,
      instrumentId: INSTRUMENT_ID,
      versionNumber: 1,
      publishedAt: new Date(),
      publishedBy: "seed",
      metadata: {
        durationEstimate: "10–12 minutes",
        dimensionOrder: [DIM_COGNITIVE, DIM_RELATIONAL, DIM_INNER],
      },
    },
  });

  // Mark this as the current version.
  await prisma.instrument.update({
    where: { id: INSTRUMENT_ID },
    data: { currentVersionId: INSTRUMENT_VERSION_ID },
  });

  for (const section of INNERGY_V1_SECTIONS) {
    await prisma.section.upsert({
      where: { id: section.id },
      update: {
        dimensionId: section.dimensionId,
        displayOrder: section.displayOrder,
        introTemplateKey: section.introTemplateKey,
      },
      create: {
        id: section.id,
        instrumentVersionId: INSTRUMENT_VERSION_ID,
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
            label: o.label,
            text: o.text,
            score: o.score,
            displayOrder: o.displayOrder,
          },
        });
      }
    }
  }

  // Clear + reseed bands (cheap; always 3 × 4 + 1 × 4 rows).
  await prisma.dimensionBand.deleteMany({
    where: { instrumentVersionId: INSTRUMENT_VERSION_ID },
  });
  await prisma.overallBand.deleteMany({
    where: { instrumentVersionId: INSTRUMENT_VERSION_ID },
  });

  const sectionBands = [
    { bands: SECTION_A_BANDS, dimensionId: DIM_COGNITIVE },
    { bands: SECTION_B_BANDS, dimensionId: DIM_RELATIONAL },
    { bands: SECTION_C_BANDS, dimensionId: DIM_INNER },
  ];
  for (const group of sectionBands) {
    for (const b of group.bands) {
      await prisma.dimensionBand.create({
        data: {
          instrumentVersionId: INSTRUMENT_VERSION_ID,
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
  for (const b of OVERALL_BANDS) {
    await prisma.overallBand.create({
      data: {
        instrumentVersionId: INSTRUMENT_VERSION_ID,
        minScore: b.minScore,
        maxScore: b.maxScore,
        bandLabel: b.bandLabel,
        interpretationTemplate: b.interpretationTemplate,
      },
    });
  }
  console.log("✓ seeded Innergy FLS v1 (25 questions + bands)");
}

async function seedMessageTemplates() {
  for (const t of GLOBAL_MESSAGE_TEMPLATES) {
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
  console.log(`✓ seeded ${GLOBAL_MESSAGE_TEMPLATES.length} global message templates`);
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
    update: { bookingUrl: "https://calendly.com/rashmii-sharma/meeting" },
    create: {
      id: "coach_rashmi",
      name: "Rashmi Sharma",
      // Placeholders — replace with real values (§12.9).
      bookingUrl: "https://calendly.com/rashmii-sharma/meeting",
      notificationChannel: "email",
      notificationAddress: "rashmi@innergy.example",
    },
  });

  await prisma.tenantCoach.upsert({
    where: { tenantId_coachId: { tenantId: tenant.id, coachId: coach.id } },
    update: { isPrimary: true },
    create: { tenantId: tenant.id, coachId: coach.id, isPrimary: true },
  });

  await prisma.tenantInstrument.upsert({
    where: {
      tenantId_instrumentVersionId: {
        tenantId: tenant.id,
        instrumentVersionId: INSTRUMENT_VERSION_ID,
      },
    },
    update: {},
    create: { tenantId: tenant.id, instrumentVersionId: INSTRUMENT_VERSION_ID },
  });

  // Feature flags (see CLAUDE.md §V1 seed content).
  const flags: Array<[string, string]> = [
    ["voice_enabled", "true"],
    ["llm_interpretation", "false"],
    ["email_capture", "false"],
    ["dynamic_image_gen", "false"],
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
  await seedInstrument();
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
