const MEDALS = ["🥇", "🥈", "🥉"];

function renderFunGrid(container, items) {
  container.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Aucune donnée pour le moment.";
    container.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const cell = document.createElement("div");
    cell.className = "fun-cell";

    const label = document.createElement("div");
    label.className = "fun-label";
    label.textContent = item.icon + " " + item.label;

    const value = document.createElement("div");
    value.className = "fun-value";
    value.textContent = item.value;
    value.title = item.value;

    cell.appendChild(label);
    cell.appendChild(value);
    container.appendChild(cell);
  });
}

function renderBoard(container, rows, countLabel) {
  container.innerHTML = "";

  if (rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Aucune donnée pour le moment.";
    container.appendChild(empty);
    return;
  }

  rows.forEach((row, index) => {
    const item = document.createElement("div");
    item.className = "board-row" + (index === 0 ? " top1" : "");

    const pos = document.createElement("span");
    pos.className = "board-pos";
    pos.textContent = MEDALS[index] ?? "#" + (index + 1);

    const name = document.createElement("span");
    name.className = "board-name";
    name.textContent = row.name;
    name.title = row.name;

    const count = document.createElement("span");
    count.className = "board-count";
    count.textContent = row.count + " " + (countLabel || "");

    item.appendChild(pos);
    item.appendChild(name);
    item.appendChild(count);
    container.appendChild(item);
  });
}

async function load() {
  try {
    const [statsRes, botRes] = await Promise.all([
      fetch("/api/public-stats"),
      fetch("/api/bot-info")
    ]);

    const stats = await statsRes.json();
    const bot = await botRes.json();

    if (bot.username) {
      document.title = bot.username + " — Stats";
      document.getElementById("pageTitle").textContent = "📊 Stats de " + bot.username;
    }

    renderBoard(
      document.getElementById("triggerBoard"),
      stats.triggers.map((entry) => ({
        name: entry.trigger + " → " + entry.response,
        count: entry.count
      })),
      "fois"
    );

    renderBoard(
      document.getElementById("userBoard"),
      stats.users.map((entry) => ({
        name: entry.display,
        count: entry.count
      })),
      "déclenchement(s)"
    );

    const daily = stats.daily ?? { total: 0, triggers: [], users: [] };
    const topDailyTrigger = daily.triggers[0];
    const topDailyUser = daily.users[0];

    renderFunGrid(document.getElementById("dailyBoard"), [
      {
        icon: "💬",
        label: "Déclenché aujourd'hui",
        value:
          daily.total === 0
            ? "Personne… encore 🥲"
            : daily.total + (daily.total > 1 ? " fois" : " fois")
      },
      {
        icon: "⚡",
        label: "Mot du jour",
        value: topDailyTrigger
          ? topDailyTrigger.trigger + " → " + topDailyTrigger.response + " (" + topDailyTrigger.count + " fois)"
          : "—"
      },
      {
        icon: "👤",
        label: "Personne du jour",
        value: topDailyUser
          ? topDailyUser.display + " (" + topDailyUser.count + ")"
          : "—"
      }
    ]);

  } catch {
    // Page encore en cours de chargement ou bot hors ligne : on réessaie.
  }
}

load();
setInterval(load, 15000);
