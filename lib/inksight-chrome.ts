/**
 * Device chrome geometry: must match `backend/core/config.py` and
 * `firmware/src/config.h` (INKSIGHT_*).
 *
 * The BMP/PNG from /api/render and /api/preview is the *body* only (between
 * firmware-drawn status and footer strips).
 */
export const INKSIGHT_STATUS_BAR_PX = 36;
export const INKSIGHT_FOOTER_PX = 30;

export const DEFAULT_PANEL_W = 400;
export const DEFAULT_PANEL_H = 300;

export function inksightBodySize(panelW: number, panelH: number): { w: number; h: number } {
  const h = panelH - INKSIGHT_STATUS_BAR_PX - INKSIGHT_FOOTER_PX;
  return { w: panelW, h: Math.max(1, h) };
}
