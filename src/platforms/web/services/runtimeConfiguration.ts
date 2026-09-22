export interface RuntimeConfiguration {
  accountBackupMode: 'enabled' | 'disabled';
  openBankingAvailable: boolean;
}

let pendingConfiguration: Promise<RuntimeConfiguration> | null = null;

export const getRuntimeConfiguration = (): Promise<RuntimeConfiguration> => {
  pendingConfiguration ??= fetch('/api/config', {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  }).then(async (response) => {
    if (!response.ok) throw new Error('Runtime configuration is unavailable.');
    const value = await response.json() as Partial<RuntimeConfiguration>;
    if (value.accountBackupMode !== 'enabled' && value.accountBackupMode !== 'disabled') {
      throw new Error('Runtime configuration is invalid.');
    }
    return {
      accountBackupMode: value.accountBackupMode,
      openBankingAvailable: value.openBankingAvailable === true,
    };
  }).catch((error) => {
    pendingConfiguration = null;
    throw error;
  });
  return pendingConfiguration;
};

export const isRemoteAccountBackupEnabled = async () =>
  (await getRuntimeConfiguration()).accountBackupMode === 'enabled';

export const resetRuntimeConfigurationCache = () => {
  pendingConfiguration = null;
};
