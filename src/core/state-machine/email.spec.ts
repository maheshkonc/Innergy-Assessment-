import { describe, expect, it } from "vitest";
import { isEmailAddress } from "./engine";

describe("isEmailAddress", () => {
  it("accepts ordinary work addresses", () => {
    expect(isEmailAddress("mahesh@company.com")).toBe(true);
    expect(isEmailAddress("first.last@company.co.in")).toBe(true);
    expect(isEmailAddress("name+tag@sub.company.com")).toBe(true);
    expect(isEmailAddress("a_b-c@company-name.io")).toBe(true);
  });

  it("rejects free text typed at the email step", () => {
    // The reported case: this used to fall through to the answer-a-question
    // message, telling the user to "reply with a number from 1 to 5".
    expect(isEmailAddress("skjs")).toBe(false);
    expect(isEmailAddress("")).toBe(false);
    expect(isEmailAddress("not an email")).toBe(false);
  });

  it("rejects addresses the old includes('@') check let through", () => {
    expect(isEmailAddress("a@b")).toBe(false);
    expect(isEmailAddress("@company.com")).toBe(false);
    expect(isEmailAddress("mahesh@")).toBe(false);
    expect(isEmailAddress("mahesh@company")).toBe(false);
    expect(isEmailAddress("@")).toBe(false);
  });

  it("rejects malformed domains", () => {
    expect(isEmailAddress("mahesh@company..com")).toBe(false);
    expect(isEmailAddress("mahesh@.com")).toBe(false);
    expect(isEmailAddress("mahesh@company.")).toBe(false);
    // Single-character TLDs are not real; two is the shortest that is.
    expect(isEmailAddress("mahesh@company.c")).toBe(false);
  });

  it("rejects anything containing whitespace or a second @", () => {
    expect(isEmailAddress("mahesh @company.com")).toBe(false);
    expect(isEmailAddress("mahesh@ company.com")).toBe(false);
    expect(isEmailAddress("a@b@company.com")).toBe(false);
  });
});
