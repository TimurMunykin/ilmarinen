const DAYS_MS = 24 * 60 * 60 * 1000;

/**
 * Evaluates a notification condition against a database record.
 *
 * Supported formats:
 *   daysUntil(<field>) <= N
 *   daysSince(<field>) >= N
 */
export function evaluateCondition(
  condition: string,
  record: Record<string, unknown>,
  now: Date = new Date(),
): boolean {
  const daysUntilMatch = condition.match(/^daysUntil\((\w+)\)\s*<=\s*(\d+)$/);
  if (daysUntilMatch) {
    const [, field, threshold] = daysUntilMatch;
    const dateValue = record[field];
    if (!(dateValue instanceof Date)) return false;
    const daysUntil = Math.ceil((dateValue.getTime() - now.getTime()) / DAYS_MS);
    return daysUntil <= parseInt(threshold, 10);
  }

  const daysSinceMatch = condition.match(/^daysSince\((\w+)\)\s*>=\s*(\d+)$/);
  if (daysSinceMatch) {
    const [, field, threshold] = daysSinceMatch;
    const dateValue = record[field];
    if (!(dateValue instanceof Date)) return false;
    const daysSince = Math.floor((now.getTime() - dateValue.getTime()) / DAYS_MS);
    return daysSince >= parseInt(threshold, 10);
  }

  return false;
}
