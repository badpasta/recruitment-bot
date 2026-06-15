/**
 * Pick a random template from the list.
 */
export function pickTemplate(templates: string[]): string {
  if (templates.length === 0) {
    throw new Error("No elimination templates configured");
  }
  const idx = Math.floor(Math.random() * templates.length);
  return templates[idx];
}

/**
 * Render a template by replacing {{name}} with the candidate name.
 */
export function renderTemplate(template: string, candidateName: string): string {
  return template.replace(/\{\{name\}\}/g, candidateName);
}
