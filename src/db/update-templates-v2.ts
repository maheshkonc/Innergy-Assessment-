// One-off: rewrite message templates to match innergy_whatsapp_ux_flow.docx.pdf
// wording exactly. Adds 3 new templates for steps the PDF describes but the
// current set did not: org_ack, coaching_interest_yes, coaching_interest_no.
//
// Run with: npx tsx src/db/update-templates-v2.ts

import { prisma } from "./client";

type Tpl = { key: string; body: string };

const TEMPLATES: Tpl[] = [
  {
    key: "welcome_1",
    body: "Hi there — welcome to the AI Leadership Readiness Assessment from {{tenant_name}}.\n\nI'm here on behalf of {{coach_name}} to help you understand where you stand across three dimensions that matter most for leading in the AI age.",
  },
  {
    key: "welcome_2",
    body: "In the next 10 minutes, I'll help you understand how ready you are as a leader for the AI age — across three dimensions: how you think, how you lead your team, and how you show up under pressure.",
  },
  {
    key: "welcome_3",
    body: "Ready to begin? Type YES to start — or type LATER if now isn't a good time and I'll remind you tomorrow.",
  },
  {
    key: "ask_name",
    body: "Great. Before we start — two quick things.\n\nWhat's your first name?",
  },
  {
    key: "ask_organisation",
    body: "And which organisation are you from, {{name}}?",
  },
  {
    key: "org_ack",
    body: "Perfect. Let's begin, {{name}}.",
  },
  {
    key: "calculating",
    body: "You've completed all {{total_questions}} questions, {{name}}. ✓\n\nCalculating your Full Spectrum Leadership scores now...",
  },
  {
    key: "dimension_result",
    body: "*{{dimension_name}}*\n\nYour score: {{score}} / {{max_score}}\nBand: {{band_label}}\n\n{{interpretation}}",
  },
  {
    key: "overall_result",
    body:
      "*YOUR FULL SPECTRUM LEADERSHIP SCORE*\n\n" +
      "Section 1: {{cognitive_score}} / {{cognitive_max}}\n" +
      "Section 2: {{relational_score}} / {{relational_max}}\n" +
      "Section 3: {{inner_score}} / {{inner_max}}\n\n" +
      "OVERALL: {{overall_score}} / {{overall_max_score}}\n" +
      "Readiness Level: {{overall_band_label}}\n\n" +
      "{{overall_interpretation}}",
  },
  {
    key: "debrief_cta_1",
    body: "Your results tell a story, {{name}}. And the most valuable thing you can do with them is talk through what they mean for your specific context — your role, your team, and where you are right now.",
  },
  {
    key: "debrief_cta_2",
    body:
      "{{coach_name}} — who built this assessment — offers a limited number of 20-minute debrief conversations each month with senior leaders.\n\n" +
      "Would you like to book one?\n\n" +
      "Type YES to get the booking link\n" +
      "Type NO if you'd prefer to sit with your results first",
  },
  {
    key: "coaching_yes",
    body:
      "Here's {{coach_name}}'s booking link:\n{{coach_booking_url}}\n\n" +
      "Choose any 20-minute slot that works for you. {{coach_name}} will have your results before the call so you can go straight into the conversation that matters.",
  },
  {
    key: "coaching_no",
    body:
      "Completely understood. Your results will stay here whenever you're ready to revisit them.\n\n" +
      "If you change your mind, {{coach_name}}'s booking link is: {{coach_booking_url}}",
  },
  {
    key: "coaching_interest_prompt",
    body:
      "One last question — are any of your three dimensions something you'd want to actively work on with a coach?\n\n" +
      "Type YES if you'd like to explore coaching\n" +
      "Type NO if you're just here for the assessment for now",
  },
  {
    key: "coaching_interest_yes",
    body:
      "Noted. {{coach_name}} works with a number of senior leaders on exactly this — building the Full Spectrum Leadership infrastructure through a structured coaching programme.\n\n" +
      "{{coach_name}} will reach out within 48 hours to share more. No pressure — it's just a conversation.",
  },
  {
    key: "coaching_interest_no",
    body: "Understood. If that ever changes, you know where to find {{coach_name}}. 🙏",
  },
  {
    key: "closing",
    body:
      "Thank you for taking the time to do this, {{name}}. Most leaders never stop to look at themselves honestly.\n\n" +
      "If you found this useful, {{coach_name}} shares thinking on leadership and the AI age every week on LinkedIn. Worth a follow.\n\n" +
      "{{coach_linkedin_url}}\n\n" +
      "Wishing you well. 🙏\n\n— The Innergy Team",
  },
];

async function main() {
  for (const t of TEMPLATES) {
    const existing = await prisma.messageTemplate.findFirst({
      where: { key: t.key, tenantId: null, locale: "en" },
    });
    if (existing) {
      await prisma.messageTemplate.update({
        where: { id: existing.id },
        data: { body: t.body },
      });
      console.log(`updated ${t.key}`);
    } else {
      await prisma.messageTemplate.create({
        data: { key: t.key, tenantId: null, locale: "en", body: t.body },
      });
      console.log(`created ${t.key}`);
    }
  }
  console.log(`\ndone — ${TEMPLATES.length} templates upserted`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
