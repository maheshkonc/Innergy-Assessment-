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
    });
    expect(body).toContain("Ravi");
    expect(body).toContain("coaching conversation");
    expect(body).not.toContain("Overall:");
  });
});
