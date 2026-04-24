import type {
  IngestionDetectedSection,
  DocumentAnalysisResult,
  IngestionConflict,
  IngestionDocumentType,
  IngestionExtractedField,
  IngestionFieldValueType,
  IngestionMissingDataFlag,
  IngestionProjectType,
  IngestionSuggestedCategory,
  IngestionSuggestedCustomField,
  IngestionWarning,
  UploadedWorkspaceFile,
  UploadedWorkspaceFileShape,
  UploadedWorkspaceFileType,
  WorkspaceCustomFieldType,
  WorkspaceModule,
} from '../types/settings';

const buildId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const decodeArrayBuffer = (buffer: ArrayBuffer) => {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  } catch {
    return new TextDecoder('latin1').decode(buffer);
  }
};

const collectReadableRuns = (input: string) =>
  Array.from(
    new Set(
      input
        .replace(/[^\x09\x0a\x0d\x20-\x7e\u00a1-\u017f€£$%]/g, ' ')
        .split(/[\r\n]+/)
        .map((line) => normalizeWhitespace(line))
        .filter((line) => line.length >= 3)
    )
  );

const extractPdfLikeText = async (file: File) => {
  const buffer = await file.arrayBuffer();
  const decoded = decodeArrayBuffer(buffer);
  const textOperators = Array.from(decoded.matchAll(/\(([^()]*)\)\s*Tj/g)).map((match) =>
    normalizeWhitespace(match[1])
  );
  return [...textOperators, ...collectReadableRuns(decoded)].join('\n');
};

const extractSpreadsheetLikeText = async (file: File) => {
  const buffer = await file.arrayBuffer();
  const decoded = decodeArrayBuffer(buffer);
  return collectReadableRuns(decoded).join('\n');
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

const inferFileType = (file: File): UploadedWorkspaceFileType => {
  const name = file.name.toLowerCase();
  if (file.type.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.csv') || name.endsWith('.tsv')) return 'csv';
  if (file.type.includes('sheet') || file.type.includes('excel') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return 'spreadsheet';
  }
  if (file.type.startsWith('image/')) return 'image';
  return 'document';
};

const inferContentShape = (file: File, text: string): UploadedWorkspaceFileShape => {
  const blob = `${file.name} ${text}`.toLowerCase();
  const hasRows = /\b(total|subtotal|qty|quantity|unit cost|materials|labor|supplier)\b/.test(blob);
  const hasNarrative = /\b(property|investment|location|summary|memo|opportunity|yield|rent)\b/.test(blob);
  const isImage = file.type.startsWith('image/');

  if (isImage && !text.replace(/image upload detected:/i, '').trim()) return 'visual';
  if (hasRows && hasNarrative) return 'mixed';
  if (hasRows) return 'tabular';
  if (isImage) return 'visual';
  return 'narrative';
};

const estimatePageCount = (file: File, text: string) => {
  if (file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')) {
    const matches = text.match(/\/Type\s*\/Page\b/g);
    return Math.max(1, (matches?.length ?? Math.ceil(text.length / 2800)) || 1);
  }
  return 1;
};

export const preprocessUploadedWorkspaceFile = async (file: File): Promise<UploadedWorkspaceFile> => {
  const extractedText = await extractTextFromDocumentFile(file);
  return {
    id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    type: inferFileType(file),
    sizeBytes: file.size,
    uploadedAt: new Date().toISOString(),
    pageCount: estimatePageCount(file, extractedText),
    encoding: 'utf-8',
    needsOcr: file.type.startsWith('image/'),
    contentShape: inferContentShape(file, extractedText),
    extractedText,
    extractedEntities: [],
    analysis: null,
    reviewStatus: 'pending',
  };
};

const parseLocalizedNumber = (rawValue: string): number => {
  const cleaned = rawValue.replace(/[^\d,.-]/g, '').replace(/\u00a0/g, '').trim();

  if (!cleaned) return 0;

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  if (hasComma && hasDot) {
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    return Number(cleaned.replace(new RegExp(`\\${thousandsSeparator}`, 'g'), '').replace(decimalSeparator, '.'));
  }

  if (hasComma) {
    const commaCount = cleaned.split(',').length - 1;
    if (commaCount > 1 || /,\d{3}$/.test(cleaned)) return Number(cleaned.replace(/,/g, ''));
    return Number(cleaned.replace(',', '.'));
  }

  if (hasDot) {
    const dotCount = cleaned.split('.').length - 1;
    if (dotCount > 1 || /\.\d{3}$/.test(cleaned)) return Number(cleaned.replace(/\./g, ''));
  }

  return Number(cleaned);
};

const normalizeCurrency = (rawValue: string) => Math.max(parseLocalizedNumber(rawValue), 0);
const normalizePercentage = (rawValue: string) => Math.max(parseLocalizedNumber(rawValue), 0);
const normalizeSurface = (rawValue: string) => Math.max(parseLocalizedNumber(rawValue), 0);

const classifyDocumentTypes = (file: UploadedWorkspaceFile): Array<{ type: IngestionDocumentType; confidence: number }> => {
  const blob = `${file.name} ${file.extractedText}`.toLowerCase();
  const matches: Array<{ type: IngestionDocumentType; confidence: number }> = [];
  const add = (type: IngestionDocumentType, confidence: number) => {
    if (!matches.some((item) => item.type === type)) matches.push({ type, confidence });
  };

  if (/\b(asking price|precio|yield|rentabilidad|bedrooms|bathrooms|broker|teaser)\b/.test(blob)) add('investment-opportunity', 0.86);
  if (/\b(property brochure|brochure|brokers?|marketing deck|investment highlights)\b/.test(blob)) add('property-brochure', 0.82);
  if (/\b(materials|labor|qty|quantity|unit cost|budget|presupuesto|subtotal|contingency)\b/.test(blob)) add('budget-spreadsheet', 0.88);
  if (/\b(quote|quotation|contractor|proposal|scope of works)\b/.test(blob)) add('contractor-quote', 0.8);
  if (/\b(loan amount|interest rate|fixed rate|variable|monthly payment|lender|hipoteca|bonification)\b/.test(blob)) add('mortgage-offer', 0.9);
  if (blob.includes('/month') || /\\b(rent estimate|market rent|alquiler)\\b/.test(blob)) add('rent-estimate', 0.74);
  if (/\b(invoice|invoice number|supplier|vat|iva|tax amount|due date)\b/.test(blob)) add('invoice', 0.84);
  if (/\b(receipt|paid|receipt no)\b/.test(blob)) add('receipt', 0.72);
  if (/\b(permit|licence|license|permit number|expediente)\b/.test(blob)) add('permit', 0.79);
  if (/\b(floorplan|plano|elevation|layout)\b/.test(blob)) add('floorplan-notes', 0.72);
  if (/\b(report|memo|investment memo|presentation)\b/.test(blob)) add('report-memo', 0.72);
  if (/\b(deck|presentation|investor pack)\b/.test(blob)) add('marketing-deck', 0.7);

  if (matches.length === 0) add('unknown', 0.45);
  return matches.sort((left, right) => right.confidence - left.confidence);
};

const detectProjectTypes = (blob: string): Array<{ type: IngestionProjectType; confidence: number }> => {
  const matches: Array<{ type: IngestionProjectType; confidence: number }> = [];
  const add = (type: IngestionProjectType, confidence: number) => {
    if (!matches.some((item) => item.type === type)) matches.push({ type, confidence });
  };

  if (/\b(rent|rental|yield|cashflow|tenant|alquiler)\b/.test(blob)) add('rental-investment', 0.84);
  if (/\b(flip|resale|value-add|staging|rehab|renovation|reforma)\b/.test(blob)) add('flip-rehab', 0.88);
  if (/\b(development|construction|permit|contractor|shared area|materials)\b/.test(blob)) add('development-new-build', 0.8);
  if (/\b(portfolio|equity|debt|properties)\b/.test(blob)) add('portfolio-tracking', 0.68);
  if (/\b(mortgage|loan|lender|interest rate|monthly payment)\b/.test(blob)) add('mortgage-analysis', 0.82);
  if (/\b(broker|sourcing|client|teaser|presentation)\b/.test(blob)) add('broker-sourcing', 0.74);

  if (matches.length > 1) add('mixed-strategy', 0.7);
  if (matches.length === 0) add('mixed-strategy', 0.5);

  return matches.sort((left, right) => right.confidence - left.confidence);
};

const fieldLabels: Record<string, string> = {
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
  estimatedClosingCosts: 'Closing costs',
  transferTax: 'Transfer tax',
  notaryRegistry: 'Notary / registry',
  estimatedRenovationCost: 'Renovation cost',
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
  estimatedResalePrice: 'Estimated resale value',
  ltv: 'LTV',
  totalCashContributionNeeded: 'Total cash contribution needed',
  lender: 'Lender',
  loanAmount: 'Loan amount',
  interestRate: 'Interest rate',
  mortgageTermYears: 'Mortgage term',
  mortgagePayment: 'Mortgage payment',
  estimatedMonthlyMortgagePayment: 'Monthly mortgage payment',
  leveragedReturnOnEquity: 'Leveraged return on equity',
  leveragedCashflow: 'Leveraged cashflow',
  lineItemName: 'Line item',
  budgetCategory: 'Budget category',
  estimatedTotal: 'Estimated total',
  actualTotal: 'Actual total',
  supplier: 'Supplier',
  contractor: 'Contractor',
  contingency: 'Contingency',
  permitNumber: 'Permit number',
  financingNotes: 'Financing notes',
  demandNotes: 'Location / demand notes',
  acquisitionSteps: 'Acquisition steps',
  strengths: 'Strengths',
  risks: 'Risks',
};

const fieldTargets: Record<string, Array<'opportunities' | 'properties' | 'projects' | 'budgets' | 'mortgages' | 'documents' | 'reports' | 'workspace-config'>> = {
  title: ['opportunities', 'properties', 'reports'],
  address: ['opportunities', 'properties', 'reports', 'workspace-config'],
  city: ['opportunities', 'properties', 'reports', 'workspace-config'],
  municipality: ['opportunities', 'properties', 'reports'],
  region: ['opportunities', 'properties'],
  province: ['opportunities', 'properties'],
  autonomousCommunity: ['opportunities', 'properties'],
  country: ['opportunities', 'properties'],
  postalCode: ['opportunities', 'properties'],
  propertyType: ['opportunities', 'properties'],
  strategy: ['opportunities', 'projects', 'workspace-config'],
  bedrooms: ['opportunities', 'properties'],
  bathrooms: ['opportunities', 'properties'],
  builtSqm: ['opportunities', 'properties', 'projects'],
  builtArea: ['opportunities', 'properties', 'projects'],
  plotSqm: ['opportunities', 'properties', 'projects'],
  floor: ['opportunities', 'properties'],
  yearBuilt: ['opportunities', 'properties'],
  condition: ['opportunities', 'properties', 'projects'],
  exterior: ['opportunities', 'properties'],
  terrace: ['opportunities', 'properties'],
  elevator: ['opportunities', 'properties'],
  parking: ['opportunities', 'properties'],
  storageRoom: ['opportunities', 'properties'],
  occupancyStatus: ['opportunities', 'properties'],
  askingPrice: ['opportunities', 'reports'],
  purchasePrice: ['opportunities', 'reports'],
  targetOfferPrice: ['opportunities', 'reports'],
  estimatedClosingCosts: ['opportunities', 'projects'],
  transferTax: ['opportunities', 'projects'],
  notaryRegistry: ['opportunities', 'projects'],
  estimatedRenovationCost: ['opportunities', 'projects', 'budgets'],
  furnitureSetupCost: ['opportunities', 'budgets'],
  renovationFurniture: ['opportunities', 'projects', 'budgets'],
  sourcingServiceFee: ['opportunities', 'projects'],
  agencyFee: ['opportunities', 'projects'],
  totalInvestment: ['opportunities', 'reports'],
  monthlyRentEstimate: ['opportunities', 'properties', 'reports'],
  pessimisticMonthlyRent: ['opportunities', 'reports'],
  realisticMonthlyRent: ['opportunities', 'reports'],
  optimisticMonthlyRent: ['opportunities', 'reports'],
  pessimisticAnnualRent: ['opportunities', 'reports'],
  realisticAnnualRent: ['opportunities', 'reports'],
  optimisticAnnualRent: ['opportunities', 'reports'],
  annualIbiTrash: ['opportunities', 'properties'],
  annualInsurance: ['opportunities', 'properties'],
  annualCommunity: ['opportunities', 'properties'],
  annualRentalManagement: ['opportunities', 'properties'],
  monthlyNetCashflow: ['opportunities', 'reports'],
  annualNetCashflow: ['opportunities', 'reports'],
  grossYield: ['opportunities', 'reports'],
  netComparableYield: ['opportunities', 'reports'],
  fullyPassiveNetYield: ['opportunities', 'reports'],
  estimatedResalePrice: ['opportunities', 'projects', 'reports'],
  ltv: ['opportunities', 'mortgages', 'reports'],
  totalCashContributionNeeded: ['opportunities', 'reports'],
  lender: ['mortgages', 'documents'],
  loanAmount: ['mortgages', 'opportunities'],
  interestRate: ['mortgages', 'opportunities'],
  mortgageTermYears: ['mortgages', 'opportunities'],
  mortgagePayment: ['mortgages', 'opportunities', 'reports'],
  estimatedMonthlyMortgagePayment: ['mortgages', 'opportunities'],
  leveragedReturnOnEquity: ['opportunities', 'reports'],
  leveragedCashflow: ['opportunities', 'reports'],
  lineItemName: ['budgets', 'projects'],
  budgetCategory: ['budgets', 'projects', 'workspace-config'],
  estimatedTotal: ['budgets', 'projects'],
  actualTotal: ['budgets', 'projects'],
  supplier: ['documents', 'projects'],
  contractor: ['projects'],
  contingency: ['budgets', 'projects'],
  permitNumber: ['documents', 'projects'],
  financingNotes: ['mortgages', 'opportunities'],
  demandNotes: ['opportunities', 'reports'],
  acquisitionSteps: ['opportunities', 'reports'],
  strengths: ['opportunities', 'reports'],
  risks: ['opportunities', 'reports'],
};

const fieldValueType: Record<string, IngestionFieldValueType> = {
  bedrooms: 'number',
  bathrooms: 'number',
  builtSqm: 'surface',
  builtArea: 'surface',
  plotSqm: 'surface',
  yearBuilt: 'number',
  askingPrice: 'currency',
  purchasePrice: 'currency',
  targetOfferPrice: 'currency',
  estimatedClosingCosts: 'currency',
  transferTax: 'currency',
  notaryRegistry: 'currency',
  estimatedRenovationCost: 'currency',
  furnitureSetupCost: 'currency',
  renovationFurniture: 'currency',
  sourcingServiceFee: 'currency',
  agencyFee: 'currency',
  totalInvestment: 'currency',
  monthlyRentEstimate: 'currency',
  pessimisticMonthlyRent: 'currency',
  realisticMonthlyRent: 'currency',
  optimisticMonthlyRent: 'currency',
  pessimisticAnnualRent: 'currency',
  realisticAnnualRent: 'currency',
  optimisticAnnualRent: 'currency',
  annualIbiTrash: 'currency',
  annualInsurance: 'currency',
  annualCommunity: 'currency',
  annualRentalManagement: 'currency',
  monthlyNetCashflow: 'currency',
  annualNetCashflow: 'currency',
  grossYield: 'percentage',
  netComparableYield: 'percentage',
  fullyPassiveNetYield: 'percentage',
  estimatedResalePrice: 'currency',
  ltv: 'percentage',
  totalCashContributionNeeded: 'currency',
  loanAmount: 'currency',
  interestRate: 'percentage',
  mortgageTermYears: 'number',
  mortgagePayment: 'currency',
  estimatedMonthlyMortgagePayment: 'currency',
  leveragedReturnOnEquity: 'percentage',
  leveragedCashflow: 'currency',
  estimatedTotal: 'currency',
  actualTotal: 'currency',
  contingency: 'currency',
  exterior: 'boolean',
  terrace: 'boolean',
  elevator: 'boolean',
  parking: 'boolean',
  storageRoom: 'boolean',
};

const normalizeFieldValue = (fieldKey: string, rawValue: string): string | number | boolean => {
  if ((fieldValueType[fieldKey] ?? 'text') === 'boolean') {
    return /\b(yes|true|si|sí|con|incluido|available|dispone|tiene|1)\b/i.test(rawValue);
  }
  if ((fieldValueType[fieldKey] ?? 'text') === 'currency') return normalizeCurrency(rawValue);
  if ((fieldValueType[fieldKey] ?? 'text') === 'percentage') return normalizePercentage(rawValue);
  if ((fieldValueType[fieldKey] ?? 'text') === 'surface') return normalizeSurface(rawValue);
  if ((fieldValueType[fieldKey] ?? 'text') === 'number') return Math.max(parseLocalizedNumber(rawValue), 0);

  if (fieldKey === 'strategy') {
    const normalized = rawValue.toLowerCase();
    if (normalized.includes('flip') || normalized.includes('reforma')) return 'flip';
    if (normalized.includes('brrrr')) return 'brrrr';
    if (normalized.includes('short')) return 'short-term-rental';
    if (normalized.includes('rent') || normalized.includes('alquiler')) return 'buy-to-let';
  }

  return normalizeWhitespace(rawValue);
};

const safeMatchGroup = (match: RegExpMatchArray | null, index = 1) => (match?.[index] ? normalizeWhitespace(match[index]) : '');

const findSnippet = (text: string, expressions: RegExp[]) => {
  for (const expression of expressions) {
    const match = text.match(expression);
    if (match) {
      return {
        value: safeMatchGroup(match),
        snippet: normalizeWhitespace(match[0]),
      };
    }
  }
  return null;
};

const inferPropertyTypeFromText = (text: string) => {
  const normalized = text.toLowerCase();
  if (/\bapartment|apartamento|piso\b/.test(normalized)) return 'Apartment';
  if (/\bhouse|casa|villa|chalet\b/.test(normalized)) return 'House';
  if (/\boffice|oficina\b/.test(normalized)) return 'Office';
  if (/\blocal|commercial|retail\b/.test(normalized)) return 'Commercial';
  return '';
};

const inferStrategyHint = (text: string) => {
  const normalized = text.toLowerCase();
  if (/\bflip|resale|value-add|reforma integral\b/.test(normalized)) return 'Flip / rehab';
  if (/\bbrrrr\b/.test(normalized)) return 'BRRRR';
  if (/\bshort[\s-]?term|vacacional|tourist\b/.test(normalized)) return 'Short term rental';
  if (/\brent|rental|alquiler|yield\b/.test(normalized)) return 'Buy to let';
  return '';
};

const createField = (
  fieldKey: string,
  rawValue: string,
  sourceSnippet: string,
  confidence: number,
  extractedDirectly = true,
  sourceLocation?: string
): IngestionExtractedField | null => {
  const normalizedValue = normalizeFieldValue(fieldKey, rawValue);
  const empty =
    normalizedValue === '' ||
    normalizedValue === 0 ||
    (typeof normalizedValue === 'number' && !Number.isFinite(normalizedValue));
  if (empty) return null;

  return {
    id: buildId(`ing-field-${fieldKey}`),
    fieldKey,
    label: fieldLabels[fieldKey] ?? fieldKey,
    rawValue: normalizeWhitespace(rawValue),
    normalizedValue,
    valueType: fieldValueType[fieldKey] ?? 'text',
    confidence,
    sourceSnippet: normalizeWhitespace(sourceSnippet),
    sourceLocation,
    extractedDirectly,
    mappingTargets: fieldTargets[fieldKey] ?? ['documents'],
    approved: confidence >= 0.55,
  };
};

const pushField = (
  fields: IngestionExtractedField[],
  fieldKey: string,
  rawValue: string,
  sourceSnippet: string,
  confidence: number,
  extractedDirectly = true,
  sourceLocation?: string
) => {
  const field = createField(fieldKey, rawValue, sourceSnippet, confidence, extractedDirectly, sourceLocation);
  if (field && !fields.some((item) => item.fieldKey === fieldKey && item.rawValue === field.rawValue)) {
    fields.push(field);
  }
};

const nexiaSectionDefinitions: Array<{ key: string; title: string; patterns: RegExp[] }> = [
  {
    key: 'opportunity-data',
    title: 'Opportunity data',
    patterns: [/\bdatos de la oportunidad\b/i, /\boportunidad\b/i],
  },
  {
    key: 'property-details',
    title: 'Property details',
    patterns: [/\bdetalles del inmueble\b/i, /\bproperty details\b/i],
  },
  {
    key: 'location-demand',
    title: 'Location / demand',
    patterns: [/\bubicaci[oó]n y demanda\b/i, /\blocation\b/i, /\bdemanda\b/i],
  },
  {
    key: 'property-photos',
    title: 'Property photos',
    patterns: [/\bfotos\b/i, /\bgaler[ií]a\b/i, /\bproperty photos\b/i],
  },
  {
    key: 'investment-details',
    title: 'Investment details',
    patterns: [/\bdetalle de la inversi[oó]n\b/i, /\binvestment details\b/i],
  },
  {
    key: 'profitability-details',
    title: 'Profitability details',
    patterns: [/\bdetalle rentabilidad\b/i, /\brentabilidad\b/i, /\bprofitability\b/i],
  },
  {
    key: 'financing-scenario',
    title: 'Financing scenario',
    patterns: [/\bescenario de financiaci[oó]n\b/i, /\bfinancing scenario\b/i],
  },
  {
    key: 'acquisition-steps',
    title: 'Acquisition steps',
    patterns: [/\bpasos de adquisici[oó]n\b/i, /\bacquisition steps\b/i],
  },
];

const detectNexiaPropTemplate = (file: UploadedWorkspaceFile) => {
  const blob = `${file.name}\n${file.extractedText}`.toLowerCase();
  const matchedSections = nexiaSectionDefinitions
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
    /ibi/i.test(blob) && /comunidad/i.test(blob),
    /pesimista|realista|optimista/i.test(blob),
  ].filter(Boolean).length;

  const sectionScore = matchedSections.length / nexiaSectionDefinitions.length;
  const confidence = Math.min(0.97, 0.34 + sectionScore * 0.44 + strongSignals * 0.06);

  return {
    matched: confidence >= 0.62,
    confidence,
    sections: matchedSections as IngestionDetectedSection[],
  };
};

const getSectionSlice = (text: string, titlePatterns: RegExp[], fallbackWindow = 900) => {
  const lines = text.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => titlePatterns.some((pattern) => pattern.test(line)));
  if (startIndex === -1) {
    return '';
  }

  const nextIndex = lines.findIndex(
    (line, index) =>
      index > startIndex &&
      nexiaSectionDefinitions.some((section) => section.patterns.some((pattern) => pattern.test(line)))
  );

  const slice = lines
    .slice(startIndex, nextIndex === -1 ? startIndex + 18 : nextIndex)
    .join('\n')
    .slice(0, fallbackWindow);

  return normalizeWhitespace(slice);
};

const extractNexiaPropFields = (
  file: UploadedWorkspaceFile,
  templateConfidence: number
): {
  fields: IngestionExtractedField[];
  sections: IngestionDetectedSection[];
  summary: string;
} => {
  const text = file.extractedText || file.name;
  const fields: IngestionExtractedField[] = [];
  const sectionMap = {
    opportunity: getSectionSlice(text, [/\bdatos de la oportunidad\b/i, /\boportunidad\b/i]),
    property: getSectionSlice(text, [/\bdetalles del inmueble\b/i, /\bproperty details\b/i]),
    location: getSectionSlice(text, [/\bubicaci[oó]n y demanda\b/i, /\blocation\b/i, /\bdemanda\b/i]),
    investment: getSectionSlice(text, [/\bdetalle de la inversi[oó]n\b/i, /\binvestment details\b/i]),
    profitability: getSectionSlice(text, [/\bdetalle rentabilidad\b/i, /\brentabilidad\b/i, /\bprofitability\b/i]),
    financing: getSectionSlice(text, [/\bescenario de financiaci[oó]n\b/i, /\bfinancing scenario\b/i]),
    acquisition: getSectionSlice(text, [/\bpasos de adquisici[oó]n\b/i, /\bacquisition steps\b/i]),
  };

  const add = (
    fieldKey: string,
    sectionText: string,
    expressions: RegExp[],
    confidence = 0.9,
    extractedDirectly = true
  ) => {
    const match = findSnippet(sectionText || text, expressions);
    if (match) {
      pushField(fields, fieldKey, match.value, match.snippet, Math.min(0.98, confidence), extractedDirectly);
    }
  };

  const addBoolean = (fieldKey: string, sectionText: string, pattern: RegExp, confidence = 0.86) => {
    const match = sectionText.match(pattern) || text.match(pattern);
    if (match) {
      pushField(fields, fieldKey, match[0], normalizeWhitespace(match[0]), confidence);
    }
  };

  add('municipality', sectionMap.opportunity || sectionMap.property, [/\bmunicipio\s*[:\-]?\s*([^\n\r|]{3,60})/i], 0.94);
  add('city', sectionMap.opportunity || sectionMap.property, [/\bmunicipio\s*[:\-]?\s*([^\n\r|]{3,60})/i], 0.92);
  add('address', sectionMap.opportunity || sectionMap.property, [/\bdirecci[oó]n\s*[:\-]?\s*([^\n\r]{8,100})/i], 0.95);
  add('province', sectionMap.opportunity || sectionMap.property, [/\bprovincia\s*[:\-]?\s*([^\n\r|]{3,60})/i], 0.93);
  add('region', sectionMap.opportunity || sectionMap.property, [/\bprovincia\s*[:\-]?\s*([^\n\r|]{3,60})/i], 0.9);
  add('autonomousCommunity', sectionMap.opportunity || sectionMap.property, [/\bcomunidad aut[oó]noma\s*[:\-]?\s*([^\n\r|]{3,80})/i], 0.93);
  add('builtArea', sectionMap.property, [/\b(?:superficie construida|superficie)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*m2\b/i], 0.95);
  add('builtSqm', sectionMap.property, [/\b(?:superficie construida|superficie)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*m2\b/i], 0.93);
  add('floor', sectionMap.property, [/\bplanta\s*[:\-]?\s*([A-Za-z0-9ºª -]{1,12})/i], 0.88);
  add('bedrooms', sectionMap.property, [/\bdormitorios?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i], 0.95);
  add('bathrooms', sectionMap.property, [/\bba[nñ]os?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i], 0.95);
  add('yearBuilt', sectionMap.property, [/\ba[nñ]o de construcci[oó]n\s*[:\-]?\s*(\d{4})/i], 0.92);

  addBoolean('exterior', sectionMap.property, /\bexterior\b/i);
  addBoolean('terrace', sectionMap.property, /\bterraza\b/i);
  addBoolean('elevator', sectionMap.property, /\bascensor\b/i);
  addBoolean('parking', sectionMap.property, /\bparking\b|\bgaraje\b/i);
  addBoolean('storageRoom', sectionMap.property, /\btrastero\b/i);

  add('purchasePrice', sectionMap.investment, [/\b(?:precio de compra|precio adquisición|purchase price)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 0.96);
  add('askingPrice', sectionMap.investment, [/\b(?:precio de compra|precio adquisición|purchase price)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 0.95);
  add('transferTax', sectionMap.investment, [/\b(?:itp|transfer tax)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 0.94);
  add('notaryRegistry', sectionMap.investment, [/\b(?:notar[ií]a\s*\/?\s*registro|notary(?:\/registry)?)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 0.92);
  add('renovationFurniture', sectionMap.investment, [/\b(?:reforma(?: y mobiliario)?|renovation(?: and furniture)?)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 0.93);
  add('estimatedRenovationCost', sectionMap.investment, [/\b(?:reforma(?: y mobiliario)?|renovation(?: and furniture)?)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 0.88);
  add('furnitureSetupCost', sectionMap.investment, [/\bmobiliario\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 0.86);
  add('sourcingServiceFee', sectionMap.investment, [/\b(?:fee de sourcing|sourcing(?:\/service)? fee)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 0.9);
  add('agencyFee', sectionMap.investment, [/\b(?:honorarios agencia|agency fee)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 0.9);
  add('totalInvestment', sectionMap.investment, [/\b(?:inversi[oó]n total|total investment)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 0.96);

  add('annualIbiTrash', sectionMap.profitability || sectionMap.investment, [/\b(?:ibi(?:\s*\/\s*basura)?|ibi\s*y\s*basura)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 0.91);
  add('annualInsurance', sectionMap.profitability || sectionMap.investment, [/\bseguro\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 0.91);
  add('annualCommunity', sectionMap.profitability || sectionMap.investment, [/\bcomunidad\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 0.91);
  add('annualRentalManagement', sectionMap.profitability || sectionMap.investment, [/\b(?:gesti[oó]n del alquiler|rental management)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 0.9);

  add('pessimisticMonthlyRent', sectionMap.profitability, [/\bpesimista[^\n\r]{0,40}?([€$£]?\s?\d[\d.,\s]*)/i], 0.92);
  add('realisticMonthlyRent', sectionMap.profitability, [/\brealista[^\n\r]{0,40}?([€$£]?\s?\d[\d.,\s]*)/i], 0.94);
  add('optimisticMonthlyRent', sectionMap.profitability, [/\boptimista[^\n\r]{0,40}?([€$£]?\s?\d[\d.,\s]*)/i], 0.92);
  add('monthlyRentEstimate', sectionMap.profitability, [/\brealista[^\n\r]{0,40}?([€$£]?\s?\d[\d.,\s]*)/i], 0.9);
  add('pessimisticAnnualRent', sectionMap.profitability, [/\bpesimista[^\n\r]{0,80}?(?:anual|annual)[^\d]{0,10}([€$£]?\s?\d[\d.,\s]*)/i], 0.88);
  add('realisticAnnualRent', sectionMap.profitability, [/\brealista[^\n\r]{0,80}?(?:anual|annual)[^\d]{0,10}([€$£]?\s?\d[\d.,\s]*)/i], 0.9);
  add('optimisticAnnualRent', sectionMap.profitability, [/\boptimista[^\n\r]{0,80}?(?:anual|annual)[^\d]{0,10}([€$£]?\s?\d[\d.,\s]*)/i], 0.88);

  add('monthlyNetCashflow', sectionMap.profitability, [/\b(?:cashflow neto mensual|monthly net cashflow)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s-]*)/i], 0.93);
  add('annualNetCashflow', sectionMap.profitability, [/\b(?:cashflow neto anual|annual net cashflow)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s-]*)/i], 0.93);
  add('grossYield', sectionMap.profitability, [/\b(?:rentabilidad bruta|gross yield)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i], 0.94);
  add('netComparableYield', sectionMap.profitability, [/\b(?:rentabilidad neta comparable|net comparable yield)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i], 0.92);
  add('fullyPassiveNetYield', sectionMap.profitability, [/\b(?:rentabilidad neta totalmente pasiva|fully passive net yield)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i], 0.92);

  add('ltv', sectionMap.financing, [/\b(?:ltv)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i], 0.95);
  add('totalCashContributionNeeded', sectionMap.financing, [/\b(?:aportaci[oó]n total necesaria|total cash contribution needed)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 0.94);
  add('mortgagePayment', sectionMap.financing, [/\b(?:cuota hipotecaria|mortgage payment)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 0.94);
  add('estimatedMonthlyMortgagePayment', sectionMap.financing, [/\b(?:cuota hipotecaria|mortgage payment)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], 0.92);
  add('leveragedReturnOnEquity', sectionMap.financing, [/\b(?:rentabilidad apalancada sobre recursos propios|leveraged return on equity)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i], 0.9);
  add('leveragedCashflow', sectionMap.financing, [/\b(?:cashflow apalancado|leveraged cashflow)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s-]*)/i], 0.9);

  if (sectionMap.location) {
    pushField(fields, 'demandNotes', sectionMap.location, sectionMap.location, Math.min(0.95, 0.72 + templateConfidence * 0.2), false);
  }
  if (sectionMap.acquisition) {
    pushField(fields, 'acquisitionSteps', sectionMap.acquisition, sectionMap.acquisition, Math.min(0.95, 0.74 + templateConfidence * 0.18), false);
  }

  const strengthsText = [sectionMap.location, sectionMap.profitability]
    .filter(Boolean)
    .join(' ')
    .slice(0, 220);
  if (strengthsText) {
    pushField(fields, 'strengths', strengthsText, strengthsText, 0.68, false);
  }

  const inferredSections = nexiaSectionDefinitions
    .map((section) => ({
      key: section.key,
      title: section.title,
      confidence: section.patterns.some((pattern) => pattern.test(text)) ? 0.84 : 0,
    }))
    .filter((section) => section.confidence > 0) as IngestionDetectedSection[];

  return {
    fields,
    sections: inferredSections,
    summary:
      'Real Estate Opportunity Dossier Template matched. The file was parsed using section-based broker dossier extraction with table-first field mapping.',
  };
};

const extractFieldsFromText = (
  file: UploadedWorkspaceFile,
  parserProfile?: { templateName?: string; confidence?: number }
) => {
  const text = file.extractedText || file.name;
  const fields: IngestionExtractedField[] = [];
  const fileStem = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  const titleFromText =
    text
      .split(/\r?\n/)
      .map((line) => normalizeWhitespace(line))
      .find((line) => line.length > 10 && line.length < 80 && !/price|precio|rent|yield|invoice|budget|loan/i.test(line)) || fileStem;

  pushField(fields, 'title', titleFromText, titleFromText, titleFromText === fileStem ? 0.55 : 0.68, titleFromText !== fileStem);

  const postalMatch = text.match(/\b(\d{5})\b/);
  if (postalMatch) pushField(fields, 'postalCode', postalMatch[1], postalMatch[0], 0.68);

  const cityMatch = findSnippet(text, [
    /\b(?:city|ciudad|localidad)\s*[:\-]\s*([A-Za-zÀ-ÿ' -]{3,})/i,
    /\b(Madrid|Barcelona|Valencia|Malaga|Málaga|Sevilla|Bilbao|Alicante|Marbella|Palma)\b/i,
  ]);
  if (cityMatch) pushField(fields, 'city', cityMatch.value, cityMatch.snippet, cityMatch.value.length > 4 ? 0.82 : 0.65);

  const regionMatch = findSnippet(text, [
    /\b(?:province|provincia|region|región)\s*[:\-]\s*([A-Za-zÀ-ÿ' -]{3,})/i,
    /\b(Andalucia|Andalucía|Catalonia|Catalunya|Valencia|Balearic Islands|Islas Baleares|Madrid)\b/i,
  ]);
  if (regionMatch) pushField(fields, 'region', regionMatch.value, regionMatch.snippet, 0.7);

  const countryMatch = findSnippet(text, [
    /\b(?:country|pais|país)\s*[:\-]\s*([A-Za-zÀ-ÿ' -]{3,})/i,
    /\b(Spain|España|Portugal|France|Italy|United Kingdom)\b/i,
  ]);
  if (countryMatch) pushField(fields, 'country', countryMatch.value, countryMatch.snippet, 0.72);

  const addressMatch = findSnippet(text, [
    /\b(?:address|direccion|dirección)\s*[:\-]\s*([^\n\r]{8,90})/i,
    /\b(?:calle|c\/|avenida|avda\.?|paseo|plaza|camino)\s+[^\n\r,]{4,80}/i,
  ]);
  if (addressMatch) pushField(fields, 'address', addressMatch.value, addressMatch.snippet, 0.72);

  const propertyType = inferPropertyTypeFromText(text);
  if (propertyType) pushField(fields, 'propertyType', propertyType, propertyType, 0.64, false);

  const strategyHint = inferStrategyHint(text);
  if (strategyHint) pushField(fields, 'strategy', strategyHint, strategyHint, 0.62, false);

  const simplePatterns: Array<{ fieldKey: string; expressions: RegExp[]; confidence: number }> = [
    { fieldKey: 'bedrooms', expressions: [/\b(\d+(?:[.,]\d+)?)\s*(?:bed(?:room)?s?|hab(?:itaciones?)?)\b/i], confidence: 0.88 },
    { fieldKey: 'bathrooms', expressions: [/\b(\d+(?:[.,]\d+)?)\s*(?:bath(?:room)?s?|baños|banos)\b/i], confidence: 0.88 },
    { fieldKey: 'builtSqm', expressions: [/\b(?:built|constructed|interior|construidos?)\s*(?:area)?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*m2\b/i, /\b(\d+(?:[.,]\d+)?)\s*m2\s*(?:built|interior|construidos?)\b/i], confidence: 0.85 },
    { fieldKey: 'plotSqm', expressions: [/\b(?:plot|parcel|parcela|solar)\s*(?:size)?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*m2\b/i], confidence: 0.82 },
    { fieldKey: 'floor', expressions: [/\b(?:floor|planta)\s*[:\-]?\s*([A-Za-z0-9ºª -]{1,12})/i], confidence: 0.63 },
    { fieldKey: 'yearBuilt', expressions: [/\b(?:year built|built in|ano de construccion|año de construcción)\s*[:\-]?\s*(\d{4})\b/i], confidence: 0.84 },
    { fieldKey: 'condition', expressions: [/\b(?:condition|estado)\s*[:\-]?\s*([A-Za-zÀ-ÿ' -]{4,40})/i], confidence: 0.61 },
    { fieldKey: 'occupancyStatus', expressions: [/\b(vacant|occupied|tenant in place|alquilado|libre)\b/i], confidence: 0.66 },
    { fieldKey: 'askingPrice', expressions: [/\b(?:asking price|sale price|purchase price|precio(?: de venta)?|pvp)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], confidence: 0.92 },
    { fieldKey: 'targetOfferPrice', expressions: [/\b(?:target offer|offer price|precio objetivo)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], confidence: 0.84 },
    { fieldKey: 'estimatedClosingCosts', expressions: [/\b(?:closing costs|gastos de cierre|purchase costs|itp|ajd)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], confidence: 0.72 },
    { fieldKey: 'estimatedRenovationCost', expressions: [/\b(?:renovation|rehab|refurbishment|reforma)\s*(?:cost|budget|presupuesto)?\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], confidence: 0.79 },
    { fieldKey: 'furnitureSetupCost', expressions: [/\b(?:furniture|staging|setup)\s*(?:cost)?\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], confidence: 0.74 },
    { fieldKey: 'monthlyRentEstimate', expressions: [/\b(?:monthly rent|rent estimate|alquiler(?: mensual)?|renta(?: mensual)?)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i, /\b([€$£]?\s?\d[\d.,\s]*)\s*(?:\/month|per month|mes)\b/i], confidence: 0.86 },
    { fieldKey: 'estimatedResalePrice', expressions: [/\b(?:resale value|sale assumption|sale value|exit price|valor de venta)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], confidence: 0.78 },
    { fieldKey: 'loanAmount', expressions: [/\b(?:loan amount|principal|importe prestamo|importe préstamo)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], confidence: 0.9 },
    { fieldKey: 'interestRate', expressions: [/\b(?:interest rate|fixed rate|variable rate|tin|tae)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i], confidence: 0.9 },
    { fieldKey: 'mortgageTermYears', expressions: [/\b(?:term|loan term|plazo)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*(?:years|años|yrs)\b/i], confidence: 0.85 },
    { fieldKey: 'estimatedMonthlyMortgagePayment', expressions: [/\b(?:monthly payment|cuota mensual|monthly instalment)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], confidence: 0.88 },
    { fieldKey: 'estimatedTotal', expressions: [/\b(?:total budget|estimated total|presupuesto total|total)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], confidence: 0.74 },
    { fieldKey: 'actualTotal', expressions: [/\b(?:actual total|paid total|total paid)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], confidence: 0.72 },
    { fieldKey: 'contingency', expressions: [/\b(?:contingency|imprevistos)\s*[:\-]?\s*([€$£]?\s?\d[\d.,\s]*)/i], confidence: 0.8 },
    { fieldKey: 'permitNumber', expressions: [/\b(?:permit number|licence number|license number|expediente)\s*[:\-]?\s*([A-Za-z0-9\/-]{4,})/i], confidence: 0.75 },
  ];

  simplePatterns.forEach((pattern) => {
    const match = findSnippet(text, pattern.expressions);
    if (match) pushField(fields, pattern.fieldKey, match.value, match.snippet, pattern.confidence);
  });

  const lenderMatch = findSnippet(text, [/\b(?:lender|bank|entity|banco)\s*[:\-]?\s*([A-Za-zÀ-ÿ0-9 .&-]{3,})/i]);
  if (lenderMatch) pushField(fields, 'lender', lenderMatch.value, lenderMatch.snippet, 0.78);

  const financingMatch = findSnippet(text, [
    /\b(?:financing|mortgage|hipoteca|loan)\b[^\n\r]{0,120}/i,
    /\b(?:lender|broker|bank)\b[^\n\r]{0,120}/i,
  ]);
  if (financingMatch) pushField(fields, 'financingNotes', financingMatch.snippet, financingMatch.snippet, 0.58);

  const strengthsMatch = findSnippet(text, [
    /\b(?:highlights|investment highlights|ventajas|strengths)\b[^\n\r]{0,180}/i,
    /\b(?:yield|rentability|rentabilidad)\b[^\n\r]{0,180}/i,
  ]);
  if (strengthsMatch) pushField(fields, 'strengths', strengthsMatch.snippet, strengthsMatch.snippet, 0.56);

  const risksMatch = findSnippet(text, [
    /\b(?:risks|warnings|red flags|riesgos|advertencias)\b[^\n\r]{0,180}/i,
    /\b(?:needs renovation|legal review|sin ascensor|vacant possession)\b[^\n\r]{0,180}/i,
  ]);
  if (risksMatch) pushField(fields, 'risks', risksMatch.snippet, risksMatch.snippet, 0.56);

  const budgetRowMatches = Array.from(
    text.matchAll(/\b(demolition|labor|materials|plumbing|electrical|finishes|windows|roofing|hvac|flooring|painting|permits|furniture|staging)\b[^\n\r]{0,40}?([€$£]?\s?\d[\d.,\s]*)/gi)
  );
  budgetRowMatches.slice(0, 8).forEach((match) => {
    pushField(fields, 'lineItemName', match[1], match[0], 0.65);
    pushField(fields, 'budgetCategory', match[1], match[0], 0.65);
    pushField(fields, 'estimatedTotal', match[2], match[0], 0.68);
  });

  const supplierMatch = findSnippet(text, [/\b(?:supplier|provider|proveedor)\s*[:\-]?\s*([A-Za-zÀ-ÿ0-9 .&-]{3,})/i]);
  if (supplierMatch) pushField(fields, 'supplier', supplierMatch.value, supplierMatch.snippet, 0.72);
  const contractorMatch = findSnippet(text, [/\b(?:contractor|builder|contratista)\s*[:\-]?\s*([A-Za-zÀ-ÿ0-9 .&-]{3,})/i]);
  if (contractorMatch) pushField(fields, 'contractor', contractorMatch.value, contractorMatch.snippet, 0.74);

  if (parserProfile?.templateName === 'Real Estate Opportunity Dossier Template') {
    const dossierExtraction = extractNexiaPropFields(file, parserProfile.confidence ?? 0.82);
    dossierExtraction.fields.forEach((field) => {
      const existingIndex = fields.findIndex((item) => item.fieldKey === field.fieldKey);
      if (existingIndex === -1) {
        fields.push(field);
        return;
      }
      if ((fields[existingIndex]?.confidence ?? 0) < field.confidence) {
        fields.splice(existingIndex, 1, field);
      }
    });
  }

  return fields;
};

const buildSuggestedCategories = (projectTypes: IngestionProjectType[], text: string): IngestionSuggestedCategory[] => {
  const categories: IngestionSuggestedCategory[] = [];
  const add = (name: string, reason: string, confidence: number, relatedItems: string[], module: WorkspaceModule = 'budgets') => {
    if (categories.some((item) => item.name === name)) return;
    categories.push({ id: buildId('ing-cat'), name, reason, confidence, relatedItems, module, approved: confidence >= 0.6 });
  };

  if (projectTypes.includes('flip-rehab') || projectTypes.includes('development-new-build')) {
    ([
      ['Labor', 'Budget language suggests execution spend tracking.', ['labor', 'contractor']],
      ['Materials', 'Materials and supplier references appear in the file.', ['materials', 'supplier']],
      ['Permits', 'Permit or technical fee references were found.', ['permit', 'licence']],
      ['Electrical', 'Electrical work appears in the detected line items.', ['electrical']],
      ['Plumbing', 'Plumbing work appears in the detected line items.', ['plumbing']],
      ['Finishes', 'Finish-related line items appear in the document.', ['finishes', 'painting', 'flooring']],
      ['Furniture', 'Setup, furniture, or staging references appear.', ['furniture', 'staging']],
      ['Contingency', 'A contingency buffer is relevant for this project type.', ['contingency']],
    ] as Array<[string, string, string[]]>).forEach(([name, reason, relatedItems]) => add(name, reason, 0.72, relatedItems));
  }

  if (/shared|common area|unit 1|unit 2/i.test(text)) {
    add('Shared / common area', 'Allocation hints suggest shared-cost tracking.', 0.76, ['shared', 'common area']);
  }

  return categories;
};

const buildSuggestedCustomFields = (
  projectTypes: IngestionProjectType[],
  documentTypes: IngestionDocumentType[],
  text: string
): IngestionSuggestedCustomField[] => {
  const fields: IngestionSuggestedCustomField[] = [];
  const add = (
    label: string,
    fieldType: WorkspaceCustomFieldType,
    module: WorkspaceModule,
    reason: string,
    confidence: number,
    required = false
  ) => {
    if (fields.some((item) => item.label === label)) return;
    fields.push({ id: buildId('ing-custom-field'), label, fieldType, module, reason, confidence, required, approved: confidence >= 0.6 });
  };

  if (projectTypes.includes('rental-investment')) {
    add('Vacancy assumption', 'percentage', 'properties', 'Rental analysis benefits from a visible vacancy assumption.', 0.72);
    add('Target refinance value', 'currency', 'properties', 'Refinance upside is relevant for hold or BRRRR workflows.', 0.65);
  }
  if (projectTypes.includes('flip-rehab')) {
    add('Expected resale value', 'currency', 'projects', 'Exit value appears relevant for flip economics.', 0.83);
    add('Contractor name', 'text', 'tasks', 'Supplier and contractor coordination appears in the uploaded file set.', 0.74);
    add('Staging cost', 'currency', 'budgets', 'Staging and setup costs affect sale prep.', 0.69);
  }
  if (projectTypes.includes('development-new-build')) {
    add('Permit number', 'text', 'documents', 'Permit tracking appears relevant for this workflow.', 0.8, true);
    add('Common area allocation', 'percentage', 'budgets', 'The file suggests shared cost allocation logic.', 0.77);
    add('Cost per apartment', 'currency', 'budgets', 'A per-unit cost lens is useful for development reviews.', 0.7);
  }
  if (documentTypes.includes('mortgage-offer') || /bonification|payroll|insurance requirement/i.test(text)) {
    add('Bonification type', 'text', 'mortgages', 'The financing document references pricing conditions.', 0.78);
    add('Payroll requirement', 'boolean', 'mortgages', 'The lender may require payroll or direct deposit linkage.', 0.72);
    add('Insurance requirement', 'text', 'mortgages', 'Insurance-linked pricing conditions matter for true mortgage cost.', 0.71);
  }

  return fields;
};

const buildMissingFlags = (projectTypes: IngestionProjectType[], fields: IngestionExtractedField[]): IngestionMissingDataFlag[] => {
  const fieldKeys = new Set(fields.map((field) => field.fieldKey));
  const missing: IngestionMissingDataFlag[] = [];
  const add = (key: string, explanation: string, affectedModule: WorkspaceModule, severity: 'low' | 'medium' | 'high' = 'medium') => {
    if (!missing.some((item) => item.key === key)) {
      missing.push({ key, severity, explanation, affectedModule });
    }
  };

  if (!fieldKeys.has('address')) add('address-missing', 'No address found in the uploaded file.', 'opportunities', 'high');
  if (projectTypes.includes('rental-investment') && !fieldKeys.has('monthlyRentEstimate')) add('rent-missing', 'No rent estimate found.', 'opportunities', 'high');
  if (projectTypes.includes('mortgage-analysis') && !fieldKeys.has('loanAmount')) add('mortgage-terms-missing', 'Mortgage terms are incomplete or missing.', 'mortgages', 'high');
  if ((projectTypes.includes('flip-rehab') || projectTypes.includes('development-new-build')) && !fieldKeys.has('estimatedRenovationCost')) add('renovation-budget-missing', 'No renovation budget found.', 'budgets', 'high');
  if ((projectTypes.includes('flip-rehab') || projectTypes.includes('development-new-build')) && !fieldKeys.has('contingency')) add('contingency-missing', 'No contingency line found.', 'budgets', 'medium');
  if (projectTypes.includes('flip-rehab') && !fieldKeys.has('estimatedResalePrice')) add('sale-assumption-missing', 'No resale assumption found.', 'projects', 'high');

  return missing;
};

const buildWarnings = (file: UploadedWorkspaceFile, fields: IngestionExtractedField[], documentTypes: IngestionDocumentType[]) => {
  const warnings: IngestionWarning[] = [];
  if (file.needsOcr) {
    warnings.push({
      id: buildId('warning'),
      level: 'warning',
      message: 'This file likely needs OCR for higher-confidence extraction. Review values carefully before saving.',
    });
  }
  if (documentTypes.includes('unknown')) {
    warnings.push({
      id: buildId('warning'),
      level: 'warning',
      message: 'Document type confidence is low. The app kept extraction conservative.',
    });
  }
  const currencies = fields
    .filter((field) => field.valueType === 'currency')
    .map((field) => (field.rawValue.includes('$') ? 'USD' : field.rawValue.includes('£') ? 'GBP' : 'EUR'));
  if (new Set(currencies).size > 1) {
    warnings.push({
      id: buildId('warning'),
      level: 'warning',
      message: 'Potential inconsistent currency usage detected across extracted values.',
    });
  }
  return warnings;
};

const buildSummary = (
  filename: string,
  documentTypes: IngestionDocumentType[],
  projectTypes: IngestionProjectType[],
  fields: IngestionExtractedField[],
  missingFlags: IngestionMissingDataFlag[]
): DocumentAnalysisResult['aiSummary'] => {
  const topType = documentTypes[0] ?? 'unknown';
  const topProject = projectTypes[0] ?? 'mixed-strategy';
  const strengths = [
    fields.find((field) => field.fieldKey === 'askingPrice') ? 'Headline deal pricing was found.' : '',
    fields.find((field) => field.fieldKey === 'monthlyRentEstimate') ? 'Income guidance was found.' : '',
    fields.find((field) => field.fieldKey === 'estimatedRenovationCost') ? 'Rehab cost assumptions were detected.' : '',
    fields.find((field) => field.fieldKey === 'loanAmount') ? 'Financing terms were detected.' : '',
  ].filter(Boolean);
  const risks = missingFlags.slice(0, 3).map((item) => item.explanation);
  return {
    summary: `${filename} appears to be a ${topType.replace(/-/g, ' ')} for a ${topProject.replace(/-/g, ' ')} workflow. ${fields.length} structured values were extracted for review.`,
    nextAction: missingFlags.length >= 4 ? 'review-manually' : fields.length >= 8 ? 'pursue' : 'negotiate',
    strengths,
    risks,
    missingInformation: missingFlags.map((item) => item.explanation),
  };
};

const buildSourceSnippets = (fields: IngestionExtractedField[]) =>
  fields.slice(0, 12).map((field) => ({
    id: buildId('snippet'),
    text: field.sourceSnippet,
    reference: field.sourceLocation,
    linkedFieldKeys: [field.fieldKey],
  }));

const deriveSuggestedModules = (projectTypes: IngestionProjectType[], documentTypes: IngestionDocumentType[]): WorkspaceModule[] => {
  const modules: WorkspaceModule[] = ['dashboard', 'documents', 'reports'];
  const add = (module: WorkspaceModule) => {
    if (!modules.includes(module)) modules.push(module);
  };

  if (projectTypes.includes('rental-investment')) ['opportunities', 'properties', 'mortgages'].forEach((module) => add(module as WorkspaceModule));
  if (projectTypes.includes('flip-rehab')) ['opportunities', 'projects', 'budgets', 'tasks'].forEach((module) => add(module as WorkspaceModule));
  if (projectTypes.includes('development-new-build')) ['projects', 'budgets', 'tasks'].forEach((module) => add(module as WorkspaceModule));
  if (projectTypes.includes('mortgage-analysis') || documentTypes.includes('mortgage-offer')) add('mortgages');
  if (projectTypes.includes('broker-sourcing')) add('opportunities');

  return modules;
};

const deriveSuggestedKpis = (projectTypes: IngestionProjectType[]): string[] => {
  if (projectTypes.includes('flip-rehab')) return ['Projected net profit', 'Budget variance', 'Remaining budget', 'Break-even sale price'];
  if (projectTypes.includes('development-new-build')) return ['Total project cost', 'Cost per unit', 'Cost per m2', 'Completion %'];
  if (projectTypes.includes('mortgage-analysis')) return ['Mortgage payment', 'Total debt', 'Total equity', 'Net monthly cashflow'];
  if (projectTypes.includes('broker-sourcing')) return ['Readiness score', 'Gross yield', 'Projected net profit'];
  return ['Monthly cashflow', 'Gross yield', 'Total debt', 'Total equity'];
};

const deriveReportTemplates = (projectTypes: IngestionProjectType[]): string[] => {
  if (projectTypes.includes('flip-rehab')) return ['Flip Analysis Report', 'Clean Investor Memo'];
  if (projectTypes.includes('development-new-build')) return ['Developer Budget Summary', 'Clean Investor Memo'];
  if (projectTypes.includes('broker-sourcing')) return ['Broker Presentation', 'General Opportunity Memo'];
  return ['Rental Investment Memo', 'Clean Investor Memo'];
};

const deriveDashboardFocus = (projectTypes: IngestionProjectType[]): string[] => {
  if (projectTypes.includes('flip-rehab')) return ['profit-trend', 'budget-variance', 'remaining-cash'];
  if (projectTypes.includes('development-new-build')) return ['total-project-cost', 'cost-per-unit', 'completion-status'];
  if (projectTypes.includes('mortgage-analysis')) return ['mortgage-payment', 'debt-overview', 'cashflow-summary'];
  if (projectTypes.includes('broker-sourcing')) return ['readiness-score', 'memo-quick-links', 'key-deal-metrics'];
  return ['cashflow-summary', 'yield-focus', 'equity-debt'];
};

const deriveReadinessScore = (fields: IngestionExtractedField[], missingFlags: IngestionMissingDataFlag[], warnings: IngestionWarning[]) =>
  Math.max(28, Math.min(96, Math.round(42 + fields.length * 3.5 - missingFlags.length * 7 - warnings.length * 3)));

const analysisFromFile = (file: UploadedWorkspaceFile): DocumentAnalysisResult => {
  const blob = `${file.name} ${file.extractedText}`.toLowerCase();
  const nexiaTemplate = detectNexiaPropTemplate(file);
  const documentMatches = classifyDocumentTypes(file);
  const projectMatches = detectProjectTypes(blob);
  const parserProfile = nexiaTemplate.matched
    ? {
        templateName: 'Real Estate Opportunity Dossier Template',
        confidence: nexiaTemplate.confidence,
      }
    : undefined;
  const fields = extractFieldsFromText(file, parserProfile);
  const documentTypes = Array.from(
    new Set([
      ...(nexiaTemplate.matched ? (['investment-opportunity', 'property-brochure'] as IngestionDocumentType[]) : []),
      ...documentMatches.map((item) => item.type),
    ])
  );
  const projectTypes = projectMatches.map((item) => item.type);
  const suggestedCategories = buildSuggestedCategories(projectTypes, blob);
  const suggestedCustomFields = buildSuggestedCustomFields(projectTypes, documentTypes, blob);
  const missingDataFlags = buildMissingFlags(projectTypes, fields);
  if (nexiaTemplate.matched) {
    const fieldKeys = new Set(fields.map((field) => field.fieldKey));
    if (!fieldKeys.has('realisticMonthlyRent')) {
      missingDataFlags.push({
        key: 'realistic-rent-missing',
        severity: 'high',
        explanation: 'The dossier did not produce a realistic monthly rent scenario.',
        affectedModule: 'opportunities',
      });
    }
    if (!fieldKeys.has('totalInvestment')) {
      missingDataFlags.push({
        key: 'total-investment-missing',
        severity: 'high',
        explanation: 'Total investment was not clearly extracted from the broker dossier.',
        affectedModule: 'opportunities',
      });
    }
    if (!fieldKeys.has('ltv')) {
      missingDataFlags.push({
        key: 'ltv-missing',
        severity: 'medium',
        explanation: 'No LTV was found in the financing scenario section.',
        affectedModule: 'mortgages',
      });
    }
  }
  const warnings = buildWarnings(file, fields, documentTypes);
  if (nexiaTemplate.matched) {
    warnings.unshift({
      id: buildId('warning'),
      level: 'info',
      message:
        'Real Estate Opportunity Dossier Template matched. Section-based extraction and broker table mapping were prioritized.',
    });
  }
  const suggestedModules = deriveSuggestedModules(projectTypes, documentTypes);
  const suggestedKpis = deriveSuggestedKpis(projectTypes);
  const suggestedReportTemplates = deriveReportTemplates(projectTypes);
  const suggestedSidebarPriority = [...suggestedModules];
  const suggestedDashboardFocus = deriveDashboardFocus(projectTypes);
  const extractedEntities = fields.map((field) => ({
    label: field.label,
    value: String(field.normalizedValue),
    confidence: field.confidence,
  }));
  const aiSummary = buildSummary(file.name, documentTypes, projectTypes, fields, missingDataFlags);
  const enrichedSummary = nexiaTemplate.matched
    ? {
        ...aiSummary,
        summary:
          'This file matches the Real Estate Opportunity Dossier Template. Broker sections, profitability tables, financing scenarios, and acquisition steps were mapped into structured opportunity fields for review.',
      }
    : aiSummary;
  const readinessScore = deriveReadinessScore(fields, missingDataFlags, warnings);

  return {
    id: buildId('doc-analysis'),
    fileId: file.id,
    filename: file.name,
    analyzedAt: new Date().toISOString(),
    documentType: documentTypes,
    documentTypeConfidence: Math.round(
      Math.max(documentMatches[0]?.confidence ?? 0.45, nexiaTemplate.matched ? nexiaTemplate.confidence : 0) *
        100
    ),
    inferredProjectType: projectTypes,
    inferredProjectTypeConfidence: Math.round((projectMatches[0]?.confidence ?? 0.5) * 100),
    extractedTextSummary: normalizeWhitespace((file.extractedText || file.name).slice(0, 420)) || file.name,
    extractedEntities,
    normalizedFields: fields,
    suggestedCategories,
    suggestedCustomFields,
    suggestedKpis,
    suggestedModules,
    suggestedSidebarPriority,
    suggestedReportTemplates,
    suggestedDashboardFocus,
    missingDataFlags,
    warnings,
    sourceSnippets: buildSourceSnippets(fields),
    extractionTemplateName: nexiaTemplate.matched ? 'Real Estate Opportunity Dossier Template' : undefined,
    extractionTemplateConfidence: nexiaTemplate.matched
      ? Math.round(nexiaTemplate.confidence * 100)
      : undefined,
    detectedSections: nexiaTemplate.sections,
    aiSummary: enrichedSummary,
    mappingTargets: Array.from(new Set(fields.flatMap((field) => field.mappingTargets))).filter(Boolean),
    readinessScore,
  };
};

const boostMultiFileConfidence = (results: DocumentAnalysisResult[]) => {
  const grouped = new Map<string, Array<{ resultIndex: number; fieldIndex: number }>>();

  results.forEach((result, resultIndex) => {
    result.normalizedFields.forEach((field, fieldIndex) => {
      const key = `${field.fieldKey}:${String(field.normalizedValue)}`;
      const current = grouped.get(key) ?? [];
      current.push({ resultIndex, fieldIndex });
      grouped.set(key, current);
    });
  });

  grouped.forEach((entries) => {
    if (entries.length < 2) return;
    entries.forEach(({ resultIndex, fieldIndex }) => {
      const field = results[resultIndex]?.normalizedFields[fieldIndex];
      if (!field) return;
      field.confidence = Math.min(0.98, field.confidence + 0.08);
    });
  });
};

const detectConflicts = (results: DocumentAnalysisResult[]): IngestionConflict[] =>
  Array.from(
    results.reduce((map, result) => {
      result.normalizedFields.forEach((field) => {
        const current = map.get(field.fieldKey) ?? [];
        current.push({ fileId: result.fileId, value: field.normalizedValue, confidence: field.confidence });
        map.set(field.fieldKey, current);
      });
      return map;
    }, new Map<string, Array<{ fileId: string; value: string | number | boolean; confidence: number }>>()).entries()
  )
    .filter(([, values]) => new Set(values.map((item) => String(item.value))).size > 1)
    .map(([fieldKey, values]) => ({
      id: buildId('ing-conflict'),
      fieldKey,
      values,
      resolution: 'pending',
    }));

export const analyzeUploadedWorkspaceFiles = (files: UploadedWorkspaceFile[]) => {
  const results = files.map((file) => analysisFromFile(file));
  boostMultiFileConfidence(results);
  return {
    results,
    conflicts: detectConflicts(results),
  };
};

export const attachDocumentAnalysisToFile = (file: UploadedWorkspaceFile, analysis: DocumentAnalysisResult): UploadedWorkspaceFile => ({
  ...file,
  extractedEntities: analysis.extractedEntities,
  analysis,
  reviewStatus: 'reviewed',
});

export const updateAnalysisField = (
  analysis: DocumentAnalysisResult,
  fieldId: string,
  updates: Partial<IngestionExtractedField>
): DocumentAnalysisResult => ({
  ...analysis,
  normalizedFields: analysis.normalizedFields.map((field) =>
    field.id === fieldId
      ? { ...field, ...updates, userEdited: updates.rawValue !== undefined || updates.normalizedValue !== undefined ? true : field.userEdited }
      : field
  ),
});

export const approveDocumentAnalysis = (file: UploadedWorkspaceFile, analysis: DocumentAnalysisResult): UploadedWorkspaceFile => ({
  ...attachDocumentAnalysisToFile(file, analysis),
  reviewStatus: 'approved',
});

export const mockIngestionScenarios: Record<
  'opportunity-pdf' | 'budget-spreadsheet' | 'mortgage-offer' | 'mixed-upload',
  UploadedWorkspaceFile[]
> = {
  'opportunity-pdf': [
    {
      id: 'mock-opp-pdf',
      name: 'malaga-opportunity.pdf',
      mimeType: 'application/pdf',
      type: 'pdf',
      sizeBytes: 182003,
      uploadedAt: new Date().toISOString(),
      pageCount: 5,
      encoding: 'utf-8',
      needsOcr: false,
      contentShape: 'narrative',
      extractedText:
        'Investment opportunity in Malaga. Address: Paseo Conde de Ferreria 6. Asking price: 105.000 €. Monthly rent estimate: 950 €/month. Apartment with 2 bedrooms, 1 bathroom, 72 m2. Broker highlights strong rental demand.',
      extractedEntities: [],
      analysis: null,
      reviewStatus: 'pending',
    },
  ],
  'budget-spreadsheet': [
    {
      id: 'mock-budget-xlsx',
      name: 'rehab-budget.xlsx',
      mimeType: 'application/vnd.ms-excel',
      type: 'spreadsheet',
      sizeBytes: 94002,
      uploadedAt: new Date().toISOString(),
      pageCount: 1,
      encoding: 'utf-8',
      needsOcr: false,
      contentShape: 'tabular',
      extractedText:
        'Budget spreadsheet. Demolition 3.500 €. Labor 14.000 €. Electrical 4.400 €. Plumbing 3.900 €. Finishes 8.200 €. Contingency 5.000 €. Estimated total 39.000 €.',
      extractedEntities: [],
      analysis: null,
      reviewStatus: 'pending',
    },
  ],
  'mortgage-offer': [
    {
      id: 'mock-mortgage-pdf',
      name: 'mortgage-offer.pdf',
      mimeType: 'application/pdf',
      type: 'pdf',
      sizeBytes: 114002,
      uploadedAt: new Date().toISOString(),
      pageCount: 3,
      encoding: 'utf-8',
      needsOcr: false,
      contentShape: 'narrative',
      extractedText:
        'Mortgage offer from Banco Demo. Loan amount: 82.000 €. Fixed rate: 3,45%. Term 25 years. Monthly payment: 411 €. Bonification requires payroll and home insurance.',
      extractedEntities: [],
      analysis: null,
      reviewStatus: 'pending',
    },
  ],
  'mixed-upload': [
    {
      id: 'mock-mixed-1',
      name: 'deal-brochure.pdf',
      mimeType: 'application/pdf',
      type: 'pdf',
      sizeBytes: 120000,
      uploadedAt: new Date().toISOString(),
      pageCount: 4,
      encoding: 'utf-8',
      needsOcr: false,
      contentShape: 'narrative',
      extractedText:
        'Investment brochure. Address: Marbella center. Asking price 240.000 €. Monthly rent estimate 1.450 €/month. Yield and strong location highlighted.',
      extractedEntities: [],
      analysis: null,
      reviewStatus: 'pending',
    },
    {
      id: 'mock-mixed-2',
      name: 'contractor-quote.pdf',
      mimeType: 'application/pdf',
      type: 'pdf',
      sizeBytes: 102000,
      uploadedAt: new Date().toISOString(),
      pageCount: 2,
      encoding: 'utf-8',
      needsOcr: false,
      contentShape: 'mixed',
      extractedText:
        'Contractor quote. Labor 12.000 €. Materials 7.500 €. Finishes 6.400 €. Plumbing 2.700 €. Electrical 2.950 €. Contingency 4.000 €. Contractor: BuildCo.',
      extractedEntities: [],
      analysis: null,
      reviewStatus: 'pending',
    },
  ],
};

