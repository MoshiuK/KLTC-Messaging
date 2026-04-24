import twilio from "twilio";
import Telnyx from "telnyx";
import { prisma } from "../lib/prisma";

export type Provider = "twilio" | "telnyx";

export interface SendResult {
  success: boolean;
  providerId?: string;
  provider?: Provider;
  error?: string;
  errorCode?: string;
}

export interface VoiceCallResult {
  success: boolean;
  callId?: string;
  provider?: Provider;
  status?: string;
  error?: string;
  errorCode?: string;
}

// --- Provider setup types ---

interface TwilioSetup {
  provider: "twilio";
  client: twilio.Twilio;
  phoneNumber: string;
}

interface TelnyxSetup {
  provider: "telnyx";
  client: any;
  phoneNumber: string;
  messagingProfileId?: string;
}

type ProviderSetup = TwilioSetup | TelnyxSetup;

// --- Cache ---
const CONFIG_CACHE_TTL = 5 * 60 * 1000;
const configCache = new Map<string, { data: ProviderSetup; expiresAt: number }>();

export function clearProviderConfigCache(organizationId?: string) {
  if (organizationId) {
    configCache.delete(organizationId);
  } else {
    configCache.clear();
  }
}

// --- Get provider for an organization ---

export async function getProviderSetup(organizationId: string): Promise<ProviderSetup | null> {
  const cached = configCache.get(organizationId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // Check which provider the org uses
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { smsProvider: true },
  });

  const provider = (org?.smsProvider as Provider) || "telnyx";
  let result: ProviderSetup | null = null;

  if (provider === "twilio") {
    result = await getTwilioSetup(organizationId);
  } else {
    result = await getTelnyxSetup(organizationId);
  }

  if (result) {
    configCache.set(organizationId, { data: result, expiresAt: Date.now() + CONFIG_CACHE_TTL });
  }

  return result;
}

async function getTwilioSetup(organizationId: string): Promise<TwilioSetup | null> {
  const config = await prisma.twilioConfig.findFirst({ where: { organizationId } });

  if (config) {
    return {
      provider: "twilio",
      client: twilio(config.accountSid, config.authToken),
      phoneNumber: config.phoneNumber,
    };
  }

  // Fallback to env vars
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const phone = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !phone) return null;

  return {
    provider: "twilio",
    client: twilio(sid, token),
    phoneNumber: phone,
  };
}

async function getTelnyxSetup(organizationId: string): Promise<TelnyxSetup | null> {
  const config = await prisma.telnyxConfig.findFirst({ where: { organizationId } });

  if (config) {
    return {
      provider: "telnyx",
      client: new (Telnyx as any)(config.apiKey),
      phoneNumber: config.phoneNumber,
      messagingProfileId: config.messagingProfileId || undefined,
    };
  }

  // Fallback to env vars
  const apiKey = process.env.TELNYX_API_KEY;
  const phone = process.env.TELNYX_PHONE_NUMBER;

  if (!apiKey || !phone) return null;

  return {
    provider: "telnyx",
    client: new (Telnyx as any)(apiKey),
    phoneNumber: phone,
    messagingProfileId: process.env.TELNYX_MESSAGING_PROFILE_ID || undefined,
  };
}

// --- Send SMS (unified) ---

export async function sendSms(
  organizationId: string,
  to: string,
  body: string,
  options?: { statusCallbackUrl?: string; mediaUrl?: string }
): Promise<SendResult> {
  const setup = await getProviderSetup(organizationId);

  if (!setup) {
    return { success: false, error: "No SMS provider configured for this organization" };
  }

  if (setup.provider === "twilio") {
    return sendSmsTwilio(setup, to, body, options);
  } else {
    return sendSmsTelnyx(setup, to, body, options);
  }
}

async function sendSmsTwilio(
  setup: TwilioSetup,
  to: string,
  body: string,
  options?: { statusCallbackUrl?: string; mediaUrl?: string }
): Promise<SendResult> {
  try {
    const params: Record<string, unknown> = { to, from: setup.phoneNumber, body };

    if (options?.statusCallbackUrl) params.statusCallback = options.statusCallbackUrl;
    if (options?.mediaUrl) params.mediaUrl = [options.mediaUrl];

    const message = await setup.client.messages.create(params as any);
    return { success: true, providerId: message.sid, provider: "twilio" };
  } catch (err: unknown) {
    const error = err as { message?: string; code?: number };
    return {
      success: false,
      provider: "twilio",
      error: error.message || "Failed to send SMS via Twilio",
      errorCode: error.code != null ? String(error.code) : undefined,
    };
  }
}

async function sendSmsTelnyx(
  setup: TelnyxSetup,
  to: string,
  body: string,
  options?: { statusCallbackUrl?: string; mediaUrl?: string }
): Promise<SendResult> {
  try {
    const params: Record<string, unknown> = { to, from: setup.phoneNumber, text: body };

    if (setup.messagingProfileId) params.messaging_profile_id = setup.messagingProfileId;
    if (options?.statusCallbackUrl) params.webhook_url = options.statusCallbackUrl;
    if (options?.mediaUrl) params.media_urls = [options.mediaUrl];

    const message = await setup.client.messages.send(params as any);
    const messageData = (message as any).data || message;

    return { success: true, providerId: messageData.id, provider: "telnyx" };
  } catch (err: unknown) {
    const error = err as { message?: string; raw?: { errors?: Array<{ code?: string; detail?: string }> } };
    const telnyxError = error.raw?.errors?.[0];
    return {
      success: false,
      provider: "telnyx",
      error: telnyxError?.detail || error.message || "Failed to send SMS via Telnyx",
      errorCode: telnyxError?.code || undefined,
    };
  }
}

// --- Voice Call (unified) ---

export async function makeVoiceCall(
  organizationId: string,
  to: string,
  twimlUrl: string,
  statusCallbackUrl: string
): Promise<VoiceCallResult> {
  const setup = await getProviderSetup(organizationId);

  if (!setup) {
    return { success: false, error: "No voice provider configured for this organization" };
  }

  if (setup.provider === "twilio") {
    return makeVoiceCallTwilio(setup, to, twimlUrl, statusCallbackUrl);
  } else {
    return makeVoiceCallTelnyx(setup, to, twimlUrl, statusCallbackUrl);
  }
}

async function makeVoiceCallTwilio(
  setup: TwilioSetup,
  to: string,
  twimlUrl: string,
  statusCallbackUrl: string
): Promise<VoiceCallResult> {
  try {
    const call = await setup.client.calls.create({
      to,
      from: setup.phoneNumber,
      url: twimlUrl,
      method: "POST",
      statusCallback: statusCallbackUrl,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    });

    return { success: true, callId: call.sid, provider: "twilio", status: call.status };
  } catch (err: unknown) {
    const error = err as { message?: string; code?: number };
    return {
      success: false,
      provider: "twilio",
      error: error.message || "Failed to make voice call via Twilio",
      errorCode: error.code != null ? String(error.code) : undefined,
    };
  }
}

async function makeVoiceCallTelnyx(
  setup: TelnyxSetup,
  to: string,
  texmlUrl: string,
  statusCallbackUrl: string
): Promise<VoiceCallResult> {
  try {
    const call = await setup.client.calls.dial({
      to,
      from: setup.phoneNumber,
      connection_id: process.env.TELNYX_SIP_CONNECTION_ID || "",
      texml_url: texmlUrl,
      webhook_url: statusCallbackUrl,
      webhook_url_method: "POST",
    } as any);

    const callData = (call as any).data || call;

    return {
      success: true,
      callId: callData.call_control_id,
      provider: "telnyx",
      status: callData.state || "initiated",
    };
  } catch (err: unknown) {
    const error = err as { message?: string; raw?: { errors?: Array<{ code?: string; detail?: string }> } };
    const telnyxError = error.raw?.errors?.[0];
    return {
      success: false,
      provider: "telnyx",
      error: telnyxError?.detail || error.message || "Failed to make voice call via Telnyx",
      errorCode: telnyxError?.code || undefined,
    };
  }
}

// --- TwiML/TeXML generation (same format, both providers support it) ---

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
  const truncated = messageText.slice(0, 4000);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${escapeXml(voice)}" language="${escapeXml(language)}">${escapeXml(truncated)}</Say>
</Response>`;
}
