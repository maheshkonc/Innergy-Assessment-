import { describe, expect, it } from "vitest";
import { extractVariableNames, renderTemplate, TemplateError } from "./render";

describe("renderTemplate", () => {
  it("substitutes simple variables", () => {
    const out = renderTemplate("Hi {{name}}, score is {{score}}", {
      name: "Priya",
      score: 42,
    });
    expect(out).toBe("Hi Priya, score is 42");
  });

  it("throws on missing variable by default", () => {
    expect(() => renderTemplate("Hi {{name}}", {})).toThrow(TemplateError);
  });

  it("allows missing when opts.allowMissing is true", () => {
    expect(renderTemplate("Hi {{name}}", {}, { allowMissing: true })).toBe("Hi ");
  });

  it("extracts variable names", () => {
    const vars = extractVariableNames("Hi {{name}}, you scored {{score}} / {{max_score}}");
    expect(vars.sort()).toEqual(["max_score", "name", "score"]);
  });

  it("ignores non-variable braces", () => {
    expect(renderTemplate("function foo() { return 1 }", {})).toBe(
      "function foo() { return 1 }",
    );
  });
});
