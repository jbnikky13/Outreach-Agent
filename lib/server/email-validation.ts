/** Shared validation for prospect recipient addresses. */
export function isValidEmailAddress(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= 254
    && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/u.test(value);
}
