import { prisma } from "../config/prisma";

// Remembers each user's passwordChangedAt for a minute so the auth check
// doesn't add a database round trip to every request.
const CACHE_MS = 60000;
const cache = new Map<string, { changedAt: number; loadedAt: number }>();

async function passwordChangedAt(userId: string): Promise<number> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.loadedAt < CACHE_MS) return hit.changedAt;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordChangedAt: true } });
  const changedAt = user?.passwordChangedAt?.getTime() ?? 0;
  cache.set(userId, { changedAt, loadedAt: Date.now() });
  return changedAt;
}

// A token is stale if it was issued before the user's last password reset.
export async function isTokenCurrent(userId: string, issuedAtSeconds: number | undefined): Promise<boolean> {
  const changedAt = await passwordChangedAt(userId);
  if (!changedAt) return true;
  return (issuedAtSeconds ?? 0) * 1000 >= Math.floor(changedAt / 1000) * 1000;
}

export function markPasswordChanged(userId: string, at: Date) {
  cache.set(userId, { changedAt: at.getTime(), loadedAt: Date.now() });
}
