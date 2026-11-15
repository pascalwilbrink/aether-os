import { z } from 'zod';

import { createZodDto } from '@pistis/core';

/**
 * The sign-in page's form. Not part of the REST API (it's an HTML form on
 * an OIDC interaction), so it's defined here rather than generated.
 */
export const zSignInForm = z.object({
  login: z.string().min(1).max(320),
  password: z.string().min(1).max(256),
});

export class SignInForm extends createZodDto(zSignInForm) {}
