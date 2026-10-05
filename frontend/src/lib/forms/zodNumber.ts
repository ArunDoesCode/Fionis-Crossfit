import { z } from 'zod';
import type { Decimals } from '@/lib/assessments/types';
import { parseNumberText } from '@/lib/forms/numberText';

// Text -> number for form schemas (BR-REC-197): one parser, one set of messages. Chain `.pipe(z.number()…)`
// for range rules, e.g. `numberFromText(0).pipe(z.number().min(0, { error: 'Use 0 to 30 days' }))`.

export const NUMBER_REQUIRED = 'Enter a number';
export const numberExample = (decimals: Decimals): string =>
  `Enter a number like ${decimals === 0 ? '7' : '95.5'}`;

/** A required number typed as text; blank gives "Enter a number". */
export const numberFromText = (decimals: Decimals = 0) =>
  z.string().transform((text, ctx) => {
    const parsed = parseNumberText(text, decimals);
    if (parsed.kind === 'ok') return parsed.value;
    const message = parsed.kind === 'empty' ? NUMBER_REQUIRED : numberExample(decimals);
    ctx.issues.push({ code: 'custom', message, input: text });
    return z.NEVER;
  });

/** An optional number typed as text; blank gives `null`. */
export const optionalNumberFromText = (decimals: Decimals = 0) =>
  z.string().transform((text, ctx) => {
    const parsed = parseNumberText(text, decimals);
    if (parsed.kind === 'ok') return parsed.value;
    if (parsed.kind === 'empty') return null;
    ctx.issues.push({ code: 'custom', message: numberExample(decimals), input: text });
    return z.NEVER;
  });
