export function formatSearchFailureReference(reference: string | null): string | null {
  return reference ? `Reference: ${reference}` : null;
}
