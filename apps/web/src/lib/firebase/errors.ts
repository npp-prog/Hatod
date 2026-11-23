/** Extracts a Firebase error code ("auth/invalid-verification-code", "functions/invalid-argument"). */
export function errorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err && typeof err.code === 'string') return err.code;
  return 'unknown';
}

/**
 * Message code thrown by our callables (HttpsError message), e.g.
 * "cannot_remove_own_admin". Newer Firebase clients append the HTTP status
 * ("shop_closed [400]"); that suffix is removed.
 */
export function callableMessage(err: unknown): string | null {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') return err.message.replace(/\s*\[\d{3}\]$/, '');
  return null;
}

/** First field issue code from an invalid_input callable error. */
export function firstIssueCode(err: unknown): string | null {
  const details = (err as { details?: { issues?: { code: string }[] } } | null)?.details;
  return details?.issues?.[0]?.code ?? null;
}
