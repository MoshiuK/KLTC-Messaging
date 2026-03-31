import Telnyx from "telnyx";
import { prisma } from "../lib/prisma";

export interface SendResult {
  success: boolean;
  telnyxId?: string;
  error?: string;
  errorCode?: string;
}

export interface VoiceCallResult {
  success: boolean;
  callControlId?: string;
  callLegId?: string;
  status?: string;
  error?: string;
  errorCode?: string;
}

interface TelnyxSetup {
  client: any;
  phoneNumber: string;
  messagingProfileId?: string;
}

// In-memory cache for Telnyx config per org (TTL: 5 minutes)
const CONFIG_CACHE_TTL = 5 * 60 * 1000;
const configCache = new Map<string, { data: TelnyxSetup; expiresAt: number }>();

export async function getTelnyxClient(organizationId: string): Promise<TelnyxSetup | null> {
  // Check cache first
  const cached = configCache.get(organizationId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const config = await prisma.telnyxConfig.findFirst({
    where: { organizationId },
  });

  let result: TelnyxSetup | null = null;

  if (!config) {
    // Fallback to env vars
    const apiKey = process.env.TELNYX_API_KEY;
    const phone = process.env.TELNYX_PHONE_NUMBER;

    if (!apiKey || !phone) {
      return null;
    }

    result = {
      client: new (Telnyx as any)(apiKey),
      phoneNumber: phone,
      messagingProfileId: process.env.TELNYX_MESSAGING_PROFILE_ID || undefined,
    };
  } else {
    result = {
      client: new (Telnyx as any)(config.apiKey),
      phoneNumber: config.phoneNumber,
      messagingProfileId: config.messagingProfileId || undefined,
    };
  }

  // Cache the result
  configCache.set(organizationId, {
    data: result,
    expiresAt: Date.now() + CONFIG_CACHE_TTL,
  });

  return result;
}

// Allow cache invalidation when config changes
export function clearTelnyxConfigCache(organizationId?: string) {
  if (organizationId) {
    configCache.delete(organizationId);
  } else {
    configCache.clear();
  }
}

export async function sendSms(
  organizationId: string,
  to: string,
  body: string,
  options?: { statusCallbackUrl?: string; mediaUrl?: string }
): Promise<SendResult> {
  const telnyxSetup = await getTelnyxClient(organizationId);

  if (!telnyxSetup) {
    return { success: false, error: "Telnyx not configured for this organization" };
  }

  try {
    const createParams: Record<string, unknown> = {
      to,
      from: telnyxSetup.phoneNumber,
      text: body,
    };

    if (telnyxSetup.messagingProfileId) {
      createParams.messaging_profile_id = telnyxSetup.messagingProfileId;
    }

    if (options?.statusCallbackUrl) {
      createParams.webhook_url = options.statusCallbackUrl;
    }

    if (options?.mediaUrl) {
      createParams.media_urls = [options.mediaUrl];
    }

    const message = await telnyxSetup.client.messages.create(createParams as any);
    const messageData = (message as any).data || message;

    return { success: true, telnyxId: messageData.id };
  } catch (err: unknown) {
    const error = err as { message?: string; raw?: { errors?: Array<{ code?: string; detail?: string }> } };
    const telnyxError = error.raw?.errors?.[0];
    return {
      success: false,
      error: telnyxError?.detail || error.message || "Failed to send SMS",
      errorCode: telnyxError?.code || undefined,
    };
  }
}

export async function makeVoiceCall(
  organizationId: string,
  to: string,
  texmlUrl: string,
  statusCallbackUrl: string
): Promise<VoiceCallResult> {
  const telnyxSetup = await getTelnyxClient(organizationId);

  if (!telnyxSetup) {
    return { success: false, error: "Telnyx not configured for this organization" };
  }

  try {
    const call = await telnyxSetup.client.calls.create({
      to,
      from: telnyxSetup.phoneNumber,
      connection_id: process.env.TELNYX_SIP_CONNECTION_ID || "",
      texml_url: texmlUrl,
      webhook_url: statusCallbackUrl,
      webhook_url_method: "POST",
    } as any);

    const callData = (call as any).data || call;

    return {
      success: true,
      callControlId: callData.call_control_id,
      callLegId: callData.call_leg_id,
      status: callData.state || "initiated",
    };
  } catch (err: unknown) {
    const error = err as { message?: string; raw?: { errors?: Array<{ code?: string; detail?: string }> } };
    const telnyxError = error.raw?.errors?.[0];
    return {
      success: false,
      error: telnyxError?.detail || error.message || "Failed to make voice call",
      errorCode: telnyxError?.code || undefined,
    };
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/\r\n/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ");
}

// Telnyx uses TeXML (compatible with TwiML)
export function generateTexmlSay(
  messageText: string,
  voice: string = "alice",
  language: string = "en-US"
): string {
  const truncated = messageText.slice(0, 4000);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${escapeXml(voice)}" language="${escapeXml(language)}">${escapeXml(truncated)}</Say>
</Response>`;
}
