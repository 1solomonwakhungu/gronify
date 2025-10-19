/**
 * Convert JSON Pointer to gron-style path
 * @param instancePath JSON Pointer path (e.g., "/users/0/email")
 * @returns Gron-style path (e.g., "json.users[0].email")
 */
export function jsonPointerToGron(instancePath: string): string {
  if (instancePath === "" || instancePath === "/") {
    return "json";
  }

  // Remove leading slash and split by slash
  const tokens = instancePath.slice(1).split("/");

  let gronPath = "json";

  for (const token of tokens) {
    // Unescape JSON Pointer tokens: ~1 -> /, ~0 -> ~
    const unescaped = token.replace(/~1/g, "/").replace(/~0/g, "~");

    // Check if token is numeric (array index)
    if (/^\d+$/.test(unescaped)) {
      gronPath += `[${unescaped}]`;
    } else {
      // Check if token needs bracket notation (contains special chars or starts with number)
      if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(unescaped)) {
        // Simple identifier - use dot notation
        gronPath += `.${unescaped}`;
      } else {
        // Complex identifier - use bracket notation
        gronPath += `["${unescaped.replace(/"/g, '\\"')}"]`;
      }
    }
  }

  return gronPath;
}

/**
 * Convert data path to gron-style path
 * @param dataPath Path array (e.g., ["users", 0, "email"])
 * @returns Gron-style path (e.g., "json.users[0].email")
 */
export function dataPathToGron(dataPath: (string | number)[]): string {
  let gronPath = "json";

  for (const segment of dataPath) {
    if (typeof segment === "number") {
      gronPath += `[${segment}]`;
    } else {
      if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(segment)) {
        gronPath += `.${segment}`;
      } else {
        gronPath += `["${segment.replace(/"/g, '\\"')}"]`;
      }
    }
  }

  return gronPath;
}

