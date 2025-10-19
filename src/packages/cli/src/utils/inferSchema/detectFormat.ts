/**
 * Detect string format (email, uri, date-time, uuid, ipv4, ipv6)
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URI_REGEX = /^https?:\/\/.+/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const IPV6_REGEX = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
const DATE_TIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;

export type StringFormat = "email" | "uri" | "date-time" | "uuid" | "ipv4" | "ipv6";

/**
 * Detect the format of a string value
 * @param value String value to analyze
 * @returns Detected format or null
 */
export function detectFormat(value: string): StringFormat | null {
  if (DATE_TIME_REGEX.test(value)) {
    return "date-time";
  }
  if (EMAIL_REGEX.test(value)) {
    return "email";
  }
  if (UUID_REGEX.test(value)) {
    return "uuid";
  }
  if (URI_REGEX.test(value)) {
    return "uri";
  }
  if (IPV4_REGEX.test(value)) {
    return "ipv4";
  }
  if (IPV6_REGEX.test(value)) {
    return "ipv6";
  }
  return null;
}

/**
 * Merge format detections from multiple values
 * If all non-null formats agree, return that format
 * Otherwise return null
 */
export function mergeFormats(formats: (StringFormat | null)[]): StringFormat | null {
  const nonNull = formats.filter((f) => f !== null) as StringFormat[];
  if (nonNull.length === 0) return null;
  
  const first: StringFormat | undefined = nonNull[0];
  if (first && nonNull.every((f) => f === first)) {
    return first;
  }
  
  return null;
}

