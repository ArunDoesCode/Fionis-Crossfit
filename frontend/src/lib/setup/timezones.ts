// Time zone names for the gym settings (BR-REC-60). The list comes from the browser's own `Intl`, so every
// name in it is one a server with a current `Intl` also knows. The saved name is always in the list even
// when this browser spells it differently (some list "Asia/Calcutta" for "Asia/Kolkata"), and "UTC" is
// added because `supportedValuesOf` leaves it out.
export function timeZoneOptions(current: string): string[] {
  const known =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return [...new Set([...known, 'UTC', current])].sort((a, b) => a.localeCompare(b));
}

// How a time zone reads in the settings box (BR-REC-233): "India (Kolkata) · IST". The saved value is still the
// id; only the text changes. The country comes from a small table of the zones a gym is likely to pick (the
// browser has no country names for zones); any other id reads as its city and the short name the browser gives.
const COUNTRY_OF: Record<string, string> = {
  'Asia/Kolkata': 'India',
  'Asia/Calcutta': 'India',
  'Asia/Dubai': 'United Arab Emirates',
  'Asia/Singapore': 'Singapore',
  'Asia/Colombo': 'Sri Lanka',
  'Asia/Kathmandu': 'Nepal',
  'Asia/Dhaka': 'Bangladesh',
  'Asia/Karachi': 'Pakistan',
  'Asia/Tokyo': 'Japan',
  'Asia/Hong_Kong': 'Hong Kong',
  'Europe/London': 'United Kingdom',
  'Europe/Paris': 'France',
  'Europe/Berlin': 'Germany',
  'America/New_York': 'United States',
  'America/Chicago': 'United States',
  'America/Denver': 'United States',
  'America/Los_Angeles': 'United States',
  'Australia/Sydney': 'Australia',
  'Pacific/Auckland': 'New Zealand',
};

// Zones whose short name the browser spells as "GMT+5:30"; the common local abbreviation reads better.
const SHORT_NAME_OF: Record<string, string> = {
  'Asia/Kolkata': 'IST',
  'Asia/Calcutta': 'IST',
  'Asia/Dubai': 'GST',
  'Asia/Singapore': 'SGT',
  'Asia/Colombo': 'IST',
  'Asia/Kathmandu': 'NPT',
  'Asia/Dhaka': 'BST',
  'Asia/Karachi': 'PKT',
  'Asia/Tokyo': 'JST',
  'Asia/Hong_Kong': 'HKT',
};

const cityOf = (id: string): string => (id.split('/').pop() ?? id).replaceAll('_', ' ');

function browserShortName(id: string): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: id, timeZoneName: 'short' })
      .formatToParts(new Date())
      .find((entry) => entry.type === 'timeZoneName');
    return part?.value ?? '';
  } catch {
    return '';
  }
}

/** "India (Kolkata) · IST" for `Asia/Kolkata`; "Berlin · CET" style for a zone without a country entry. */
export function timeZoneLabel(id: string): string {
  if (id === 'UTC') return 'UTC';
  const city = cityOf(id);
  const country = COUNTRY_OF[id];
  const place = country ? `${country} (${city})` : city;
  const short = SHORT_NAME_OF[id] ?? browserShortName(id);
  return short ? `${place} · ${short}` : place;
}
