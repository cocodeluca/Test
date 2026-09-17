import type { IncomingMessage } from 'node:http';

export interface AuthenticatedOpenBankingPrincipal {
  userId: string;
}

export interface OpenBankingRequestAuthenticator {
  authenticate(request: IncomingMessage): Promise<AuthenticatedOpenBankingPrincipal>;
}

export class OpenBankingAuthenticationError extends Error {
  readonly code = 'OPEN_BANKING_AUTHENTICATION_REQUIRED';

  constructor(message = 'Server-authenticated session required.') {
    super(message);
    this.name = 'OpenBankingAuthenticationError';
  }
}

export const unavailableOpenBankingAuthenticator: OpenBankingRequestAuthenticator = {
  async authenticate(_request) {
    throw new OpenBankingAuthenticationError();
  },
};
