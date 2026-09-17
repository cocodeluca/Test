import type { IncomingMessage } from 'node:http';
import {
  getSessionTokenFromRequest,
  type ServerAuthService,
} from './serverAuth';

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

export const createServerSessionOpenBankingAuthenticator = (
  authService: Pick<ServerAuthService, 'resolveToken'>
): OpenBankingRequestAuthenticator => ({
  async authenticate(request) {
    const token = getSessionTokenFromRequest(request);
    const user = token ? await authService.resolveToken(token) : null;
    if (!user) throw new OpenBankingAuthenticationError();
    return { userId: user.id };
  },
});
