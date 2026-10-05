import { nationalDigits } from '@/lib/format';

/**
 * The WhatsApp chat link for a stored phone (BR-REC-59): `https://wa.me/<digits>`. The number is first cut
 * down as for BR-REC-127 (`nationalDigits`); a ten-digit result gets the India code `91` in front, any other
 * number keeps its own digits.
 */
export const whatsAppUrl = (phone: string): string => {
  const national = nationalDigits(phone);
  return `https://wa.me/${national.length === 10 ? `91${national}` : national}`;
};
