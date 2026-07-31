// Unit tests for the pure pieces of the notifications worker — the body
// renderer. Delivery + enrichment need a live DB and are covered by
// integration tests (not run in this suite).

import { describe, expect, it } from "vitest";
import { __internal } from "./notifications";
import type { Notification } from "@prisma/client";

const { renderBody } = __internal;

function baseNotification(overrides: Partial<Notification>): Notification {
  return {
    id: "n1",
    tenantId: "t1",
    coachId: null,
    userId: "u1",
    sessionId: "s1",
    type: "escalation",
    channel: "email",
    payload: {},
    status: "pending",
    attempts: 0,
    lastError: null,
    createdAt: new Date(),
    sentAt: null,
    ...overrides,
  } as Notification;
}

describe("notifications worker renderBody", () => {
  it("renders an escalation body with matched phrase + snippet + user identity", () => {
    const n = baseNotification({
      type: "escalation",
      payload: { matchedPhrase: "hopeless", rawInputSnippet: "i feel hopeless about this team" },
    });
    const body = renderBody(n, {
      userName: "Asha",
      organisation: "Acme",
      cognitive: null,
      relational: null,
      inner: null,
      overall: null,
      generatedAt: null,
      interpretation: null,
      lowestDimensionName: null,
      coach: null,
      tenant: null,
    });
    expect(body).toContain("Safety escalation");
    expect(body).toContain("Asha");
    expect(body).toContain("Acme");
    expect(body).toContain("hopeless");
    expect(body).toContain("i feel hopeless about this team");
    expect(body).toContain("s1");
  });

  it("falls back gracefully when user identity is missing", () => {
    const n = baseNotification({ type: "escalation", payload: {} });
    const body = renderBody(n, null);
    expect(body).toContain("Safety escalation");
    expect(body).toContain("a user");
  });

  it("renders a coaching_interest body with overall + per-dimension scores", () => {
    const n = baseNotification({ type: "coaching_interest", payload: {} });
    const body = renderBody(n, {
      userName: "Ravi",
      organisation: "Innergy",
      cognitive: { score: 30, band: "Strong" },
      relational: { score: 32, band: "Emerging" },
      inner: { score: 28, band: "Developing" },
      overall: { score: 90, band: "Emerging leader" },
      generatedAt: "2026-04-20T12:00:00.000Z",
      interpretation: null,
      lowestDimensionName: null,
      coach: null,
      tenant: null,
    });
    expect(body).toContain("Ravi");
    expect(body).toContain("Innergy");
    expect(body).toContain("coaching conversation");
    expect(body).toContain("Overall: 90");
    expect(body).toMatch(/CC 30.+RI 32.+IM 28/);
  });

  it("renders a coaching_interest body without scores when result is missing", () => {
    const n = baseNotification({ type: "coaching_interest", payload: {} });
    const body = renderBody(n, {
      userName: "Ravi",
      organisation: null,
      cognitive: null,
      relational: null,
      inner: null,
      overall: null,
      generatedAt: null,
      interpretation: null,
      lowestDimensionName: null,
      coach: null,
      tenant: null,
    });
    expect(body).toContain("Ravi");
    expect(body).toContain("coaching conversation");
    expect(body).not.toContain("Overall:");
  });
});

describe("notifications worker user_report email", () => {
  const { renderEmail } = __internal;

  function reportPayload(audience: "individual" | "team" | undefined) {
    return {
      userName: "Mahesh",
      organisation: "Innergy",
      cognitive: { score: 14, band: "Developing" },
      relational: { score: 18, band: "Developing" },
      inner: { score: 10, band: "Developing" },
      overall: { score: 42, band: "Partially Ready" },
      generatedAt: null,
      interpretation: null,
      lowestDimensionName: "Inner Mastery",
      coach: null,
      tenant: { name: "Innergy", logoUrl: null },
      ...(audience ? { audience } : {}),
    };
  }
  const report = baseNotification({ type: "user_report" });

  it("titles a team result as a Team Readiness Report", () => {
    const { subject, html, text } = renderEmail(report, reportPayload("team"));
    expect(subject).toBe("Your Innergy Team Readiness Report — Partially Ready");
    expect(html).toContain("readiness report");
    expect(html).toContain(">Team</em>");
    expect(html).toContain("here&#39;s your team&#39;s detailed readout");
    expect(text).toContain("Here's your Team Readiness Report.");
    // The individual framing must not leak into a team readout.
    expect(html).not.toContain("Individual AI");
  });

  it("titles an individual result as an Individual AI Readiness Report", () => {
    const { subject, html, text } = renderEmail(report, reportPayload("individual"));
    expect(subject).toBe("Your Innergy Individual AI Readiness Report — Partially Ready");
    expect(html).toContain(">Individual AI</em>");
    expect(text).toContain("Here's your Individual AI Readiness Report.");
    expect(html).not.toContain("your team&#39;s detailed readout");
  });

  it("treats a payload written before the audience field as individual", () => {
    const { subject } = renderEmail(report, reportPayload(undefined));
    expect(subject).toBe("Your Innergy Individual AI Readiness Report — Partially Ready");
  });

  it("says Assessment, not Diagnostic", () => {
    const { html } = renderEmail(report, reportPayload("team"));
    expect(html).toContain("Leadership Assessment");
    expect(html).not.toContain("Leadership Diagnostic");
    expect(html).not.toContain("Leadership diagnostic");
  });
});
