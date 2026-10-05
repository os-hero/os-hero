const test = require("node:test");
const assert = require("node:assert/strict");
const { trayPanelBounds, normalizeTraySession, isOutsideClick } = require("../src/shared/trayPanel");

test("one route-independent popup size stays inside each display's work area", () => {
  for (const area of [
    { x: 0, y: 25, width: 1920, height: 1055 }, { x: -1280, y: -720, width: 1280, height: 696 },
    { x: 1920, y: 200, width: 640, height: 480 }, { x: 0, y: 0, width: 360, height: 520 }
  ]) for (const bottom of [false, true]) {
    const tray = { x: area.x + area.width - 48, y: bottom ? area.y + area.height : area.y - 24, width: 24, height: 24 };
    const bounds = trayPanelBounds(tray, area);
    assert.equal(bounds.width, Math.min(760, area.width - 16));
    assert.equal(bounds.height, Math.min(600, area.height - 16));
    assert(bounds.x >= area.x && bounds.y >= area.y);
    assert(bounds.x + bounds.width <= area.x + area.width);
    assert(bounds.y + bounds.height <= area.y + area.height);
  }
});

test("outside-click policy excludes popup, tray and native child controls, not other apps", () => {
  const popup = { x: 10, y: 40, width: 760, height: 600 }, tray = { x: 720, y: 0, width: 24, height: 24 };
  const outside = click => isOutsideClick(click, popup, tray, 10);
  assert.equal(outside({ x: 20, y: 50, targetPid: 30 }), false);
  assert.equal(outside({ x: 730, y: 10, targetPid: 30 }), false);
  assert.equal(outside({ x: 900, y: 500, targetPid: 10 }), false);
  assert.equal(outside({ x: 900, y: 500, targetPid: 30 }), true);
  assert.equal(outside({}), false);
});

test("ephemeral session is bounded, route allowlisted and detached from caller", () => {
  const input = { route: "inventory", inventory: { tab: "back" }, secret: "not a session field" };
  const state = normalizeTraySession(input);
  input.inventory.tab = "hair";
  assert.equal(state.inventory.tab, "back");
  assert(!Object.hasOwn(state, "secret"));
  assert.equal(normalizeTraySession({ route: "file:///tmp" }).route, "companion");
  assert.throws(() => normalizeTraySession({ formValues: "x".repeat(140000) }), /too large/);
});
