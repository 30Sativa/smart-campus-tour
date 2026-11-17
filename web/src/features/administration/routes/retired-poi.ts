/** ADR-0062: the words and amber chip of a route revision with a retired POI; the route list uses them as its status. */
export const RETIRED_POI_LABEL = 'Có POI ngưng dùng'
export const retiredPoiChip = 'border-[#f1dcb0] bg-[#fffaf0] text-[#7d5310]'
export const retiredPoiTitle = (names: string[]) => `POI đã ngưng dùng: ${names.join(', ')}`
