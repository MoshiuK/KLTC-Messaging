import { z } from "zod";

export const e164Phone = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, "Phone number must be in E.164 format (e.g. +15551234567)");

export const emailSchema = z
  .string()
  .email("Invalid email address")
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

export const contactCreateSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  phoneNumber: e164Phone,
  email: emailSchema,
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Birthday must be YYYY-MM-DD format").optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
});

export const contactUpdateSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phoneNumber: e164Phone.optional(),
  email: emailSchema,
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Birthday must be YYYY-MM-DD format").optional().nullable().or(z.literal("")).transform((v) => (v === "" ? null : v)),
  isActive: z.boolean().optional(),
  isOptedOut: z.boolean().optional(),
  isBlockedSuspected: z.boolean().optional(),
  blockedReason: z.string().optional().nullable(),
});

export const groupCreateSchema = z.object({
  name: z.string().min(1, "Group name is required").max(200),
  description: z.string().max(500).optional(),
});

export const groupUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional().nullable(),
});

export const addMembersSchema = z.object({
  contactIds: z.array(z.string().min(1)).min(1, "At least one contact ID is required"),
});

export const groupSendSchema = z.object({
  groupId: z.string().min(1, "Group ID is required"),
  body: z.string().min(1, "Message body is required").max(1600),
  mediaUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  organizationName: z.string().min(1),
});

export const directSmsSchema = z.object({
  to: e164Phone,
  body: z.string().min(1).max(1600),
  mediaUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// User management schemas (admin)
export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.enum(["admin", "member"]).optional().default("member"),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(["admin", "member"]).optional(),
});

// Birthday message schemas
export const birthdaySettingsSchema = z.object({
  birthdayMessageTemplate: z.string().min(1, "Message template is required").max(1600),
  birthdayMessageEnabled: z.boolean(),
  sendToEveryone: z.boolean().default(true),
  birthdayGroupId: z.string().optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
});

// Voice call schemas
export const voiceCallSchema = z.object({
  to: e164Phone,
  message: z.string().min(1, "Message text is required").max(5000),
  voice: z.enum(["alice", "man", "woman"]).optional().default("alice"),
  language: z.string().optional().default("en-US"),
});

export const groupVoiceCallSchema = z.object({
  groupId: z.string().min(1, "Group ID is required"),
  message: z.string().min(1, "Message text is required").max(5000),
  voice: z.enum(["alice", "man", "woman"]).optional().default("alice"),
  language: z.string().optional().default("en-US"),
});

// Branding schema
export const updateBrandingSchema = z.object({
  appName: z.string().min(1).max(100).optional(),
  logoUrl: z.string().url().max(500).optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color").optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color").optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color").optional(),
});
