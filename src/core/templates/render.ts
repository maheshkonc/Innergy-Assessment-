// Template engine (PRD §6.3). Variables use {{snake_case}}.
// FAIL LOUD: a missing variable throws. This is intentional — silently
// shipping "Hi {{name}}" to a WhatsApp user is worse than a 500.

export class TemplateError extends Error {
  constructor(
    message: string,
    readonly context: { templateKey?: string; missing?: string[]; extras?: string[] },
  ) {
    super(message);
  }
}

export type TemplateVars = Record<string, string | number | null | undefined>;

const VAR_RE = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g;

export function renderTemplate(
  body: string,
  vars: TemplateVars,
  opts: { templateKey?: string; allowMissing?: boolean } = {},
): string {
  const missing: string[] = [];
  const used = new Set<string>();

  const rendered = body.replace(VAR_RE, (_match, name: string) => {
    used.add(name);
    const v = vars[name];
    if (v === undefined || v === null || v === "") {
      missing.push(name);
      return "";
    }
    return String(v);
  });

  if (missing.length && !opts.allowMissing) {
    throw new TemplateError(
      `Template "${opts.templateKey ?? "(inline)"}" missing variables: ${missing.join(", ")}`,
      { templateKey: opts.templateKey, missing },
    );
  }

  return rendered;
}

/**
 * Extract referenced variable names from a template body.
 * Useful for admin UI validation ("your template references {{foo}} but
 * we have no such variable in this context").
 */
export function extractVariableNames(body: string): string[] {
  const names = new Set<string>();
  for (const match of body.matchAll(VAR_RE)) {
    if (match[1]) names.add(match[1]);
  }
  return [...names];
}
