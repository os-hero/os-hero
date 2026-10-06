const TRAY_ROUTES = new Set(["companion", "customization", "inventory", "quests", "settings", "about", "updates"]);
const TRAY_PANEL_SIZE = { width: 760, height: 600 };

function trayPanelBounds(tray, area) {
  const margin = 8;
  const width = Math.min(TRAY_PANEL_SIZE.width, Math.max(1, area.width - margin * 2));
  const height = Math.min(TRAY_PANEL_SIZE.height, Math.max(1, area.height - margin * 2));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const below = tray.y < area.y + area.height / 2;
  return {
    x: clamp(Math.round(tray.x + tray.width / 2 - width + 52), area.x + margin, area.x + area.width - width - margin),
    y: clamp(below ? tray.y + tray.height + margin : tray.y - height - margin, area.y + margin, area.y + area.height - height - margin),
    width, height
  };
}

function normalizeTraySession(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { route: "companion" };
  // This is bounded, ephemeral UI state only. It never writes character/quest stores.
  const json = JSON.stringify(value);
  if (json.length > 128 * 1024) throw new Error("Tray session is too large");
  const result = {};
  for (const key of ["route", "customizationDraft", "customizationHairDirty", "inventory", "questRoute", "questDraft", "quickQuest", "dialog", "scroll", "formValues"])
    if (Object.hasOwn(value, key)) result[key] = JSON.parse(JSON.stringify(value[key]));
  result.route = TRAY_ROUTES.has(result.route) ? result.route : "companion";
  result.hasUnsavedChanges = value.hasUnsavedChanges === true;
  return result;
}

function pointInside(point, bounds) {
  return point.x >= bounds.x && point.x < bounds.x + bounds.width && point.y >= bounds.y && point.y < bounds.y + bounds.height;
}

function isOutsideClick(click, bounds, trayBounds, ownerPid) {
  if (!click || !Number.isFinite(click.x) || !Number.isFinite(click.y)) return false;
  // Native selects/color panels belong to this app even when outside the main rectangle.
  return click.targetPid !== ownerPid && !pointInside(click, bounds) && !pointInside(click, trayBounds);
}

module.exports = { TRAY_ROUTES, TRAY_PANEL_SIZE, trayPanelBounds, normalizeTraySession, pointInside, isOutsideClick };
