/** Which form "Tạo Tour" opens (ADR-0053): a Tour on a shift, or a quick Tour. */
export type TourKind = 'normal' | 'quick'
/** `?kind=`; `short`, the ADR-0050 name, still opens the quick form. */
export const tourKindOf = (value: string | null): TourKind | null =>
  value === 'normal' ? 'normal' : value === 'quick' || value === 'short' ? 'quick' : null
