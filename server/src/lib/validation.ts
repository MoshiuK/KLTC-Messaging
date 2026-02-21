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
});

export const contactUpdateSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phoneNumber: e164Phone.optional(),
  email: emailSchema,
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
});
