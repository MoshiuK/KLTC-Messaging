import twilio from "twilio";
import { prisma } from "../lib/prisma";

export interface SendResult {
  success: boolean;
  twilioSid?: string;
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

// In-memory cache for Twilio config per org (TTL: 5 minutes)
const CONFIG_CACHE_TTL = 5 * 60 * 1000;
const configCache = new Map<string, { data: { client: twilio.Twilio; phoneNumber: string }; expiresAt: number }>();

export async function getTwilioClient(organizationId: string) {
  // Check cache first
  const cached = configCache.get(organizationId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const config = await prisma.twilioConfig.findFirst({
    where: { organizationId },
  });

  let result: { client: twilio.Twilio; phoneNumber: string } | null = null;

  if (!config) {
    // Fallback to env vars
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const phone = process.env.TWILIO_PHONE_NUMBER;

    if (!sid || !token || !phone) {
      return null;
    }

    result = { client: twilio(sid, token), phoneNumber: phone };
  } else {
    result = {
      client: twilio(config.accountSid, config.authToken),
      phoneNumber: config.phoneNumber,
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
export function clearTwilioConfigCache(organizationId?: string) {
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
  statusCallbackUrl?: string
): Promise<SendResult> {
  const twilioSetup = await getTwilioClient(organizationId);

  if (!twilioSetup) {
    return { success: false, error: "Twilio not configured for this organization" };
  }

  try {
    const message = await twilioSetup.client.messages.create({
      to,
      from: twilioSetup.phoneNumber,
      body,
      ...(statusCallbackUrl ? { statusCallback: statusCallbackUrl } : {}),
    });

    return { success: true, twilioSid: message.sid };
  } catch (err: unknown) {
    const error = err as { message?: string; code?: number; status?: number };
    return {
      success: false,
      error: error.message || "Failed to send SMS",
      errorCode: error.code != null ? String(error.code) : undefined,
    };
  }
}

export async function makeVoiceCall(
  organizationId: string,
  to: string,
  twimlUrl: string,
  statusCallbackUrl: string
): Promise<VoiceCallResult> {
  const twilioSetup = await getTwilioClient(organizationId);

  if (!twilioSetup) {
    return { success: false, error: "Twilio not configured for this organization" };
  }

  try {
    const call = await twilioSetup.client.calls.create({
      to,
      from: twilioSetup.phoneNumber,
      url: twimlUrl,
      method: "POST",
      statusCallback: statusCallbackUrl,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    });

    return { success: true, callSid: call.sid, status: call.status };
  } catch (err: unknown) {
    const error = err as { message?: string; code?: number; status?: number };
    return {
      success: false,
      error: error.message || "Failed to make voice call",
      errorCode: error.code != null ? String(error.code) : undefined,
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
  // Truncate to Twilio's practical limit
  const truncated = messageText.slice(0, 4000);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${escapeXml(voice)}" language="${escapeXml(language)}">${escapeXml(truncated)}</Say>
</Response>`;
}
