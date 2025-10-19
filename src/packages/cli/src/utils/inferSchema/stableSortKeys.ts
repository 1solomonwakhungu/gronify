/**
 * Sort object keys in a stable, deterministic order
 * @param obj Object with potentially unsorted keys
 * @returns New object with sorted keys
 */
export function stableSortKeys(obj: any): any {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(stableSortKeys);
  }

  const sorted: any = {};
  const keys = Object.keys(obj).sort();

  for (const key of keys) {
    sorted[key] = stableSortKeys(obj[key]);
  }

  return sorted;
}

