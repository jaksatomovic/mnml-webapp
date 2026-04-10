/**
 * Preview uses full panel size (w×h). Status bar and footer are rendered in the
 * bitmap by the backend; the device only displays the image.
 */
export const INKSIGHT_STATUS_BAR_PX = 36;
export const INKSIGHT_FOOTER_PX = 30;

export const DEFAULT_PANEL_W = 400;
export const DEFAULT_PANEL_H = 300;

/** Effective render dimensions for /api/preview (full frame). */
export function inksightBodySize(panelW: number, panelH: number): { w: number; h: number } {
  return { w: panelW, h: Math.max(1, panelH) };
}
