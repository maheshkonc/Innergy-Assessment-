// Global default message templates. Per-tenant overrides live on tenant rows
// with tenantId set (precedence: tenant override → global default).
// All copy aligns with innergy_whatsapp_ux_flow §STEP 2 and PRD §5.

export interface TemplateSeed {
  key: string;
  body: string;
}

export const GLOBAL_MESSAGE_TEMPLATES: TemplateSeed[] = [
  // --- Welcome sequence (FR-2.2: three messages) ---
  {
    key: "welcome_1",
    body:
      "Hi {{name_or_there}} — welcome to the AI Leadership Readiness Assessment from {{tenant_name}}.\n\n" +
      "I'm here on behalf of {{coach_name}} to help you understand where you stand across three dimensions that matter most for leading in the AI age: {{dimension_names_list}}.",
  },
  {
    key: "welcome_2",
    body:
      "This takes about {{duration_estimate}}. {{question_count}} questions. Answer honestly — nobody else sees your answers.\n\n" +
      "At the end you'll get a personal readout and an optional coaching conversation with {{coach_name}}.",
  },
  {
    key: "welcome_3",
    body: "Ready to begin? Reply YES to start, or LATER if you'd like a reminder.",
  },
  { key: "later_ack", body: "No problem. I'll ping you tomorrow." },

  // --- Name + org capture ---
  { key: "ask_name", body: "Great. What's your first name?" },
  { key: "ask_organisation", body: "Thanks, {{name}}. And which organisation are you with?" },

  // --- Section intros ---
  {
    key: "section_intro_cognitive",
    body:
      "SECTION 1 OF 3: COGNITIVE CLARITY. This section is about how you think and decide — especially when things are fast-moving, ambiguous, or genuinely new.\n\n" +
      "For each question, reply with A, B, C, or D.",
  },
  {
    key: "section_intro_relational",
    body:
      "Section 1 complete. ✓\n\nSECTION 2 OF 3: RELATIONAL INFLUENCE. This section is about your team — how you lead together, make decisions, give feedback, and respond to change. Answer based on how your top team operates as a whole.",
  },
  {
    key: "section_intro_inner",
    body:
      "Section 2 complete. ✓\n\nSECTION 3 OF 3: INNER MASTERY. This section is personal. It's about your inner experience — how you feel under pressure, how you recover, and the quality of presence you bring to the people around you. Answer honestly. These questions are often the most revealing.",
  },

  // --- Question delivery ---
  {
    key: "question_body",
    body:
      "Q{{question_number}} of {{question_count}} — {{section_name}}\n\n" +
      "{{stem}}\n\n" +
      "A) {{option_a}}\nB) {{option_b}}\nC) {{option_c}}\nD) {{option_d}}",
  },
  {
    key: "invalid_answer",
    body: "Sorry, I didn't catch that. Please reply with A, B, C, or D.",
  },
  {
    key: "voice_confirm_name",
    body: "I heard '{{heard}}' — is that right? Reply YES or NO.",
  },

  // --- Results ---
  {
    key: "calculating",
    body: "That's all the questions. Calculating your readout…",
  },
  {
    key: "dimension_result",
    body:
      "*{{dimension_name}}* — {{score}} / {{max_score}} · {{band_label}}\n\n{{interpretation}}",
  },
  {
    key: "overall_result",
    body:
      "*OVERALL: {{overall_band_label}}*\n\n" +
      "Cognitive Clarity: {{cognitive_score}} / {{cognitive_max}}\n" +
      "Relational Influence: {{relational_score}} / {{relational_max}}\n" +
      "Inner Mastery: {{inner_score}} / {{inner_max}}\n\n" +
      "Total: {{overall_score}} / {{overall_max_score}}\n\n{{overall_interpretation}}",
  },

  // --- Debrief CTA ---
  {
    key: "debrief_cta_1",
    body:
      "Your lowest dimension is *{{lowest_dimension_name}}*. {{coach_name}} works with senior leaders exactly on this.",
  },
  {
    key: "debrief_cta_2",
    body:
      "Would you like a 30-minute conversation with {{coach_name}} to walk through your results? Reply YES or NO.",
  },
  {
    key: "coaching_yes",
    body:
      "Great. You can book a slot here: {{coach_booking_url}}\n\nI'll let {{coach_name}} know to expect you.",
  },
  {
    key: "coaching_no",
    body:
      "Understood. If you change your mind, the link is here: {{coach_booking_url}}",
  },
  {
    key: "coaching_interest_prompt",
    body: "One last thing — would you like {{coach_name}} to reach out personally? Reply YES or NO.",
  },
  {
    key: "closing",
    body:
      "Thanks, {{name}}. Your readout is saved and you can revisit it anytime by typing RESULTS.\n\n" +
      "Connect with {{coach_name}} on LinkedIn: {{coach_linkedin_url}}",
  },

  // --- Re-entry, abandonment, safety ---
  {
    key: "reentry_prompt",
    body:
      "Welcome back, {{name}}. Would you like to (1) view your last results, or (2) take the diagnostic again?",
  },
  {
    key: "abandonment_reminder",
    body:
      "Hi {{name}} — just checking in. You were on question {{question_number}} of {{question_count}}. Reply to continue, or START to begin fresh.",
  },
  {
    key: "session_closed",
    body: "Your session has timed out. Scan the QR again when you're ready to pick back up.",
  },
  {
    key: "safe_handoff",
    body:
      "What you mentioned sounds important. This assessment isn't the right place for that conversation.\n\n" +
      "Please reach out to {{coach_name}} directly: {{coach_booking_url}} — or, if this is urgent, please contact a qualified professional in your region.",
  },

  // --- Commands ---
  { key: "voice_on_ack", body: "Voice mode ON. Long messages will also come as voice notes." },
  { key: "voice_off_ack", body: "Voice mode OFF. Text only from here." },
];
