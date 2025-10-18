import Handlebars from "handlebars";
import type { NormalizedData } from "./normalizeRecords.js";

export interface TemplateOptions {
  template: string;
}

/**
 * Convert normalized data to custom template format using Handlebars
 */
export function toTemplate(
  data: NormalizedData,
  options: TemplateOptions
): string {
  const { template } = options;

  // Compile the template
  const compiled = Handlebars.compile(template);

  // Render each row with the template
  const lines = data.rows.map((row) => {
    // For template rendering, we want the original structure if possible
    // So we pass the row as-is to the template
    return compiled(row);
  });

  return lines.join("\n");
}

