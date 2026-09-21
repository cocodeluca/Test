import { OperationalStoreConfigurationError } from './operationalStore';
import { startProductionServer } from './standaloneServer';

startProductionServer().catch((error) => {
  console.error('[api] Production startup refused.', {
    errorName: error instanceof Error ? error.name : 'UnknownError',
    errorCode: error instanceof OperationalStoreConfigurationError ? error.code : null,
    message: error instanceof Error ? error.message : 'Unknown startup error.',
  });
  process.exitCode = 1;
});
