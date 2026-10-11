import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const bundle = await build({ entryPoints: [fileURLToPath(new URL("../src/module/compatibility.ts", import.meta.url))], bundle: true, format: "esm", platform: "node", write: false });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

test("v14 roll-mode defaults work before Game is initialized", () => {
  delete globalThis.game;
  globalThis.CONFIG = { ChatMessage: { modes: { public: {}, gm: {}, blind: {}, self: {} } } };
  assert.deepEqual(api.getRollModes(), { PUBLIC: "public", PRIVATE: "gm", BLIND: "blind", SELF: "self" });
  assert.equal(api.normalizeRollMode("blindroll"), "blind");
  assert.equal(api.normalizeRollMode("gmroll"), "gm");
  assert.equal(api.normalizeRollMode("selfroll"), "self");
});

test("v13 preserves its roll-mode and Active Effect protocols", () => {
  globalThis.CONFIG = { ChatMessage: {} };
  globalThis.game = { release: { generation: 13 }, system: { version: "5.3.3" } };
  assert.deepEqual(api.getRollModes(), { PUBLIC: "publicroll", PRIVATE: "gmroll", BLIND: "blindroll", SELF: "selfroll" });
  assert.deepEqual(api.effectChange("add", "flags.midi-qol.actions.bonusActionsUsed", "1", 20), { key: "flags.midi-qol.actions.bonusActionsUsed", value: "1", priority: 20, mode: 2 });
  assert.equal(api.usesSystemChatData(), false);
});

test("v14 changes use string types and D&D 6 references use UUIDs", async () => {
  globalThis.game = { release: { generation: 14 }, system: { version: "6.0.6" } };
  assert.deepEqual(api.effectChange("add", "flags.midi-qol.actions.bonusActionsUsed", "1", 20), { key: "flags.midi-qol.actions.bonusActionsUsed", value: "1", priority: 20, type: "add" });
  const effect = { uuid: "Compendium.dnd5e.effects.ActiveEffect.test", statuses: new Set(["blinded"]) };
  assert.equal(await api.resolveActivityEffect({ getEffect: async () => effect }), effect);
  assert.deepEqual(api.activityEffectReferences({ applicableEffects: [{ relativeUUID: effect.uuid }] }), [effect.uuid]);
  assert.equal(api.countTemplateShapes([{ documentName: "Region", shapes: [{}, {}] }]), 2);
  assert.equal(api.usesSystemChatData(), true);
});
