import { getSetting, setSetting } from "./db.js";

const allowedActivityTypes = new Set(["playing", "streaming", "listening", "watching", "competing"]);
const allowedPresenceStatuses = new Set(["online", "idle", "dnd", "invisible"]);

const defaultStatusConfig = {
  statuses: [
    {
      activityName: "ca va",
      activityType: "playing",
      presenceStatus: "online"
    }
  ]
};

function normalizeStatusEntry(config) {
  const activityName = String(config?.activityName ?? defaultStatusConfig.statuses[0].activityName).trim() || defaultStatusConfig.statuses[0].activityName;
  const activityType = String(config?.activityType ?? defaultStatusConfig.statuses[0].activityType).trim().toLowerCase();
  const presenceStatus = String(config?.presenceStatus ?? defaultStatusConfig.statuses[0].presenceStatus).trim().toLowerCase();

  return {
    activityName,
    activityType: allowedActivityTypes.has(activityType) ? activityType : defaultStatusConfig.statuses[0].activityType,
    presenceStatus: allowedPresenceStatuses.has(presenceStatus) ? presenceStatus : defaultStatusConfig.statuses[0].presenceStatus
  };
}

function normalizeStatusConfig(config) {
  const rawStatuses = Array.isArray(config)
    ? config
    : Array.isArray(config?.statuses)
      ? config.statuses
      : config
        ? [config]
        : [];

  const statuses = rawStatuses
    .filter((status) => String(status?.activityName ?? "").trim().length > 0)
    .map(normalizeStatusEntry);

  return {
    statuses: statuses.length > 0 ? statuses : defaultStatusConfig.statuses
  };
}

export function readBotStatusConfig() {
  const stored = getSetting("bot_status");
  return normalizeStatusConfig(stored ?? defaultStatusConfig);
}

export function writeBotStatusConfig(nextConfig) {
  const normalizedConfig = normalizeStatusConfig(nextConfig);
  setSetting("bot_status", normalizedConfig);
  return normalizedConfig;
}
