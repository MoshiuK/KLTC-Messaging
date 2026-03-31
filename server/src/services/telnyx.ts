import { Telnyx } from "telnyx";
import { prisma } from "../lib/prisma";

export interface SendResult {
  success: boolean;
  messageSid?: string;
  error?: string;
  errorCode?: string;
}

export interface VoiceCallResult {
  success: boolean;
  callSid?: string;
  status?: string;
  error?: string;
  errorCode?: string;
}

// In-memory cache for Telnyx config per org (TTL: 5 minutes)
const CONFIG_CACHE_TTL = 5 * 60 * 1000;
const configCache = new Map<string, { data: { client: any; phoneNumber: string; messagingProfileId?: string }; expiresAt: number }>();

export async function getTelnyxClient(organizationId: string) {
  // Check cache first
  const cached = configCache.get(organizationId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const config = await prisma.telnyxConfig.findFirst({
    where: { organizationId },
  });

  let result: { client: any; phoneNumber: string; messagingProfileId?: string } | null = null;

  if (!config) {
    // Fallback to env vars
    const apiKey = process.env.TELNYX_API_KEY;
    const phone = process.env.TELNYX_PHONE_NUMBER;

    if (!apiKey || !phone) {
      return null;
    }

    result = {
      client: new Telnyx({ apiKey }),
      phoneNumber: phone,
      messagingProfileId: process.env.TELNYX_MESSAGING_PROFILE_ID || undefined,
    };
  } else {
    result = {
      client: new Telnyx({ apiKey: config.apiKey }),
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

    const message = await telnyxSetup.client.messages.create(createParams);
    const msgId = message?.data?.id || message?.id;

    return { success: true, messageSid: msgId };
  } catch (err: unknown) {
    const error = err as { message?: string; raw?: { errors?: Array<{ code?: string; detail?: string }> } };
    const errDetail = error.raw?.errors?.[0];
    return {
      success: false,
      error: errDetail?.detail || error.message || "Failed to send SMS",
      errorCode: errDetail?.code || undefined,
    };
  }
}

export async function makeVoiceCall(
  organizationId: string,
  to: string,
  webhookUrl: string,
  statusCallbackUrl: string
): Promise<VoiceCallResult> {
  const telnyxSetup = await getTelnyxClient(organizationId);

  if (!telnyxSetup) {
    return { success: false, error: "Telnyx not configured for this organization" };
  }

  try {
    const call = await telnyxSetup.client.calls.create({
      connection_id: process.env.TELNYX_SIP_CONNECTION_ID || "",
      to,
      from: telnyxSetup.phoneNumber,
      webhook_url: webhookUrl,
      webhook_url_method: "POST",
    });

    const callId = call?.data?.call_control_id || call?.call_control_id;
    const callLegId = call?.data?.call_leg_id || call?.call_leg_id;

    return { success: true, callSid: callId || callLegId, status: "initiated" };
  } catch (err: unknown) {
    const error = err as { message?: string; raw?: { errors?: Array<{ code?: string; detail?: string }> } };
    const errDetail = error.raw?.errors?.[0];
    return {
      success: false,
      error: errDetail?.detail || error.message || "Failed to make voice call",
      errorCode: errDetail?.code || undefined,
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

export function generateTwimlSay(
  messageText: string,
  voice: string = "alice",
  language: string = "en-US"
): string {
  // Telnyx supports TwiML-compatible XML for voice
  const truncated = messageText.slice(0, 4000);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${escapeXml(voice)}" language="${escapeXml(language)}">${escapeXml(truncated)}</Say>
</Response>`;
}
