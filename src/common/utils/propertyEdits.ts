import type { Property } from '../types';

const valuesEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export const mergeChangedPropertyFields = (
  original: Property,
  baselineDraft: Property,
  editedDraft: Property
): Property => {
  const next = { ...original } as Property & Record<string, unknown>;
  const baseline = baselineDraft as Property & Record<string, unknown>;
  const edited = editedDraft as Property & Record<string, unknown>;

  Object.keys(edited).forEach((key) => {
    if (!valuesEqual(baseline[key], edited[key])) {
      next[key] = edited[key];
    }
  });

  return next;
};

export const replacePropertyRecord = (
  properties: Property[],
  updatedProperty: Property
): Property[] =>
  properties.map((property) =>
    property.id === updatedProperty.id ? updatedProperty : property
  );
