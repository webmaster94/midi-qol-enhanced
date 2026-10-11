/* Run in the isolated compatibility world after the card/workflow fixtures exist. */
(async () => {
  const assertions = [];
  const check = (name, pass, detail) => assertions.push({ name, pass: !!pass, detail });
  const source = game.actors.find(actor => actor.name === "Compatibility Caster")
    ?? game.actors.find(actor => actor.getFlag("midi-qol", "dnd6CardFixture"));
  if (!source || !canvas.scene) return { pass: false, error: "Create the compatibility actor and view a scene first." };
  if (!canvas.scene.tokens.find(token => token.actorId === source.id)) {
    await canvas.scene.createEmbeddedDocuments("Token", [(await source.getTokenDocument({ x: 100, y: 100, actorLink: true })).toObject()]);
  }
  let target = game.actors.find(actor => actor.name === "Compatibility Target");
  if (!target) target = await Actor.create({ name: "Compatibility Target", type: "npc", flags: { "midi-qol": { dnd6RegionFixture: true } }, system: { attributes: { hp: { value: 100, max: 100 } } } });
  if (!canvas.scene.tokens.find(token => token.actorId === target.id)) {
    await canvas.scene.createEmbeddedDocuments("Token", [(await target.getTokenDocument({ x: 200, y: 100, actorLink: true })).toObject()]);
  }
  let item = source.items.find(item => item.name === "Compatibility Automatic Area");
  if (!item) item = (await source.createEmbeddedDocuments("Item", [{
    name: "Compatibility Automatic Area", type: "feat", system: { activities: {
      midiRegionTest00: { _id: "midiRegionTest00", type: "utility", range: { units: "self" }, duration: { units: "inst" },
        target: { template: { type: "radius", size: "10", units: "ft", count: "2" }, affects: { type: "creature", special: "-self" }, prompt: false },
        midiProperties: { autoTargetAction: "always" }
      }
    } }
  }]))[0];
  const activity = item.system.activities.contents[0];
  const speaker = ChatMessage.getSpeaker({ actor: source });
  const workflow = new MidiQOL.Workflow(source, activity, speaker, [], { storeWorkflow: false });
  workflow.expectedTemplateCount = 2;
  let regions = [];
  try {
    regions = await activity._placeEmanationTemplate(workflow);
    check("automatic area uses Region documents", regions?.length === 1 && regions[0].documentName === "Region");
    check("multiple placements share one region", regions?.[0]?.shapes.length === 2);
    const accepted = await workflow.processPlacedTemplates(regions, activity);
    check("workflow accepts all shapes", accepted && !workflow.needTemplate, { expected: workflow.expectedTemplateCount, placed: workflow.placedTemplateShapeCount });
    check("native region targets affected tokens", [...workflow.targets].some(token => token.actor?.name === "Compatibility Target"), [...workflow.targets].map(token => token.name));
    check("ignore-self remains effective", ![...workflow.targets].some(token => token.actor?.id === source.id));
    const direct = MidiQOL.computeTargetsFromTemplates([regions[0]], source, true, "any", "always");
    check("region document input also works", direct.some(token => token.actor?.name === "Compatibility Target"));
    return { pass: assertions.every(assertion => assertion.pass), assertions };
  } catch (error) { return { pass: false, assertions, error: error.message, stack: error.stack }; }
  finally { for (const region of regions ?? []) await region.delete(); }
})()
