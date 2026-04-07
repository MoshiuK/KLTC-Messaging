import { prisma } from "../lib/prisma";
import { sendSms } from "./twilio";

const CHECK_INTERVAL = 60 * 1000; // Check every 60 seconds
let lastCheckedMinute = "";

export function startBirthdayScheduler() {
  console.log("Birthday scheduler started (checking every 60 seconds)");

  setInterval(async () => {
    try {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

      // Only run once per minute
      if (currentTime === lastCheckedMinute) return;
      lastCheckedMinute = currentTime;

      // Get all enabled birthday configs
      const configs = await prisma.birthdayConfig.findMany({
        where: { isEnabled: true, groupId: { not: null } },
      });

      for (const config of configs) {
        if (config.scheduledTime !== currentTime) continue;

        await processBirthdaysForOrg(config);
      }
    } catch (err) {
      console.error("Birthday scheduler error:", err);
    }
  }, CHECK_INTERVAL);
}

async function processBirthdaysForOrg(config: {
  id: string;
  organizationId: string;
  groupId: string | null;
  template1: string;
  template2: string;
  template3: string;
  template4: string;
  template5: string;
  rotationIndex: number;
}) {
  if (!config.groupId) return;

  const now = new Date();
  const currentYear = now.getFullYear();
  const monthDay = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // Find birthday entries for today that haven't been sent this year
  const todaysBirthdays = await prisma.scheduledMessage.findMany({
    where: {
      organizationId: config.organizationId,
      birthday: monthDay,
      isActive: true,
      OR: [
        { lastSentYear: null },
        { lastSentYear: { not: currentYear } },
      ],
    },
  });

  if (todaysBirthdays.length === 0) return;

  // Get the group and its members
  const group = await prisma.contactGroup.findFirst({
    where: { id: config.groupId, organizationId: config.organizationId },
    include: {
      members: {
        include: { contact: true },
      },
    },
  });

  if (!group) {
    console.error(`Birthday scheduler: Group ${config.groupId} not found for org ${config.organizationId}`);
    return;
  }

  // Filter to active, non-opted-out, non-blocked members
  const activeMembers = group.members.filter(
    (m) => m.contact.isActive && !m.contact.isOptedOut && !m.contact.isBlockedSuspected
  );

  if (activeMembers.length === 0) return;

  const templates = [config.template1, config.template2, config.template3, config.template4, config.template5];
  let rotationIndex = config.rotationIndex;

  for (const birthday of todaysBirthdays) {
    // Pick the next template in rotation
    const template = templates[rotationIndex % 5];
    const messageBody = template.replace(/\{name\}/gi, birthday.contactName);

    console.log(`Birthday scheduler: Sending birthday announcement for ${birthday.contactName} to ${activeMembers.length} members (template ${rotationIndex % 5 + 1})`);

    // Send to all active group members
    const BATCH_SIZE = 5;
    for (let i = 0; i < activeMembers.length; i += BATCH_SIZE) {
      const batch = activeMembers.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (member) => {
          try {
            const result = await sendSms(config.organizationId, member.contact.phoneNumber, messageBody);

            // Store in conversation history
            await prisma.$transaction(async (tx) => {
              const conversation = await tx.conversation.upsert({
                where: {
                  organizationId_phoneNumber: {
                    organizationId: config.organizationId,
                    phoneNumber: member.contact.phoneNumber,
                  },
                },
                create: { organizationId: config.organizationId, phoneNumber: member.contact.phoneNumber },
                update: {},
              });

              await tx.message.create({
                data: {
                  conversationId: conversation.id,
                  direction: "outbound",
                  body: messageBody,
                  status: result.success ? "queued" : "failed",
                  twilioSid: result.twilioSid || null,
                  fromNumber: "org",
                  toNumber: member.contact.phoneNumber,
                  errorCode: result.errorCode || null,
                  errorMessage: result.error || null,
                },
              });
            });

            if (!result.success) {
              console.error(`Birthday scheduler: Failed to send to ${member.contact.phoneNumber}: ${result.error}`);
            }
          } catch (err) {
            console.error(`Birthday scheduler: Error sending to ${member.contact.phoneNumber}:`, err);
          }
        })
      );
    }

    // Mark as sent for this year
    await prisma.scheduledMessage.update({
      where: { id: birthday.id },
      data: { lastSentYear: currentYear },
    });

    // Advance rotation index
    rotationIndex = (rotationIndex + 1) % 5;
  }

  // Save the updated rotation index
  await prisma.birthdayConfig.update({
    where: { id: config.id },
    data: { rotationIndex },
  });

  console.log(`Birthday scheduler: Processed ${todaysBirthdays.length} birthday(s) for org ${config.organizationId}`);
}
