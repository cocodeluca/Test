import type {
  Opportunity,
  OpportunityAnalysisMetrics,
  OpportunityAttachment,
  OpportunityAiSummary,
  OpportunityDocumentAnalysis,
  OpportunityDocumentType,
  OpportunityExtractedField,
  OpportunityFieldExtractionConfidence,
  OpportunityRecommendation,
  OpportunityScenario,
  OpportunityStatus,
  OpportunityStrategy,
} from '../types';

const toNumber = (value: number | null | undefined): number =>
  Number.isFinite(value) ? Number(value) : 0;

export const opportunityStatuses: OpportunityStatus[] = [
  'new-lead',
  'under-review',
  'negotiating',
  'offer-made',
  'rejected',
  'purchased',
];

export const opportunityStatusLabels: Record<OpportunityStatus, string> = {
  'new-lead': 'New Lead',
  'under-review': 'Under Review',
  negotiating: 'Negotiating',
  'offer-made': 'Offer Made',
  rejected: 'Rejected',
  purchased: 'Purchased',
};

export const opportunityStrategies: OpportunityStrategy[] = [
  'buy-to-let',
  'flip',
  'brrrr',
  'short-term-rental',
  'other',
];

export const opportunityStrategyLabels: Record<OpportunityStrategy, string> = {
  'buy-to-let': 'Buy to let',
  flip: 'Flip',
  brrrr: 'BRRRR',
  'short-term-rental': 'Short term rental',
  other: 'Other',
};

const scenarioAdjustments: Record<
  OpportunityScenario,
  { rentFactor: number; renovationFactor: number; vacancyDelta: number; saleFactor: number }
> = {
  conservative: { rentFactor: 0.93, renovationFactor: 1.12, vacancyDelta: 2, saleFactor: 0.95 },
  base: { rentFactor: 1, renovationFactor: 1, vacancyDelta: 0, saleFactor: 1 },
  optimistic: { rentFactor: 1.07, renovationFactor: 0.94, vacancyDelta: -1, saleFactor: 1.06 },
};

const slugify = (input: string) =>
  input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const buildId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const extractedFieldLabels: Record<string, string> = {
  title: 'Property title',
  address: 'Address',
  city: 'City',
  municipality: 'Municipality',
  region: 'Province / region',
  province: 'Province',
  autonomousCommunity: 'Autonomous community',
  country: 'Country',
  postalCode: 'Postal code',
  propertyType: 'Property type',
  strategy: 'Strategy hints',
  bedrooms: 'Bedrooms',
  bathrooms: 'Bathrooms',
  builtSqm: 'Built m2',
  builtArea: 'Built area',
  plotSqm: 'Plot m2',
  floor: 'Floor',
  yearBuilt: 'Year built',
  condition: 'Condition',
  exterior: 'Exterior',
  terrace: 'Terrace',
  elevator: 'Elevator',
  parking: 'Parking',
  storageRoom: 'Storage room',
  occupancyStatus: 'Occupancy status',
  askingPrice: 'Asking price',
  purchasePrice: 'Purchase price',
  targetOfferPrice: 'Target offer',
  estimatedClosingCosts: 'Estimated closing costs',
  transferTax: 'Transfer tax',
  notaryRegistry: 'Notary / registry',
  estimatedRenovationCost: 'Estimated renovation cost',
  furnitureSetupCost: 'Furniture / setup cost',
  renovationFurniture: 'Renovation and furniture',
  sourcingServiceFee: 'Sourcing / service fee',
  agencyFee: 'Agency fee',
  totalInvestment: 'Total investment',
  monthlyRentEstimate: 'Monthly rent estimate',
  pessimisticMonthlyRent: 'Pessimistic monthly rent',
  realisticMonthlyRent: 'Realistic monthly rent',
  optimisticMonthlyRent: 'Optimistic monthly rent',
  pessimisticAnnualRent: 'Pessimistic annual rent',
  realisticAnnualRent: 'Realistic annual rent',
  optimisticAnnualRent: 'Optimistic annual rent',
  annualIbiTrash: 'IBI / trash annual',
  annualInsurance: 'Insurance annual',
  annualCommunity: 'Community annual',
  annualRentalManagement: 'Rental management annual',
  monthlyNetCashflow: 'Monthly net cashflow',
  annualNetCashflow: 'Annual net cashflow',
  grossYield: 'Gross yield',
  netComparableYield: 'Net comparable yield',
  fullyPassiveNetYield: 'Fully passive net yield',
  otherMonthlyIncome: 'Other monthly income',
  monthlyCommunityCost: 'Community fees',
  monthlyInsuranceCost: 'Insurance cost',
  monthlyPropertyTax: 'IBI / property tax',
  monthlyMaintenanceReserve: 'Maintenance cost',
  monthlyManagementCost: 'Management cost',
  vacancyAssumptionPct: 'Vacancy assumption',
  sellingCostPct: 'Selling cost',
  ltv: 'LTV',
  totalCashContributionNeeded: 'Total cash contribution needed',
  mortgagePayment: 'Mortgage payment',
  leveragedReturnOnEquity: 'Leveraged return on equity',
  leveragedCashflow: 'Leveraged cashflow',
  financingNotes: 'Financing notes',
  brokerLenderNotes: 'Broker notes',
  demandNotes: 'Location / demand notes',
  acquisitionSteps: 'Acquisition steps',
  strengths: 'Investment highlights',
  risks: 'Risks / warnings',
};

const criticalOpportunityFields = [
  'title',
  'address',
  'city',
  'askingPrice',
  'monthlyRentEstimate',
  'estimatedClosingCosts',
  'estimatedRenovationCost',
  'financingNotes',
] as const;

const numericFieldKeys = new Set([
  'bedrooms',
  'bathrooms',
  'builtSqm',
  'plotSqm',
  'yearBuilt',
  'askingPrice',
  'targetOfferPrice',
  'estimatedClosingCosts',
  'estimatedRenovationCost',
  'furnitureSetupCost',
  'monthlyRentEstimate',
  'otherMonthlyIncome',
  'monthlyCommunityCost',
  'monthlyInsuranceCost',
  'monthlyPropertyTax',
  'monthlyMaintenanceReserve',
  'monthlyManagementCost',
  'vacancyAssumptionPct',
  'sellingCostPct',
  'purchasePrice',
  'transferTax',
  'notaryRegistry',
  'renovationFurniture',
  'sourcingServiceFee',
  'agencyFee',
  'totalInvestment',
  'pessimisticMonthlyRent',
  'realisticMonthlyRent',
  'optimisticMonthlyRent',
  'pessimisticAnnualRent',
  'realisticAnnualRent',
  'optimisticAnnualRent',
  'annualIbiTrash',
  'annualInsurance',
  'annualCommunity',
  'annualRentalManagement',
  'monthlyNetCashflow',
  'annualNetCashflow',
  'grossYield',
  'netComparableYield',
  'fullyPassiveNetYield',
  'ltv',
  'totalCashContributionNeeded',
  'mortgagePayment',
  'leveragedReturnOnEquity',
  'leveragedCashflow',
]);

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const suspiciousMojibakePattern =
  /(?:�|Ã.|Â.|â€¦|â€“|â€”|â€œ|â€|â€˜|â€™|â‚¬|â„¢|ðŸ|ï¿½)/g;

const textQualityProtectedFields = new Set([
  'title',
  'address',
  'city',
  'municipality',
  'region',
  'province',
  'autonomousCommunity',
  'country',
  'propertyType',
  'condition',
  'occupancyStatus',
  'financingNotes',
  'brokerLenderNotes',
  'demandNotes',
  'acquisitionSteps',
  'strengths',
  'risks',
]);

const analyzeExtractedTextQuality = (input: string) => {
  const value = normalizeWhitespace(input);
  if (!value) {
    return {
      isCorrupted: false,
      score: 0,
      replacementCount: 0,
      suspiciousSequenceCount: 0,
      symbolRatio: 0,
      garbageRatio: 0,
    };
  }

  const replacementCount = (value.match(/�/g) ?? []).length;
  const suspiciousSequenceCount = (value.match(suspiciousMojibakePattern) ?? []).length;
  const printableCharacters = Array.from(value);
  const symbolCount = printableCharacters.filter(
    (character) => !/[\p{L}\p{N}\s€$£%.,:;()\-/'"]/u.test(character)
  ).length;
  const alphanumericCount = printableCharacters.filter((character) => /[\p{L}\p{N}]/u.test(character))
    .length;
  const weirdChunkCount =
    value
      .split(/\s+/)
      .filter(
        (chunk) =>
          chunk.length >= 4 &&
          /[^\p{L}\p{N}€$£%.,:;()\-/'"]/u.test(chunk) &&
          !/^\d/.test(chunk)
      ).length || 0;
  const symbolRatio = symbolCount / Math.max(printableCharacters.length, 1);
  const garbageRatio = weirdChunkCount / Math.max(value.split(/\s+/).filter(Boolean).length, 1);
  const score = replacementCount * 3 + suspiciousSequenceCount * 2 + symbolRatio * 8 + garbageRatio * 5;

  return {
    isCorrupted:
      replacementCount > 0 ||
      suspiciousSequenceCount >= 2 ||
      symbolRatio > 0.18 ||
      garbageRatio > 0.34 ||
      score >= 2.8 ||
      (alphanumericCount > 0 && alphanumericCount / Math.max(printableCharacters.length, 1) < 0.45),
    score,
    replacementCount,
    suspiciousSequenceCount,
    symbolRatio,
    garbageRatio,
  };
};

const isLikelyCorruptedFieldValue = (field: string, value: string) =>
  textQualityProtectedFields.has(field) && analyzeExtractedTextQuality(value).isCorrupted;

const isUsefulPdfTextCandidate = (input: string) => {
  const value = normalizeWhitespace(
    input
      .replace(/\\[nrtbf()\\]/g, ' ')
      .replace(/\\\d{2,3}/g, ' ')
  );

  if (!value || value.length < 2 || value.length > 260) {
    return false;
  }

  const quality = analyzeExtractedTextQuality(value);
  if (quality.isCorrupted) {
    return false;
  }

  const letterCount = (value.match(/\p{L}/gu) ?? []).length;
  const digitCount = (value.match(/\d/g) ?? []).length;
  const wordCount = value.split(/\s+/).filter(Boolean).length;

  if (letterCount < 2 && digitCount < 2) {
    return false;
  }

  if (wordCount === 1 && value.length < 4) {
    return false;
  }

  return /[\p{L}\d]/u.test(value);
};

const decodePdfHexText = (hexValue: string) => {
  const compact = hexValue.replace(/\s+/g, '');
  if (!compact || compact.length % 2 !== 0) {
    return '';
  }

  try {
    const bytes = new Uint8Array(compact.match(/.{2}/g)?.map((pair) => parseInt(pair, 16)) ?? []);
    const utf16Text = new TextDecoder('utf-16be', { fatal: false }).decode(bytes);
    if (isUsefulPdfTextCandidate(utf16Text)) {
      return normalizeWhitespace(utf16Text);
    }

    const latinText = new TextDecoder('latin1', { fatal: false }).decode(bytes);
    return isUsefulPdfTextCandidate(latinText) ? normalizeWhitespace(latinText) : '';
  } catch {
    return '';
  }
};

const decodeArrayBuffer = (buffer: ArrayBuffer) => {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  } catch {
    return new TextDecoder('latin1').decode(buffer);
  }
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

const normalizeCurrency = (rawValue: string) => Math.max(parseLocalizedNumber(rawValue), 0);
const normalizePercentage = (rawValue: string) => Math.max(parseLocalizedNumber(rawValue), 0);

const normalizeFieldValue = (field: string, rawValue: string): string | number | boolean => {
  if (field === 'strategy') {
    const normalized = rawValue.toLowerCase();
    if (normalized.includes('flip') || normalized.includes('reforma')) return 'flip';
    if (normalized.includes('short') || normalized.includes('vacacional')) return 'short-term-rental';
    if (normalized.includes('brrrr')) return 'brrrr';
    if (normalized.includes('rental') || normalized.includes('alquiler') || normalized.includes('let'))
      return 'buy-to-let';
    return 'other';
  }

  if (field === 'propertyType') {
    return normalizeWhitespace(rawValue);
  }

  if (field === 'cashPurchase' || field === 'useMortgage') {
    return ['yes', 'true', 'si', 'cash'].some((token) => rawValue.toLowerCase().includes(token));
  }

  if (['exterior', 'terrace', 'elevator', 'parking', 'storageRoom'].includes(field)) {
    return /\b(yes|true|si|sí|con|incluido|available|dispone|tiene|1)\b/i.test(rawValue);
  }

  if (field.endsWith('Pct')) {
    return normalizePercentage(rawValue);
  }

  if (numericFieldKeys.has(field)) {
    return normalizeCurrency(rawValue);
  }

  return normalizeWhitespace(rawValue);
};

export const normalizeOpportunityExtractedValue = (field: string, rawValue: string) =>
  normalizeFieldValue(field, rawValue);

const safeMatchGroup = (match: RegExpMatchArray | null, index = 1) =>
  match?.[index] ? normalizeWhitespace(match[index]) : '';

const collectReadableRuns = (input: string) =>
  Array.from(
    new Set(
      input
        .replace(/[^\x09\x0a\x0d\x20-\x7e\u00a1-\u017f€£$%]/g, ' ')
        .split(/[\r\n]+/)
        .map((line) => normalizeWhitespace(line))
        .filter((line) => line.length >= 4 && isUsefulPdfTextCandidate(line))
    )
  );

const extractPdfLikeText = async (file: File) => {
  const buffer = await file.arrayBuffer();
  const decoded = decodeArrayBuffer(buffer);
  const literalTextOperators = Array.from(decoded.matchAll(/\(([^()]*)\)\s*Tj/g))
    .map((match) => normalizeWhitespace(match[1]))
    .filter(isUsefulPdfTextCandidate);
  const hexTextOperators = Array.from(decoded.matchAll(/<([0-9A-Fa-f\s]{8,})>\s*Tj/g))
    .map((match) => decodePdfHexText(match[1]))
    .filter(Boolean);
  const taggedTextEntries = Array.from(
    decoded.matchAll(/\/(?:T|TU|Alt|ActualText|Contents|Title|Subject|Author)\s*\(([^()]*)\)/g)
  )
    .map((match) => normalizeWhitespace(match[1]))
    .filter(isUsefulPdfTextCandidate);
  const readableRuns = collectReadableRuns(decoded);

  return Array.from(
    new Set([...taggedTextEntries, ...literalTextOperators, ...hexTextOperators, ...readableRuns])
  ).join('\n');
};

const extractSpreadsheetLikeText = async (file: File) => {
  const buffer = await file.arrayBuffer();
  const decoded = decodeArrayBuffer(buffer);
  return collectReadableRuns(decoded).join('\n');
};

export const detectOpportunityAttachmentType = (file: File): OpportunityDocumentType => {
  const name = file.name.toLowerCase();
  if (file.type.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (name.includes('floorplan') || name.includes('plano') || name.includes('floor-plan')) {
    return 'floorplan';
  }
  if (file.type.startsWith('image/')) return 'photo';
  return 'other';
};

export const extractTextFromDocumentFile = async (file: File): Promise<string> => {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  if (
    type.startsWith('text/') ||
    name.endsWith('.csv') ||
    name.endsWith('.tsv') ||
    name.endsWith('.txt') ||
    name.endsWith('.json')
  ) {
    return normalizeWhitespace(await file.text());
  }

  if (type.includes('pdf') || name.endsWith('.pdf')) {
    return extractPdfLikeText(file);
  }

  if (
    type.includes('sheet') ||
    type.includes('excel') ||
    name.endsWith('.xlsx') ||
    name.endsWith('.xls')
  ) {
    return extractSpreadsheetLikeText(file);
  }

  if (type.startsWith('image/')) {
    return `Image upload detected: ${file.name}`;
  }

  return extractSpreadsheetLikeText(file);
};

const buildExtractedField = (
  field: string,
  value: string,
  sourceSnippet: string,
  confidence: OpportunityFieldExtractionConfidence,
  inferred = false
): OpportunityExtractedField | null => {
  const rawValue = normalizeWhitespace(value);
  const rawSnippet = normalizeWhitespace(sourceSnippet || value);
  const corruptedValue = isLikelyCorruptedFieldValue(field, rawValue);
  const corruptedSnippet = analyzeExtractedTextQuality(rawSnippet).isCorrupted;
  const isCorrupted = corruptedValue || corruptedSnippet;
  const effectiveValue = corruptedValue ? '' : rawValue;
  const normalized = normalizeFieldValue(field, value);
  const isEmpty =
    effectiveValue === '' ||
    normalized === '' ||
    normalized === 0 ||
    (typeof normalized === 'number' && !Number.isFinite(normalized));

  if (isEmpty && !isCorrupted) {
    return null;
  }

  return {
    id: buildId(`field-${field}`),
    field,
    label: extractedFieldLabels[field] ?? field,
    value: effectiveValue,
    normalizedValue: isCorrupted ? '' : normalized,
    confidence: isCorrupted ? 'low' : confidence,
    sourceSnippet: rawSnippet,
    inferred,
    isCorrupted,
    reviewMessage: isCorrupted
      ? 'Text could not be reliably extracted from this section of the PDF.'
      : undefined,
  };
};

const pushFieldIfPresent = (
  fields: OpportunityExtractedField[],
  field: string,
  value: string,
  sourceSnippet: string,
  confidence: OpportunityFieldExtractionConfidence,
  inferred = false
) => {
  const extracted = buildExtractedField(field, value, sourceSnippet, confidence, inferred);
  if (extracted && !fields.some((item) => item.field === field)) {
    fields.push(extracted);
  }
};

const findSnippet = (text: string, expressions: RegExp[]) => {
  for (const expression of expressions) {
    const match = text.match(expression);
    if (match) {
      return { value: safeMatchGroup(match), snippet: normalizeWhitespace(match[0]) };
    }
  }
  return null;
};

const inferStrategyFromText = (text: string) => {
  const normalized = text.toLowerCase();
  if (/\bflip|resale|value-add|reforma integral\b/.test(normalized)) return 'flip';
  if (/\bbrrrr\b/.test(normalized)) return 'brrrr';
  if (/\bshort[\s-]?term|vacacional|tourist\b/.test(normalized)) return 'short-term-rental';
  if (/\brent|rental|alquiler|yield\b/.test(normalized)) return 'buy-to-let';
  return '';
};

const inferPropertyTypeFromText = (text: string) => {
  const normalized = text.toLowerCase();
  if (/\bapartment|apartamento|piso\b/.test(normalized)) return 'Apartment';
  if (/\bhouse|casa|villa|chalet\b/.test(normalized)) return 'House';
  if (/\bstudio\b/.test(normalized)) return 'Studio';
  if (/\boffice|oficina\b/.test(normalized)) return 'Office';
  if (/\blocal|retail|commercial\b/.test(normalized)) return 'Commercial';
  return '';
};

const nexiaDossierSectionDefinitions: Array<{ key: string; title: string; patterns: RegExp[] }> = [
  { key: 'opportunity-data', title: 'Opportunity data', patterns: [/\bdatos de la oportunidad\b/i, /\boportunidad\b/i] },
  { key: 'property-details', title: 'Property details', patterns: [/\bdetalles del inmueble\b/i, /\bproperty details\b/i] },
  { key: 'location-demand', title: 'Location / demand', patterns: [/\bubicaci[oó]n y demanda\b/i, /\blocation\b/i, /\bdemanda\b/i] },
  { key: 'investment-details', title: 'Investment details', patterns: [/\bdetalle de la inversi[oó]n\b/i, /\binvestment details\b/i] },
  { key: 'profitability-details', title: 'Profitability details', patterns: [/\bdetalle rentabilidad\b/i, /\brentabilidad\b/i] },
  { key: 'financing-scenario', title: 'Financing scenario', patterns: [/\bescenario de financiaci[oó]n\b/i, /\bfinancing scenario\b/i] },
  { key: 'acquisition-steps', title: 'Acquisition steps', patterns: [/\bpasos de adquisici[oó]n\b/i, /\bacquisition steps\b/i] },
];

const detectNexiaDossierTemplate = (text: string, fileName: string) => {
  const blob = `${fileName}\n${text}`.toLowerCase();
  const sections = nexiaDossierSectionDefinitions
    .map((section) => ({
      key: section.key,
      title: section.title,
      confidence: section.patterns.some((pattern) => pattern.test(blob)) ? 0.84 : 0,
    }))
    .filter((section) => section.confidence > 0);

  const strongSignals = [
    /nexia\s*prop/i.test(blob),
    /rentabilidad/i.test(blob),
    /escenario de financiaci/i.test(blob),
    /pasos de adquisici/i.test(blob),
    /pesimista|realista|optimista/i.test(blob),
    /ibi/i.test(blob) && /comunidad/i.test(blob),
  ].filter(Boolean).length;

  const confidence = Math.min(
    0.97,
    0.34 + (sections.length / nexiaDossierSectionDefinitions.length) * 0.44 + strongSignals * 0.06
  );

  return {
    matched: confidence >= 0.62,
    confidence,
    sections,
  };
};

const getDossierSectionSlice = (text: string, titlePatterns: RegExp[], fallbackWindow = 900) => {
  const lines = text.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => titlePatterns.some((pattern) => pattern.test(line)));
  if (startIndex === -1) {
    return '';
  }

  const nextIndex = lines.findIndex(
    (line, index) =>
      index > startIndex &&
      nexiaDossierSectionDefinitions.some((section) =>
        section.patterns.some((pattern) => pattern.test(line))
      )
  );

  return normalizeWhitespace(
    lines
      .slice(startIndex, nextIndex === -1 ? startIndex + 18 : nextIndex)
      .join('\n')
      .slice(0, fallbackWindow)
  );
};

const buildAiSummary = (
  fields: OpportunityExtractedField[],
  extractedText: string,
  fileName: string
): OpportunityAiSummary => {
  const byField = Object.fromEntries(fields.map((field) => [field.field, field]));
  const corruptedFieldCount = fields.filter((field) => field.isCorrupted).length;
  const corruptedSummarySource =
    analyzeExtractedTextQuality(extractedText).isCorrupted ||
    ['title', 'strengths', 'risks', 'demandNotes'].some((field) => byField[field]?.isCorrupted);
  const missingInformation = criticalOpportunityFields
    .filter((field) => !byField[field] || byField[field]?.isCorrupted)
    .map((field) => extractedFieldLabels[field]);
  const title = byField.title?.value || fileName.replace(/\.[^.]+$/, '');
  const city = byField.city?.value || 'location pending';
  const price = byField.askingPrice ? `at ${byField.askingPrice.value}` : 'with price still unconfirmed';
  const summary = corruptedSummarySource
    ? 'This file appears to be a real estate opportunity dossier. Some text sections could not be extracted reliably and may require manual review.'
    : `${title} was analyzed from the uploaded document and appears to be a ${byField.propertyType?.value || 'real estate'} opportunity in ${city}, ${price}.`;

  const keyStrengths = [
    byField.monthlyRentEstimate ? `Rent guidance found: ${byField.monthlyRentEstimate.value}.` : '',
    byField.builtSqm ? `Size identified: ${byField.builtSqm.value}.` : '',
    /yield|rentabilidad|cashflow/i.test(extractedText)
      ? 'Yield or cashflow language appears in the source document.'
      : '',
    byField.strengths && !byField.strengths.isCorrupted ? byField.strengths.value : '',
  ].filter(Boolean);

  const mainRisks = [
    byField.risks && !byField.risks.isCorrupted ? byField.risks.value : '',
    missingInformation.length > 0
      ? `Missing critical information: ${missingInformation.slice(0, 4).join(', ')}.`
      : '',
    !byField.address ? 'No complete address was found in the uploaded document.' : '',
    corruptedFieldCount > 0
      ? 'Some PDF text sections appear corrupted and should be reviewed manually.'
      : '',
  ].filter(Boolean);

  const suggestedNextAction =
    missingInformation.length >= 4
      ? 'review-manually'
      : byField.askingPrice && byField.monthlyRentEstimate
      ? 'pursue'
      : missingInformation.length >= 2
      ? 'negotiate'
      : 'review-manually';

  return {
    summary,
    keyStrengths,
    mainRisks,
    missingInformation,
    suggestedNextAction,
  };
};

export const analyzeOpportunityDocument = async (
  file: File,
  attachment: OpportunityAttachment
): Promise<OpportunityDocumentAnalysis> => {
  const extractedText = await extractTextFromDocumentFile(file);
  const text = extractedText || file.name;
  const fields: OpportunityExtractedField[] = [];
  const nexiaTemplate = detectNexiaDossierTemplate(text, file.name);
  const fileStem = file.name
    .replace(/\.[^.]+$/, '')
    .replace(/\bTG Dossier\b/gi, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const titleFromText =
    text
      .split(/\r?\n/)
      .map((line) => normalizeWhitespace(line))
      .find(
        (line) =>
          line.length > 10 &&
          line.length < 80 &&
          !/precio|price|rent|yield|opportunity|property|venta|alquiler|convierte tus inversiones|pasos para adquirir|rentabilidad neta|invertir en/i.test(
            line
          )
      ) || fileStem;

  pushFieldIfPresent(fields, 'title', titleFromText, titleFromText, titleFromText === fileStem ? 'low' : 'medium');

  const postalMatch = text.match(/\b(\d{5})\b/);
  if (postalMatch) {
    pushFieldIfPresent(fields, 'postalCode', postalMatch[1], postalMatch[0], 'medium');
  }

  const cityPatterns = [
    /\b(?:city|ciudad|localidad)\s*[:\-]\s*([A-Za-zÀ-ÿ' -]{3,})/i,
    /\b(Madrid|Barcelona|Valencia|Malaga|Málaga|Sevilla|Bilbao|Alicante|Marbella|Palma)\b/i,
  ];
  const cityMatch = findSnippet(text, cityPatterns);
  if (cityMatch) {
    pushFieldIfPresent(fields, 'city', cityMatch.value, cityMatch.snippet, cityMatch.value.length > 4 ? 'high' : 'medium');
  }

  const regionMatch = findSnippet(text, [
    /\b(?:province|provincia|region|región)\s*[:\-]\s*([A-Za-zÀ-ÿ' -]{3,})/i,
    /\b(Andalucia|Andalucía|Catalonia|Catalunya|Valencia|Balearic Islands|Islas Baleares|Madrid)\b/i,
  ]);
  if (regionMatch) {
    pushFieldIfPresent(fields, 'region', regionMatch.value, regionMatch.snippet, 'medium');
  }

  const countryMatch = findSnippet(text, [
    /\b(?:country|pais|país)\s*[:\-]\s*([A-Za-zÀ-ÿ' -]{3,})/i,
    /\b(Spain|Espana|España|Portugal|France|Italy|United Kingdom)\b/i,
  ]);
  if (countryMatch) {
    pushFieldIfPresent(fields, 'country', countryMatch.value, countryMatch.snippet, 'medium');
  }

  const addressMatch = findSnippet(text, [
    /\b(?:address|direccion|dirección)\s*[:\-]\s*([^\n\r]{8,90})/i,
    /\b(?:calle|c\/|avenida|avda\.?|paseo|plaza|camino)\s+[^\n\r,]{4,80}/i,
  ]);
  if (addressMatch) {
    pushFieldIfPresent(fields, 'address', addressMatch.value, addressMatch.snippet, 'medium');
  }

  const propertyType = inferPropertyTypeFromText(text);
  if (propertyType) {
    pushFieldIfPresent(fields, 'propertyType', propertyType, propertyType, 'medium', true);
  }

  const strategyHint = inferStrategyFromText(text);
  if (strategyHint) {
    pushFieldIfPresent(fields, 'strategy', strategyHint, strategyHint, 'medium', true);
  }

  const simplePatterns: Array<{ field: string; expressions: RegExp[]; confidence: OpportunityFieldExtractionConfidence }> = [
    { field: 'bedrooms', expressions: [/\b(\d+(?:[.,]\d+)?)\s*(?:bed(?:room)?s?|hab(?:itaciones?)?)\b/i], confidence: 'high' },
    { field: 'bathrooms', expressions: [/\b(\d+(?:[.,]\d+)?)\s*(?:bath(?:room)?s?|banos|baños)\b/i], confidence: 'high' },
    { field: 'builtSqm', expressions: [/\b(?:built|constructed|interior|construidos?)\s*(?:area)?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*m2\b/i, /\b(\d+(?:[.,]\d+)?)\s*m2\s*(?:built|interior|construidos?)\b/i], confidence: 'high' },
    { field: 'plotSqm', expressions: [/\b(?:plot|parcel|parcela|solar)\s*(?:size)?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*m2\b/i], confidence: 'high' },
    { field: 'floor', expressions: [/\b(?:floor|planta)\s*[:\-]?\s*([A-Za-z0-9ºª -]{1,12})/i], confidence: 'medium' },
    { field: 'yearBuilt', expressions: [/\b(?:year built|built in|ano de construccion|año de construcción)\s*[:\-]?\s*(\d{4})\b/i], confidence: 'high' },
    { field: 'condition', expressions: [/\b(?:condition|estado)\s*[:\-]?\s*([A-Za-zÀ-ÿ' -]{4,40})/i], confidence: 'medium' },
    { field: 'occupancyStatus', expressions: [/\b(?:occupancy|ocupacion|ocupación|tenancy)\s*[:\-]?\s*([A-Za-zÀ-ÿ' -]{4,40})/i, /\b(vacant|occupied|tenant in place|alquilado|libre)\b/i], confidence: 'medium' },
    { field: 'askingPrice', expressions: [/\b(?:asking price|sale price|purchase price|precio(?: de venta)?|pvp)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], confidence: 'high' },
    { field: 'targetOfferPrice', expressions: [/\b(?:target offer|offer price|precio objetivo|target purchase)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], confidence: 'high' },
    { field: 'estimatedClosingCosts', expressions: [/\b(?:closing costs|gastos de cierre|purchase costs|itp|ajd)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], confidence: 'medium' },
    { field: 'estimatedRenovationCost', expressions: [/\b(?:renovation|rehab|refurbishment|reforma)\s*(?:cost|budget|presupuesto)?\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], confidence: 'medium' },
    { field: 'furnitureSetupCost', expressions: [/\b(?:furniture|staging|setup)\s*(?:cost)?\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], confidence: 'medium' },
    { field: 'monthlyRentEstimate', expressions: [/\b(?:monthly rent|rent estimate|alquiler(?: mensual)?|renta(?: mensual)?)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i, /\b([€$£]?\s?\d[\d.,\s]*)\s*(?:\/month|per month|mes)\b/i], confidence: 'high' },
    { field: 'otherMonthlyIncome', expressions: [/\b(?:other income|parking income|storage income|otros ingresos)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], confidence: 'medium' },
    { field: 'monthlyCommunityCost', expressions: [/\b(?:community fees|community cost|comunidad)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], confidence: 'medium' },
    { field: 'monthlyInsuranceCost', expressions: [/\b(?:insurance|seguro)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], confidence: 'medium' },
    { field: 'monthlyPropertyTax', expressions: [/\b(?:ibi|property tax|council tax)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], confidence: 'medium' },
    { field: 'monthlyMaintenanceReserve', expressions: [/\b(?:maintenance|repairs reserve|mantenimiento)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], confidence: 'medium' },
    { field: 'monthlyManagementCost', expressions: [/\b(?:management fee|management cost|gestion|gestión)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], confidence: 'medium' },
    { field: 'vacancyAssumptionPct', expressions: [/\b(?:vacancy|vacancy assumption|desocupacion|desocupación)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i], confidence: 'high' },
    { field: 'sellingCostPct', expressions: [/\b(?:selling cost|sales cost|coste de venta)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i], confidence: 'high' },
  ];

  simplePatterns.forEach((pattern) => {
    const match = findSnippet(text, pattern.expressions);
    if (match) {
      pushFieldIfPresent(fields, pattern.field, match.value, match.snippet, pattern.confidence);
    }
  });

  const financingMatch = findSnippet(text, [
    /\b(?:financing|mortgage|hipoteca|loan)\b[^\n\r]{0,120}/i,
    /\b(?:lender|broker|bank)\b[^\n\r]{0,120}/i,
  ]);
  if (financingMatch) {
    pushFieldIfPresent(fields, 'financingNotes', financingMatch.snippet, financingMatch.snippet, 'low');
    pushFieldIfPresent(fields, 'brokerLenderNotes', financingMatch.snippet, financingMatch.snippet, 'low');
  }

  const highlightsMatch = findSnippet(text, [
    /\b(?:highlights|investment highlights|ventajas|strengths)\b[^\n\r]{0,180}/i,
    /\b(?:yield|rentability|rentabilidad)\b[^\n\r]{0,180}/i,
  ]);
  if (highlightsMatch) {
    pushFieldIfPresent(fields, 'strengths', highlightsMatch.snippet, highlightsMatch.snippet, 'low');
  }

  const risksMatch = findSnippet(text, [
    /\b(?:risks|warnings|red flags|riesgos|advertencias)\b[^\n\r]{0,180}/i,
    /\b(?:needs renovation|ocupado|legal review|sin ascensor)\b[^\n\r]{0,180}/i,
  ]);
  if (risksMatch) {
    pushFieldIfPresent(fields, 'risks', risksMatch.snippet, risksMatch.snippet, 'low');
  }

  if (nexiaTemplate.matched) {
    const sectionMap = {
      opportunity: getDossierSectionSlice(text, [/\bdatos de la oportunidad\b/i, /\boportunidad\b/i]),
      property: getDossierSectionSlice(text, [/\bdetalles del inmueble\b/i, /\bproperty details\b/i]),
      location: getDossierSectionSlice(text, [/\bubicaci[oó]n y demanda\b/i, /\blocation\b/i, /\bdemanda\b/i]),
      investment: getDossierSectionSlice(text, [/\bdetalle de la inversi[oó]n\b/i, /\binvestment details\b/i]),
      profitability: getDossierSectionSlice(text, [/\bdetalle rentabilidad\b/i, /\brentabilidad\b/i]),
      financing: getDossierSectionSlice(text, [/\bescenario de financiaci[oó]n\b/i, /\bfinancing scenario\b/i]),
      acquisition: getDossierSectionSlice(text, [/\bpasos de adquisici[oó]n\b/i, /\bacquisition steps\b/i]),
    };

    const addSectionField = (
      field: string,
      sectionText: string,
      expressions: RegExp[],
      confidence: OpportunityFieldExtractionConfidence = 'high',
      inferred = false
    ) => {
      const match = findSnippet(sectionText || text, expressions);
      if (match) {
        pushFieldIfPresent(fields, field, match.value, match.snippet, confidence, inferred);
      }
    };

    const addSectionBoolean = (
      field: string,
      sectionText: string,
      expression: RegExp,
      confidence: OpportunityFieldExtractionConfidence = 'medium'
    ) => {
      const match = sectionText.match(expression) || text.match(expression);
      if (match) {
        pushFieldIfPresent(fields, field, match[0], match[0], confidence);
      }
    };

    addSectionField('municipality', sectionMap.opportunity || sectionMap.property, [/\bmunicipio\s*[:\-]?\s*([^\n\r|]{3,60})/i]);
    addSectionField('city', sectionMap.opportunity || sectionMap.property, [/\bmunicipio\s*[:\-]?\s*([^\n\r|]{3,60})/i]);
    addSectionField('address', sectionMap.opportunity || sectionMap.property, [/\bdirecci[oó]n\s*[:\-]?\s*([^\n\r]{8,100})/i]);
    addSectionField('province', sectionMap.opportunity || sectionMap.property, [/\bprovincia\s*[:\-]?\s*([^\n\r|]{3,60})/i]);
    addSectionField('region', sectionMap.opportunity || sectionMap.property, [/\bprovincia\s*[:\-]?\s*([^\n\r|]{3,60})/i]);
    addSectionField('autonomousCommunity', sectionMap.opportunity || sectionMap.property, [/\bcomunidad aut[oó]noma\s*[:\-]?\s*([^\n\r|]{3,80})/i]);
    addSectionField('builtArea', sectionMap.property, [/\b(?:superficie construida|superficie)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*m2\b/i]);
    addSectionField('builtSqm', sectionMap.property, [/\b(?:superficie construida|superficie)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*m2\b/i]);
    addSectionField('floor', sectionMap.property, [/\bplanta\s*[:\-]?\s*([A-Za-z0-9ºª -]{1,12})/i], 'medium');
    addSectionField('bedrooms', sectionMap.property, [/\bdormitorios?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i]);
    addSectionField('bathrooms', sectionMap.property, [/\bba[nñ]os?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i]);
    addSectionField('yearBuilt', sectionMap.property, [/\ba[nñ]o de construcci[oó]n\s*[:\-]?\s*(\d{4})/i]);
    addSectionBoolean('exterior', sectionMap.property, /\bexterior\b/i);
    addSectionBoolean('terrace', sectionMap.property, /\bterraza\b/i);
    addSectionBoolean('elevator', sectionMap.property, /\bascensor\b/i);
    addSectionBoolean('parking', sectionMap.property, /\bparking\b|\bgaraje\b/i);
    addSectionBoolean('storageRoom', sectionMap.property, /\btrastero\b/i);

    addSectionField('purchasePrice', sectionMap.investment, [/\b(?:precio de compra|precio adquisici[oó]n|purchase price)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i]);
    addSectionField('askingPrice', sectionMap.investment, [/\b(?:precio de compra|precio adquisici[oó]n|purchase price)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i]);
    addSectionField('transferTax', sectionMap.investment, [/\b(?:itp|transfer tax)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i]);
    addSectionField('estimatedClosingCosts', sectionMap.investment, [/\b(?:itp|notar[ií]a\s*\/?\s*registro|notary(?:\/registry)?|honorarios agencia|agency fee|fee de sourcing|sourcing(?:\/service)? fee)\b[^\n\r]{0,70}?([€$£]?\s?\d[\d.,\s]*)/i], 'medium');
    addSectionField('notaryRegistry', sectionMap.investment, [/\b(?:notar[ií]a\s*\/?\s*registro|notary(?:\/registry)?)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 'medium');
    addSectionField('renovationFurniture', sectionMap.investment, [/\b(?:reforma(?: y mobiliario)?|renovation(?: and furniture)?)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i]);
    addSectionField('estimatedRenovationCost', sectionMap.investment, [/\b(?:reforma(?: y mobiliario)?|renovation(?: and furniture)?)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 'medium');
    addSectionField('furnitureSetupCost', sectionMap.investment, [/\bmobiliario\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 'medium');
    addSectionField('sourcingServiceFee', sectionMap.investment, [/\b(?:fee de sourcing|sourcing(?:\/service)? fee)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 'medium');
    addSectionField('agencyFee', sectionMap.investment, [/\b(?:honorarios agencia|agency fee)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 'medium');
    addSectionField('totalInvestment', sectionMap.investment, [/\b(?:inversi[oó]n total|total investment)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i]);

    addSectionField('annualIbiTrash', sectionMap.profitability || sectionMap.investment, [/\b(?:ibi(?:\s*\/\s*basura)?|ibi\s*y\s*basura)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 'medium');
    addSectionField('annualInsurance', sectionMap.profitability || sectionMap.investment, [/\bseguro\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 'medium');
    addSectionField('annualCommunity', sectionMap.profitability || sectionMap.investment, [/\bcomunidad\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 'medium');
    addSectionField('annualRentalManagement', sectionMap.profitability || sectionMap.investment, [/\b(?:gesti[oó]n del alquiler|rental management)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 'medium');

    addSectionField('pessimisticMonthlyRent', sectionMap.profitability, [/\bpesimista[^\n\r]{0,40}?([€$£]?\s?\d[\d.,\s]*)/i]);
    addSectionField('realisticMonthlyRent', sectionMap.profitability, [/\brealista[^\n\r]{0,40}?([€$£]?\s?\d[\d.,\s]*)/i]);
    addSectionField('optimisticMonthlyRent', sectionMap.profitability, [/\boptimista[^\n\r]{0,40}?([€$£]?\s?\d[\d.,\s]*)/i]);
    addSectionField('monthlyRentEstimate', sectionMap.profitability, [/\brealista[^\n\r]{0,40}?([€$£]?\s?\d[\d.,\s]*)/i]);
    addSectionField('pessimisticAnnualRent', sectionMap.profitability, [/\bpesimista[^\n\r]{0,80}?(?:anual|annual)[^\d]{0,10}([€$£]?\s?\d[\d.,\s]*)/i], 'medium');
    addSectionField('realisticAnnualRent', sectionMap.profitability, [/\brealista[^\n\r]{0,80}?(?:anual|annual)[^\d]{0,10}([€$£]?\s?\d[\d.,\s]*)/i], 'medium');
    addSectionField('optimisticAnnualRent', sectionMap.profitability, [/\boptimista[^\n\r]{0,80}?(?:anual|annual)[^\d]{0,10}([€$£]?\s?\d[\d.,\s]*)/i], 'medium');
    addSectionField('monthlyNetCashflow', sectionMap.profitability, [/\b(?:cashflow neto mensual|monthly net cashflow)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s-]*)/i], 'medium');
    addSectionField('annualNetCashflow', sectionMap.profitability, [/\b(?:cashflow neto anual|annual net cashflow)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s-]*)/i], 'medium');
    addSectionField('grossYield', sectionMap.profitability, [/\b(?:rentabilidad bruta|gross yield)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i], 'medium');
    addSectionField('netComparableYield', sectionMap.profitability, [/\b(?:rentabilidad neta comparable|net comparable yield)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i], 'medium');
    addSectionField('fullyPassiveNetYield', sectionMap.profitability, [/\b(?:rentabilidad neta totalmente pasiva|fully passive net yield)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i], 'medium');

    addSectionField('ltv', sectionMap.financing, [/\bltv\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i], 'medium');
    addSectionField('totalCashContributionNeeded', sectionMap.financing, [/\b(?:aportaci[oó]n total necesaria|total cash contribution needed)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i]);
    addSectionField('mortgagePayment', sectionMap.financing, [/\b(?:cuota hipotecaria|mortgage payment)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 'medium');
    addSectionField('estimatedMonthlyMortgagePayment', sectionMap.financing, [/\b(?:cuota hipotecaria|mortgage payment)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 'medium');
    addSectionField('leveragedReturnOnEquity', sectionMap.financing, [/\b(?:rentabilidad apalancada sobre recursos propios|leveraged return on equity)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i], 'medium');
    addSectionField('leveragedCashflow', sectionMap.financing, [/\b(?:cashflow apalancado|leveraged cashflow)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s-]*)/i], 'medium');

    if (sectionMap.location) {
      pushFieldIfPresent(fields, 'demandNotes', sectionMap.location, sectionMap.location, 'low', true);
      pushFieldIfPresent(fields, 'strengths', sectionMap.location, sectionMap.location, 'low', true);
    }
    if (sectionMap.acquisition) {
      pushFieldIfPresent(fields, 'acquisitionSteps', sectionMap.acquisition, sectionMap.acquisition, 'low', true);
    }
  }

  const summary = buildAiSummary(fields, text, file.name);

  return {
    id: buildId('analysis'),
    attachmentId: attachment.id,
    fileName: file.name,
    extractedAt: new Date().toISOString(),
    extractedText: text,
    extractionTemplateName: nexiaTemplate.matched ? 'Real Estate Opportunity Dossier Template' : undefined,
    extractionTemplateConfidence: nexiaTemplate.matched
      ? Math.round(nexiaTemplate.confidence * 100)
      : undefined,
    detectedSections: nexiaTemplate.sections,
    extractedFields: fields,
    summary: nexiaTemplate.matched
      ? {
          ...summary,
          summary:
            'This broker PDF matches the Real Estate Opportunity Dossier Template. The extraction prioritized dossier sections, investment tables, profitability scenarios, financing assumptions, and acquisition steps.',
        }
      : summary,
  };
};

export const applyOpportunityDocumentAnalysis = (
  analysis: OpportunityDocumentAnalysis,
  attachment: OpportunityAttachment,
  currentOpportunity?: Opportunity
): Opportunity => {
  const base = currentOpportunity ?? createEmptyOpportunity();
  const patch: Partial<Opportunity> = {};
  const fieldConfidence = { ...base.fieldConfidence };

  analysis.extractedFields.forEach((field) => {
    if (field.isCorrupted || field.value === '' || field.normalizedValue === '') {
      return;
    }
    (patch as Record<string, unknown>)[field.field] = field.normalizedValue;
    fieldConfidence[field.field] = {
      value: String(field.value),
      confidence: field.confidence,
    };
  });

  const shouldUseImage = attachment.type === 'photo' || attachment.type === 'floorplan';

  const merged = enrichOpportunity({
    ...base,
    ...patch,
    sourceType: attachment.type === 'pdf' ? 'pdf' : 'document',
    sourcePdfName: attachment.name,
    extractedText: analysis.extractedText,
    fieldConfidence,
    documents: base.documents.some((doc) => doc.id === attachment.id)
      ? base.documents
      : [...base.documents, attachment],
    galleryImages:
      shouldUseImage && !base.galleryImages.some((image) => image.id === attachment.id)
        ? [...base.galleryImages, attachment]
        : base.galleryImages,
    mainImageUrl: shouldUseImage && !base.mainImageUrl ? attachment.url : base.mainImageUrl,
    strengths:
      patch.strengths !== undefined
        ? String(patch.strengths)
        : base.strengths || analysis.summary.keyStrengths.join(' '),
    risks:
      patch.risks !== undefined
        ? String(patch.risks)
        : base.risks || analysis.summary.mainRisks.join(' '),
    investmentThesis:
      base.investmentThesis || analysis.summary.summary,
    documentAnalyses: [...base.documentAnalyses, analysis],
  });

  return merged;
};

export const estimateOpportunityReadiness = (opportunity: Opportunity): number => {
  const checks = [
    opportunity.title.trim(),
    opportunity.city.trim(),
    opportunity.country.trim(),
    toNumber(opportunity.askingPrice) > 0,
    toNumber(opportunity.targetOfferPrice) > 0,
    toNumber(opportunity.monthlyRentEstimate) > 0,
    opportunity.propertyType.trim(),
    opportunity.strategy.trim(),
    opportunity.mainImageUrl.trim(),
    opportunity.investmentThesis.trim(),
    opportunity.strengths.trim(),
    opportunity.risks.trim(),
  ];

  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
};

export const getOpportunityRecommendation = (
  readinessScore: number,
  metrics: OpportunityAnalysisMetrics
): OpportunityRecommendation => {
  if (readinessScore >= 72 && metrics.netMonthlyCashflow >= 0 && metrics.cashOnCashReturn >= 7) {
    return 'pursue';
  }

  if (readinessScore >= 48 && metrics.netMonthlyCashflow > -150) {
    return 'negotiate';
  }

  return 'reject';
};

export const createEmptyOpportunity = (
  overrides: Partial<Opportunity> = {}
): Opportunity => {
  const now = new Date().toISOString();
  const base: Opportunity = {
    id: buildId('opp'),
    title: '',
    address: '',
    city: '',
    region: '',
    country: 'Spain',
    postalCode: '',
    propertyType: 'Apartment',
    strategy: 'buy-to-let',
    status: 'new-lead',
    description: '',
    bedrooms: 0,
    bathrooms: 0,
    builtSqm: 0,
    plotSqm: 0,
    floor: '',
    yearBuilt: 0,
    condition: '',
    occupancyStatus: '',
    askingPrice: 0,
    targetOfferPrice: 0,
    estimatedClosingCosts: 0,
    estimatedRenovationCost: 0,
    furnitureSetupCost: 0,
    monthlyRentEstimate: 0,
    otherMonthlyIncome: 0,
    monthlyCommunityCost: 0,
    monthlyInsuranceCost: 0,
    monthlyPropertyTax: 0,
    monthlyMaintenanceReserve: 0,
    monthlyManagementCost: 0,
    vacancyAssumptionPct: 5,
    sellingCostPct: 4,
    contingencyPct: 5,
    financingNotes: '',
    cashPurchase: false,
    useMortgage: true,
    downPaymentPct: 30,
    interestRate: 3.6,
    mortgageTermYears: 25,
    estimatedMonthlyMortgagePayment: 0,
    loanAmount: 0,
    brokerLenderNotes: '',
    estimatedResalePrice: 0,
    monthlyHoldingCosts: 0,
    investmentThesis: '',
    risks: '',
    strengths: '',
    weaknesses: '',
    locationNotes: '',
    exitStrategyNotes: '',
    mainImageUrl: '',
    galleryImages: [],
    documents: [],
    extractedText: '',
    sourcePdfName: '',
    sourceType: 'manual',
    fieldConfidence: {},
    documentAnalyses: [],
    readinessScore: 0,
    recommendedAction: 'negotiate',
    linkedPropertyId: null,
    createdAt: now,
    updatedAt: now,
    addedAt: now,
  };

  const merged: Opportunity = {
    ...base,
    ...overrides,
    galleryImages: overrides.galleryImages ?? base.galleryImages,
    documents: overrides.documents ?? base.documents,
    fieldConfidence: overrides.fieldConfidence ?? base.fieldConfidence,
    documentAnalyses: overrides.documentAnalyses ?? base.documentAnalyses,
  };
  const metrics = calculateOpportunityAnalysis(merged, 'base');
  const readinessScore = estimateOpportunityReadiness(merged);

  return {
    ...merged,
    loanAmount:
      overrides.loanAmount ??
      calculateOpportunityLoanAmount(merged.askingPrice, merged.targetOfferPrice, merged.downPaymentPct),
    estimatedMonthlyMortgagePayment:
      overrides.estimatedMonthlyMortgagePayment ??
      calculateMortgagePayment(
        overrides.loanAmount ??
          calculateOpportunityLoanAmount(merged.askingPrice, merged.targetOfferPrice, merged.downPaymentPct),
        merged.interestRate,
        merged.mortgageTermYears
      ),
    readinessScore,
    recommendedAction: getOpportunityRecommendation(readinessScore, metrics),
  };
};

export const calculateOpportunityLoanAmount = (
  askingPrice: number,
  targetOfferPrice: number,
  downPaymentPct: number
): number => {
  const acquisitionPrice = Math.max(toNumber(targetOfferPrice) || toNumber(askingPrice), 0);
  return acquisitionPrice * (1 - Math.min(Math.max(toNumber(downPaymentPct), 0), 100) / 100);
};

export const calculateMortgagePayment = (
  principal: number,
  annualRate: number,
  termYears: number
): number => {
  const safePrincipal = Math.max(toNumber(principal), 0);
  const months = Math.max(Math.round(toNumber(termYears) * 12), 0);

  if (safePrincipal <= 0 || months <= 0) {
    return 0;
  }

  const monthlyRate = Math.max(toNumber(annualRate), 0) / 100 / 12;

  if (monthlyRate === 0) {
    return safePrincipal / months;
  }

  const factor = Math.pow(1 + monthlyRate, months);
  return (safePrincipal * monthlyRate * factor) / (factor - 1);
};

export const calculateOpportunityAnalysis = (
  opportunity: Opportunity,
  scenario: OpportunityScenario = 'base'
): OpportunityAnalysisMetrics => {
  const adjustment = scenarioAdjustments[scenario];
  const acquisitionPrice = Math.max(
    toNumber(opportunity.targetOfferPrice) || toNumber(opportunity.askingPrice),
    0
  );
  const closingCosts = toNumber(opportunity.estimatedClosingCosts);
  const renovationCost = toNumber(opportunity.estimatedRenovationCost) * adjustment.renovationFactor;
  const furnitureCost = toNumber(opportunity.furnitureSetupCost);
  const contingencyBase = acquisitionPrice + closingCosts + renovationCost + furnitureCost;
  const contingencyCost = contingencyBase * (Math.max(toNumber(opportunity.contingencyPct), 0) / 100);
  const totalProjectCost = acquisitionPrice + closingCosts + renovationCost + furnitureCost + contingencyCost;

  const loanAmount = opportunity.cashPurchase || !opportunity.useMortgage
    ? 0
    : toNumber(opportunity.loanAmount) > 0
    ? toNumber(opportunity.loanAmount)
    : calculateOpportunityLoanAmount(acquisitionPrice, acquisitionPrice, opportunity.downPaymentPct);

  const monthlyMortgagePayment =
    opportunity.cashPurchase || !opportunity.useMortgage
      ? 0
      : toNumber(opportunity.estimatedMonthlyMortgagePayment) > 0
      ? toNumber(opportunity.estimatedMonthlyMortgagePayment)
      : calculateMortgagePayment(loanAmount, opportunity.interestRate, opportunity.mortgageTermYears);

  const downPayment = opportunity.cashPurchase || !opportunity.useMortgage
    ? acquisitionPrice
    : acquisitionPrice * (Math.min(Math.max(toNumber(opportunity.downPaymentPct), 0), 100) / 100);

  const totalCashNeeded = downPayment + closingCosts + renovationCost + furnitureCost + contingencyCost;
  const monthlyRent = toNumber(opportunity.monthlyRentEstimate) * adjustment.rentFactor;
  const otherIncome = toNumber(opportunity.otherMonthlyIncome);
  const totalMonthlyIncome = monthlyRent + otherIncome;
  const vacancyPct = Math.max(toNumber(opportunity.vacancyAssumptionPct) + adjustment.vacancyDelta, 0);
  const vacancyMonthlyCost = monthlyRent * (vacancyPct / 100);
  const totalMonthlyExpenses =
    toNumber(opportunity.monthlyCommunityCost) +
    toNumber(opportunity.monthlyInsuranceCost) +
    toNumber(opportunity.monthlyPropertyTax) +
    toNumber(opportunity.monthlyMaintenanceReserve) +
    toNumber(opportunity.monthlyManagementCost) +
    vacancyMonthlyCost +
    toNumber(opportunity.monthlyHoldingCosts) +
    monthlyMortgagePayment;
  const annualRent = totalMonthlyIncome * 12;
  const annualOperatingExpenses =
    (toNumber(opportunity.monthlyCommunityCost) +
      toNumber(opportunity.monthlyInsuranceCost) +
      toNumber(opportunity.monthlyPropertyTax) +
      toNumber(opportunity.monthlyMaintenanceReserve) +
      toNumber(opportunity.monthlyManagementCost) +
      vacancyMonthlyCost +
      toNumber(opportunity.monthlyHoldingCosts)) *
    12;
  const netAnnualIncome = annualRent - annualOperatingExpenses - monthlyMortgagePayment * 12;
  const netMonthlyCashflow = totalMonthlyIncome - totalMonthlyExpenses;
  const grossYield = totalProjectCost === 0 ? 0 : (annualRent / totalProjectCost) * 100;
  const cashOnCashReturn = totalCashNeeded === 0 ? 0 : (netAnnualIncome / totalCashNeeded) * 100;
  const estimatedSalePrice =
    Math.max(toNumber(opportunity.estimatedResalePrice), acquisitionPrice) * adjustment.saleFactor;
  const sellingCosts = estimatedSalePrice * (Math.max(toNumber(opportunity.sellingCostPct), 0) / 100);
  const estimatedSaleProfit =
    estimatedSalePrice - acquisitionPrice - closingCosts - renovationCost - furnitureCost - contingencyCost - sellingCosts;
  const roiOnSale = totalCashNeeded === 0 ? 0 : (estimatedSaleProfit / totalCashNeeded) * 100;
  const sellingCostRate = Math.max(toNumber(opportunity.sellingCostPct), 0) / 100;
  const breakEvenSalePrice = totalProjectCost / (1 - sellingCostRate);

  return {
    totalCashNeeded,
    totalProjectCost,
    grossYield,
    netAnnualIncome,
    netMonthlyCashflow,
    cashOnCashReturn,
    roiOnSale,
    breakEvenSalePrice,
    annualRent,
    annualOperatingExpenses,
    monthlyMortgagePayment,
    totalMonthlyIncome,
    totalMonthlyExpenses,
    estimatedSaleProfit,
  };
};

export const enrichOpportunity = (opportunity: Opportunity): Opportunity => {
  const loanAmount =
    opportunity.cashPurchase || !opportunity.useMortgage
      ? 0
      : toNumber(opportunity.loanAmount) > 0
      ? toNumber(opportunity.loanAmount)
      : calculateOpportunityLoanAmount(
          opportunity.targetOfferPrice || opportunity.askingPrice,
          opportunity.targetOfferPrice || opportunity.askingPrice,
          opportunity.downPaymentPct
        );
  const estimatedMonthlyMortgagePayment =
    opportunity.cashPurchase || !opportunity.useMortgage
      ? 0
      : toNumber(opportunity.estimatedMonthlyMortgagePayment) > 0
      ? toNumber(opportunity.estimatedMonthlyMortgagePayment)
      : calculateMortgagePayment(loanAmount, opportunity.interestRate, opportunity.mortgageTermYears);
  const updatedAt = new Date().toISOString();
  const draft = {
    ...opportunity,
    loanAmount,
    estimatedMonthlyMortgagePayment,
    updatedAt,
  };
  const metrics = calculateOpportunityAnalysis(draft, 'base');
  const readinessScore = estimateOpportunityReadiness(draft);

  return {
    ...draft,
    readinessScore,
    recommendedAction: getOpportunityRecommendation(readinessScore, metrics),
  };
};

export const inferOpportunityFromPdf = (
  fileName: string,
  attachment: OpportunityAttachment
): Opportunity => {
  const baseName = fileName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
  const title = baseName
    .split(/\s+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
  const cityMatch = title.match(/\b(Madrid|Barcelona|Valencia|Malaga|Seville|Bilbao|Alicante)\b/i);
  const city = cityMatch ? cityMatch[0] : '';

  return createEmptyOpportunity({
    title,
    city,
    sourceType: 'pdf',
    sourcePdfName: fileName,
    documents: [attachment],
    extractedText: `Imported from ${fileName}. Filename-based extraction applied.`,
    fieldConfidence: {
      title: { value: title, confidence: 'medium' },
      city: { value: city, confidence: city ? 'low' : 'low' },
    },
    description: 'Imported PDF opportunity. Review and complete the missing inputs before decision-making.',
  });
};

export const createAttachmentFromFile = async (
  file: File,
  type: OpportunityAttachment['type']
): Promise<OpportunityAttachment> => {
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  return {
    id: buildId(slugify(file.name) || 'file'),
    name: file.name,
    type,
    mimeType: file.type,
    url,
    uploadedAt: new Date().toISOString(),
  };
};

export const mapOpportunityToPropertyPreview = (opportunity: Opportunity) => ({
  name: opportunity.title,
  address: opportunity.address,
  city: opportunity.city,
  country: opportunity.country,
  propertyType: opportunity.propertyType,
  bedrooms: opportunity.bedrooms,
  bathrooms: opportunity.bathrooms,
  builtAreaSqm: opportunity.builtSqm,
  notes: opportunity.investmentThesis,
  askingPrice: opportunity.askingPrice,
});
