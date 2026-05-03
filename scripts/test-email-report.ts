// One-off: seed a fake completed session + result + user_report notification,
// then exit. Run while the notifications worker is up and it will pick it up.
//   set -a && source .env && set +a && npx tsx scripts/test-email-report.ts you@example.com

import { prisma } from "../src/db/client";
import { enqueueUserReportNotification } from "../src/core/notifications/create";

async function main() {
  const email = process.argv[2];
  if (!email) {
    throw new Error("usage: tsx scripts/test-email-report.ts <email>");
  }

  const tenant = await prisma.tenant.findFirstOrThrow({ where: { slug: "innergy" } });
  const tenantInstrument = await prisma.tenantInstrument.findFirstOrThrow({
    where: { tenantId: tenant.id },
    include: { instrumentVersion: true },
  });
  const dims = await prisma.dimension.findMany({ orderBy: { displayOrder: "asc" } });
  const cogId = dims[0].id;
  const relId = dims[1].id;
  const innerId = dims[2].id;

  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      whatsappPhoneHash: "test-hash-" + Date.now(),
      firstName: "Test Leader",
      organisation: "Acme Co",
      email,
    },
  });

  const session = await prisma.session.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      instrumentVersionId: tenantInstrument.instrumentVersionId,
      status: "completed",
      fsmState: { state: "results" },
      completedAt: new Date(),
    },
  });

  await prisma.result.create({
    data: {
      sessionId: session.id,
      tenantId: tenant.id,
      userId: user.id,
      instrumentVersionId: tenantInstrument.instrumentVersionId,
      cognitiveScore: 28,
      cognitiveBand: "Strong",
      relationalScore: 32,
      relationalBand: "Emerging",
      innerScore: 25,
      innerBand: "Developing",
      overallScore: 85,
      overallBand: "Emerging leader",
      lowestDimensionId: innerId,
      interpretationMode: "template",
      interpretationJson: {
        perDimension: [
          { dimensionId: cogId, dimensionName: "Section 1", narrative: "You think clearly under ambiguity and frame problems before solving them. This is a real strength as AI accelerates the pace of decisions." },
          { dimensionId: relId, dimensionName: "Section 2", narrative: "You influence well in 1:1 settings; the next edge is broadening that influence across teams who are anxious about AI." },
          { dimensionId: innerId, dimensionName: "Section 3", narrative: "Your developing area is inner mastery — the steady ground you operate from. This is the highest-leverage place to invest right now." },
        ],
        overallNarrative: "Your overall profile is that of an emerging AI-age leader: strong cognitively, building relational reach, and growing the inner foundation that will let you lead through the next wave of change with steadiness.",
        lowestDimensionId: innerId,
      },
    },
  });

  const { created } = await enqueueUserReportNotification(prisma, {
    tenantId: tenant.id,
    userId: user.id,
    sessionId: session.id,
    email,
  });
  console.log(JSON.stringify({ created, sessionId: session.id, userId: user.id, email }, null, 2));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
