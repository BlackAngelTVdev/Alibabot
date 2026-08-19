const form = document.getElementById("loginForm");
const status = document.getElementById("status");

// Affiche le pseudo actuel du bot sur la page de connexion.
async function loadBotIdentity() {
  try {
    const response = await fetch("/api/bot-info");
    const data = await response.json();

    if (data.username) {
      document.getElementById("botNameTitle").textContent = data.username;
      document.title = data.username + " - Connexion";
    }

    if (data.avatarURL) {
      const img = new Image();
      img.onload = () => {
        document.getElementById("botAvatar").src = data.avatarURL;
      };
      img.src = data.avatarURL;
    }
  } catch {
    // Le bot-info n'est pas indispensable pour la connexion.
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "";

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: document.getElementById("username").value,
        password: document.getElementById("password").value
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Échec de la connexion.");
    }

    // On conserve le #onglet de l'URL pour retomber sur le même endroit après connexion.
    window.location.href = "/" + (window.location.hash ?? "");
  } catch (error) {
    status.textContent = error.message;
  }
});

loadBotIdentity();
