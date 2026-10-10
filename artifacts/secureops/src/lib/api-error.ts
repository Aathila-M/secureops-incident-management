export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    try {
      const parsed = JSON.parse(error.message) as { error?: string; message?: string };
      if (parsed.error || parsed.message) return parsed.error ?? parsed.message ?? error.message;
    } catch {
      return error.message;
    }
    return error.message;
  }
  if (error && typeof error === 'object' && 'error' in error && typeof error.error === 'string') return error.error;
  return 'The request could not be completed. Please try again.';
}
