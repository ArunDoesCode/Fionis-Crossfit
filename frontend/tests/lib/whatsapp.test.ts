// Spec: docs/specs/member-records/members.md (v8) BR-REC-59 — on the member page the phone opens a WhatsApp
//   chat in a new tab: `https://wa.me/<digits>`: "first the number is cut down as for BR-REC-127 (non-digits
//   removed, a leading `91` on 12 digits or `0` on 11 digits dropped), then a 10-digit number gets `91` in
//   front and any other number keeps its own digits ("09845012345" → `wa.me/919845012345`)".
//   Helper `whatsAppUrl(phone)` in `@/lib/members/whatsapp`.
// Interface: `whatsAppUrl(phone: string): string`.
import { beforeAll, describe, expect, test } from 'bun:test';

interface WhatsApp {
  whatsAppUrl(phone: string): string;
}

let wa: WhatsApp;

beforeAll(async () => {
  wa = (await import('@/lib/members/whatsapp')) as unknown as WhatsApp;
});

describe('BR-REC-59 whatsAppUrl: 10-digit number (after cut-down) gets 91 in front', () => {
  test.each<[string, string]>([
    ['plain ten digits', '9845012345'],
    ['grouped as shown "98450 12345"', '98450 12345'],
    ['grouped with a dash', '98450-12345'],
    ['leading 0 (11 digits) is dropped first', '09845012345'],
    ['leading 0 with grouping is dropped first', '0 98450 12345'],
  ])('BR-REC-59 %s -> https://wa.me/919845012345', (_name, stored) => {
    expect(wa.whatsAppUrl(stored)).toBe('https://wa.me/919845012345');
  });
});

describe('BR-REC-59 whatsAppUrl: any other number keeps its own digits (91 on 12 digits is dropped, then 91 added back)', () => {
  test.each<[string, string, string]>([
    ['+91 prefix', '+919845012345', 'https://wa.me/919845012345'],
    ['91 prefix without plus', '919845012345', 'https://wa.me/919845012345'],
    ['+91 with spaces', '+91 98450 12345', 'https://wa.me/919845012345'],
    ['+91 with dashes', '+91-98450-12345', 'https://wa.me/919845012345'],
    ['other country code', '+14155550123', 'https://wa.me/14155550123'],
  ])('BR-REC-59 %s', (_name, stored, expected) => {
    expect(wa.whatsAppUrl(stored)).toBe(expected);
  });
});

describe('BR-REC-59 whatsAppUrl: URL shape', () => {
  test('BR-REC-59 the link has no plus, spaces or dashes after wa.me/', () => {
    for (const stored of ['+91 98450-12345', '98450 12345', '(+91) 9845012345']) {
      expect(wa.whatsAppUrl(stored)).toMatch(/^https:\/\/wa\.me\/\d+$/);
    }
  });

  test('BR-REC-59 the same number in different stored forms gives the same link', () => {
    const urls = ['9845012345', '+919845012345', '919845012345', '98450 12345', '09845012345'].map(
      wa.whatsAppUrl,
    );
    expect(new Set(urls).size).toBe(1);
  });
});
