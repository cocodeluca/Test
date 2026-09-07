export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

const civilDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses a YYYY-MM-DD calendar value without treating it as a UTC instant. */
export const parseCivilDate = (value: string | null | undefined): CivilDate | null => {
  const match = typeof value === 'string' ? civilDatePattern.exec(value) : null;
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const localDate = new Date(year, month - 1, day);

  return localDate.getFullYear() === year && localDate.getMonth() === month - 1 && localDate.getDate() === day
    ? { year, month, day }
    : null;
};

export const toCivilDate = (date: Date): CivilDate => ({
  year: date.getFullYear(),
  month: date.getMonth() + 1,
  day: date.getDate(),
});

export const compareCivilDates = (left: CivilDate, right: CivilDate): number =>
  left.year - right.year || left.month - right.month || left.day - right.day;
