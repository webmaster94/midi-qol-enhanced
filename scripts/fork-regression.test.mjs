import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/module/utils.ts", import.meta.url), "utf8");
function functionSource(name) {
  const file = ts.createSourceFile("utils.ts", source, ts.ScriptTarget.Latest, true);
  const node = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(node, `Missing ${name}`);
  return ts.transpile(node.getText(file).replace(/^export /, ""), { target: ts.ScriptTarget.ES2022 });
}
const getProperty = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
const setProperty = (object, path, value) => {
  const keys = path.split("."); const last = keys.pop();
  for (const key of keys) object = object[key] ??= {};
  object[last] = value;
};
function fixture({ existing = false } = {}) {
  const calls = [];
  const parent = { uuid: "Actor.target.ActiveEffect.parent", origin: "Actor.source.Item.item.ActiveEffect.source", flags: {}, toObject: () => ({ duration: { seconds: 60, startTime: 5 } }) };
  const controller = { id: "controller", uuid: "Actor.target.ActiveEffect.controller", flags: { "midi-qol": { autoOverTime: { activityUuid: "Actor.source.Item.item.Activity.tick", sourceActorUuid: "Actor.source" } } } };
  const actor = { uuid: "Actor.target", appliedEffects: [parent, ...(existing ? [controller] : [])] };
  const activity = { uuid: "Actor.source.Item.item.Activity.tick", identifier: "tick", name: "Tick", isOverTimeFlag: true, item: { uuid: "Actor.source.Item.item" }, duration: { units: "inst" } };
  const workflow = { actor: { uuid: "Actor.source", effects: new Map() }, item: activity.item, activity: { uuid: "Actor.source.Item.item.Activity.hit", effects: [{ getEffect: async () => ({ uuid: parent.origin }) }], item: activity.item }, castData: { castLevel: 4 }, itemCardUuid: "ChatMessage.card" };
  const context = vm.createContext({
    MODULE_ID: "midi-qol", foundry: { utils: { getProperty, setProperty, duplicate: structuredClone } },
    getActor: id => id === actor.uuid || id === "Token.target" ? actor : undefined,
    getConcentrationEffect: () => undefined, isInCombat: () => false,
    convertDuration: () => { throw new Error("Inherited source duration should be used"); },
    createEffects: async data => calls.push({ create: data }), updateEffects: async data => calls.push({ update: data }),
    game: { combat: null, time: { worldTime: 99 } }
  });
  vm.runInContext(functionSource("applyTriggeredActivityAsOverTime"), context);
  return { context, calls, actor, activity, workflow, parent };
}

test("triggered OverTime deduplicates targets and inherits source duration/dependency using v14 changes", async () => {
  const f = fixture();
  assert.equal(await f.context.applyTriggeredActivityAsOverTime(f.workflow, f.activity, [f.actor.uuid, "Token.target", "missing"]), true);
  assert.equal(f.calls.length, 1);
  const effect = f.calls[0].create.effects[0];
  assert.equal(effect.changes, undefined);
  assert.equal(effect.system.changes[0].type, "override");
  assert.equal(effect.system.changes[0].value, "tick");
  assert.equal(effect.duration.seconds, 60);
  assert.equal(effect.flags.dnd5e.dependentOn, f.parent.uuid);
  assert.equal(effect.flags["midi-qol"].autoOverTime.triggeringEffectUuids[0], f.parent.uuid);
  assert.equal(effect.flags["midi-qol"].autoOverTime.triggeringEffectOrigins[0], f.workflow.activity.uuid);
});
test("reapplying triggered OverTime refreshes one controller", async () => {
  const f = fixture({ existing: true });
  await f.context.applyTriggeredActivityAsOverTime(f.workflow, f.activity, [f.actor.uuid]);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].update.updates[0]._id, "controller");
  assert.equal(f.calls[0].update.updates[0].system.changes[0].type, "override");
});
test("no valid targets or a non-OverTime activity creates no effect", async () => {
  const f = fixture();
  assert.equal(await f.context.applyTriggeredActivityAsOverTime(f.workflow, f.activity, ["missing"]), false);
  f.activity.isOverTimeFlag = false;
  assert.equal(await f.context.applyTriggeredActivityAsOverTime(f.workflow, f.activity, [f.actor.uuid]), false);
  assert.equal(f.calls.length, 0);
});
test("OverTime rolls as its source and a successful save removes its triggering effect", async () => {
  const f = fixture();
  const deleted = [];
  f.parent.delete = async () => deleted.push(f.parent.uuid);
  const token = {};
  const rollActor = { uuid: "Actor.source", isOwner: true };
  const activity = { id: "tick", item: { toObject: () => ({ system: { properties: [] } }) }, overTimeProperties: { saveRemoves: true, removeTriggeringActivityEffects: true } };
  const effect = { uuid: "Actor.target.ActiveEffect.controller", system: { changes: [{ key: "flags.midi-qol.ActivityOverTime", priority: 20 }] }, flags: { "midi-qol": { autoOverTime: { sourceActorUuid: rollActor.uuid, triggeringEffectUuids: [f.parent.uuid] } } }, delete: async () => deleted.push("controller") };
  let rollingParent;
  Object.assign(f.context, {
    getOvertimeActivity: async () => activity,
    fromUuidSync: id => id === rollActor.uuid ? rollActor : effect,
    getItemFromEffectOrigin: () => undefined,
    CONFIG: { Item: { documentClass: class { constructor(data, options) { rollingParent = options.parent; this.system = { activities: [activity] }; } prepareData() {} prepareFinalAttributes() {} } } },
    tokenForActor: () => token, getOrCreateTokenForActor: () => token,
    completeActivityUse: async () => ({ saves: new Set([token]) })
  });
  vm.runInContext(functionSource("localActivityOverTimeEffect"), f.context);
  await f.context.localActivityOverTimeEffect(f.actor, effect);
  assert.equal(rollingParent, rollActor);
  assert.deepEqual(deleted, [f.parent.uuid]);
});
