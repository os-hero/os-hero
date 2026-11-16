const messages = {
  ko: {
    "loot.loadFailed": "저장 데이터를 불러오지 못했습니다. 기존 기록은 초기화하지 않았습니다. 검증된 백업을 확인한 뒤 다시 실행해주세요.",
    "loot.title": "초원 전리품", "loot.open": "전리품 도감", "loot.encounter": "현재 적 {value} / 5", "loot.nextKill": "다음 처치까지",
    "loot.elite": "초원 정예 슬라임", "loot.advance": "다음 단계로", "loot.farm": "현재 단계 반복", "loot.mode": "탐험 방식",
    "loot.pity": "희귀 보상까지 최대 {value}회 처치", "loot.chance": "현재 적 희귀 추첨 {value}%", "loot.individual": "개별 확률 {value}%",
    "loot.owned": "보유", "loot.firstClear": "1-8 첫 완료 보상", "loot.shopLocked": "1-8 완료 후 구매 가능", "loot.buy": "{value}G 구매",
    "loot.shortGold": "골드 부족", "loot.purchased": "인벤토리에 추가했습니다.", "loot.duplicate": "모두 수집한 뒤 희귀 보상은 20G로 지급됩니다.",
    "loot.kills": "누적 {value}회 처치", "loot.last": "최근 전투", "loot.none": "첫 전투를 기다리는 중", "loot.reward": "+{gold}G · +{xp} XP", "loot.level": "Lv. {value}",
    "loot.new": "새 획득: {name}", "loot.savedBattle": "이전 전투 마무리 중", "loot.locked": "직전 단계의 적 5마리 처치 필요",
    "loot.systemPaused": "잠금·절전으로 일시정지", "loot.saveFailed": "진행을 저장하지 못해 멈췄습니다. 다시 시작하면 같은 지점에서 재시도합니다.",
    "item.meadow_crown": "별이끼 왕관", "item.moon_coat": "달무늬 코트", "item.leaf_cape": "잎사귀 케이프", "item.firefly_lantern": "반딧불 랜턴", "item.meadow_badge": "초원 인장", "item.background_star_meadow": "별빛 초원"
  },
  en: {
    "loot.loadFailed": "Saved data could not be loaded. Existing records were not reset. Check a verified backup before trying again.",
    "loot.title": "Meadow loot", "loot.open": "Loot collection", "loot.encounter": "Enemy {value} / 5", "loot.nextKill": "Next defeat in",
    "loot.elite": "Elite Meadow Slime", "loot.advance": "Advance", "loot.farm": "Repeat stage", "loot.mode": "Exploration mode",
    "loot.pity": "Rare reward within {value} defeats", "loot.chance": "Current rare roll {value}%", "loot.individual": "Individual chance {value}%",
    "loot.owned": "Owned", "loot.firstClear": "First completion of 1-8", "loot.shopLocked": "Shop opens after stage 1-8", "loot.buy": "Buy for {value}G",
    "loot.shortGold": "Not enough gold", "loot.purchased": "Added to Inventory.", "loot.duplicate": "After completing the collection, rare rewards grant 20G.",
    "loot.kills": "{value} total defeats", "loot.last": "Latest battle", "loot.none": "Waiting for the first battle", "loot.reward": "+{gold}G · +{xp} XP", "loot.level": "Lv. {value}",
    "loot.new": "New: {name}", "loot.savedBattle": "Finishing saved battle", "loot.locked": "Defeat all 5 enemies in the previous stage",
    "loot.systemPaused": "Paused while locked or asleep", "loot.saveFailed": "Could not save progress. Start again to retry the same checkpoint.",
    "item.meadow_crown": "Moss Star Crown", "item.moon_coat": "Moon Coat", "item.leaf_cape": "Leaf Cape", "item.firefly_lantern": "Firefly Lantern", "item.meadow_badge": "Meadow Mark", "item.background_star_meadow": "Starlit Meadow"
  },
  "zh-CN": {
    "loot.loadFailed": "无法读取保存数据。现有记录未被重置。请检查已验证的备份后重试。",
    "loot.title": "草原战利品", "loot.open": "战利品图鉴", "loot.encounter": "当前敌人 {value} / 5", "loot.nextKill": "距离下次击败",
    "loot.elite": "草原精英史莱姆", "loot.advance": "前往下一关", "loot.farm": "重复当前关卡", "loot.mode": "探索方式",
    "loot.pity": "最多再击败{value}个敌人获得稀有奖励", "loot.chance": "当前稀有抽取率 {value}%", "loot.individual": "单件概率 {value}%",
    "loot.owned": "已拥有", "loot.firstClear": "首次完成1-8奖励", "loot.shopLocked": "完成1-8后可购买", "loot.buy": "{value}G购买",
    "loot.shortGold": "金币不足", "loot.purchased": "已加入背包。", "loot.duplicate": "集齐后稀有奖励转换为20G。",
    "loot.kills": "累计击败{value}次", "loot.last": "最近战斗", "loot.none": "等待首次战斗", "loot.reward": "+{gold}G · +{xp} XP", "loot.level": "Lv. {value}",
    "loot.new": "新获得：{name}", "loot.savedBattle": "正在完成已保存战斗", "loot.locked": "需击败上一关的5个敌人",
    "loot.systemPaused": "锁屏或休眠时暂停", "loot.saveFailed": "进度保存失败，已暂停。重新开始将从同一检查点重试。",
    "item.meadow_crown": "苔星王冠", "item.moon_coat": "月纹外套", "item.leaf_cape": "叶片披风", "item.firefly_lantern": "萤火灯笼", "item.meadow_badge": "草原印记", "item.background_star_meadow": "星光草原"
  }
};
function lootMessages(language) { return messages[language] || messages.en; }
module.exports = { lootMessages };
