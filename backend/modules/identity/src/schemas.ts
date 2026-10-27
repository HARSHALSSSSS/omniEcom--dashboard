import { z } from 'zod';
import { EmailSchema, GstinSchema, IsoDate, PasswordSchema } from '@oms/contracts';

export const UserSummarySchema = z
  .object({
    id: z.string(),
    email: z.string(),
    fullName: z.string(),
    userType: z.enum(['vendor', 'platform']),
    vendorId: z.string().nullable(),
    roles: z.array(z.string()),
    emailVerified: z.boolean(),
    status: z.string(),
    lastLoginAt: IsoDate.nullable(),
    /** the person's own details (additive): null until they set them */
    phone: z.string().nullable(),
    roleTitle: z.string().nullable(),
  })
  .meta({ id: 'UserSummary' });

export const VendorSummarySchema = z
  .object({ id: z.string(), displayName: z.string(), slug: z.string(), status: z.string() })
  .meta({ id: 'VendorSummary' });

export const RegisterBodySchema = z.object({
  businessName: z.string().trim().min(2).max(120).meta({ example: 'Acme Apparel' }),
  legalName: z.string().trim().min(2).max(200).optional(),
  fullName: z.string().trim().min(2).max(120).meta({ example: 'Asha Rao' }),
  email: EmailSchema.meta({ example: 'asha@acme.example' }),
  password: PasswordSchema,
  phone: z.string().trim().min(7).max(20).optional(),
  gstin: GstinSchema.optional(),
});

export const LoginBodySchema = z.object({ email: EmailSchema, password: z.string().min(1).max(128) });
export const RefreshBodySchema = z.object({ refreshToken: z.string().min(20).max(200) });
export const TokenBodySchema = z.object({ token: z.string().min(20).max(200) });
export const ForgotBodySchema = z.object({ email: EmailSchema });
export const ResetBodySchema = z.object({ token: z.string().min(20).max(200), password: PasswordSchema });
export const ChangePasswordBodySchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: PasswordSchema });
/** `phone` and `roleTitle` are optional: leave them out to keep them, send null (or an empty string) to clear them */
const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
export const UpdateProfileBodySchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.preprocess(blankToNull, z.string().trim().regex(/^\+?[0-9][0-9 ()-]{5,18}[0-9]$/, 'Enter a phone number with 7 to 20 digits, for example +91 98765 43210').nullable()).optional(),
  roleTitle: z.preprocess(blankToNull, z.string().trim().min(2).max(80).nullable()).optional(),
});

export const SessionTokensSchema = z
  .object({
    tokenType: z.literal('Bearer'),
    accessToken: z.string(),
    expiresIn: z.number().int().describe('Access token lifetime in seconds'),
    refreshToken: z.string().describe('Opaque, single-use: exchange it at /auth/refresh for a new pair'),
    sessionId: z.string(),
    user: UserSummarySchema,
    vendor: VendorSummarySchema.nullable(),
  })
  .meta({ id: 'SessionTokens' });

export const RegisteredSchema = z
  .object({ user: UserSummarySchema, vendor: VendorSummarySchema, emailVerificationRequired: z.boolean() })
  .meta({ id: 'Registered' });

export const SessionSchema = z
  .object({ id: z.string(), current: z.boolean(), startedAt: IsoDate, lastActiveAt: IsoDate, userAgent: z.string().nullable(), ip: z.string().nullable() })
  .meta({ id: 'Session' });

export const MessageSchema = z.object({ message: z.string() }).meta({ id: 'Message' });

export const RoleSchema = z
  .object({ key: z.string(), name: z.string(), userType: z.enum(['vendor', 'platform']), permissions: z.array(z.string()) })
  .meta({ id: 'Role' });
