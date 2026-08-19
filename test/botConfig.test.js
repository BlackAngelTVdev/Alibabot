import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

process.env.DB_PATH = `test-prefix-${process.pid}.db`;

const { initDb, setSetting } = await import("../src/db.js");
const { readBotPrefix, writeBotPrefix } = await import("../src/botConfig.js");

test.after(() => {
  rmSync(process.env.DB_PATH, { force: true });
});

test("préfixe par défaut", async () => {
  await initDb();
  assert.equal(readBotPrefix(), "!");
});

test("changer et récupérer le préfixe", () => {
  writeBotPrefix("$");
  assert.equal(readBotPrefix(), "$");

  writeBotPrefix("  ?  ");
  assert.equal(readBotPrefix(), "?");

  assert.throws(() => writeBotPrefix(""), /préfixe/);
  assert.throws(() => writeBotPrefix("abcdef"), /préfixe/);
});

test("un préfixe invalide en base retombe sur le défaut", () => {
  setSetting("bot_prefix", "abcdefgh");
  assert.equal(readBotPrefix(), "!");
});
