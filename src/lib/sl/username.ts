/**
 * Second Life name handling.
 *
 * SL has two name systems living side by side and they get confused constantly:
 *
 *   - The *username* (login name) is permanent and unique: "john.doe", or a
 *     single word like "johndoe" for legacy accounts created before 2010.
 *     Legacy accounts have an implicit last name of "Resident".
 *   - The *display name* is a free-text vanity string. It changes weekly, is
 *     not unique, and must never be used to look anyone up.
 *
 * Everything in City Link keys off the username, normalised to lowercase.
 */

/** "John Doe", "John.Doe", "JOHNDOE" -> "john.doe" / "johndoe". */
export function normalizeSlUsername(input: string): string {
  return input
    .trim()
    .toLowerCase()
    // People paste legacy "First Last" form out of habit.
    .replace(/\s+/g, '.')
    // A trailing ".resident" is implied for single-word accounts; strip it so
    // "johndoe" and "johndoe.resident" resolve to one identity.
    .replace(/\.resident$/, '')
}

const USERNAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)?$/

export function isValidSlUsername(input: string): boolean {
  const normalized = normalizeSlUsername(input)
  if (normalized.length < 2 || normalized.length > 63) return false
  return USERNAME_PATTERN.test(normalized)
}

/** The form the SL grid expects: "john.doe" or "johndoe Resident". */
export function toLegacyName(username: string): string {
  const normalized = normalizeSlUsername(username)
  const [first, last] = normalized.split('.')
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  return last ? `${capitalize(first)} ${capitalize(last)}` : `${capitalize(first)} Resident`
}

/** How the name is shown in the UI when we have no display name. */
export function prettySlUsername(username: string): string {
  return toLegacyName(username)
}
