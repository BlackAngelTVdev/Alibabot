const ACTIVITY_TYPES = [
  ["playing", "Joue à"],
  ["streaming", "Streaming"],
  ["listening", "Écoute"],
  ["watching", "Regarde"],
  ["competing", "Compétition"]
];
const PRESENCE_TYPES = [
  ["online", "En ligne"],
  ["idle", "Absent"],
  ["dnd", "Ne pas déranger"],
  ["invisible", "Invisible"]
];

const state = { reactions: [], statuses: [], discord: null };

// ---- Bannière « Connecte ton compte Discord » ----
const discordBanner = document.getElementById("discordBanner");
const discordBannerTitle = document.getElementById("discordBannerTitle");
const discordBannerText = document.getElementById("discordBannerText");
const discordConnectBtn = document.getElementById("discordConnectBtn");
const discordUnlinkBtn = document.getElementById("discordUnlinkBtn");

async function loadDiscordStatus() {
  try {
    const response = await apiFetch("/api/discord-status");
    const data = await response.json();
    state.discord = data;
    renderDiscordBanner();
  } catch (error) {
    // Session expirée : apiFetch redirige déjà.
  }
}

function renderDiscordBanner() {
  const data = state.discord;

  if (!data) {
    return;
  }

  // Les admins n'ont pas besoin de connecter Discord (accès complet).
  if (data.isAdmin) {
    discordBanner.style.display = "none";
    return;
  }

  if (!data.configured) {
    discordBanner.style.display = "flex";
    discordBannerTitle.textContent = "⚠️ Connexion Discord non configurée";
    discordBannerText.textContent = "L'administrateur doit renseigner DISCORD_CLIENT_ID et DISCORD_CLIENT_SECRET dans le .env pour que les membres puissent se connecter.";
    discordConnectBtn.style.display = "none";
    discordUnlinkBtn.style.display = "none";
    return;
  }

  discordBanner.style.display = "flex";

  if (data.linked) {
    discordBannerTitle.textContent = "✅ Connecté : " + (data.discordUsername ?? "Discord");
    discordBannerText.textContent = "Tu vois les " + (data.discordGuilds ?? 0) + " serveur(s) où tu es. Tu peux y envoyer 1 broadcast par jour.";
    discordConnectBtn.style.display = "none";
    discordUnlinkBtn.style.display = "";
  } else {
    discordBannerTitle.textContent = "🔗 Connecte ton compte Discord";
    discordBannerText.textContent = "Pour voir les serveurs où tu es et y envoyer des broadcasts.";
    discordConnectBtn.style.display = "";
    discordUnlinkBtn.style.display = "none";
  }
}

discordUnlinkBtn.addEventListener("click", async () => {
  try {
    await apiFetch("/api/discord-unlink", { method: "POST" });
    loadDiscordStatus();
    loadGuilds();
  } catch (error) {
    // Ignoré : apiFetch redirige en cas de session expirée.
  }
});

// Si la session a expiré, on renvoie vers la page de connexion.
async function apiFetch(url, options) {
  const response = await fetch(url, options);

  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("Session expirée. Reconnecte-toi.");
  }

  return response;
}

// ---- Onglets (avec hash dans l'URL pour retomber sur le bon onglet au F5) ----
const tabButtons = Array.from(document.querySelectorAll(".tab"));
const tabContents = {};

function activateTab(name) {
  const button = tabButtons.find((entry) => entry.dataset.tab === name);

  if (!button || button.style.display === "none") {
    return false;
  }

  tabButtons.forEach((other) => other.classList.toggle("active", other === button));
  Object.values(tabContents).forEach((section) => section.classList.remove("active"));
  tabContents[name].classList.add("active");

  if (name === "broadcast") {
    loadGuilds();
  }

  if (name === "role") {
    loadChampionRole();
  }

  return true;
}

function tabFromHash() {
  const hash = window.location.hash.replace(/^#/, "");
  return tabButtons.some((entry) => entry.dataset.tab === hash) ? hash : null;
}

tabButtons.forEach((button) => {
  tabContents[button.dataset.tab] = document.getElementById("tab-" + button.dataset.tab);
  button.addEventListener("click", () => {
    if (window.location.hash === "#" + button.dataset.tab) {
      activateTab(button.dataset.tab);
    } else {
      window.location.hash = button.dataset.tab;
    }
  });
});

window.addEventListener("hashchange", () => {
  const tab = tabFromHash();
  if (tab) {
    activateTab(tab);
  }
});

// Au chargement : onglet depuis l'URL, sinon on écrit l'onglet actif dans l'URL.
const initialTab = tabFromHash();
if (initialTab) {
  activateTab(initialTab);
} else if (!window.location.hash) {
  const currentTab = document.querySelector(".tab.active")?.dataset.tab ?? "reactions";
  history.replaceState(null, "", "#" + currentTab);
}

// ---- Onglet « réactions » ----
const reactionCreateForm = document.getElementById("reactionCreateForm");
const newTriggerInput = document.getElementById("newTriggerInput");
const newResponseInput = document.getElementById("newResponseInput");
const reactionList = document.getElementById("reactionList");
const reactionCount = document.getElementById("reactionCount");
const reactionStatus = document.getElementById("reactionStatus");

let openTrigger = null;

function setReactionStatus(message, kind) {
  reactionStatus.textContent = message;
  reactionStatus.className = "status" + (kind ? " " + kind : "");
}

function wordLabel(count) {
  return count + " mot" + (count > 1 ? "s" : "");
}

function buildDetailBody(reaction) {
  const body = document.createElement("div");
  body.className = "reaction-row-body";

  const responseLabel = document.createElement("p");
  responseLabel.className = "reaction-detail-label";
  responseLabel.textContent = "Réponse du bot";

  const bigResponse = document.createElement("div");
  bigResponse.className = "reaction-response-big";
  bigResponse.textContent = reaction.response;

  const responseRow = document.createElement("div");
  responseRow.className = "add-row";

  const responseInput = document.createElement("input");
  responseInput.type = "text";
  responseInput.maxLength = 200;
  responseInput.placeholder = "Nouvelle réponse…";

  const changeBtn = document.createElement("button");
  changeBtn.type = "button";
  changeBtn.className = "pill secondary";
  changeBtn.textContent = "Changer la réponse";
  changeBtn.addEventListener("click", async () => {
    const value = responseInput.value.trim();

    if (!value) {
      setReactionStatus("Écris d'abord la nouvelle réponse.", "bad");
      return;
    }

    reaction.response = value;
    await saveReaction(reaction);
  });
  responseInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      changeBtn.click();
    }
  });

  responseRow.appendChild(responseInput);
  responseRow.appendChild(changeBtn);

  const wordsLabel = document.createElement("p");
  wordsLabel.className = "sub";
  wordsLabel.textContent = "Mots qui déclenchent cette réponse (le mot « " + reaction.trigger + " » lui-même compte toujours) :";

  const chips = document.createElement("div");
  chips.className = "chips";

  if (reaction.variants.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Aucun mot en plus pour l'instant — ajoutes-en ci-dessous.";
    chips.appendChild(empty);
  } else {
    reaction.variants.forEach((variant, index) => {
      const chip = document.createElement("div");
      chip.className = "chip";

      const label = document.createElement("span");
      label.textContent = variant;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.title = "Supprimer ce mot";
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        reaction.variants.splice(index, 1);
        saveReaction(reaction);
      });

      chip.appendChild(label);
      chip.appendChild(remove);
      chips.appendChild(chip);
    });
  }

  const addRow = document.createElement("div");
  addRow.className = "add-row";

  const variantInput = document.createElement("input");
  variantInput.type = "text";
  variantInput.maxLength = 60;
  variantInput.placeholder = "Ajouter un mot (ex. : koi, oué…)";

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "pill primary";
  addBtn.textContent = "Ajouter";
  addBtn.addEventListener("click", () => {
    const value = variantInput.value.trim().toLowerCase();

    if (!value) {
      return;
    }

    if (value === reaction.trigger || reaction.variants.includes(value)) {
      setReactionStatus("Ce mot est déjà dans la liste.", "bad");
      return;
    }

    reaction.variants.push(value);
    saveReaction(reaction);
  });
  variantInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      addBtn.click();
    }
  });

  addRow.appendChild(variantInput);
  addRow.appendChild(addBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "pill secondary small danger";
  deleteBtn.textContent = "Supprimer cette réaction";
  deleteBtn.addEventListener("click", async () => {
    if (!confirm("Supprimer la réaction « " + reaction.trigger + " » ?")) {
      return;
    }

    try {
      const res = await apiFetch("/api/reactions/" + encodeURIComponent(reaction.trigger), { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erreur");
      }

      state.reactions = state.reactions.filter((entry) => entry.trigger !== reaction.trigger);
      if (openTrigger === reaction.trigger) {
        openTrigger = null;
      }
      renderReactionList();
      setReactionStatus("Réaction supprimée.", "ok");
    } catch (error) {
      setReactionStatus(error.message, "bad");
    }
  });

  body.appendChild(responseLabel);
  body.appendChild(bigResponse);
  body.appendChild(responseRow);
  body.appendChild(wordsLabel);
  body.appendChild(chips);
  body.appendChild(addRow);
  body.appendChild(deleteBtn);
  return body;
}

function renderReactionList() {
  reactionList.innerHTML = "";
  reactionCount.textContent = String(state.reactions.length);

  if (state.reactions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Aucune réaction pour le moment — crées-en une ci-dessus.";
    reactionList.appendChild(empty);
    return;
  }

  state.reactions.forEach((reaction) => {
    const isOpen = reaction.trigger === openTrigger;
    const row = document.createElement("div");
    row.className = "reaction-row" + (isOpen ? " open" : "");

    const head = document.createElement("div");
    head.className = "reaction-row-head";
    head.title = isOpen ? "Replier" : "Déplier pour gérer les mots et la réponse";
    head.addEventListener("click", () => {
      openTrigger = isOpen ? null : reaction.trigger;
      renderReactionList();
    });

    const info = document.createElement("div");
    info.className = "reaction-row-info";

    const trigger = document.createElement("div");
    trigger.className = "reaction-row-trigger";
    trigger.textContent = reaction.trigger;

    const response = document.createElement("div");
    response.className = "reaction-row-response";
    response.textContent = "→ " + reaction.response;

    const meta = document.createElement("div");
    meta.className = "reaction-row-meta";
    const wordCount = reaction.variants.length + 1;
    meta.textContent = wordLabel(wordCount) + " déclencheur" + (wordCount > 1 ? "s" : "") + " · " + (reaction.count ?? 0) + " réponse" + ((reaction.count ?? 0) > 1 ? "s" : "");

    info.appendChild(trigger);
    info.appendChild(response);
    info.appendChild(meta);

    const chevron = document.createElement("div");
    chevron.className = "reaction-row-chevron";
    chevron.textContent = "▾";

    head.appendChild(info);
    head.appendChild(chevron);
    row.appendChild(head);

    if (isOpen) {
      row.appendChild(buildDetailBody(reaction));
    }

    reactionList.appendChild(row);
  });
}

async function saveReaction(reaction) {
  try {
    const response = await apiFetch("/api/reactions/" + encodeURIComponent(reaction.trigger), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: reaction.response, variants: reaction.variants })
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Impossible d'enregistrer.");
    }

    const index = state.reactions.findIndex((entry) => entry.trigger === reaction.trigger);
    state.reactions[index] = result.reaction;
    renderReactionList();
    setReactionStatus("Réaction enregistrée.", "ok");
  } catch (error) {
    setReactionStatus(error.message, "bad");
  }
}

reactionCreateForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const trigger = newTriggerInput.value.trim().toLowerCase();
  const response = newResponseInput.value.trim();

  if (!trigger || !response) {
    setReactionStatus("Renseigne le mot déclencheur et la réponse.", "bad");
    return;
  }

  try {
    const res = await apiFetch("/api/reactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger, response })
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Erreur");
    }

    state.reactions.push(data.reaction);
    newTriggerInput.value = "";
    newResponseInput.value = "";
    openTrigger = data.reaction.trigger;
    renderReactionList();
    setReactionStatus("Réaction « " + data.reaction.trigger + " » créée.", "ok");
  } catch (error) {
    setReactionStatus(error.message, "bad");
  }
});

// ---- Onglet « status » ----
const statusList = document.getElementById("statusList");
const statusCount = document.getElementById("statusCount");
const addStatusBtn = document.getElementById("addStatusBtn");
const saveStatusBtn = document.getElementById("saveStatusBtn");
const statusMessage = document.getElementById("statusMessage");

function setStatusMessage(message, kind) {
  statusMessage.textContent = message;
  statusMessage.className = "status" + (kind ? " " + kind : "");
}

function renderStatusRows() {
  statusList.innerHTML = "";
  statusCount.textContent = String(state.statuses.length);

  state.statuses.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "status-row";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.maxLength = 120;
    nameInput.placeholder = "Texte de l'activité";
    nameInput.value = entry.activityName;
    nameInput.addEventListener("input", () => {
      state.statuses[index].activityName = nameInput.value;
    });

    const typeSelect = document.createElement("select");
    ACTIVITY_TYPES.forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      if (entry.activityType === value) {
        option.selected = true;
      }
      typeSelect.appendChild(option);
    });
    typeSelect.addEventListener("change", () => {
      state.statuses[index].activityType = typeSelect.value;
    });

    const presenceSelect = document.createElement("select");
    PRESENCE_TYPES.forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      if (entry.presenceStatus === value) {
        option.selected = true;
      }
      presenceSelect.appendChild(option);
    });
    presenceSelect.addEventListener("change", () => {
      state.statuses[index].presenceStatus = presenceSelect.value;
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "icon-btn";
    removeBtn.title = "Supprimer ce statut";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => {
      state.statuses.splice(index, 1);
      renderStatusRows();
    });

    row.appendChild(nameInput);
    row.appendChild(typeSelect);
    row.appendChild(presenceSelect);
    row.appendChild(removeBtn);
    statusList.appendChild(row);
  });
}

function addStatusRow() {
  state.statuses.push({ activityName: "", activityType: "playing", presenceStatus: "online" });
  renderStatusRows();
  const rows = statusList.querySelectorAll(".status-row");
  if (rows.length > 0) {
    rows[rows.length - 1].querySelector("input").focus();
  }
}

async function saveStatuses() {
  try {
    const response = await apiFetch("/api/bot-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statuses: state.statuses })
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Impossible d'enregistrer le statut.");
    }

    state.statuses = result.statuses;
    renderStatusRows();
    setStatusMessage("Statuts enregistrés.", "ok");
  } catch (error) {
    setStatusMessage(error.message, "bad");
  }
}

addStatusBtn.addEventListener("click", addStatusRow);
saveStatusBtn.addEventListener("click", saveStatuses);

// ---- Onglet « compte » ----
const userList = document.getElementById("userList");
const userForm = document.getElementById("userForm");
const userStatus = document.getElementById("userStatus");
const compteTab = document.getElementById("compteTab");
const compteSub = document.getElementById("compteSub");

function setUserStatus(message, kind) {
  userStatus.textContent = message;
  userStatus.className = "status" + (kind ? " " + kind : "");
}

async function loadUsers() {
  try {
    const response = await apiFetch("/api/users");

    if (response.status === 403) {
      compteTab.style.display = "none";
      return;
    }

    const result = await response.json();
    const currentIsAdmin = result.users.find((user) => user.username === result.currentUser)?.isAdmin ?? false;

    compteTab.style.display = "";
    compteSub.textContent = currentIsAdmin
      ? "Crée ou supprime des comptes pour les personnes qui gèrent le bot."
      : "Change ton mot de passe ici. Seul un administrateur peut gérer les autres comptes.";
    userForm.style.display = currentIsAdmin ? "grid" : "none";
    userList.innerHTML = "";

    const visibleUsers = currentIsAdmin
      ? result.users
      : result.users.filter((user) => user.username === result.currentUser);

    visibleUsers.forEach((user) => {
      const row = document.createElement("div");
      row.className = "user-row";

      const nameWrap = document.createElement("div");
      const name = document.createElement("span");
      name.className = "user-row-name";
      name.textContent = user.username + (user.username === result.currentUser ? " (toi)" : "");
      const role = document.createElement("span");
      role.className = "user-row-role" + (user.isAdmin ? " admin" : "");
      role.textContent = user.isAdmin ? "admin" : "membre";
      nameWrap.appendChild(name);
      nameWrap.appendChild(role);

      const actions = document.createElement("div");
      actions.className = "user-actions";

      const changeBtn = document.createElement("button");
      changeBtn.type = "button";
      changeBtn.className = "pill secondary small";
      changeBtn.textContent = "Changer le mdp";
      changeBtn.addEventListener("click", async () => {
        const password = prompt("Nouveau mot de passe pour " + user.username + " (min. 8 caractères) :");
        if (!password) {
          return;
        }

        try {
          const res = await apiFetch("/api/users/" + encodeURIComponent(user.username) + "/password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password })
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || "Erreur");
          }
          setUserStatus("Mot de passe modifié.", "ok");
        } catch (error) {
          setUserStatus(error.message, "bad");
        }
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "pill secondary small danger";
      deleteBtn.textContent = "Supprimer";

      if (user.username === result.currentUser) {
        deleteBtn.disabled = true;
        deleteBtn.title = "Tu ne peux pas supprimer ton propre compte";
      } else {
        deleteBtn.addEventListener("click", async () => {
          if (!confirm("Supprimer l'utilisateur " + user.username + " ?")) {
            return;
          }

          try {
            const res = await apiFetch("/api/users/" + encodeURIComponent(user.username), { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) {
              throw new Error(data.error || "Erreur");
            }
            setUserStatus("Utilisateur supprimé.", "ok");
            loadUsers();
          } catch (error) {
            setUserStatus(error.message, "bad");
          }
        });
      }

      actions.appendChild(changeBtn);
      actions.appendChild(deleteBtn);
      row.appendChild(nameWrap);
      row.appendChild(actions);
      userList.appendChild(row);
    });
  } catch (error) {
    setUserStatus(error.message, "bad");
  }
}

userForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const response = await apiFetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: document.getElementById("newUsername").value.trim(),
        password: document.getElementById("newPassword").value
      })
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Erreur");
    }

    document.getElementById("newUsername").value = "";
    document.getElementById("newPassword").value = "";
    setUserStatus("Utilisateur " + result.user.username + " créé.", "ok");
    loadUsers();
  } catch (error) {
    setUserStatus(error.message, "bad");
  }
});

// ---- Onglet « perso » ----
const avatarInput = document.getElementById("avatarInput");
const avatarPreview = document.getElementById("avatarPreview");
const saveAvatarBtn = document.getElementById("saveAvatarBtn");
const currentName = document.getElementById("currentName");
const botNameInput = document.getElementById("botNameInput");
const saveNameBtn = document.getElementById("saveNameBtn");
const botPrefixInput = document.getElementById("botPrefixInput");
const savePrefixBtn = document.getElementById("savePrefixBtn");
const persoStatus = document.getElementById("persoStatus");
const championRoleToggle = document.getElementById("championRoleToggle");
const championRoleLabel = document.getElementById("championRoleLabel");
const championRoleNote = document.getElementById("championRoleNote");
const roleGuildList = document.getElementById("roleGuildList");
const roleServerCount = document.getElementById("roleServerCount");
const roleSub = document.getElementById("roleSub");
const roleStatus = document.getElementById("roleStatus");
let selectedAvatar = null;

function setRoleStatus(message, kind) {
  roleStatus.textContent = message;
  roleStatus.className = "status" + (kind ? " " + kind : "");
}

// Système « Déclencheur du Jour » : toggle global (perso, admin) + par serveur (onglet rôle).
async function loadChampionRole() {
  try {
    const response = await apiFetch("/api/champion-role");
    const data = await response.json();

    // Toggle global dans l'onglet perso (réservé à l'admin).
    if (!data.isAdmin) {
      championRoleToggle.closest(".perso-row").style.display = "none";
    } else {
      championRoleToggle.closest(".perso-row").style.display = "";
      championRoleToggle.checked = data.enabled;
      championRoleLabel.textContent = data.enabled ? "Activé (tous les serveurs)" : "Désactivé partout";
      championRoleNote.textContent = data.enabled
        ? "Le rôle suit en direct le plus gros déclencheur du jour. Tu peux aussi l'activer/désactiver serveur par serveur dans l'onglet « 👑 rôle »."
        : "Système coupé partout : aucun rôle n'est créé ni attribué. Réactiver recrée le rôle sur tous les serveurs (sauf ceux désactivés individuellement).";
    }

    renderRoleServers(data);
  } catch (error) {
    // apiFetch redirige déjà en cas de session expirée.
  }
}

championRoleToggle.addEventListener("change", async () => {
  const enabled = championRoleToggle.checked;

  try {
    const response = await apiFetch("/api/champion-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Impossible de modifier le réglage.");
    }

    championRoleToggle.checked = data.enabled;
    championRoleLabel.textContent = data.enabled ? "Activé (tous les serveurs)" : "Désactivé partout";
    championRoleNote.textContent = data.enabled
      ? "Le rôle suit en direct le plus gros déclencheur du jour. Tu peux aussi l'activer/désactiver serveur par serveur dans l'onglet « 👑 rôle »."
      : "Système coupé partout : aucun rôle n'est créé ni attribué. Réactiver recrée le rôle sur tous les serveurs (sauf ceux désactivés individuellement).";
    setPersoStatus(data.enabled ? "Système « Déclencheur du Jour » activé." : "Système « Déclencheur du Jour » désactivé partout.", "ok");
    loadChampionRole();
  } catch (error) {
    championRoleToggle.checked = !enabled;
    setPersoStatus(error.message, "bad");
  }
});

// Onglet « 👑 rôle » : liste des serveurs visibles avec un switch chacun.
function renderRoleServers(data) {
  roleGuildList.innerHTML = "";
  roleServerCount.textContent = data.servers.length + " serveur" + (data.servers.length > 1 ? "s" : "");

  if (!data.isAdmin) {
    roleSub.innerHTML = data.linked
      ? "Active ou désactive le rôle sur <strong>tes serveurs</strong> (ceux où tu es et où le bot est présent)."
      : "Connecte ton compte Discord (bouton en haut) pour voir <strong>tes serveurs</strong> et pouvoir y activer ou désactiver le rôle.";
  } else {
    roleSub.innerHTML = "Active ou désactive le rôle par serveur. Le rôle suit en direct le plus gros déclencheur du jour et change de main si quelqu'un dépasse.";
  }

  if (data.servers.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";

    if (data.isAdmin) {
      empty.textContent = "Le bot n'est sur aucun serveur pour le moment.";
    } else if (!data.linked) {
      empty.textContent = "Connecte ton compte Discord pour voir tes serveurs.";
    } else {
      empty.textContent = "Tu n'es membre d'aucun serveur où le bot est présent.";
    }

    roleGuildList.appendChild(empty);
    return;
  }

  data.servers.forEach((server) => {
    const row = document.createElement("div");
    row.className = "guild-row";

    const info = document.createElement("div");
    const name = document.createElement("span");
    name.className = "guild-row-name";
    name.textContent = server.name;
    const meta = document.createElement("span");
    meta.className = "guild-row-meta";
    meta.textContent = server.memberCount + " membres";
    info.appendChild(name);
    info.appendChild(meta);

    const label = document.createElement("label");
    label.className = "switch";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = server.enabled;
    const slider = document.createElement("span");
    slider.className = "switch-slider";
    const text = document.createElement("span");
    text.className = "switch-text";
    text.textContent = server.enabled ? "Activé" : "Désactivé";
    label.appendChild(input);
    label.appendChild(slider);
    label.appendChild(text);

    input.addEventListener("change", async () => {
      const enabled = input.checked;
      input.disabled = true;

      try {
        const response = await apiFetch("/api/champion-role", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guildId: server.id, enabled })
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Impossible de modifier le réglage.");
        }

        text.textContent = result.enabled ? "Activé" : "Désactivé";
        setRoleStatus(result.enabled ? "Rôle activé sur « " + server.name + " »." : "Rôle désactivé sur « " + server.name + " » (rôle retiré).", "ok");
        loadChampionRole();
      } catch (error) {
        input.checked = !enabled;
        setRoleStatus(error.message, "bad");
      } finally {
        input.disabled = false;
      }
    });

    row.appendChild(info);
    row.appendChild(label);
    roleGuildList.appendChild(row);
  });
}

function setPersoStatus(message, kind) {
  persoStatus.textContent = message;
  persoStatus.className = "status" + (kind ? " " + kind : "");
}

async function loadBotInfo() {
  try {
    const response = await apiFetch("/api/bot-info");
    const data = await response.json();

    if (data.username) {
      document.getElementById("botNameTitle").textContent = data.username;
      document.title = data.username + " - Gestion";
    }

    if (data.avatarURL) {
      const img = new Image();
      img.onload = () => {
        document.getElementById("botAvatar").src = data.avatarURL;
        document.getElementById("botAvatar").classList.add("visible");
      };
      img.src = data.avatarURL;
    }

    currentName.textContent = data.username ?? "bot hors ligne";
    botNameInput.placeholder = data.username ?? "Nouveau pseudo";
    botPrefixInput.value = data.prefix ?? "!";
  } catch (error) {
    setPersoStatus(error.message, "bad");
  }
}

avatarInput.addEventListener("change", () => {
  const file = avatarInput.files && avatarInput.files[0];
  if (!file) {
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    setPersoStatus("Image trop lourde (5 Mo maximum).", "bad");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    selectedAvatar = reader.result;
    avatarPreview.src = selectedAvatar;
    avatarPreview.classList.add("visible");
    setPersoStatus("Image sélectionnée. Clique sur « Changer la pdp ».", "ok");
  };
  reader.readAsDataURL(file);
});

saveAvatarBtn.addEventListener("click", async () => {
  if (!selectedAvatar) {
    setPersoStatus("Choisis d'abord une image.", "bad");
    return;
  }

  try {
    const response = await apiFetch("/api/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: selectedAvatar })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Erreur");
    }

    setPersoStatus("Photo de profil changée !", "ok");
    selectedAvatar = null;
    loadBotInfo();
  } catch (error) {
    setPersoStatus(error.message, "bad");
  }
});

saveNameBtn.addEventListener("click", async () => {
  try {
    const response = await apiFetch("/api/bot-name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: botNameInput.value })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Erreur");
    }

    setPersoStatus("Pseudo changé !", "ok");
    loadBotInfo();
  } catch (error) {
    setPersoStatus(error.message, "bad");
  }
});

savePrefixBtn.addEventListener("click", async () => {
  try {
    const response = await apiFetch("/api/bot-prefix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: botPrefixInput.value })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Erreur");
    }

    setPersoStatus("Préfixe changé ! La commande est maintenant " + data.prefix + "stats", "ok");
    loadBotInfo();
  } catch (error) {
    setPersoStatus(error.message, "bad");
  }
});

// ---- Onglet « reports » ----
const reportList = document.getElementById("reportList");
const reportCount = document.getElementById("reportCount");
const reportSub = document.getElementById("reportSub");
const reportStatus = document.getElementById("reportStatus");

function setReportStatus(message, kind) {
  reportStatus.textContent = message;
  reportStatus.className = "status" + (kind ? " " + kind : "");
}

function reportDate(timestamp) {
  return new Date(timestamp).toLocaleString("fr-FR");
}

async function loadReports() {
  try {
    const response = await apiFetch("/api/reports");
    const data = await response.json();

    reportCount.textContent = String(data.reports.length);
    reportSub.innerHTML = data.isAdmin
      ? "Les problèmes signalés via la commande <code>[préfixe]report</code> sur Discord arrivent ici (tous les serveurs)."
      : data.linked
        ? "Les problèmes signalés sur <strong>tes serveurs</strong> (via la commande <code>[préfixe]report</code>) arrivent ici."
        : "Connecte ton compte Discord (bouton en haut) pour voir les reports de tes serveurs.";

    reportList.innerHTML = "";

    if (data.reports.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = data.linked
        ? "Aucun report pour le moment."
        : "Connecte ton compte Discord pour voir les reports de tes serveurs.";
      reportList.appendChild(empty);
      return;
    }

    data.reports.forEach((report) => {
      const row = document.createElement("div");
      row.className = "report-row" + (report.resolved ? " resolved" : "");

      const head = document.createElement("div");
      head.className = "report-row-head";

      const info = document.createElement("div");
      info.className = "report-row-info";

      const title = document.createElement("div");
      title.className = "report-row-title";
      title.textContent = (report.resolved ? "✅ Résolu · " : "🛠️ ") + (report.guildName || "Serveur inconnu");

      const meta = document.createElement("div");
      meta.className = "report-row-meta";
      meta.textContent = report.authorName + " · " + reportDate(report.createdAt) + (report.channelName ? " · #" + report.channelName : "");

      info.appendChild(title);
      info.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "report-actions";

      const resolveBtn = document.createElement("button");
      resolveBtn.type = "button";
      resolveBtn.className = "pill secondary small";
      resolveBtn.textContent = report.resolved ? "Rouvrir" : "Résolu";
      resolveBtn.addEventListener("click", async () => {
        try {
          const res = await apiFetch("/api/reports/" + encodeURIComponent(report.id), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resolved: !report.resolved })
          });
          const result = await res.json();
          if (!res.ok) {
            throw new Error(result.error || "Erreur");
          }
          setReportStatus(report.resolved ? "Report rouvert." : "Report marqué résolu.", "ok");
          loadReports();
        } catch (error) {
          setReportStatus(error.message, "bad");
        }
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "pill secondary small danger";
      deleteBtn.textContent = "Supprimer";
      deleteBtn.addEventListener("click", async () => {
        if (!confirm("Supprimer ce report ?")) {
          return;
        }

        try {
          const res = await apiFetch("/api/reports/" + encodeURIComponent(report.id), { method: "DELETE" });
          const result = await res.json();
          if (!res.ok) {
            throw new Error(result.error || "Erreur");
          }
          setReportStatus("Report supprimé.", "ok");
          loadReports();
        } catch (error) {
          setReportStatus(error.message, "bad");
        }
      });

      actions.appendChild(resolveBtn);
      actions.appendChild(deleteBtn);
      head.appendChild(info);
      head.appendChild(actions);
      row.appendChild(head);

      const content = document.createElement("div");
      content.className = "report-row-content";
      content.textContent = report.content;
      row.appendChild(content);

      reportList.appendChild(row);
    });
  } catch (error) {
    setReportStatus(error.message, "bad");
  }
}

// ---- Onglet « logs » (admin) ----
const logTableWrap = document.getElementById("logTableWrap");
const logCount = document.getElementById("logCount");
const logsTab = document.getElementById("logsTab");

async function loadLogs() {
  try {
    const response = await apiFetch("/api/logs");

    if (response.status === 403) {
      logsTab.style.display = "none";

      if (document.querySelector(".tab.active")?.dataset.tab === "logs") {
        window.location.hash = "reactions";
      }
      return;
    }

    const data = await response.json();
    logCount.textContent = String(data.logs.length);
    logTableWrap.innerHTML = "";

    if (data.logs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Aucune action enregistrée pour le moment.";
      logTableWrap.appendChild(empty);
      return;
    }

    const table = document.createElement("table");
    table.className = "logs-table";
    const thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Détails</th></tr>";
    const tbody = document.createElement("tbody");

    data.logs.forEach((log) => {
      const row = document.createElement("tr");

      const timeCell = document.createElement("td");
      timeCell.className = "log-time";
      timeCell.textContent = new Date(log.timestamp).toLocaleString("fr-FR");

      const userCell = document.createElement("td");
      userCell.className = "log-user";
      userCell.textContent = log.username;

      const actionCell = document.createElement("td");
      actionCell.className = "log-action";
      actionCell.textContent = log.action;

      const detailsCell = document.createElement("td");
      detailsCell.className = "log-details";
      detailsCell.textContent = log.details;

      row.appendChild(timeCell);
      row.appendChild(userCell);
      row.appendChild(actionCell);
      row.appendChild(detailsCell);
      tbody.appendChild(row);
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    logTableWrap.appendChild(table);
  } catch (error) {
    // apiFetch redirige déjà vers le login en cas de session expirée.
  }
}

setInterval(loadLogs, 10000);

// ---- Onglet « broadcast » ----
const broadcastTab = document.getElementById("broadcastTab");
const broadcastGuildCount = document.getElementById("broadcastGuildCount");
const broadcastSub = document.getElementById("broadcastSub");
const guildList = document.getElementById("guildList");
const embedPreview = document.getElementById("embedPreview");
const broadcastStatus = document.getElementById("broadcastStatus");
const fieldList = document.getElementById("fieldList");
const buttonList = document.getElementById("buttonList");
const addFieldBtn = document.getElementById("addFieldBtn");
const addButtonBtn = document.getElementById("addButtonBtn");
const clearBroadcastBtn = document.getElementById("clearBroadcastBtn");
const sendBroadcastBtn = document.getElementById("sendBroadcastBtn");
const bcTarget = document.getElementById("bcTarget");

const BC_STYLES = [
  ["primary", "Primaire"],
  ["success", "Succès"],
  ["danger", "Danger"],
  ["secondary", "Secondaire"],
  ["link", "Lien (URL)"]
];

const broadcast = { fields: [], buttons: [], guilds: [] };

function setBroadcastStatus(message, kind) {
  broadcastStatus.textContent = message;
  broadcastStatus.className = "status" + (kind ? " " + kind : "");
}

function broadcastSpec() {
  return {
    title: document.getElementById("bcTitle").value,
    color: document.getElementById("bcColor").value,
    authorName: document.getElementById("bcAuthor").value,
    description: document.getElementById("bcDesc").value,
    image: document.getElementById("bcImage").value,
    thumbnail: document.getElementById("bcThumb").value,
    footer: document.getElementById("bcFooter").value,
    fields: broadcast.fields,
    buttons: broadcast.buttons
  };
}

function renderBroadcastPreview() {
  embedPreview.innerHTML = "";
  const spec = broadcastSpec();

  const preview = document.createElement("div");
  preview.className = "discord-embed";

  const border = document.createElement("div");
  border.className = "discord-embed-border";
  border.style.background = spec.color || "#38bdf8";

  const body = document.createElement("div");
  body.className = "discord-embed-body";

  if (spec.authorName.trim()) {
    const author = document.createElement("div");
    author.className = "discord-embed-author";
    author.textContent = spec.authorName.trim();
    body.appendChild(author);
  }

  if (spec.title.trim()) {
    const title = document.createElement("div");
    title.className = "discord-embed-title";
    title.textContent = spec.title.trim();
    body.appendChild(title);
  }

  if (spec.description.trim()) {
    const desc = document.createElement("div");
    desc.className = "discord-embed-desc";
    desc.textContent = spec.description.trim();
    body.appendChild(desc);
  }

  const inlineFields = broadcast.fields.filter((field) => field.inline && field.name && field.value);
  const blockFields = broadcast.fields.filter((field) => !field.inline && field.name && field.value);

  if (inlineFields.length > 0) {
    const grid = document.createElement("div");
    grid.className = "discord-embed-fields";
    inlineFields.forEach((field) => {
      const wrap = document.createElement("div");
      const name = document.createElement("div");
      name.className = "discord-embed-field-name";
      name.textContent = field.name;
      const value = document.createElement("div");
      value.className = "discord-embed-field-value";
      value.textContent = field.value;
      wrap.appendChild(name);
      wrap.appendChild(value);
      grid.appendChild(wrap);
    });
    body.appendChild(grid);
  }

  blockFields.forEach((field) => {
    const name = document.createElement("div");
    name.className = "discord-embed-field-name";
    name.textContent = field.name;
    const value = document.createElement("div");
    value.className = "discord-embed-field-value";
    value.textContent = field.value;
    body.appendChild(name);
    body.appendChild(value);
  });

  if (spec.thumbnail.trim()) {
    const thumb = document.createElement("img");
    thumb.className = "discord-embed-thumb";
    thumb.src = spec.thumbnail.trim();
    thumb.alt = "";
    body.appendChild(thumb);
  }

  if (spec.image.trim()) {
    const image = document.createElement("img");
    image.className = "discord-embed-image";
    image.src = spec.image.trim();
    image.alt = "";
    body.appendChild(image);
  }

  if (spec.footer.trim()) {
    const footer = document.createElement("div");
    footer.className = "discord-embed-footer";
    footer.textContent = spec.footer.trim();
    body.appendChild(footer);
  }

  preview.appendChild(border);
  preview.appendChild(body);
  embedPreview.appendChild(preview);

  const buttonsWrap = document.createElement("div");
  buttonsWrap.className = "discord-embed-buttons";
  broadcast.buttons.forEach((button) => {
    if (!button.label.trim()) {
      return;
    }
    const btn = document.createElement("div");
    btn.className = "discord-button" + (button.style === "link" ? " link" : " " + (button.style || "primary"));
    btn.textContent = button.label.trim();
    buttonsWrap.appendChild(btn);
  });
  if (buttonsWrap.children.length > 0) {
    embedPreview.appendChild(buttonsWrap);
  }
}

function renderFieldEditors() {
  fieldList.innerHTML = "";

  if (broadcast.fields.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Aucun champ.";
    fieldList.appendChild(empty);
    return;
  }

  broadcast.fields.forEach((field, index) => {
    const row = document.createElement("div");
    row.className = "bc-row";

    const name = document.createElement("input");
    name.type = "text";
    name.maxLength = 256;
    name.placeholder = "Nom";
    name.value = field.name;
    name.addEventListener("input", () => {
      field.name = name.value;
      renderBroadcastPreview();
    });

    const value = document.createElement("input");
    value.type = "text";
    value.maxLength = 1024;
    value.placeholder = "Valeur";
    value.value = field.value;
    value.addEventListener("input", () => {
      field.value = value.value;
      renderBroadcastPreview();
    });

    const inlineWrap = document.createElement("label");
    inlineWrap.className = "bc-inline";
    const inline = document.createElement("input");
    inline.type = "checkbox";
    inline.checked = Boolean(field.inline);
    inline.addEventListener("change", () => {
      field.inline = inline.checked;
      renderBroadcastPreview();
    });
    inlineWrap.appendChild(inline);
    inlineWrap.appendChild(document.createTextNode("Inline"));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-btn";
    remove.title = "Supprimer ce champ";
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      broadcast.fields.splice(index, 1);
      renderFieldEditors();
      renderBroadcastPreview();
    });

    row.appendChild(name);
    row.appendChild(value);
    row.appendChild(inlineWrap);
    row.appendChild(remove);
    fieldList.appendChild(row);
  });
}

function renderButtonEditors() {
  buttonList.innerHTML = "";

  if (broadcast.buttons.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Aucun bouton.";
    buttonList.appendChild(empty);
    return;
  }

  broadcast.buttons.forEach((button, index) => {
    const row = document.createElement("div");
    row.className = "bc-row";

    const label = document.createElement("input");
    label.type = "text";
    label.maxLength = 80;
    label.placeholder = "Texte du bouton";
    label.value = button.label;
    label.addEventListener("input", () => {
      button.label = label.value;
      renderBroadcastPreview();
    });

    const style = document.createElement("select");
    BC_STYLES.forEach(([value, text]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      if (button.style === value) {
        option.selected = true;
      }
      style.appendChild(option);
    });
    style.addEventListener("change", () => {
      button.style = style.value;
      renderBroadcastPreview();
    });

    const url = document.createElement("input");
    url.type = "text";
    url.maxLength = 200;
    url.placeholder = "URL (style lien)";
    url.value = button.url || "";
    url.addEventListener("input", () => {
      button.url = url.value;
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-btn";
    remove.title = "Supprimer ce bouton";
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      broadcast.buttons.splice(index, 1);
      renderButtonEditors();
      renderBroadcastPreview();
    });

    row.appendChild(label);
    row.appendChild(style);
    row.appendChild(url);
    row.appendChild(remove);
    buttonList.appendChild(row);
  });
}

addFieldBtn.addEventListener("click", () => {
  broadcast.fields.push({ name: "", value: "", inline: false });
  renderFieldEditors();
});

addButtonBtn.addEventListener("click", () => {
  broadcast.buttons.push({ label: "", style: "primary", url: "" });
  renderButtonEditors();
});

clearBroadcastBtn.addEventListener("click", () => {
  if (!confirm("Tout effacer (champs, boutons et aperçu) ?")) {
    return;
  }

  ["bcTitle", "bcAuthor", "bcDesc", "bcImage", "bcThumb", "bcFooter"].forEach((id) => {
    document.getElementById(id).value = "";
  });
  broadcast.fields = [];
  broadcast.buttons = [];
  renderFieldEditors();
  renderButtonEditors();
  renderBroadcastPreview();
  setBroadcastStatus("Formulaire vidé.", "ok");
});

sendBroadcastBtn.addEventListener("click", async () => {
  const spec = broadcastSpec();
  const target = bcTarget.value;
  spec.guildId = target === "all" ? null : target;

  if (!spec.title.trim() && !spec.description.trim() && !spec.image.trim() && !spec.authorName.trim()) {
    setBroadcastStatus("Renseigne au moins un titre, une description ou une image.", "bad");
    return;
  }

  if (broadcast.guilds.length === 0) {
    setBroadcastStatus("Le bot n'est sur aucun serveur — rien à envoyer.", "bad");
    return;
  }

  const targetGuild = broadcast.guilds.find((guild) => guild.id === target);
  const targetLabel = targetGuild
    ? "le serveur « " + targetGuild.name + " »"
    : broadcast.guilds.length + " serveur(s)";

  if (!confirm("Envoyer cet embed sur " + targetLabel + " ? L'envoi est immédiat.")) {
    return;
  }

  try {
    const res = await apiFetch("/api/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(spec)
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Erreur");
    }

    const failures = data.results.filter((result) => !result.ok);
    const message = "Envoyé sur " + data.sent + "/" + data.total + " serveur(s)."
      + (failures.length > 0
        ? " Échecs : " + failures.map((f) => f.guild + " (" + f.reason + ")").join(", ")
        : "");
    setBroadcastStatus(message, failures.length === 0 ? "ok" : "bad");
  } catch (error) {
    setBroadcastStatus(error.message, "bad");
  }
});

let guildRetryCount = 0;

async function loadGuilds() {
  try {
    const response = await apiFetch("/api/guilds");

    if (response.status === 403) {
      broadcastTab.style.display = "none";
      return;
    }

    const data = await response.json();
    broadcast.guilds = data.guilds;
    const count = broadcast.guilds.length;
    broadcastGuildCount.textContent = count + " serveur" + (count > 1 ? "s" : "");
    guildList.innerHTML = "";

    // Comptes non-admin : on rappelle qu'ils ne voient que leurs serveurs.
    if (!data.isAdmin) {
      broadcastSub.innerHTML = data.linked
        ? "Construis un embed et envoie-le sur <strong>tes serveurs</strong> (ceux où tu es, via ton compte Discord). Il atterrit dans le salon système, sinon un salon « general », sinon le premier salon où le bot peut écrire."
        : "Connecte ton compte Discord (bouton en haut) pour voir <strong>tes serveurs</strong> et pouvoir envoyer un broadcast dessus.";
    } else {
      broadcastSub.innerHTML = "Construis un embed (avec boutons si tu veux) et envoie-le sur <strong>tous les serveurs</strong> où le bot est présent. Il atterrit dans le salon système, sinon un salon « general », sinon le premier salon où le bot peut écrire.";
    }

    // Remplit le sélecteur de cible (par défaut : tous les serveurs visibles).
    bcTarget.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = data.isAdmin ? "🌍 Tous les serveurs" : "🌍 Tous mes serveurs";
    bcTarget.appendChild(allOption);
    broadcast.guilds.forEach((guild) => {
      const option = document.createElement("option");
      option.value = guild.id;
      option.textContent = guild.name + " (" + guild.memberCount + " membres)";
      bcTarget.appendChild(option);
    });

    if (count === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";

      if (data.isAdmin) {
        empty.textContent = "Le bot n'est sur aucun serveur pour le moment.";
      } else if (!data.linked) {
        empty.textContent = "Connecte ton compte Discord pour voir tes serveurs.";
      } else {
        empty.textContent = "Tu n'es membre d'aucun serveur où le bot est présent.";
      }

      guildList.appendChild(empty);

      // Le bot peut encore être en train de se connecter : on réessaie quelques fois (admin).
      if (data.isAdmin && guildRetryCount < 6) {
        guildRetryCount += 1;
        setTimeout(loadGuilds, 5000);
      }
      return;
    }

    guildRetryCount = 0;

    const title = document.createElement("div");
    title.className = "guild-list-title";
    title.textContent = "Recevront le message :";
    guildList.appendChild(title);

    broadcast.guilds.slice(0, 30).forEach((guild) => {
      const row = document.createElement("div");
      row.className = "guild-row";

      const name = document.createElement("span");
      name.className = "guild-row-name";
      name.textContent = guild.name;

      const meta = document.createElement("span");
      meta.className = "guild-row-meta";
      meta.textContent = guild.memberCount + " membres";

      row.appendChild(name);
      row.appendChild(meta);
      guildList.appendChild(row);
    });

    if (count > 30) {
      const more = document.createElement("div");
      more.className = "empty";
      more.textContent = "…et " + (count - 30) + " autre(s) serveur(s).";
      guildList.appendChild(more);
    }
  } catch (error) {
    setBroadcastStatus(error.message, "bad");
  }
}

// L'aperçu se met à jour à chaque frappe.
["bcTitle", "bcAuthor", "bcDesc", "bcImage", "bcThumb", "bcFooter"].forEach((id) => {
  document.getElementById(id).addEventListener("input", renderBroadcastPreview);
});
document.getElementById("bcColor").addEventListener("input", renderBroadcastPreview);

// ---- Chargement initial ----
async function loadAll() {
  loadDiscordStatus();

  try {
    const reactionsResponse = await apiFetch("/api/reactions");
    const reactionsData = await reactionsResponse.json();
    state.reactions = reactionsData.reactions;
    renderReactionList();
  } catch (error) {
    setReactionStatus(error.message, "bad");
  }

  try {
    const statusResponse = await apiFetch("/api/bot-status");
    const statusData = await statusResponse.json();
    state.statuses = statusData.statuses;
    renderStatusRows();
  } catch (error) {
    setStatusMessage(error.message, "bad");
  }

  loadUsers();
  loadBotInfo();
  loadLogs();
  loadGuilds();
  loadChampionRole();
  loadReports();
}

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/login";
});

loadAll();
