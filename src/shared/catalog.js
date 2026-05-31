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
  },
  {
    id: "focused",
    name: "Focused",
    description: "Sharp adventurer eyes"
  },
  {
    id: "bright",
    name: "Bright",
    description: "Large sparkling eyes"
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
    id: "wizard_robe",
    name: "Wizard Robe",
    category: "clothes",
    slot: "clothes",
    assetPath: "assets/items/clothes/wizard_robe.png",
    isDefault: false,
    owned: true,
    style: {
      shirt: "#2457B8",
      pants: "#172B66",
      accent: "#F5D547",
      trim: "#8FD3FF"
    }
  },
  {
    id: "princess_dress",
    name: "Princess Dress",
    category: "clothes",
    slot: "clothes",
    assetPath: "assets/items/clothes/princess_dress.png",
    isDefault: false,
    owned: true,
    style: {
      shirt: "#F07CA8",
      pants: "#C7467D",
      accent: "#FFE1F0",
      trim: "#F5D547"
    }
  },
  {
    id: "knight_armor",
    name: "Knight Armor",
    category: "clothes",
    slot: "clothes",
    assetPath: "assets/items/clothes/knight_armor.png",
    isDefault: false,
    owned: true,
    style: {
      shirt: "#8A97A0",
      pants: "#48535B",
      accent: "#DDE5EA",
      trim: "#C4CCD2"
    }
  },
  {
    id: "rogue_cloak",
    name: "Rogue Cloak",
    category: "clothes",
    slot: "clothes",
    assetPath: "assets/items/clothes/rogue_cloak.png",
    isDefault: false,
    owned: true,
    style: {
      shirt: "#263238",
      pants: "#141A1D",
      accent: "#5FD0A5",
      trim: "#6B4A2F"
    }
  },
  {
    id: "pirate_coat",
    name: "Pirate Coat",
    category: "clothes",
    slot: "clothes",
    assetPath: "assets/items/clothes/pirate_coat.png",
    isDefault: false,
    owned: true,
    style: {
      shirt: "#8C2F39",
      pants: "#2F2A35",
      accent: "#F3D3A1",
      trim: "#F5D547"
    }
  },
  {
    id: "ninja_suit",
    name: "Ninja Suit",
    category: "clothes",
    slot: "clothes",
    assetPath: "assets/items/clothes/ninja_suit.png",
    isDefault: false,
    owned: true,
    style: {
      shirt: "#171B22",
      pants: "#0D1016",
      accent: "#5A6472",
      trim: "#C94242"
    }
  },
  {
    id: "dragon_suit",
    name: "Dragon Suit",
    category: "clothes",
    slot: "clothes",
    assetPath: "assets/items/clothes/dragon_suit.png",
    isDefault: false,
    owned: true,
    style: {
      shirt: "#57A63F",
      pants: "#2E6B2D",
      accent: "#F08A24",
      trim: "#F5D547"
    }
  },
  {
    id: "space_suit",
    name: "Space Suit",
    category: "clothes",
    slot: "clothes",
    assetPath: "assets/items/clothes/space_suit.png",
    isDefault: false,
    owned: true,
    style: {
      shirt: "#DCEAF2",
      pants: "#8FB8CA",
      accent: "#245F8F",
      trim: "#D83A34"
    }
  },
  {
    id: "devil_suit",
    name: "Devil Suit",
    category: "clothes",
    slot: "clothes",
    assetPath: "assets/items/clothes/devil_suit.png",
    isDefault: false,
    owned: true,
    style: {
      shirt: "#C53A2F",
      pants: "#5B161E",
      accent: "#F49B2D",
      trim: "#1F2328"
    }
  },
  {
    id: "ranger_hoodie",
    name: "Ranger Hoodie",
    category: "clothes",
    slot: "clothes",
    assetPath: "assets/items/clothes/ranger_hoodie.png",
    isDefault: false,
    owned: true,
    style: {
      shirt: "#3E7D3A",
      pants: "#54402E",
      accent: "#B8E986",
      trim: "#7F5A35"
    }
  },
  {
    id: "royal_robe",
    name: "Royal Robe",
    category: "clothes",
    slot: "clothes",
    assetPath: "assets/items/clothes/royal_robe.png",
    isDefault: false,
    owned: true,
    style: {
      shirt: "#6F3CC3",
      pants: "#3C236B",
      accent: "#F5D547",
      trim: "#FFFFFF"
    }
  },
  {
    id: "cleric_robes",
    name: "Cleric Robes",
    category: "clothes",
    slot: "clothes",
    assetPath: "assets/items/clothes/cleric_robes.png",
    isDefault: false,
    owned: true,
    style: {
      shirt: "#F2F0D8",
      pants: "#9E8F5C",
      accent: "#4FB3C8",
      trim: "#F5D547"
    }
  },
  {
    id: "barbarian_armor",
    name: "Barbarian Armor",
    category: "clothes",
    slot: "clothes",
    assetPath: "assets/items/clothes/barbarian_armor.png",
    isDefault: false,
    owned: true,
    style: {
      shirt: "#A05A32",
      pants: "#4C3426",
      accent: "#E0C07A",
      trim: "#6B7280"
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
    id: "spiky_hair",
    name: "Spiky Hair",
    category: "head",
    slot: "head",
    assetPath: "assets/items/head/spiky_hair.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#2B2E3A",
      accent: "#4A5162"
    }
  },
  {
    id: "side_part_hair",
    name: "Side Part",
    category: "head",
    slot: "head",
    assetPath: "assets/items/head/side_part_hair.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#7A3E22",
      accent: "#B4572A"
    }
  },
  {
    id: "mohawk_hair",
    name: "Mohawk",
    category: "head",
    slot: "head",
    assetPath: "assets/items/head/mohawk_hair.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#D83A7C",
      accent: "#5A1F42"
    }
  },
  {
    id: "curly_hair",
    name: "Curly Hair",
    category: "head",
    slot: "head",
    assetPath: "assets/items/head/curly_hair.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#2A1D18",
      accent: "#6D3D24"
    }
  },
  {
    id: "ponytail_hair",
    name: "Ponytail",
    category: "head",
    slot: "head",
    assetPath: "assets/items/head/ponytail_hair.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#8A4D2A",
      accent: "#F0B35D"
    }
  },
  {
    id: "princess_hair",
    name: "Princess Hair",
    category: "head",
    slot: "head",
    assetPath: "assets/items/head/princess_hair.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#F0C85A",
      accent: "#FFF2A8"
    }
  },
  {
    id: "short_bangs",
    name: "Short Bangs",
    category: "head",
    slot: "head",
    assetPath: "assets/items/head/short_bangs.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#151B24",
      accent: "#31445F"
    }
  },
  {
    id: "braided_hair",
    name: "Braided Hair",
    category: "head",
    slot: "head",
    assetPath: "assets/items/head/braided_hair.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#5D3325",
      accent: "#D89B5B"
    }
  },
  {
    id: "wizard_hat",
    name: "Wizard Hat",
    category: "head",
    slot: "head",
    assetPath: "assets/items/head/wizard_hat.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#2457B8",
      accent: "#F5D547"
    }
  },
  {
    id: "gold_crown",
    name: "Gold Crown",
    category: "head",
    slot: "head",
    assetPath: "assets/items/head/gold_crown.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#F5C542",
      accent: "#D83A34"
    }
  },
  {
    id: "knight_helmet",
    name: "Knight Helmet",
    category: "head",
    slot: "head",
    assetPath: "assets/items/head/knight_helmet.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#8A97A0",
      accent: "#DDE5EA"
    }
  },
  {
    id: "pirate_hat",
    name: "Pirate Hat",
    category: "head",
    slot: "head",
    assetPath: "assets/items/head/pirate_hat.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#171B22",
      accent: "#F5D547"
    }
  },
  {
    id: "horned_helm",
    name: "Horned Helm",
    category: "head",
    slot: "head",
    assetPath: "assets/items/head/horned_helm.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#6B7280",
      accent: "#E8D6A4"
    }
  },
  {
    id: "ninja_hood",
    name: "Ninja Hood",
    category: "head",
    slot: "head",
    assetPath: "assets/items/head/ninja_hood.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#10151C",
      accent: "#4B5563"
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
  },
  {
    id: "iron_sword",
    name: "Iron Sword",
    category: "tool",
    slot: "tool",
    assetPath: "assets/items/tools/iron_sword.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#B8C4CC",
      accent: "#6B4A2F"
    }
  },
  {
    id: "wooden_shield",
    name: "Wooden Shield",
    category: "tool",
    slot: "tool",
    assetPath: "assets/items/tools/wooden_shield.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#8B5E3C",
      accent: "#2F66A4"
    }
  },
  {
    id: "magic_staff",
    name: "Magic Staff",
    category: "tool",
    slot: "tool",
    assetPath: "assets/items/tools/magic_staff.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#6B4A2F",
      accent: "#8FD3FF"
    }
  },
  {
    id: "long_bow",
    name: "Long Bow",
    category: "tool",
    slot: "tool",
    assetPath: "assets/items/tools/long_bow.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#7A4A2A",
      accent: "#E7D8B5"
    }
  },
  {
    id: "battle_axe",
    name: "Battle Axe",
    category: "tool",
    slot: "tool",
    assetPath: "assets/items/tools/battle_axe.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#B8C4CC",
      accent: "#7A4A2A"
    }
  },
  {
    id: "steel_dagger",
    name: "Steel Dagger",
    category: "tool",
    slot: "tool",
    assetPath: "assets/items/tools/steel_dagger.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#DDE5EA",
      accent: "#263238"
    }
  },
  {
    id: "wizard_wand",
    name: "Wizard Wand",
    category: "tool",
    slot: "tool",
    assetPath: "assets/items/tools/wizard_wand.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#7A4A2A",
      accent: "#F5D547"
    }
  },
  {
    id: "spellbook",
    name: "Spellbook",
    category: "tool",
    slot: "tool",
    assetPath: "assets/items/tools/spellbook.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#6F3CC3",
      accent: "#F5D547"
    }
  },
  {
    id: "kite_shield",
    name: "Kite Shield",
    category: "tool",
    slot: "tool",
    assetPath: "assets/items/tools/kite_shield.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#8A97A0",
      accent: "#C53A2F"
    }
  },
  {
    id: "spear",
    name: "Spear",
    category: "tool",
    slot: "tool",
    assetPath: "assets/items/tools/spear.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#C4CCD2",
      accent: "#7A4A2A"
    }
  },
  {
    id: "war_hammer",
    name: "War Hammer",
    category: "tool",
    slot: "tool",
    assetPath: "assets/items/tools/war_hammer.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#8A97A0",
      accent: "#6B4A2F"
    }
  },
  {
    id: "health_potion",
    name: "Health Potion",
    category: "tool",
    slot: "tool",
    assetPath: "assets/items/tools/health_potion.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#D83A34",
      accent: "#F5D547"
    }
  },
  {
    id: "torch",
    name: "Torch",
    category: "tool",
    slot: "tool",
    assetPath: "assets/items/tools/torch.png",
    isDefault: false,
    owned: true,
    style: {
      primary: "#7A4A2A",
      accent: "#F08A24"
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
