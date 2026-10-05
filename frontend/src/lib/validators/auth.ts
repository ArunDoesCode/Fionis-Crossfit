import { z } from 'zod';
import '@/lib/validators/zodMessages';

// Mirrors backend/src/types/auth.types.ts (the server checks again). Passwords are 8–128 characters of
// any kind, no other rules (BR-REC-02, 27). Messages are plain sentences that say what to do (BR-REC-128).
export const USERNAME_MAX_LENGTH = 64;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const passwordTooLong = `Use at most ${PASSWORD_MAX_LENGTH} characters`;

export const loginSchema = z.object({
  username: z
    .string({ error: 'Enter your username' })
    .min(1, { error: 'Enter your username' })
    .max(USERNAME_MAX_LENGTH, { error: `Use at most ${USERNAME_MAX_LENGTH} characters` }),
  password: z
    .string({ error: 'Enter your password' })
    .min(1, { error: 'Enter your password' })
    .max(PASSWORD_MAX_LENGTH, { error: passwordTooLong }),
  remember: z.boolean({ error: 'Fill this in' }),
});

export const changePasswordSchema = z.object({
  currentPassword: z
    .string({ error: 'Enter your current password' })
    .min(1, { error: 'Enter your current password' })
    .max(PASSWORD_MAX_LENGTH, { error: passwordTooLong }),
  newPassword: z
    .string({ error: 'Enter a new password' })
    .min(PASSWORD_MIN_LENGTH, { error: `Use at least ${PASSWORD_MIN_LENGTH} characters` })
    .max(PASSWORD_MAX_LENGTH, { error: passwordTooLong }),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
