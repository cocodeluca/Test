import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { APP_RECOVERY_MODE } from '../utils/appRecoveryMode';
import { GALLERY_SAFE_MODE } from '../utils/gallerySafeMode';

type AppSafetyValue = {
  appRecoveryMode: boolean;
  gallerySafeMode: boolean;
  isBootSettled: boolean;
  canAutoWrite: boolean;
};

const AppSafetyContext = createContext<AppSafetyValue | null>(null);

export const AppSafetyProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [isBootSettled, setIsBootSettled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      if (!cancelled) {
        setIsBootSettled(true);
      }
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, []);

  const value = useMemo<AppSafetyValue>(
    () => ({
      appRecoveryMode: APP_RECOVERY_MODE,
      gallerySafeMode: GALLERY_SAFE_MODE,
      isBootSettled,
      canAutoWrite: isBootSettled && !APP_RECOVERY_MODE,
    }),
    [isBootSettled]
  );

  return <AppSafetyContext.Provider value={value}>{children}</AppSafetyContext.Provider>;
};

export const useAppSafety = (): AppSafetyValue => {
  const value = useContext(AppSafetyContext);

  if (!value) {
    throw new Error('useAppSafety must be used within AppSafetyProvider');
  }

  return value;
};
