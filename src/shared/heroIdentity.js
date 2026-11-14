const NAME_LIMIT = 12;

function heroName(value) {
  if (typeof value !== "string") throw new Error("Invalid hero name");
  const name = value.normalize("NFC").trim();
  const length = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(name)].length;
  if (!length || length > NAME_LIMIT || !/^[\p{L}\p{M}\p{N} ._-]+$/u.test(name)) throw new Error("Invalid hero name");
  return name;
}

function normalizeIdentity(value) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || !/^[a-zA-Z0-9-]{16,64}$/.test(value.id || "") || !Number.isFinite(Date.parse(value.registeredAt))) {
    throw new Error("Invalid registered Hero identity; restore a backup instead of creating another Hero");
  }
  return { id: value.id, name: heroName(value.name), registeredAt: new Date(value.registeredAt).toISOString() };
}

function heroRegistrationMode(character) {
  return character.identity ? "registered" : character.registrationMode === "create" ? "create" : "existing";
}

module.exports = { NAME_LIMIT, heroName, normalizeIdentity, heroRegistrationMode };
