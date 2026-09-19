import { prisma } from "@/lib/prisma";
import { clerkClient } from "@clerk/nextjs/server";

/**
 * Returns the Synapse User row for the signed-in Clerk user,
 * creating it on first visit if it doesn't exist yet.
 *
 * Clerk is the source of truth for identity; our User table stores
 * app data (documents) keyed by clerkId. This "get-or-create" sync is
 * the lazy alternative to Clerk webhooks: fine for a dev project,
 * but note it only runs when a user actually visits the app.
 */
export async function getOrCreateUser(clerkUserId: string) {
  const existing = await prisma.user.findUnique({
    where: { clerkId: clerkUserId },
  });
  if (existing) return existing;

  const client = await clerkClient();
  const clerkUser = await client.users.getUser(clerkUserId);

  return prisma.user.create({
    data: {
      clerkId: clerkUser.id,
      email: clerkUser.primaryEmailAddress?.emailAddress ?? "",
      name:
        clerkUser.firstName && clerkUser.lastName
          ? `${clerkUser.firstName} ${clerkUser.lastName}`
          : clerkUser.firstName ??
            clerkUser.username ??
            clerkUser.primaryEmailAddress?.emailAddress ??
            "Anonymous",
    },
  });
}
