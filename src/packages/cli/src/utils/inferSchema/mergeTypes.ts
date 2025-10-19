/**
 * Merge multiple types into a single type or array of types
 */
export function mergeTypes(types: Set<string>): string | string[] {
  if (types.size === 0) {
    return "null";
  }

  if (types.size === 1) {
    const singleType = Array.from(types)[0];
    return singleType !== undefined ? singleType : "null";
  }

  // If we have both "integer" and "number", collapse to "number"
  if (types.has("integer") && types.has("number")) {
    types.delete("integer");
  }

  // Convert integer to number for JSON Schema
  const typeArray = Array.from(types).map((t) => (t === "integer" ? "number" : t));

  // Sort for determinism
  typeArray.sort();

  if (typeArray.length === 1) {
    const singleType = typeArray[0];
    return singleType !== undefined ? singleType : "null";
  }
  
  return typeArray;
}

