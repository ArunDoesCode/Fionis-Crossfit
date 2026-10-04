// Time zone names for the gym settings (BR-REC-60). The list comes from the browser's own `Intl`, so every
// name in it is one a server with a current `Intl` also knows. The saved name is always in the list even
// when this browser spells it differently (some list "Asia/Calcutta" for "Asia/Kolkata"), and "UTC" is
// added because `supportedValuesOf` leaves it out.
export function timeZoneOptions(current: string): string[] {
  const known =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return [...new Set([...known, 'UTC', current])].sort((a, b) => a.localeCompare(b));
}
