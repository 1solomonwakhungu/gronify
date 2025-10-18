/**
 * Flatten nested objects using dot notation
 * @param obj - Object to flatten
 * @param prefix - Prefix for keys (used in recursion)
 * @returns Flattened object with dot-notation keys
 */
export function flatten(obj: any, prefix = ""): Record<string, any> {
  if (obj === null || obj === undefined) {
    return prefix ? { [prefix]: obj } : {};
  }

  if (typeof obj !== "object" || Array.isArray(obj)) {
    return prefix ? { [prefix]: obj } : { value: obj };
  }

  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      result[newKey] = value;
    } else if (typeof value === "object" && !Array.isArray(value)) {
      // Recursively flatten nested objects
      Object.assign(result, flatten(value, newKey));
    } else if (Array.isArray(value)) {
      // Arrays get JSON stringified
      result[newKey] = JSON.stringify(value);
    } else {
      result[newKey] = value;
    }
  }

  return result;
}

