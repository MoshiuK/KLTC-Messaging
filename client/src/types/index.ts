export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  organizationId: string;
  organizationName: string;
}

export interface Contact {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phoneNumber: string;
  email: string | null;
  birthday: string | null;
  isActive: boolean;
  isOptedOut: boolean;
  isBlockedSuspected: boolean;
  blockedReason: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { groupMemberships: number };
}

export interface ContactGroup {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  createdBy: { firstName: string; lastName: string; email: string };
  _count: { members: number };
}

export interface ContactGroupMember {
  id: string;
  groupId: string;
  contactId: string;
  createdAt: string;
  contact: Contact;
}

export interface ContactStatusEvent {
  id: string;
  organizationId: string;
  contactId: string;
  eventType: string;
  source: string;
  detail: string | null;
  providerId: string | null;
  errorCode: string | null;
  createdAt: string;
  contact: { id: string; fullName: string; phoneNumber: string };
}

export interface GroupSendResult {
  contactId: string;
  contactName: string;
  phoneNumber: string;
  status: "sent" | "skipped" | "failed";
  reason?: string;
  providerId?: string;
}

export interface GroupSendResponse {
  summary: { total: number; sent: number; skipped: number; failed: number };
  results: GroupSendResult[];
}

export interface AuthResponse {
  token: string;
  user: User;
}

// Voice call types
export interface VoiceCallResult {
  contactId: string;
  contactName: string;
  phoneNumber: string;
  status: "called" | "skipped" | "failed";
  reason?: string;
  callSid?: string;
}

export interface GroupVoiceCallResponse {
  summary: { total: number; called: number; skipped: number; failed: number };
  results: VoiceCallResult[];
}

// Organization user (admin-managed)
export interface OrgUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  createdAt: string;
}

// Branding types
export interface BrandingConfig {
  appName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}

export interface Organization {
  id: string;
  name: string;
  isActive: boolean;
  monthlyMessageLimit: number | null;
  contactLimit: number | null;
  userLimit: number | null;
  createdAt: string;
  usage: { users: number; contacts: number; messagesThisMonth: number };
}

export interface CreateOrganizationInput {
  organizationName: string;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  adminPassword: string;
  monthlyMessageLimit?: number | null;
  contactLimit?: number | null;
  userLimit?: number | null;
}

export interface UpdateOrganizationInput {
  name?: string;
  isActive?: boolean;
  monthlyMessageLimit?: number | null;
  contactLimit?: number | null;
  userLimit?: number | null;
}
