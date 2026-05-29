const QUEST_TYPES = [
  { id: "adventure", hasStatus: true },
  { id: "bookmark", hasStatus: false },
  { id: "reminder", hasStatus: true }
];

const QUEST_STATUSES = [
  { id: "todo" },
  { id: "in_progress" },
  { id: "done" },
  { id: "on_hold" }
];

const DEFAULT_QUEST_TYPE = "adventure";
const DEFAULT_QUEST_STATUS = "todo";
const QUEST_PAGE_SIZE = 8;

function isValidQuestType(value) {
  return QUEST_TYPES.some((type) => type.id === value);
}

function questTypeHasStatus(type) {
  const match = QUEST_TYPES.find((entry) => entry.id === type);
  return match ? match.hasStatus : true;
}

function isValidQuestStatus(value) {
  return QUEST_STATUSES.some((status) => status.id === value);
}

function normalizeDate(value, fallback) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return fallback;
  }

  return new Date(value).toISOString();
}

function normalizeOptionalDate(value) {
  if (!value || typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return null;
  }

  return new Date(value).toISOString();
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeQuest(input, version) {
  const source = input && typeof input === "object" ? input : {};
  const now = new Date().toISOString();
  const type = isValidQuestType(source.type) ? source.type : DEFAULT_QUEST_TYPE;
  const hasStatus = questTypeHasStatus(type);

  return {
    id: normalizeText(source.id),
    type,
    title: normalizeText(source.title),
    status: hasStatus
      ? isValidQuestStatus(source.status)
        ? source.status
        : DEFAULT_QUEST_STATUS
      : null,
    body: normalizeText(source.body),
    url: type === "bookmark" ? normalizeText(source.url) : "",
    remindAt: type === "reminder" ? normalizeOptionalDate(source.remindAt) : null,
    createdAt: normalizeDate(source.createdAt, now),
    updatedAt: normalizeDate(source.updatedAt, now),
    notifiedAt: type === "reminder" ? normalizeOptionalDate(source.notifiedAt) : null,
    version
  };
}

function normalizeQuests(input, version) {
  const records = Array.isArray(input)
    ? input
    : input && Array.isArray(input.quests)
      ? input.quests
      : [];

  return records
    .map((quest) => normalizeQuest(quest, version))
    .filter((quest) => quest.id && quest.title);
}

function sortQuestsNewestFirst(input) {
  return [...input].sort((a, b) => {
    const bTime = Date.parse(b.createdAt) || 0;
    const aTime = Date.parse(a.createdAt) || 0;
    return bTime - aTime;
  });
}

module.exports = {
  DEFAULT_QUEST_STATUS,
  DEFAULT_QUEST_TYPE,
  QUEST_PAGE_SIZE,
  QUEST_STATUSES,
  QUEST_TYPES,
  isValidQuestStatus,
  isValidQuestType,
  normalizeQuest,
  normalizeQuests,
  questTypeHasStatus,
  sortQuestsNewestFirst
};
