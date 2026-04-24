import type {
  Mortgage,
  MortgageBonification,
  OpportunityAttachment,
  OpportunityFieldExtractionConfidence,
  Property,
} from '../types';

const buildId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const normalizeTextForMatch = (value: string) =>
  normalizeWhitespace(
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
  );

const normalizeLineBreaks = (value: string) =>
  value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

const toFieldStatus = (
  confidence: OpportunityFieldExtractionConfidence,
  status: 'extracted' | 'missing' | 'ambiguous'
): MortgageDocumentFieldStatus => {
  if (status === 'missing') return 'missing';
  if (status === 'ambiguous') return 'needs_user_confirmation';
  return confidence === 'high' ? 'found_high_confidence' : 'found_low_confidence';
};

const parseLocalizedNumber = (rawValue: string): number => {
  const cleaned = rawValue
    .replace(/[^\d,.-]/g, '')
    .replace(/\u00a0/g, '')
    .trim();

  if (!cleaned) {
    return 0;
  }

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  if (hasComma && hasDot) {
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';

    return Number(
      cleaned.replace(new RegExp(`\\${thousandsSeparator}`, 'g'), '').replace(decimalSeparator, '.')
    );
  }

  if (hasComma) {
    const commaCount = cleaned.split(',').length - 1;
    if (commaCount > 1 || /,\d{3}$/.test(cleaned)) {
      return Number(cleaned.replace(/,/g, ''));
    }
    return Number(cleaned.replace(',', '.'));
  }

  if (hasDot) {
    const dotCount = cleaned.split('.').length - 1;
    if (dotCount > 1 || /\.\d{3}$/.test(cleaned)) {
      return Number(cleaned.replace(/\./g, ''));
    }
  }

  return Number(cleaned);
};

const normalizeDateString = (rawValue: string): string => {
  const value = normalizeWhitespace(rawValue);
  if (!value) {
    return '';
  }

  const isoMatch = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const localMatch = value.match(/\b(\d{1,2})[/. -](\d{1,2})[/. -](\d{2,4})\b/);
  if (localMatch) {
    const day = localMatch[1].padStart(2, '0');
    const month = localMatch[2].padStart(2, '0');
    const year =
      localMatch[3].length === 2 ? `20${localMatch[3].padStart(2, '0')}` : localMatch[3];
    return `${year}-${month}-${day}`;
  }

  return '';
};

const normalizeCurrency = (value: string): Mortgage['currency'] => {
  const normalized = value.toLowerCase();
  if (/[£]|libra|gbp/.test(normalized)) return 'GBP' as Mortgage['currency'];
  if (/[$]|usd|d[oó]lar/.test(normalized)) return 'USD';
  if (/ars|peso argentino/.test(normalized)) return 'ARS';
  return 'EUR';
};

const inferInterestType = (text: string) => {
  const normalized = normalizeTextForMatch(text);
  if (/\bmixt[ao]\b|\bmixed\b/.test(normalized)) {
    return {
      fixedOrVariable: 'variable' as Mortgage['fixedOrVariable'],
      mortgageType: 'Mixed',
    };
  }
  if (/\bvariable\b|\beuribor\b/.test(normalized)) {
    return {
      fixedOrVariable: 'variable' as Mortgage['fixedOrVariable'],
      mortgageType: 'Variable',
    };
  }
  if (/\bfij[ao]\b|\bfixed\b/.test(normalized)) {
    return {
      fixedOrVariable: 'fixed' as Mortgage['fixedOrVariable'],
      mortgageType: 'Fixed',
    };
  }

  return {
    fixedOrVariable: 'fixed' as Mortgage['fixedOrVariable'],
    mortgageType: '',
  };
};

const tokenize = (value: string) =>
  normalizeTextForMatch(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3);

type MortgageImportFieldKey =
  | 'propertyId'
  | 'lenderName'
  | 'referenceNumber'
  | 'principalAmount'
  | 'currency'
  | 'termYears'
  | 'totalPayments'
  | 'repaymentFrequency'
  | 'interestType'
  | 'initialRate'
  | 'initialRateMonths'
  | 'baseRate'
  | 'initialMonthlyPayment'
  | 'regularMonthlyPayment'
  | 'valuationAmount'
  | 'collateralAddress'
  | 'bonificationMax'
  | 'bonificationItems'
  | 'mandatoryProducts'
  | 'optionalProducts'
  | 'mortgageStartDate';

export type MortgageDocumentFieldStatus =
  | 'found_high_confidence'
  | 'found_low_confidence'
  | 'missing'
  | 'needs_user_confirmation';
export type MortgageDocumentParserProfile = 'spanish-fein' | 'generic-mortgage';

export interface MortgageDocumentExtractedField {
  id: string;
  field: MortgageImportFieldKey;
  label: string;
  value: string;
  normalizedValue: string | number | boolean | string[] | MortgageBonification[] | null;
  confidence: OpportunityFieldExtractionConfidence;
  sourceLabel: string;
  sourceSnippet: string;
  sourceText: string;
  status: MortgageDocumentFieldStatus;
  inferred: boolean;
  reviewMessage?: string;
}

export interface MortgageDocumentAnalysis {
  id: string;
  attachmentId: string;
  fileName: string;
  extractedAt: string;
  extractedText: string;
  parserProfile: MortgageDocumentParserProfile;
  extractedFields: MortgageDocumentExtractedField[];
  linkedPropertyMatch?: {
    propertyId: string;
    propertyName: string;
    address: string;
    score: number;
    confidence: OpportunityFieldExtractionConfidence;
  } | null;
  summary: {
    summary: string;
    missingInformation: string[];
    lowConfidenceFields: string[];
    needsConfirmationFields: string[];
  };
  debug: MortgageImportDebugInfo;
}

interface LinkedPropertyMatch {
  propertyId: string;
  propertyName: string;
  address: string;
  score: number;
  confidence: OpportunityFieldExtractionConfidence;
}

interface RawExtractionHit {
  field: MortgageImportFieldKey;
  rawValue: string;
  sourceLabel: string;
  sourceSnippet: string;
}

interface MortgageImportDebugInfo {
  parserUsed: MortgageDocumentParserProfile;
  matchedSections: Array<{
    key: string;
    title: string;
    matched: boolean;
    preview: string;
  }>;
  rawExtractedFields: RawExtractionHit[];
  mappedFields: Array<{
    field: MortgageImportFieldKey;
    rawValue: string;
    mappedValue: string;
    status: MortgageDocumentFieldStatus;
  }>;
  mappingFailures: Array<{
    field: MortgageImportFieldKey;
    reason: string;
    rawValue?: string;
  }>;
}

const fieldLabels: Record<MortgageImportFieldKey, string> = {
  propertyId: 'Linked property',
  lenderName: 'Lender name',
  referenceNumber: 'Operation / reference number',
  principalAmount: 'Loan principal',
  currency: 'Currency',
  termYears: 'Term in years',
  totalPayments: 'Total number of payments',
  repaymentFrequency: 'Repayment frequency',
  interestType: 'Mortgage type',
  initialRate: 'Initial / front rate',
  initialRateMonths: 'Initial rate period',
  baseRate: 'Base or ongoing rate',
  initialMonthlyPayment: 'Initial monthly payment',
  regularMonthlyPayment: 'Ongoing monthly payment',
  valuationAmount: 'Valuation amount',
  collateralAddress: 'Collateral / property address',
  bonificationMax: 'Maximum total bonification',
  bonificationItems: 'Available bonifications',
  mandatoryProducts: 'Mandatory products',
  optionalProducts: 'Optional bonification products',
  mortgageStartDate: 'Mortgage start date',
};

const reviewFieldOrder: MortgageImportFieldKey[] = [
  'propertyId',
  'lenderName',
  'referenceNumber',
  'principalAmount',
  'currency',
  'termYears',
  'totalPayments',
  'repaymentFrequency',
  'interestType',
  'initialRate',
  'initialRateMonths',
  'baseRate',
  'initialMonthlyPayment',
  'regularMonthlyPayment',
  'valuationAmount',
  'collateralAddress',
  'bonificationMax',
  'bonificationItems',
  'mandatoryProducts',
  'optionalProducts',
  'mortgageStartDate',
];

interface SectionDefinition {
  key: string;
  title: string;
  patterns: RegExp[];
}

interface ParsedSection {
  key: string;
  title: string;
  content: string;
}

const sectionDefinitions: SectionDefinition[] = [
  {
    key: 'identity',
    title: 'Document identity',
    patterns: [/ficha europea de informaci[oó]n normalizada/i, /\bfein\b/i, /prestamista|entidad/i],
  },
  {
    key: 'loan',
    title: 'Loan terms',
    patterns: [/importe del prestamo|capital del prestamo|importe total del prestamo/i, /plazo|numero de cuotas/i],
  },
  {
    key: 'rates',
    title: 'Interest rate conditions',
    patterns: [/tipo de interes|tae|tin|periodo inicial|interes variable|interes fijo/i],
  },
  {
    key: 'payments',
    title: 'Payment schedule',
    patterns: [/importe de cada cuota|cuotas|reembolso|amortizacion/i],
  },
  {
    key: 'bonifications',
    title: 'Bonifications and linked products',
    patterns: [/bonificaci[oó]n|productos vinculados|vinculaciones|seguros|nomina/i],
  },
  {
    key: 'collateral',
    title: 'Collateral and valuation',
    patterns: [/tasaci[oó]n|valor de tasaci[oó]n|inmueble|garantia hipotecaria|direccion del inmueble/i],
  },
];

const extractSections = (text: string): ParsedSection[] => {
  const normalizedText = normalizeLineBreaks(text);
  const lines = normalizedText
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const sections = sectionDefinitions.map((definition) => {
    const matchingIndices = lines.reduce<number[]>((indices, line, index) => {
      if (definition.patterns.some((pattern) => pattern.test(line))) {
        indices.push(index);
      }
      return indices;
    }, []);
    const matchingLines = matchingIndices.flatMap((index) =>
      lines.slice(Math.max(0, index - 2), Math.min(lines.length, index + 8))
    );
    const content = matchingLines.join('\n');
    return {
      key: definition.key,
      title: definition.title,
      content,
    };
  });

  return [
    ...sections,
    {
      key: 'full-text',
      title: 'Full document',
      content: normalizedText,
    },
  ];
};

const getSectionContent = (sections: ParsedSection[], key: string) =>
  sections.find((section) => section.key === key)?.content ?? '';

const getCombinedSectionContent = (sections: ParsedSection[], keys: string[]) =>
  keys
    .map((key) => getSectionContent(sections, key))
    .filter(Boolean)
    .join('\n');

const findSnippet = (text: string, expressions: RegExp[]) => {
  for (const expression of expressions) {
    const match = text.match(expression);
    if (match) {
      const value = normalizeWhitespace(match[1] ?? match[0]);
      return {
        value,
        snippet: normalizeWhitespace(match[0]),
      };
    }
  }

  return null;
};

const findSnippetInSections = (
  sections: ParsedSection[],
  sectionKeys: string[],
  expressions: RegExp[]
) => {
  const sectionContent = getCombinedSectionContent(sections, sectionKeys);
  const hit = findSnippet(sectionContent, expressions);
  if (hit) {
    return {
      ...hit,
      sourceLabel:
        sections.find((section) => sectionKeys.includes(section.key) && section.content.includes(hit.snippet))
          ?.title ?? 'Document section',
      sourceText: sectionContent,
    };
  }

  const fullText = getSectionContent(sections, 'full-text');
  const fallback = findSnippet(fullText, expressions);
  if (!fallback) {
    return null;
  }

  return {
    ...fallback,
    sourceLabel: 'Full document',
    sourceText: fullText,
  };
};

const buildField = (
  field: MortgageImportFieldKey,
  value: string,
  normalizedValue: MortgageDocumentExtractedField['normalizedValue'],
  confidence: OpportunityFieldExtractionConfidence,
  sourceLabel: string,
  sourceSnippet: string,
  sourceText: string,
  status: 'extracted' | 'missing' | 'ambiguous',
  inferred = false,
  reviewMessage?: string
): MortgageDocumentExtractedField => ({
  id: buildId(`mortgage-field-${field}`),
  field,
  label: fieldLabels[field],
  value: normalizeWhitespace(value),
  normalizedValue,
  confidence,
  sourceLabel,
  sourceSnippet: normalizeWhitespace(sourceSnippet || value),
  sourceText: normalizeWhitespace(sourceText || sourceSnippet || value),
  status: toFieldStatus(confidence, status),
  inferred,
  reviewMessage,
});

const buildMissingField = (
  field: MortgageImportFieldKey,
  reviewMessage = 'Missing from document'
): MortgageDocumentExtractedField =>
  buildField(
    field,
    'Missing from document',
    null,
    'low',
    'Document review',
    '',
    '',
    'missing',
    false,
    reviewMessage
  );

const buildAmbiguousField = (
  field: MortgageImportFieldKey,
  value = 'Needs confirmation',
  reviewMessage = 'Needs confirmation'
): MortgageDocumentExtractedField =>
  buildField(
    field,
    value,
    value === 'Needs confirmation' ? null : value,
    'medium',
    'Document review',
    '',
    '',
    'ambiguous',
    true,
    reviewMessage
  );

const detectParserProfile = (text: string, fileName: string): MortgageDocumentParserProfile => {
  const blob = normalizeTextForMatch(`${fileName}\n${text}`);
  if (
    /\bfein\b/.test(blob) ||
    /ficha europea de informacion normalizada/.test(blob) ||
    (/cajasur\b|tin\b|tae\b|prestamista\b|numero de operacion\b|cru\b/.test(blob) &&
      /importe total del prestamo|cuota|tipo de interes|valor de tasacion/.test(blob))
  ) {
    return 'spanish-fein';
  }
  return 'generic-mortgage';
};

const detectPropertyMatch = (
  text: string,
  properties: Property[]
): LinkedPropertyMatch | null => {
  const documentTokens = new Set(tokenize(text));
  let bestMatch: LinkedPropertyMatch | null = null;

  for (const property of properties) {
    const addressCandidates = [property.address, `${property.address} ${property.city}`].filter(Boolean);

    const score = addressCandidates.reduce((bestScore, candidate) => {
      const candidateTokens = tokenize(candidate);
      const addressTokens = candidateTokens.filter(
        (token) =>
          token.length >= 4 &&
          token !== normalizeTextForMatch(property.city) &&
          token !== normalizeTextForMatch(property.country)
      );

      if (addressTokens.length === 0) {
        return bestScore;
      }

      const matchedTokens = addressTokens.filter((token) => documentTokens.has(token)).length;
      return Math.max(bestScore, matchedTokens / addressTokens.length);
    }, 0);

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        propertyId: property.id,
        propertyName: property.name,
        address: property.address,
        score,
        confidence: score >= 0.8 ? 'high' : score >= 0.62 ? 'medium' : 'low',
      };
    }
  }

  const finalMatch = bestMatch;

  if (finalMatch === null || finalMatch.score < 0.62) {
    return null;
  }

  return finalMatch;
};

const dedupeStrings = (values: string[]) => Array.from(new Set(values.map(normalizeWhitespace).filter(Boolean)));

const cleanProductLabel = (value: string) =>
  normalizeWhitespace(
    value
      .replace(/^[•\-–:]+/g, '')
      .replace(/\b(obligatorio|obligatoria|required|opcional|optional)\b/gi, '')
      .replace(/\bbonificaci[oó]n\b/gi, '')
      .replace(/\b\d+(?:[.,]\d+)?\s*(?:puntos?|pp|%)\b/gi, '')
  );

const parseBonificationItems = (text: string): {
  bonificationItems: MortgageBonification[];
  mandatoryProducts: string[];
  optionalProducts: string[];
  bonificationMax: number | null;
} => {
  const normalizedText = normalizeLineBreaks(text);
  const lines = normalizedText
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter((line) => /(bonific|segu|nomina|tarjeta|alarma|plan de pensiones|domicili)/i.test(line));

  const bonificationItems: MortgageBonification[] = [];
  const mandatoryProducts: string[] = [];
  const optionalProducts: string[] = [];

  lines.forEach((line, index) => {
    const label = cleanProductLabel(line);
    if (!label) {
      return;
    }

    const bonusMatch = line.match(/(\d+(?:[.,]\d+)?)\s*(?:puntos?|pp|%)/i);
    const bonusPoints = bonusMatch ? parseLocalizedNumber(bonusMatch[1]) : null;
    const isMandatory = /\b(obligatorio|obligatoria|required)\b/i.test(line);
    const isOptional = /\b(opcional|optional|bonifica|bonificable)\b/i.test(line) || bonusPoints !== null;

    if (isMandatory) {
      mandatoryProducts.push(label);
    } else if (isOptional) {
      optionalProducts.push(label);
    }

    if (bonusPoints !== null || isOptional) {
      bonificationItems.push({
        key: `imported-bonification-${index + 1}`,
        label,
        active: false,
        available: true,
        bonusPoints,
        status: 'inactive',
        notes: null,
        source: 'fein',
      });
    }
  });

  const maxBonificationMatch = normalizedText.match(
    /bonificaci[oó]n(?:\s+total)?(?:\s+m[aá]xima)?[^.\n\r]{0,40}(\d+(?:[.,]\d+)?)\s*(?:puntos?|pp|%)/i
  );
  const bonificationMax =
    maxBonificationMatch !== null
      ? parseLocalizedNumber(maxBonificationMatch[1])
      : bonificationItems.reduce((sum, item) => sum + (item.bonusPoints ?? 0), 0) || null;

  return {
    bonificationItems,
    mandatoryProducts: dedupeStrings(mandatoryProducts),
    optionalProducts: dedupeStrings(optionalProducts),
    bonificationMax,
  };
};

export const analyzeMortgageDocument = async (
  file: File,
  attachment: OpportunityAttachment,
  extractedText: string,
  properties: Property[]
): Promise<MortgageDocumentAnalysis> => {
  const normalizedText = normalizeWhitespace(normalizeLineBreaks(extractedText));
  const parserProfile = detectParserProfile(normalizedText, file.name);
  const sections = extractSections(normalizedText);
  const fields = new Map<MortgageImportFieldKey, MortgageDocumentExtractedField>();
  const rawExtractedFields = new Map<MortgageImportFieldKey, RawExtractionHit>();
  const propertyMatch = detectPropertyMatch(normalizedText, properties);

  const setField = (field: MortgageDocumentExtractedField) => {
    fields.set(field.field, field);
  };
  const registerRawHit = (
    field: MortgageImportFieldKey,
    hit: { value: string; sourceLabel: string; snippet: string } | null
  ) => {
    if (!hit) return;
    rawExtractedFields.set(field, {
      field,
      rawValue: hit.value,
      sourceLabel: hit.sourceLabel,
      sourceSnippet: hit.snippet,
    });
  };

  if (propertyMatch?.confidence === 'high') {
    setField(
      buildField(
        'propertyId',
        propertyMatch.propertyName,
        propertyMatch.propertyId,
        'high',
        'Property address match',
        propertyMatch.address,
        propertyMatch.address,
        'extracted',
        true
      )
    );
  }

  const lenderHit = findSnippetInSections(sections, ['identity', 'full-text'], [
    /(?:prestamista|entidad|banco|bank|lender)\s*[:\-]?\s*([A-ZÁÉÍÓÚÑ][^\n\r,:]{2,90})/i,
    /(?:prestamista|entidad)\s*(?:\n|\r\n?)\s*([^\n\r]{3,120})/i,
    /\b(Cajasur Banco,\s*S\.A\.U\.|Cajasur Banco|CaixaBank,\s*S\.A\.|CaixaBank|Banco Santander,\s*S\.A\.|Banco Santander|BBVA,\s*S\.A\.|BBVA)\b/i,
    /\b(CaixaBank|Banco Santander|BBVA|Banco Sabadell|ING|Kutxabank|Unicaja|Abanca|Cajamar|EVO Banco)\b/i,
  ]);
  registerRawHit('lenderName', lenderHit);
  if (lenderHit) {
    setField(buildField('lenderName', lenderHit.value, lenderHit.value, 'high', lenderHit.sourceLabel, lenderHit.snippet, lenderHit.sourceText, 'extracted'));
  }

  const referenceHit = findSnippetInSections(sections, ['identity', 'loan', 'full-text'], [
    /(?:numero de operacion|n[uú]mero de operaci[oó]n|referencia|expediente|numero de prestamo|n[uú]mero de pr[eé]stamo)\s*[:\-]?\s*([A-Z0-9\/\-]{5,40})/i,
    /(?:n[ºo]\s*operaci[oó]n|referencia|cru)\s*(?:\n|\r\n?)?\s*([A-Z0-9\/\-]{4,40})/i,
  ]);
  registerRawHit('referenceNumber', referenceHit);
  if (referenceHit) {
    setField(buildField('referenceNumber', referenceHit.value, referenceHit.value, 'high', referenceHit.sourceLabel, referenceHit.snippet, referenceHit.sourceText, 'extracted'));
  }

  const principalHit = findSnippetInSections(sections, ['loan', 'payments', 'full-text'], [
    /(?:importe total del prestamo|capital del prestamo|importe del prestamo|principal amount|capital concedido)\s*[:\-]?\s*([€$£]?\s?[\d.,]+)/i,
    /(?:importe total del prestamo|capital del prestamo|importe del prestamo|capital concedido)[^.\n\r]{0,40}([0-9][\d.,]*\s*(?:euro|euros|eur|€))/i,
    /\b([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2}\s*(?:euro|euros|eur|€))\b/i,
  ]);
  registerRawHit('principalAmount', principalHit);
  if (principalHit) {
    setField(buildField('principalAmount', principalHit.value, parseLocalizedNumber(principalHit.value), 'high', principalHit.sourceLabel, principalHit.snippet, principalHit.sourceText, 'extracted'));
  }

  const currencyHit = principalHit ?? findSnippetInSections(sections, ['loan', 'full-text'], [
    /(?:moneda|currency)\s*[:\-]?\s*(euros?|eur|usd|d[oó]lares?|ars|pesos? argentinos?)/i,
  ]);
  registerRawHit('currency', currencyHit);
  if (currencyHit) {
    setField(buildField('currency', currencyHit.value, normalizeCurrency(currencyHit.value), principalHit ? 'high' : 'medium', currencyHit.sourceLabel, currencyHit.snippet, currencyHit.sourceText, 'extracted', Boolean(principalHit && !/eur|usd|ars/i.test(currencyHit.value))));
  }

  const termYearsHit = findSnippetInSections(sections, ['loan', 'payments', 'full-text'], [
    /(?:plazo|duraci[oó]n)\s*[:\-]?\s*(\d{1,2})\s*(?:a[nñ]os|years)/i,
  ]);
  registerRawHit('termYears', termYearsHit);
  if (termYearsHit) {
    setField(buildField('termYears', termYearsHit.value, parseLocalizedNumber(termYearsHit.value), 'high', termYearsHit.sourceLabel, termYearsHit.snippet, termYearsHit.sourceText, 'extracted'));
  }

  const totalPaymentsHit = findSnippetInSections(sections, ['loan', 'payments', 'full-text'], [
    /(?:numero total de cuotas|n[uú]mero total de pagos|total payments|total de cuotas)\s*[:\-]?\s*(\d{1,4})/i,
  ]);
  registerRawHit('totalPayments', totalPaymentsHit);
  if (totalPaymentsHit) {
    setField(buildField('totalPayments', totalPaymentsHit.value, parseLocalizedNumber(totalPaymentsHit.value), 'high', totalPaymentsHit.sourceLabel, totalPaymentsHit.snippet, totalPaymentsHit.sourceText, 'extracted'));
  } else if (termYearsHit) {
    const impliedPayments = parseLocalizedNumber(termYearsHit.value) * 12;
    setField(buildField('totalPayments', String(impliedPayments), impliedPayments, 'medium', termYearsHit.sourceLabel, termYearsHit.snippet, termYearsHit.sourceText, 'ambiguous', true, 'Assumed monthly repayment frequency from term length'));
  }

  const repaymentHit = findSnippetInSections(sections, ['payments', 'loan', 'full-text'], [
    /(?:frecuencia de los pagos|frecuencia de pago|repayment frequency)\s*[:\-]?\s*([a-záéíóúñ ]{4,40})/i,
    /(?:cuotas?|pagos?)\s+(mensuales|mensual|semanales|trimestrales|anuales)/i,
  ]);
  registerRawHit('repaymentFrequency', repaymentHit);
  if (repaymentHit) {
    setField(buildField('repaymentFrequency', repaymentHit.value, normalizeWhitespace(repaymentHit.value).toLowerCase(), 'high', repaymentHit.sourceLabel, repaymentHit.snippet, repaymentHit.sourceText, 'extracted'));
  } else if (parserProfile === 'spanish-fein') {
    setField(buildField('repaymentFrequency', 'monthly', 'monthly', 'medium', 'Spanish FEIN profile', 'Cuotas mensuales assumed from FEIN profile', 'Cuotas mensuales assumed from FEIN profile', 'ambiguous', true, 'Needs confirmation if the repayment schedule is not monthly'));
  }

  const interestTypeHit = findSnippetInSections(sections, ['rates', 'loan', 'full-text'], [
    /(?:tipo de prestamo|tipo de interes|modalidad)\s*[:\-]?\s*((?:fijo|variable|mixto|fixed|variable|mixed)[^\n\r.]*)/i,
  ]);
  registerRawHit('interestType', interestTypeHit);
  const interestTypeInference = inferInterestType(interestTypeHit?.value ?? normalizedText);
  if (interestTypeHit || interestTypeInference.mortgageType) {
    setField(buildField('interestType', interestTypeHit?.value ?? interestTypeInference.mortgageType, interestTypeHit?.value ?? interestTypeInference.mortgageType, interestTypeHit ? 'high' : 'medium', interestTypeHit?.sourceLabel ?? 'Document inference', interestTypeHit?.snippet ?? interestTypeInference.mortgageType, interestTypeHit?.sourceText ?? normalizedText, interestTypeHit ? 'extracted' : 'ambiguous', !interestTypeHit));
  }

  const initialRateHit = findSnippetInSections(sections, ['rates', 'payments', 'full-text'], [
    /(?:tipo inicial|tipo deudor fijo inicial|interes inicial|tin inicial|initial rate)\s*[:\-]?\s*([\d.,]+)\s*%/i,
    /(?:durante(?:\s+el)?\s+periodo inicial[^.\n\r]{0,50})([\d.,]+)\s*%/i,
  ]);
  registerRawHit('initialRate', initialRateHit);
  if (initialRateHit) {
    setField(buildField('initialRate', initialRateHit.value, parseLocalizedNumber(initialRateHit.value), 'high', initialRateHit.sourceLabel, initialRateHit.snippet, initialRateHit.sourceText, 'extracted'));
  }

  const initialRateMonthsHit = findSnippetInSections(sections, ['rates', 'payments', 'full-text'], [
    /(?:duracion del periodo inicial|periodo inicial|primeros)\s*[:\-]?\s*(\d{1,3})\s*(?:meses|months)/i,
    /(?:durante(?:\s+los)?\s+primeros)\s*(\d{1,3})\s*(?:meses|months)/i,
  ]);
  registerRawHit('initialRateMonths', initialRateMonthsHit);
  if (initialRateMonthsHit) {
    setField(buildField('initialRateMonths', initialRateMonthsHit.value, parseLocalizedNumber(initialRateMonthsHit.value), 'high', initialRateMonthsHit.sourceLabel, initialRateMonthsHit.snippet, initialRateMonthsHit.sourceText, 'extracted'));
  } else if (initialRateHit) {
    setField(buildField('initialRateMonths', '12', 12, 'medium', initialRateHit.sourceLabel, initialRateHit.snippet, initialRateHit.sourceText, 'ambiguous', true, 'Initial rate period inferred as 12 months because no explicit duration was found'));
  }

  const baseRateHit = findSnippetInSections(sections, ['rates', 'full-text'], [
    /(?:tipo deudor variable|tipo aplicable despu[eé]s|tipo tras el periodo inicial|tipo de inter[eé]s variable|base rate)\s*[:\-]?\s*([\d.,]+)\s*%/i,
    /(?:euribor[^.\n\r]{0,40}\+\s*[\d.,]+|[\d.,]+\s*%\s+despu[eé]s\s+del\s+periodo\s+inicial)/i,
  ]);
  registerRawHit('baseRate', baseRateHit);
  if (baseRateHit) {
    const numericMatch = baseRateHit.value.match(/(\d+(?:[.,]\d+)?)/);
    const normalizedValue = numericMatch ? parseLocalizedNumber(numericMatch[1]) : baseRateHit.value;
    setField(buildField('baseRate', baseRateHit.value, normalizedValue, typeof normalizedValue === 'number' ? 'high' : 'medium', baseRateHit.sourceLabel, baseRateHit.snippet, baseRateHit.sourceText, typeof normalizedValue === 'number' ? 'extracted' : 'ambiguous'));
  }

  const initialPaymentHit = findSnippetInSections(sections, ['payments', 'rates', 'full-text'], [
    /(?:importe de cada cuota durante el periodo inicial|cuota inicial|primera cuota|initial monthly payment)\s*[:\-]?\s*([€$£]?\s?[\d.,]+)/i,
  ]);
  registerRawHit('initialMonthlyPayment', initialPaymentHit);
  if (initialPaymentHit) {
    setField(buildField('initialMonthlyPayment', initialPaymentHit.value, parseLocalizedNumber(initialPaymentHit.value), 'high', initialPaymentHit.sourceLabel, initialPaymentHit.snippet, initialPaymentHit.sourceText, 'extracted'));
  }

  const regularPaymentHit = findSnippetInSections(sections, ['payments', 'rates', 'full-text'], [
    /(?:importe de cada cuota una vez finalizado el periodo inicial|cuota posterior|cuota despu[eé]s del periodo inicial|regular monthly payment)\s*[:\-]?\s*([€$£]?\s?[\d.,]+)/i,
    /(?:cuota mensual|importe de cada cuota)\s*[:\-]?\s*([€$£]?\s?[\d.,]+)/i,
  ]);
  registerRawHit('regularMonthlyPayment', regularPaymentHit);
  if (regularPaymentHit) {
    const sameAsInitial = initialPaymentHit && normalizeWhitespace(initialPaymentHit.value) === normalizeWhitespace(regularPaymentHit.value);
    setField(buildField('regularMonthlyPayment', regularPaymentHit.value, parseLocalizedNumber(regularPaymentHit.value), sameAsInitial ? 'medium' : 'high', regularPaymentHit.sourceLabel, regularPaymentHit.snippet, regularPaymentHit.sourceText, sameAsInitial ? 'ambiguous' : 'extracted', false, sameAsInitial ? 'Needs confirmation if the same payment applies after the initial period' : undefined));
  }

  const valuationHit = findSnippetInSections(sections, ['collateral', 'full-text'], [
    /(?:valor de tasaci[oó]n|importe de tasaci[oó]n|valuation amount)\s*[:\-]?\s*([€$£]?\s?[\d.,]+)/i,
  ]);
  registerRawHit('valuationAmount', valuationHit);
  if (valuationHit) {
    setField(buildField('valuationAmount', valuationHit.value, parseLocalizedNumber(valuationHit.value), 'high', valuationHit.sourceLabel, valuationHit.snippet, valuationHit.sourceText, 'extracted'));
  }

  const addressHit = findSnippetInSections(sections, ['collateral', 'identity', 'full-text'], [
    /(?:direccion del inmueble|domicilio de la garantia|inmueble hipotecado|garantia hipotecaria|collateral address)\s*[:\-]?\s*([^\n\r]{10,160})/i,
  ]);
  registerRawHit('collateralAddress', addressHit);
  if (addressHit) {
    setField(buildField('collateralAddress', addressHit.value, addressHit.value, 'high', addressHit.sourceLabel, addressHit.snippet, addressHit.sourceText, 'extracted'));
  }

  const startDateHit = findSnippetInSections(sections, ['identity', 'loan', 'full-text'], [
    /(?:fecha de firma|fecha prevista de firma|fecha de formalizacion|start date)\s*[:\-]?\s*([0-9./ -]{8,10})/i,
  ]);
  registerRawHit('mortgageStartDate', startDateHit);
  if (startDateHit) {
    const normalizedDate = normalizeDateString(startDateHit.value);
    setField(buildField('mortgageStartDate', normalizedDate || startDateHit.value, normalizedDate || startDateHit.value, normalizedDate ? 'medium' : 'low', startDateHit.sourceLabel, startDateHit.snippet, startDateHit.sourceText, normalizedDate ? 'extracted' : 'ambiguous'));
  }

  const bonificationText = getCombinedSectionContent(sections, ['bonifications', 'rates', 'full-text']);
  const bonificationSummary = parseBonificationItems(bonificationText);
  if (bonificationSummary.bonificationItems.length > 0) {
    setField(buildField('bonificationItems', bonificationSummary.bonificationItems.map((item) => item.label).join(', '), bonificationSummary.bonificationItems, 'medium', 'Bonifications and linked products', bonificationSummary.bonificationItems.map((item) => item.label).join(', '), bonificationText, 'extracted', true, 'Available bonifications were identified, but none were assumed active'));
  }
  if (bonificationSummary.mandatoryProducts.length > 0) {
    setField(buildField('mandatoryProducts', bonificationSummary.mandatoryProducts.join(', '), bonificationSummary.mandatoryProducts, 'medium', 'Bonifications and linked products', bonificationSummary.mandatoryProducts.join(', '), bonificationText, 'extracted'));
  }
  if (bonificationSummary.optionalProducts.length > 0) {
    setField(buildField('optionalProducts', bonificationSummary.optionalProducts.join(', '), bonificationSummary.optionalProducts, 'medium', 'Bonifications and linked products', bonificationSummary.optionalProducts.join(', '), bonificationText, 'extracted'));
  }
  if (bonificationSummary.bonificationMax !== null) {
    setField(buildField('bonificationMax', String(bonificationSummary.bonificationMax), bonificationSummary.bonificationMax, 'medium', 'Bonifications and linked products', String(bonificationSummary.bonificationMax), bonificationText, 'extracted', true, 'Maximum total bonification is based on the document wording or the sum of listed bonifications'));
  }

  if (propertyMatch?.confidence !== 'high') {
    setField(propertyMatch ? buildField('propertyId', propertyMatch.propertyName, propertyMatch.propertyId, 'medium', 'Property address match', propertyMatch.address, propertyMatch.address, 'ambiguous', true, 'Address match looks close, but needs confirmation before linking the mortgage') : buildMissingField('propertyId', 'Select the property manually because no strong address match was found'));
  }

  reviewFieldOrder.forEach((fieldKey) => {
    if (fields.has(fieldKey)) return;

    switch (fieldKey) {
      case 'referenceNumber':
      case 'valuationAmount':
      case 'mortgageStartDate':
        fields.set(fieldKey, buildMissingField(fieldKey));
        break;
      case 'initialRateMonths':
      case 'baseRate':
      case 'regularMonthlyPayment':
      case 'bonificationMax':
      case 'bonificationItems':
      case 'mandatoryProducts':
      case 'optionalProducts':
        fields.set(fieldKey, buildAmbiguousField(fieldKey));
        break;
      default:
        fields.set(fieldKey, buildMissingField(fieldKey));
        break;
    }
  });

  const extractedFields = reviewFieldOrder
    .map((fieldKey) => fields.get(fieldKey))
    .filter((field): field is MortgageDocumentExtractedField => Boolean(field));
  const debug: MortgageImportDebugInfo = {
    parserUsed: parserProfile,
    matchedSections: sections
      .filter((section) => section.key !== 'full-text')
      .map((section) => ({
        key: section.key,
        title: section.title,
        matched: section.content.length > 0,
        preview: section.content.slice(0, 180),
      })),
    rawExtractedFields: Array.from(rawExtractedFields.values()),
    mappedFields: extractedFields.map((field) => ({
      field: field.field,
      rawValue: rawExtractedFields.get(field.field)?.rawValue ?? '',
      mappedValue:
        field.normalizedValue === null
          ? ''
          : Array.isArray(field.normalizedValue)
          ? field.normalizedValue
              .map((item) => (typeof item === 'string' ? item : item.label))
              .join(', ')
          : String(field.normalizedValue),
      status: field.status,
    })),
    mappingFailures: reviewFieldOrder
      .filter((fieldKey) => rawExtractedFields.has(fieldKey) && !fields.has(fieldKey))
      .map((fieldKey) => ({
        field: fieldKey,
        reason: 'Raw extraction succeeded but field mapping did not produce a review field',
        rawValue: rawExtractedFields.get(fieldKey)?.rawValue,
      })),
  };

  console.info('Mortgage FEIN raw extracted fields', debug.rawExtractedFields);
  console.info('Mortgage FEIN mapped fields', debug.mappedFields);

  return {
    id: buildId('mortgage-analysis'),
    attachmentId: attachment.id,
    fileName: file.name,
    extractedAt: new Date().toISOString(),
    extractedText,
    parserProfile,
    extractedFields,
    linkedPropertyMatch: propertyMatch,
    summary: {
      summary:
        parserProfile === 'spanish-fein'
          ? `Spanish FEIN parser reviewed ${file.name} and prepared a mortgage draft for confirmation before save.`
          : `Mortgage document parser reviewed ${file.name} and prepared a mortgage draft for confirmation before save.`,
      missingInformation: extractedFields.filter((field) => field.status === 'missing').map((field) => field.label),
      lowConfidenceFields: extractedFields.filter((field) => field.confidence === 'low').map((field) => field.label),
      needsConfirmationFields: extractedFields.filter((field) => field.status === 'needs_user_confirmation').map((field) => field.label),
    },
    debug,
  };
};

export const createEmptyMortgage = (
  properties: Property[],
  overrides: Partial<Mortgage> = {}
): Mortgage => {
  const property = properties.find((item) => item.id === overrides.propertyId) ?? properties[0];

  return {
    id: overrides.id ?? buildId('mortgage'),
    propertyId: overrides.propertyId ?? property?.id ?? '',
    currency: overrides.currency ?? property?.currency ?? 'EUR',
    lenderName: overrides.lenderName ?? '',
    referenceNumber: overrides.referenceNumber ?? null,
    originalLoanAmount: overrides.originalLoanAmount ?? 0,
    currentBalance: overrides.currentBalance ?? overrides.originalLoanAmount ?? 0,
    currentBalanceEstimated: overrides.currentBalanceEstimated ?? false,
    interestRate: overrides.interestRate ?? 0,
    mortgageTermYears: overrides.mortgageTermYears ?? 0,
    mortgageTermMonths: overrides.mortgageTermMonths,
    totalPayments: overrides.totalPayments ?? null,
    repaymentFrequency: overrides.repaymentFrequency ?? 'monthly',
    monthlyMortgagePayment: overrides.monthlyMortgagePayment ?? 0,
    initialMonthlyPayment: overrides.initialMonthlyPayment ?? null,
    regularMonthlyPayment: overrides.regularMonthlyPayment ?? null,
    mortgageStartDate: overrides.mortgageStartDate ?? new Date().toISOString().split('T')[0],
    fixedOrVariable: overrides.fixedOrVariable ?? 'fixed',
    mortgageType: overrides.mortgageType ?? 'Fixed',
    initialInterestRate: overrides.initialInterestRate ?? null,
    initialRateMonths: overrides.initialRateMonths ?? null,
    baseInterestRate: overrides.baseInterestRate ?? null,
    currentInterestRate: overrides.currentInterestRate ?? null,
    maxBonifiedRate: overrides.maxBonifiedRate ?? null,
    maxTotalBonificationPoints: overrides.maxTotalBonificationPoints ?? null,
    valuationAmount: overrides.valuationAmount ?? null,
    collateralAddress: overrides.collateralAddress ?? null,
    openingFees: overrides.openingFees ?? null,
    valuationFee: overrides.valuationFee ?? null,
    brokerFee: overrides.brokerFee ?? null,
    insuranceRequirements: overrides.insuranceRequirements ?? null,
    payrollBonificationConditions: overrides.payrollBonificationConditions ?? null,
    rateNotes: overrides.rateNotes ?? '',
    availableBonifications: overrides.availableBonifications ?? [],
    activeBonifications: overrides.activeBonifications ?? [],
    mandatoryProducts: overrides.mandatoryProducts ?? [],
    optionalProducts: overrides.optionalProducts ?? [],
    importProfile: overrides.importProfile ?? null,
    notes: overrides.notes ?? '',
  };
};

export const applyMortgageDocumentAnalysis = (
  analysis: MortgageDocumentAnalysis,
  properties: Property[],
  currentMortgage?: Mortgage
): Mortgage => {
  const base = currentMortgage ?? createEmptyMortgage(properties);
  const getField = (field: MortgageImportFieldKey) =>
    analysis.extractedFields.find((item) => item.field === field);

  const lenderName = getField('lenderName');
  const referenceNumber = getField('referenceNumber');
  const propertyId = getField('propertyId');
  const principalAmount = getField('principalAmount');
  const currency = getField('currency');
  const termYears = getField('termYears');
  const totalPayments = getField('totalPayments');
  const repaymentFrequency = getField('repaymentFrequency');
  const interestType = getField('interestType');
  const initialRate = getField('initialRate');
  const initialRateMonths = getField('initialRateMonths');
  const baseRate = getField('baseRate');
  const initialMonthlyPayment = getField('initialMonthlyPayment');
  const regularMonthlyPayment = getField('regularMonthlyPayment');
  const valuationAmount = getField('valuationAmount');
  const collateralAddress = getField('collateralAddress');
  const bonificationMax = getField('bonificationMax');
  const bonificationItems = getField('bonificationItems');
  const mandatoryProducts = getField('mandatoryProducts');
  const optionalProducts = getField('optionalProducts');
  const mortgageStartDate = getField('mortgageStartDate');

  const interestTypeDetails = inferInterestType(String(interestType?.normalizedValue ?? interestType?.value ?? ''));
  const normalizedPropertyId =
    typeof propertyId?.normalizedValue === 'string' ? propertyId.normalizedValue : base.propertyId;
  const linkedProperty = properties.find((property) => property.id === normalizedPropertyId);
  const normalizedPrincipal =
    typeof principalAmount?.normalizedValue === 'number' ? principalAmount.normalizedValue : base.originalLoanAmount;
  const normalizedInitialRate =
    typeof initialRate?.normalizedValue === 'number' ? initialRate.normalizedValue : null;
  const normalizedBaseRate =
    typeof baseRate?.normalizedValue === 'number' ? baseRate.normalizedValue : null;
  const normalizedInitialPayment =
    typeof initialMonthlyPayment?.normalizedValue === 'number' ? initialMonthlyPayment.normalizedValue : null;
  const normalizedRegularPayment =
    typeof regularMonthlyPayment?.normalizedValue === 'number' ? regularMonthlyPayment.normalizedValue : null;
  const normalizedCurrentBalance = base.currentBalance > 0 ? base.currentBalance : normalizedPrincipal;
  const totalMonths =
    typeof totalPayments?.normalizedValue === 'number'
      ? totalPayments.normalizedValue
      : typeof termYears?.normalizedValue === 'number'
      ? termYears.normalizedValue * 12
      : base.mortgageTermMonths;
  const selectedMonthlyPayment =
    normalizedInitialPayment ?? normalizedRegularPayment ?? base.monthlyMortgagePayment ?? 0;
  const normalizedMaxBonification =
    typeof bonificationMax?.normalizedValue === 'number' ? bonificationMax.normalizedValue : null;
  const normalizedBonificationItems = Array.isArray(bonificationItems?.normalizedValue)
    ? (bonificationItems.normalizedValue as MortgageBonification[])
    : [];
  const normalizedMandatoryProducts = Array.isArray(mandatoryProducts?.normalizedValue)
    ? (mandatoryProducts.normalizedValue as string[])
    : [];
  const normalizedOptionalProducts = Array.isArray(optionalProducts?.normalizedValue)
    ? (optionalProducts.normalizedValue as string[])
    : [];

  return {
    ...base,
    propertyId: normalizedPropertyId,
    currency:
      (typeof currency?.normalizedValue === 'string'
        ? (currency.normalizedValue as Mortgage['currency'])
        : undefined) ??
      linkedProperty?.currency ??
      base.currency,
    lenderName: String(lenderName?.normalizedValue ?? lenderName?.value ?? base.lenderName),
    referenceNumber:
      typeof referenceNumber?.normalizedValue === 'string'
        ? referenceNumber.normalizedValue
        : referenceNumber?.value ?? base.referenceNumber ?? null,
    originalLoanAmount: normalizedPrincipal,
    currentBalance: normalizedCurrentBalance,
    currentBalanceEstimated: !(base.currentBalance > 0),
    interestRate: normalizedInitialRate ?? normalizedBaseRate ?? base.interestRate,
    mortgageTermYears:
      typeof termYears?.normalizedValue === 'number'
        ? termYears.normalizedValue
        : totalMonths
        ? Math.max(Math.round(totalMonths / 12), 0)
        : base.mortgageTermYears,
    mortgageTermMonths: typeof totalMonths === 'number' ? totalMonths : base.mortgageTermMonths,
    totalPayments:
      typeof totalPayments?.normalizedValue === 'number'
        ? totalPayments.normalizedValue
        : typeof totalMonths === 'number'
        ? totalMonths
        : base.totalPayments ?? null,
    repaymentFrequency:
      typeof repaymentFrequency?.normalizedValue === 'string'
        ? repaymentFrequency.normalizedValue
        : base.repaymentFrequency ?? 'monthly',
    monthlyMortgagePayment: selectedMonthlyPayment,
    initialMonthlyPayment: normalizedInitialPayment,
    regularMonthlyPayment: normalizedRegularPayment ?? selectedMonthlyPayment,
    mortgageStartDate:
      typeof mortgageStartDate?.normalizedValue === 'string'
        ? mortgageStartDate.normalizedValue
        : base.mortgageStartDate,
    fixedOrVariable: interestTypeDetails.fixedOrVariable,
    mortgageType: interestType?.value || interestTypeDetails.mortgageType || base.mortgageType || 'Fixed',
    initialInterestRate: normalizedInitialRate,
    initialRateMonths:
      typeof initialRateMonths?.normalizedValue === 'number'
        ? initialRateMonths.normalizedValue
        : base.initialRateMonths ?? null,
    baseInterestRate: normalizedBaseRate,
    currentInterestRate: normalizedInitialRate ?? normalizedBaseRate ?? base.currentInterestRate,
    maxBonifiedRate:
      normalizedBaseRate !== null && normalizedMaxBonification !== null
        ? Math.max(normalizedBaseRate - normalizedMaxBonification, 0)
        : base.maxBonifiedRate,
    maxTotalBonificationPoints: normalizedMaxBonification,
    valuationAmount:
      typeof valuationAmount?.normalizedValue === 'number'
        ? valuationAmount.normalizedValue
        : base.valuationAmount ?? null,
    collateralAddress:
      typeof collateralAddress?.normalizedValue === 'string'
        ? collateralAddress.normalizedValue
        : collateralAddress?.value ?? base.collateralAddress ?? null,
    rateNotes: [
      base.rateNotes,
      analysis.parserProfile === 'spanish-fein'
        ? 'Imported from FEIN review. Active bonifications were not assumed automatically.'
        : '',
    ]
      .filter(Boolean)
      .join(' '),
    availableBonifications:
      normalizedBonificationItems.length > 0
        ? normalizedBonificationItems.map((item) => ({
            ...item,
            active: false,
            available: true,
            status: 'inactive',
            source: item.source ?? 'fein',
          }))
        : base.availableBonifications,
    activeBonifications: [],
    mandatoryProducts:
      normalizedMandatoryProducts.length > 0 ? normalizedMandatoryProducts : base.mandatoryProducts ?? [],
    optionalProducts:
      normalizedOptionalProducts.length > 0 ? normalizedOptionalProducts : base.optionalProducts ?? [],
    importProfile: analysis.parserProfile,
    notes: [
      base.notes,
      referenceNumber?.value ? `Reference: ${referenceNumber.value}` : '',
      collateralAddress?.value ? `Collateral address: ${collateralAddress.value}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  };
};
