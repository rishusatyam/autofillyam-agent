import prisma from '../prisma/client';

/**
 * Looks up an existing FormMapping by provider + formSignature.
 * Returns the stored mapping JSON (fieldId → nested path), or null if not found.
 */
export async function findMapping(
  provider: string,
  formSignature: string
): Promise<Record<string, string | null> | null> {
  const record = await prisma.formMapping.findUnique({
    where: { provider_formSignature: { provider, formSignature } },
  });

  if (!record) return null;
  return record.mapping as Record<string, string | null>;
}

/**
 * Stores a new FormMapping in the database (fieldId → nested path).
 * Uses upsert so concurrent requests for the same form don't cause a unique
 * constraint violation — the last write wins, which is safe since the LLM
 * output for the same form structure is deterministic.
 */
export async function saveMapping(
  provider: string,
  formSignature: string,
  mapping: Record<string, string | null>
): Promise<void> {
  await prisma.formMapping.upsert({
    where:  { provider_formSignature: { provider, formSignature } },
    update: { mapping },
    create: { provider, formSignature, mapping },
  });
}
