import { z } from 'zod'
export const idSchema = z.uuid()
export const panelHeightSchema = z.number().int().min(220).max(820)
export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Enter an account name.')
  .max(40, 'Use 40 characters or fewer.')
  .refine(
    (v) => Array.from(v).every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127),
    'Use a plain account name.',
  )
export const settingsSchema = z
  .object({
    appearance: z.enum(['system', 'light', 'dark']),
    syncOnSwitch: z.boolean(),
    launchAtLogin: z.boolean(),
  })
  .strict()
export const profileSchema = z
  .object({
    id: idSchema,
    name: nameSchema,
    color: z.enum(['peach', 'lavender', 'slate']),
    createdAt: z.iso.datetime(),
    connection: z.enum(['unverified', 'local-account-detected']),
    scope: z
      .string()
      .regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}$/i)
      .optional(),
  })
  .strict()
export const storeSchema = z
  .object({
    version: z.literal(1),
    profiles: z.array(profileSchema),
    activeId: idSchema.optional(),
    settings: settingsSchema,
  })
  .strict()
