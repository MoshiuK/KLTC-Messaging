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

export async function getTwilioClient(organizationId: string) {
  const config = await prisma.twilioConfig.findFirst({
    where: { organizationId },
  });

  if (!config) {
    // Fallback to env vars
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const phone = process.env.TWILIO_PHONE_NUMBER;

    if (!sid || !token || !phone) {
      return null;
    }

    return { client: twilio(sid, token), phoneNumber: phone };
  }

  return {
    client: twilio(config.accountSid, config.authToken),
    phoneNumber: config.phoneNumber,
  };
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
    const error = err as { message?: string; code?: number };
    return {
      success: false,
      error: error.message || "Failed to send SMS",
      errorCode: error.code?.toString(),
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
    const error = err as { message?: string; code?: number };
    return {
      success: false,
      error: error.message || "Failed to make voice call",
      errorCode: error.code?.toString(),
    };
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateTwimlSay(
  messageText: string,
  voice: string = "alice",
  language: string = "en-US"
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${escapeXml(voice)}" language="${escapeXml(language)}">${escapeXml(messageText)}</Say>
</Response>`;
}
