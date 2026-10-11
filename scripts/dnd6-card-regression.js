/* Run as an async Foundry macro in an isolated v14 / D&D 6 world with Midi enabled.
 * Uses real item activities, ChatMessage documents, rendering, and damage trays.
 * Leaves the rendered cards on screen for screenshots. Re-running reuses its actor.
 */
(async () => {
  const assertions = [];
  const check = (name, pass, detail) => assertions.push({ name, pass: !!pass, detail });
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => { warnings.push(args.map(String).join(" ")); originalWarn.apply(console, args); };
  const originalTheme = document.body.classList.contains("theme-dark") ? "dark" : "light";
  const displayConfig = MidiQOL.configSettings();
  const originalDisplayConfig = {
    addChatDamageButtons: displayConfig.addChatDamageButtons,
    autoApplyDamage: displayConfig.autoApplyDamage,
    mergeCardMultiDamage: displayConfig.mergeCardMultiDamage,
    itemTypeList: displayConfig.itemTypeList,
    showItemDetails: displayConfig.showItemDetails
  };
  Object.assign(displayConfig, { addChatDamageButtons: "both", autoApplyDamage: "none", mergeCardMultiDamage: false, itemTypeList: ["feat"], showItemDetails: "all" });
  try {
    let actor = game.actors.find(actor => actor.getFlag("midi-qol", "dnd6CardFixture"));
    if (!actor) actor = await Actor.create({
      name: "Midi Compatibility Fixture", type: "npc", flags: { "midi-qol": { dnd6CardFixture: true } },
      system: { attributes: { hp: { value: 100, max: 100 }, ac: { override: 12 } }, abilities: { dex: { value: 18 } }, details: { cr: 1 } }
    });
    const definitions = [
      { type: "attack", attack: { ability: "dex", type: { value: "melee", classification: "weapon" } }, damage: { includeBase: false, parts: [] } },
      { type: "save", save: { ability: ["dex"], dc: { calculation: "", formula: "15" } }, damage: { parts: [] } },
      { type: "check", check: { ability: "", dc: { calculation: "", formula: "12" } }, damage: { parts: [] } },
      { type: "utility", roll: { formula: "1d6", name: "Utility Roll" } },
      { type: "damage", damage: { parts: [{ custom: { enabled: true, formula: "120" }, types: ["fire"] }] } },
      { type: "heal", healing: { custom: { enabled: true, formula: "12" }, types: ["healing"] } }
    ];
    for (const definition of definitions) {
      if (actor.items.find(item => item.name === `Compatibility ${definition.type}`)) continue;
      await actor.createEmbeddedDocuments("Item", [{
        name: `Compatibility ${definition.type}`, type: "feat",
        system: {
          description: { value: "<p>A readable description with <strong>bold text</strong>, <em>italics</em>, and numbers 1234567890.</p>" },
          activities: { midiCardFixture0: { _id: "midiCardFixture0", name: "Compatibility Activity", ...definition,
            activation: { type: "action" }, target: { affects: { type: "creature", count: "1" }, prompt: false } } }
        }
      }]);
    }
    document.querySelector("#midi-compatibility-preview")?.remove();
    const board = document.createElement("section");
    board.id = "midi-compatibility-preview";
    board.className = "chat-log";
    board.style.cssText = "position:fixed;inset:40px 340px 40px 80px;z-index:100;overflow:auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:16px;background:var(--color-cool-5-90);align-items:start;";
    document.body.append(board);
    const messages = [];
    for (const definition of definitions) {
      const item = actor.items.find(item => item.name === `Compatibility ${definition.type}`);
      const activity = item.system.activities.contents[0];
      const buttons = activity._usageChatButtons({ hasConsumption: true });
      check(`${definition.type}: structured buttons`, buttons.every(button => button.action && typeof button.label === "object" && !button.icon?.startsWith("<")), buttons.map(button => button.action));
      const message = await activity._createUsageMessage({ hasConsumption: true });
      check(`${definition.type}: associated item`, message.getAssociatedItem()?.id === item.id);
      check(`${definition.type}: associated activity`, message.getAssociatedActivity()?.id === activity.id);
      check(`${definition.type}: structured card identity`, message.system.item.uuid === item.uuid && message.system.activity.uuid === activity.uuid);
      const rolls = await Promise.all([
        new dnd5e.dice.DamageRoll("120", {}, { type: "fire", "midi-qol": { rollType: "defaultDamage" } }).evaluate(),
        new dnd5e.dice.DamageRoll("17", {}, { type: "acid", "midi-qol": { rollType: "defaultDamage" } }).evaluate(),
        new dnd5e.dice.DamageRoll("7", {}, { type: "cold", "midi-qol": { rollType: "otherDamage" } }).evaluate()
      ]);
      await message.update({ rolls, "flags.midi-qol.messageType": "attack" });
      const html = await message.renderHTML();
      check(`${definition.type}: description retained`, html.querySelector(".card-content .wrapper")?.textContent.includes("A readable description"));
      const description = html.querySelector(".description");
      const collapsed = description.classList.contains("collapsed");
      description.querySelector(".summary").click();
      check(`${definition.type}: description expands and collapses`, description.classList.contains("collapsed") !== collapsed);
      description.classList.remove("collapsed");
      check(`${definition.type}: refund hidden before consumption`, html.querySelector('[data-action="refundResource"]')?.hidden);
      check(`${definition.type}: damage totals render`, html.querySelector(".midi-damage-roll .midi-roll-total")?.textContent === "137" && html.querySelector(".midi-other-damage-roll .midi-roll-total")?.textContent === "7");
      const icons = [...html.querySelectorAll(".midi-damage-roll .dice-total .midi-damage-type-icon")].map(icon => icon.getAttribute("aria-label"));
      const labels = [...html.querySelectorAll(".midi-damage-roll .dice-tooltip .label")].map(label => label.textContent.trim());
      check(`${definition.type}: total shows all damage icons`, icons.includes("Fire") && icons.includes("Acid"), icons);
      check(`${definition.type}: expanded breakdown labels each damage type`, labels.includes("Fire") && labels.includes("Acid"), labels);
      board.append(html);
      html.querySelectorAll(".midi-damage-roll.dice-roll").forEach(roll => roll.click());
      messages.push(message.id);
      // Includes the same target row classes generated by Midi's hit/save renderers.
      html.querySelector(".midi-qol-hits-display").insertAdjacentHTML("beforeend", '<div class="target success flexrow"><div class="name-stacked"><span class="title">Hit Target With A Long Name</span></div><span>AC 12</span></div><div class="target failure flexrow"><div class="name-stacked"><span class="title">Miss Target</span></div><span>AC 19</span></div>');
    }
    // Background collaborative-browser tabs may suspend animation frames.
    await new Promise(resolve => setTimeout(resolve, 50));
    for (const html of board.children) {
      const total = html.querySelector(".midi-damage-roll .dice-total");
      const number = total?.querySelector(".midi-roll-total");
      const outer = total?.getBoundingClientRect(), inner = number?.getBoundingClientRect();
      const offset = inner && outer ? Math.abs(inner.x + inner.width / 2 - outer.x - outer.width / 2) : Infinity;
      check(`${html.dataset.messageId}: number centered`, offset < 1, offset);
      check(`${html.dataset.messageId}: number not clipped`, inner && outer && inner.left >= outer.left && inner.right <= outer.right && inner.height <= outer.height);
      for (const part of html.querySelectorAll(".midi-damage-roll .tooltip-part")) {
        const dice = part.querySelector(".dice-rolls").getBoundingClientRect();
        const type = part.querySelector(".total").getBoundingClientRect();
        const label = part.querySelector(".label").getBoundingClientRect();
        check(`${html.dataset.messageId}: expanded type label on right`, type.left >= dice.right - 1 && label.width > 0 && label.height > 0 && label.right <= part.getBoundingClientRect().right + 1);
      }
      const trays = [...html.querySelectorAll("midi-damage-application")];
      check(`${html.dataset.messageId}: trays keep damage groups separate`, trays.length === 2 && trays.find(tray => tray.damageType === "defaultDamage")?.damages.reduce((total, damage) => total + damage.value, 0) === 137 && trays.find(tray => tray.damageType === "otherDamage")?.damages[0]?.value === 7, trays.map(tray => ({ type: tray.damageType, damage: tray.damages })));
    }
    function rgba(value) { const values = value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0]; return [...values.slice(0, 3), values[3] ?? 1]; }
    function blend(front, back) { return [...front.slice(0, 3).map((v, i) => v * front[3] + back[i] * (1 - front[3])), 1]; }
    function luminance(color) { return color.slice(0, 3).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0); }
    for (const theme of ["dark", "light"]) {
      document.body.classList.remove("theme-dark", "theme-light"); document.body.classList.add(`theme-${theme}`);
      for (const target of board.querySelectorAll(".target .title, .midi-buttons button, .dice-tooltip .label, .card-content p, .card-content strong, .card-content em")) {
        const ancestors = []; let element = target;
        while (element) { ancestors.push(element); element = element.parentElement; }
        let background = theme === "dark" ? [13, 11, 11, 1] : [255, 255, 255, 1];
        for (const ancestor of ancestors.reverse()) background = blend(rgba(getComputedStyle(ancestor).backgroundColor), background);
        const foreground = luminance(rgba(getComputedStyle(target).color)), back = luminance(background);
        const contrast = (Math.max(foreground, back) + .05) / (Math.min(foreground, back) + .05);
        check(`${theme}: readable ${target.tagName.toLowerCase()} text`, contrast >= 4.5, contrast);
      }
    }
    check("no deprecated card/effect/roll-mode APIs", !warnings.some(warning => /legacy usage card|legacy format|Activity effects|CONST.DICE_ROLL_MODES|CONST.ACTIVE_EFFECT_MODES/.test(warning)), warnings);
    return { pass: assertions.every(assertion => assertion.pass), assertions, messages, warnings, versions: { core: game.version, system: game.system.version, midi: game.modules.get("midi-qol").version } };
  } catch (error) {
    return { pass: false, assertions, error: error.message, stack: error.stack, warnings };
  } finally {
    Object.assign(displayConfig, originalDisplayConfig);
    console.warn = originalWarn;
    document.body.classList.remove("theme-dark", "theme-light"); document.body.classList.add(`theme-${originalTheme}`);
  }
})()
