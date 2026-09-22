import type { Mortgage, OccupancyStatus, Property, PropertyMetrics } from '../../../common/types';

export interface PropertyDirectoryItem {
  property: Property;
  metrics: PropertyMetrics;
  shortLocation: string;
  searchText: string;
  occupancyStatus: OccupancyStatus;
  propertyType: string | null;
  ltv: number | null;
  heroImageUrl: string | null;
}

export type PropertyDirectorySort = 'name' | 'value' | 'cashflow' | 'rent';

export const buildPropertyDirectoryItems = (
  properties: Property[],
  metrics: PropertyMetrics[],
  mortgages: Mortgage[] = []
): PropertyDirectoryItem[] => {
  const metricsById = new Map(metrics.map((metric) => [metric.id, metric]));
  const mortgagesByPropertyId = new Map(mortgages.map((mortgage) => [mortgage.propertyId, mortgage]));

  return properties.flatMap((property) => {
    const propertyMetrics = metricsById.get(property.id);
    if (!propertyMetrics) return [];
    const value = propertyMetrics.currentEstimatedValue;
    const mortgageBalance = propertyMetrics.mortgageBalance;
    return [{
      property,
      metrics: propertyMetrics,
      shortLocation: [property.city, property.country].filter(Boolean).join(', '),
      searchText: [property.name, property.address, property.city, property.country, property.propertyType]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase(),
      occupancyStatus: property.occupancyStatus,
      propertyType: property.propertyType || null,
      ltv: value > 0 && mortgagesByPropertyId.has(property.id)
        ? (mortgageBalance / value) * 100
        : null,
      heroImageUrl: property.imageUrl || property.imageUrls?.[property.primaryImageIndex ?? 0] || null,
    }];
  });
};

export const filterAndSortPropertyDirectoryItems = (
  items: PropertyDirectoryItem[],
  query: string,
  occupancy: OccupancyStatus | 'all',
  sort: PropertyDirectorySort
) => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return items
    .filter((item) => occupancy === 'all' || item.occupancyStatus === occupancy)
    .filter((item) => !normalizedQuery || item.searchText.includes(normalizedQuery))
    .sort((left, right) => {
      switch (sort) {
        case 'value':
          return right.metrics.currentEstimatedValue - left.metrics.currentEstimatedValue;
        case 'cashflow':
          return right.metrics.netMonthlyCashflow - left.metrics.netMonthlyCashflow;
        case 'rent':
          return right.metrics.annualRentalIncome - left.metrics.annualRentalIncome;
        case 'name':
        default:
          return left.property.name.localeCompare(right.property.name);
      }
    });
};
