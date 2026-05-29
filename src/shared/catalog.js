const DEFAULT_BODY_COLOR = "#F1C27D";
const DEFAULT_EYE_TYPE = "default";
const DEFAULT_CLOTHES_ID = "default_clothes";
const DEFAULT_GENDER = "male";
const { DEFAULT_LANGUAGE, normalizeLanguage } = require("./i18n");

const GENDER_OPTIONS = [
  {
    id: "male",
    name: "남",
    description: "Default character profile"
  },
  {
    id: "female",
    name: "녀",
    description: "Female character profile"
  }
];

const EYE_TYPES = [
  {
    id: "default",
    name: "Default",
    description: "Classic two-pixel eyes"
  },
  {
    id: "dot",
    name: "Dot",
    description: "Small Game Boy style dots"
  },
  {
    id: "happy",
    name: "Happy",
    description: "Soft smiling eyes"
  },
  {
    id: "sleepy",
    name: "Sleepy",
    description: "Relaxed horizontal eyes"
  }
];

const ITEM_CATEGORIES = [
  { id: "head", name: "Head" },
  { id: "clothes", name: "Clothes" },
  { id: "tool", name: "Tools" }
];

const ITEMS = [
  {
    id: DEFAULT_CLOTHES_ID,
    name: "Default Outfit",
    category: "clothes",
    slot: "clothes",
    assetPath: "assets/items/clothes/default.png",
    isDefault: true,
    owned: true,
    style: {
      shirt: "#3E7CB1",
      pants: "#26344D",
      accent: "#F5D547"
    }
  },
  {
    id: "blue_overalls",
    name: "Blue Overalls",
    category: "clothes",
    slot: "clothes",
    assetPath: "assets/items/clothes/blue_overalls.png",
    isDefault: false,
    owned: true,
    style: {
      shirt: "#F7D774",
      pants: "#2563A9",
      accent: "#F4F4F4"
    }
  },
  {
    id: "green_tunic",
    name: "Green Tunic",
    category: "clothes",
    slot: "clothes",
    assetPath: "assets/items/clothes/green_tunic.png",
    isDefault: false,
    owned: true,
    style: {
      shirt: "#4C9A5F",
      pants: "#5B4336",
      accent: "#D8E2C3"
    }
  },
  {
    id: "basic_hair",
    name: "Basic Hair",
    category: "head",
    slot: "head",
    assetPath: "assets/items/head/basic_hair.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#3A2C24",
      accent: "#2A201A"
    }
  },
  {
    id: "red_cap",
    name: "Red Cap",
    category: "head",
    slot: "head",
    assetPath: "assets/items/head/red_cap.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#D33F49",
      accent: "#F4F4F4"
    }
  },
  {
    id: "long_hair",
    name: "Long Hair",
    category: "head",
    slot: "head",
    assetPath: "assets/items/head/long_hair.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#5A3A2E",
      accent: "#7A513E"
    }
  },
  {
    id: "bob_hair",
    name: "Bob Hair",
    category: "head",
    slot: "head",
    assetPath: "assets/items/head/bob_hair.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#2F2633",
      accent: "#5A4A67"
    }
  },
  {
    id: "twin_tails",
    name: "Twin Tails",
    category: "head",
    slot: "head",
    assetPath: "assets/items/head/twin_tails.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#724B32",
      accent: "#D86A7A"
    }
  },
  {
    id: "round_glasses",
    name: "Round Glasses",
    category: "tool",
    slot: "tool",
    assetPath: "assets/items/tools/round_glasses.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#202020"
    }
  },
  {
    id: "small_bag",
    name: "Small Bag",
    category: "tool",
    slot: "tool",
    assetPath: "assets/items/tools/small_bag.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#8B5E3C",
      accent: "#D9A066"
    }
  }
];

function isValidHexColor(value) {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value);
}

function getEyeType(id) {
  return EYE_TYPES.find((eyeType) => eyeType.id === id) || EYE_TYPES[0];
}

function getGender(id) {
  return GENDER_OPTIONS.find((gender) => gender.id === id) || GENDER_OPTIONS[0];
}

function getItemById(id) {
  return ITEMS.find((item) => item.id === id) || null;
}

function defaultEquipped() {
  return {
    head: null,
    clothes: DEFAULT_CLOTHES_ID,
    tool: null
  };
}

function defaultCharacter(version) {
  return {
    hasCharacter: true,
    gender: DEFAULT_GENDER,
    bodyColor: DEFAULT_BODY_COLOR,
    eyeType: DEFAULT_EYE_TYPE,
    equipped: defaultEquipped(),
    version
  };
}

function normalizeEquipped(input) {
  const equipped = { ...defaultEquipped(), ...(input || {}) };

  const head = getItemById(equipped.head);
  if (!head || head.category !== "head") {
    equipped.head = null;
  }

  const clothes = getItemById(equipped.clothes);
  if (!clothes || clothes.category !== "clothes") {
    equipped.clothes = DEFAULT_CLOTHES_ID;
  }

  const tool = getItemById(equipped.tool);
  if (!tool || tool.category !== "tool") {
    equipped.tool = null;
  }

  return equipped;
}

function normalizeCharacter(input, version) {
  const fallback = defaultCharacter(version);
  const source = input && typeof input === "object" ? input : {};

  return {
    hasCharacter: source.hasCharacter === false ? false : true,
    gender: getGender(source.gender).id,
    bodyColor: isValidHexColor(source.bodyColor) ? source.bodyColor.toUpperCase() : fallback.bodyColor,
    eyeType: getEyeType(source.eyeType).id,
    equipped: normalizeEquipped(source.equipped),
    version
  };
}

function defaultSettings(version) {
  return {
    launchAtLogin: false,
    language: DEFAULT_LANGUAGE,
    version
  };
}

function normalizeSettings(input, version) {
  const source = input && typeof input === "object" ? input : {};

  return {
    launchAtLogin: Boolean(source.launchAtLogin),
    language: normalizeLanguage(source.language),
    version
  };
}

function equipItem(character, itemId) {
  const item = getItemById(itemId);
  if (!item) {
    throw new Error("Unknown item");
  }

  const next = normalizeCharacter(character, character.version);
  next.equipped[item.slot] = item.id;
  return next;
}

function unequipSlot(character, slot) {
  if (!["head", "clothes", "tool"].includes(slot)) {
    throw new Error("Unknown equipment slot");
  }

  const next = normalizeCharacter(character, character.version);
  next.equipped[slot] = slot === "clothes" ? DEFAULT_CLOTHES_ID : null;
  return next;
}

module.exports = {
  DEFAULT_BODY_COLOR,
  DEFAULT_EYE_TYPE,
  DEFAULT_CLOTHES_ID,
  DEFAULT_GENDER,
  EYE_TYPES,
  GENDER_OPTIONS,
  ITEM_CATEGORIES,
  ITEMS,
  defaultCharacter,
  defaultSettings,
  equipItem,
  getEyeType,
  getGender,
  getItemById,
  isValidHexColor,
  normalizeCharacter,
  normalizeSettings,
  unequipSlot
};
