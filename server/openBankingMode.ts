import { OperationalStoreConfigurationError } from './operationalStore';

export type OpenBankingMode = 'disabled' | 'enabled';

export const readOpenBankingMode = (environment: Readonly<NodeJS.ProcessEnv>): OpenBankingMode => {
  const configured = environment.OPEN_BANKING_MODE?.trim();
  if (configured === 'disabled' || configured === 'enabled') return configured;
  if (configured === undefined && environment.NODE_ENV !== 'production') return 'enabled';
  throw new OperationalStoreConfigurationError(
    'OPEN_BANKING_MODE must be explicitly set to disabled or enabled in Production.'
  );
};
