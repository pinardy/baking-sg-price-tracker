export class ProviderError extends Error {
  constructor(
    public providerId: string,
    message: string,
    public cause?: unknown,
  ) {
    super(`[${providerId}] ${message}`);
    this.name = 'ProviderError';
  }
}
