const HAIR_IDS = ["basic_hair", "long_hair", "bob_hair", "twin_tails", "spiky_hair", "side_part_hair", "mohawk_hair", "curly_hair", "ponytail_hair", "princess_hair", "short_bangs", "braided_hair", "twin_buns", "wave_bob"];
const HAIR_COLORS = ["#29262E", "#714D38", "#A04F37", "#D8B660", "#A7ADB5", "#E1DCCF", "#C56A87", "#8770AC", "#456F98", "#518574"];

const WARDROBE_ITEMS = [
  { id: "travel_cap", slot: "head", name: "Travel Cap", style: { primary: "#277D89", accent: "#E7C36C" } },
  { id: "rune_hat", slot: "head", name: "Rune Hat", style: { primary: "#347E88", accent: "#D47A64" } },
  { id: "silver_circlet", slot: "head", name: "Silver Circlet", style: { primary: "#ADBEC3", accent: "#57A7AA" } },
  { id: "travel_jacket", slot: "clothes", name: "Travel Jacket", style: { shirt: "#398C98", pants: "#343B47", accent: "#E6B877", trim: "#D77B6B" } },
  { id: "sage_tunic", slot: "clothes", name: "Sage Tunic", renderStyle: "green_tunic", style: { shirt: "#66875D", pants: "#424442", accent: "#D5BD7D", trim: "#9BAE83" } },
  { id: "rune_coat", slot: "clothes", name: "Rune Coat", style: { shirt: "#DFE5DD", pants: "#3F5964", accent: "#38848B", trim: "#CCAC64" } },
  { id: "village_armor", slot: "clothes", name: "Village Armor", style: { shirt: "#8DA8B3", pants: "#3D4B56", accent: "#E2E8E5", trim: "#C76E5C" } },
  { id: "teal_backpack", slot: "back", name: "Teal Backpack", style: { primary: "#2E8790", accent: "#D7AF66" } },
  { id: "ochre_cape", slot: "back", name: "Ochre Cape", style: { primary: "#BA9655", accent: "#E3C889" } },
  { id: "teal_cape", slot: "back", name: "Teal Cape", style: { primary: "#3C8590", accent: "#81B9B6" } },
  { id: "travel_mug", slot: "tool", name: "Travel Mug", style: { primary: "#3C92BF", accent: "#DBEDF3" } },
  { id: "field_book", slot: "tool", name: "Field Book", style: { primary: "#BD695C", accent: "#E9BF6C" } },
  { id: "trail_sword", slot: "tool", name: "Trail Sword", style: { primary: "#BCD0D4", accent: "#D5B66B" } },
  { id: "square_glasses", slot: "face", name: "Square Glasses", style: { primary: "#596D77", accent: "#BCD8DF" } },
  { id: "forehead_goggles", slot: "face", name: "Forehead Goggles", style: { primary: "#6A5641", accent: "#6BAFBB" } },
  { id: "twin_buns", slot: "hair", name: "Twin Buns", style: { primary: "#714D38", accent: "#B68C64" } },
  { id: "wave_bob", slot: "hair", name: "Wave Bob", style: { primary: "#714D38", accent: "#B68C64" } },
  { id: "berry_beret", slot: "head", name: "Berry Beret", style: { primary: "#C95B68", accent: "#ED9C8D" } },
  { id: "studio_headphones", slot: "head", name: "Studio Headphones", style: { primary: "#3777AF", accent: "#E08A7D" } },
  { id: "workshop_apron", slot: "clothes", name: "Workshop Apron", style: { shirt: "#E8E9D9", pants: "#39434C", accent: "#74965C", trim: "#B7CC8B" } },
  { id: "raincoat", slot: "clothes", name: "Raincoat", style: { shirt: "#E7BB4D", pants: "#3D858B", accent: "#F7DC82", trim: "#525E64" } },
  { id: "bedroll_pack", slot: "back", name: "Bedroll Pack", style: { primary: "#387D84", accent: "#D77B6B", strap: "#C1A573" } },
  { id: "flower_basket", slot: "back", name: "Flower Basket", style: { primary: "#AC8659", accent: "#E7BD7F", strap: "#B39265" } },
  { id: "camp_lantern", slot: "tool", name: "Camp Lantern", style: { primary: "#BB914A", accent: "#FFE49B" } },
  { id: "big_paintbrush", slot: "tool", name: "Big Paintbrush", style: { primary: "#397CB5", accent: "#D8796D" } }
].map((item) => ({ ...item, category: item.slot, owned: true, collection: "adventure_wardrobe" }));

const NAMES = {
  ko: ["여행 모자", "룬 모자", "은빛 서클릿", "여행 재킷", "세이지 튜닉", "룬 코트", "마을 기사 갑옷", "청록 배낭", "황토빛 망토", "청록 망토", "여행 머그", "기록의 책", "길잡이 검", "사각 안경", "이마 고글", "양쪽 번", "웨이브 단발", "베레모", "헤드폰", "작업 앞치마", "레인코트", "침낭 배낭", "꽃바구니", "캠핑 랜턴", "큰 붓"],
  en: WARDROBE_ITEMS.map((item) => item.name),
  "zh-CN": ["旅行帽", "符文帽", "银色头环", "旅行夹克", "鼠尾草绿上衣", "符文外套", "村庄骑士铠甲", "青绿背包", "赭色披风", "青绿披风", "旅行杯", "记录之书", "向导之剑", "方框眼镜", "额头护目镜", "双丸子头", "波浪短发", "贝雷帽", "耳机", "工作围裙", "雨衣", "睡袋背包", "花篮", "露营灯", "大画笔"]
};
const LABELS = {
  ko: ["헤어", "머리 장비", "얼굴 장식", "의상", "등 장비", "손 소품", "헤어 스타일", "머리색", "없음", "원래 색상", "검정", "밤색", "적갈색", "금발", "은색", "백금", "장미", "라일락", "파랑", "초록"],
  en: ["Hair", "Headwear", "Face", "Outfits", "Back", "Handheld", "Hairstyle", "Hair color", "None", "Original color", "Black", "Chestnut", "Auburn", "Blonde", "Silver", "Platinum", "Rose", "Lilac", "Blue", "Green"],
  "zh-CN": ["发型", "头饰", "面饰", "服装", "背饰", "手持物", "发型", "发色", "无", "原始颜色", "黑色", "栗色", "红棕", "金色", "银色", "铂金", "玫瑰", "淡紫", "蓝色", "绿色"]
};
function wardrobeMessages(language) {
  const labels = LABELS[language] || LABELS.en;
  const names = NAMES[language] || NAMES.en;
  const keys = ["category.hair", "category.head", "category.face", "category.clothes", "category.back", "category.tool", "custom.hair", "custom.hairColor", "custom.noHair", "custom.originalHairColor", ...HAIR_COLORS.map((_, i) => `hairColor.${i}`)];
  return Object.fromEntries([...keys.map((key, i) => [key, labels[i]]), ...WARDROBE_ITEMS.map((item, i) => [`item.${item.id}`, names[i]])]);
}

module.exports = { HAIR_IDS, HAIR_COLORS, WARDROBE_ITEMS, wardrobeMessages };
