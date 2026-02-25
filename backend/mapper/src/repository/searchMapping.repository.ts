import prisma from '../prisma/client';

/**
 * Looks up an existing SearchMapping by provider + vertical + formSignature.
 * Returns the stored mapping JSON (fieldId → "search.*" key), or null if not cached.
 */
export async function findSearchMapping(
  provider: string,
  vertical: string,
  formSignature: string,
): Promise<Record<string, string | null> | null> {
  const record = await prisma.searchMapping.findUnique({
    where: {
      provider_vertical_formSignature: { provider, vertical, formSignature },
    },
  });

  if (!record) return null;
  return record.mapping as Record<string, string | null>;
}

/**
 * Stores a new SearchMapping in the database.
 *
 * Uses upsert so concurrent requests for the same form never cause a unique
 * constraint violation — the last write wins, which is safe because the LLM
 * output for the same (provider + vertical + signature) is deterministic.
 */
export async function saveSearchMapping(
  provider: string,
  vertical: string,
  formSignature: string,
  mapping: Record<string, string | null>,
): Promise<void> {
  await prisma.searchMapping.upsert({
    where: {
      provider_vertical_formSignature: { provider, vertical, formSignature },
    },
    update: { mapping },
    create: { provider, vertical, formSignature, mapping },
  });
}
