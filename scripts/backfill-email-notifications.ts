// Backfill user_report email notifications for completed sessions
// where the user has an email but no notification was ever sent.
// Run: npx tsx scripts/backfill-email-notifications.ts

import { PrismaClient } from "@prisma/client";
import { enqueueUserReportNotification } from "../src/core/notifications/create";

async function main() {
  const prisma = new PrismaClient();

  const sessions = await prisma.session.findMany({
    where: { status: "completed" },
    include: {
      user: { select: { id: true, firstName: true, email: true } },
      notifications: { where: { type: "user_report" } },
    },
  });

  console.log(`Found ${sessions.length} completed sessions`);

  let enqueued = 0;
  let skipped = 0;

  for (const s of sessions) {
    if (!s.user.email) {
      console.log(`  SKIP (no email): ${s.user.firstName} — session ${s.id}`);
      skipped++;
      continue;
    }
    if (s.notifications.length > 0) {
      console.log(`  SKIP (already sent): ${s.user.firstName} <${s.user.email}>`);
      skipped++;
      continue;
    }
    const { created } = await enqueueUserReportNotification(prisma, {
      tenantId: s.tenantId,
      userId: s.userId,
      sessionId: s.id,
      email: s.user.email,
    });
    console.log(`  ENQUEUED: ${s.user.firstName} <${s.user.email}> — created=${created}`);
    enqueued++;
  }

  console.log(`\nDone. Enqueued: ${enqueued}, Skipped: ${skipped}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
