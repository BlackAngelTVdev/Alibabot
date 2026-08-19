import { getSetting, setSetting } from "./db.js";

// Rapports « problème » envoyés depuis Discord (commande + popup) vers le panneau.
// Stockés en base (clé settings), triés du plus récent au plus ancien.

const REPORTS_KEY = "reports";
const MAX_REPORTS = 200; // garde-fou : jamais plus de 200 rapports en mémoire

function reportsStore() {
  const stored = getSetting(REPORTS_KEY);
  return Array.isArray(stored) ? stored : [];
}

export function listReports() {
  return [...reportsStore()].sort((a, b) => b.createdAt - a.createdAt);
}

export function addReport({ guildId, guildName, channelName, authorId, authorName, content }) {
  const reports = reportsStore();

  const report = {
    id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    guildId,
    guildName,
    channelName,
    authorId,
    authorName,
    content: String(content ?? "").trim(),
    createdAt: Date.now(),
    resolved: false
  };

  reports.push(report);
  setSetting(REPORTS_KEY, reports.slice(-MAX_REPORTS));
  return report;
}

export function getReport(id) {
  return reportsStore().find((report) => report.id === id) ?? null;
}

export function deleteReport(id) {
  const reports = reportsStore();
  const remaining = reports.filter((report) => report.id !== id);

  if (remaining.length === reports.length) {
    return false;
  }

  setSetting(REPORTS_KEY, remaining);
  return true;
}

export function setReportResolved(id, resolved) {
  const reports = reportsStore();
  const report = reports.find((entry) => entry.id === id);

  if (!report) {
    return null;
  }

  report.resolved = Boolean(resolved);
  setSetting(REPORTS_KEY, reports);
  return report;
}

export function clearReports() {
  setSetting(REPORTS_KEY, []);
}
