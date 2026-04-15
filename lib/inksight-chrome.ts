/**
 * Preview uses full panel size (w×h). Status bar and footer are rendered in the
 * bitmap by the backend; the device only displays the image.
 */
export const INKSIGHT_STATUS_BAR_PX = 36;
export const INKSIGHT_FOOTER_PX = 30;

export const DEFAULT_PANEL_W = 400;
export const DEFAULT_PANEL_H = 300;

/** Representative sizes for widget-tab preview; aligned with backend ``classify_slot_shape`` / tier tests. */
export const WIDGET_SLOT_PREVIEW_DIMENSIONS = {
  FULL: { w: 400, h: 300 },
  SMALL: { w: 145, h: 68 },
  WIDE: { w: 380, h: 77 },
  TALL: { w: 80, h: 180 },
} as const;

/** Effective render dimensions for /api/preview (full frame). */
export function inksightBodySize(panelW: number, panelH: number): { w: number; h: number } {
  return { w: panelW, h: Math.max(1, panelH) };
}
