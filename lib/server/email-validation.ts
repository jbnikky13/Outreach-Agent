/** Shared validation for prospect recipient addresses. */
export function isValidEmailAddress(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 254) return false;
  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (
    local.length === 0 || local.length > 64 ||
    local.startsWith(".") || local.endsWith(".") || local.includes("..") ||
    !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)
  ) return false;
  const labels = domain.split(".");
  return labels.length >= 2 && labels.every(label =>
    label.length > 0 && label.length <= 63 &&
    /^[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?$/i.test(label)
  );
}
