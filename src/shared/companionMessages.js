const messages = {
  en: {
    "tray.category": "Category",
    "companion.myQuests": "My quests", "companion.expedition": "Hero's expedition",
    "companion.nextReward": "Until next reward", "companion.minutes": "{value} min",
    "companion.start": "Start expedition", "companion.pause": "Pause", "companion.resume": "Resume expedition",
    "companion.target": "Target item", "companion.change": "Change target", "companion.time": "Companion time {value} / {total} min",
    "companion.select": "Select", "companion.earned": "Collected", "companion.newReward": "New item collected",
    "companion.inventory": "Open inventory", "companion.limit": "Today's expedition is complete",
    "companion.daily": "Today {value} / {total} min", "companion.empty": "No quests yet",
    "companion.add": "Add quest", "companion.all": "All quests", "companion.completed": "Quest complete",
    "companion.error": "Couldn't save. Please try again.", "companion.title": "Quest title",
    "companion.saved": "Saved", "companion.goalDialog": "Choose a target item", "companion.close": "Close",
    "companion.done": "Mark complete", "companion.undo": "Mark incomplete", "companion.clock": "Check your system date",
    "companion.collectionComplete": "Collection complete", "companion.total": "{value} min total",
    "item.expedition_star_hat": "Star Hat", "item.expedition_cloak": "Companion Cloak", "item.expedition_sword": "Dawn Sword"
  },
  ko: {
    "tray.category": "분류",
    "companion.myQuests": "내 퀘스트", "companion.expedition": "히어로의 탐험",
    "companion.nextReward": "다음 보상까지", "companion.minutes": "{value}분",
    "companion.start": "탐험 시작", "companion.pause": "일시정지", "companion.resume": "탐험 계속",
    "companion.target": "목표 아이템", "companion.change": "목표 변경", "companion.time": "동행 시간 {value} / {total}분",
    "companion.select": "선택", "companion.earned": "획득 완료", "companion.newReward": "새 아이템을 획득했어요",
    "companion.inventory": "인벤토리 열기", "companion.limit": "오늘의 탐험을 마쳤어요",
    "companion.daily": "오늘 {value} / {total}분", "companion.empty": "아직 퀘스트가 없어요",
    "companion.add": "퀘스트 추가", "companion.all": "전체 퀘스트", "companion.completed": "퀘스트 완료",
    "companion.error": "저장하지 못했습니다. 다시 시도해주세요.", "companion.title": "퀘스트 제목",
    "companion.saved": "저장됨", "companion.goalDialog": "목표 아이템 선택", "companion.close": "닫기",
    "companion.done": "완료로 표시", "companion.undo": "미완료로 표시", "companion.clock": "시스템 날짜를 확인해주세요",
    "companion.collectionComplete": "모든 아이템을 모았어요", "companion.total": "총 {value}분",
    "item.expedition_star_hat": "별 모자", "item.expedition_cloak": "동행 망토", "item.expedition_sword": "새벽 검"
  },
  "zh-CN": {
    "tray.category": "分类",
    "companion.myQuests": "我的任务", "companion.expedition": "英雄的探险",
    "companion.nextReward": "距离下个奖励", "companion.minutes": "{value}分钟",
    "companion.start": "开始探险", "companion.pause": "暂停", "companion.resume": "继续探险",
    "companion.target": "目标物品", "companion.change": "更换目标", "companion.time": "陪伴时间 {value} / {total}分钟",
    "companion.select": "选择", "companion.earned": "已获得", "companion.newReward": "获得了新物品",
    "companion.inventory": "打开物品栏", "companion.limit": "今天的探险已完成",
    "companion.daily": "今天 {value} / {total}分钟", "companion.empty": "还没有任务",
    "companion.add": "添加任务", "companion.all": "全部任务", "companion.completed": "任务完成",
    "companion.error": "保存失败，请重试。", "companion.title": "任务标题",
    "companion.saved": "已保存", "companion.goalDialog": "选择目标物品", "companion.close": "关闭",
    "companion.done": "标记为完成", "companion.undo": "标记为未完成", "companion.clock": "请检查系统日期",
    "companion.collectionComplete": "已收集所有物品", "companion.total": "共{value}分钟",
    "item.expedition_star_hat": "星星帽", "item.expedition_cloak": "陪伴披风", "item.expedition_sword": "黎明之剑"
  }
};
module.exports = { companionMessages: (language) => messages[language] || messages.en };
