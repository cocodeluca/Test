import { getLocalDateKey } from '../../../common/utils/fxRates';

export const getMillisecondsUntilNextLocalDay = (now: Date): number => {
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0
  );
  return Math.max(1, nextMidnight.getTime() - now.getTime());
};

export interface FxDayRolloverController {
  start: () => void;
  stop: () => void;
  handleActivation: () => void;
}

export const createFxDayRolloverController = ({
  now = () => new Date(),
  refresh,
  setTimer = (callback, delay) => window.setTimeout(callback, delay),
  clearTimer = (timer) => window.clearTimeout(timer),
}: {
  now?: () => Date;
  refresh: () => void | Promise<void>;
  setTimer?: (callback: () => void, delay: number) => number;
  clearTimer?: (timer: number) => void;
}): FxDayRolloverController => {
  let timer: number | null = null;
  let observedLocalDateKey = getLocalDateKey(now());

  const scheduleNextBoundary = () => {
    if (timer !== null) {
      clearTimer(timer);
    }
    const currentTime = now();
    timer = setTimer(checkForDayChange, getMillisecondsUntilNextLocalDay(currentTime));
  };

  const checkForDayChange = () => {
    const currentLocalDateKey = getLocalDateKey(now());
    const localDayChanged = currentLocalDateKey !== observedLocalDateKey;
    observedLocalDateKey = currentLocalDateKey;
    scheduleNextBoundary();

    if (localDayChanged) {
      void refresh();
    }
  };

  return {
    start: () => {
      observedLocalDateKey = getLocalDateKey(now());
      scheduleNextBoundary();
    },
    stop: () => {
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
    },
    handleActivation: checkForDayChange,
  };
};
