import type { UserPortfolioData } from './localAccountStore';
import { saveUserPortfolio, serializeUserPortfolioForPersistence } from './localAccountStore';
import { tracePortfolioPersistence } from './portfolioPersistenceTrace';

export type PersistenceStatus = 'saving' | 'saved' | 'error';
/** Latest revision owns the status; an older completion cannot hide a newer failure. */
export const createPortfolioPersistence = (userId: string, publish: (status: PersistenceStatus) => void) => {
  let revision = 0;
  let savedSignature: string | null = null;
  const save = async (portfolio: UserPortfolioData) => {
    const current = ++revision;
    publish('saving');
    tracePortfolioPersistence('autosave:status', { userId, accountId: userId, indexedDbKey: userId, details: { status: 'saving', revision: current } });
    try {
      const signature = serializeUserPortfolioForPersistence(portfolio);
      await saveUserPortfolio(userId, portfolio);
      if (current === revision) {
        savedSignature = signature;
        publish('saved');
        tracePortfolioPersistence('autosave:status', { userId, accountId: userId, indexedDbKey: userId, details: { status: 'saved', revision: current } });
      }
    } catch (error) {
      if (current === revision) {
        publish('error');
        tracePortfolioPersistence('autosave:status', { userId, accountId: userId, indexedDbKey: userId, details: { status: 'error', revision: current } });
      }
      throw error;
    }
  };
  return { save, getSavedSignature: () => savedSignature };
};
