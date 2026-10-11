/** Boundaries shared by the D&D 5.x/6.x and Foundry v13/v14 integrations. */
export function usesSystemChatData(): boolean {
  return Number(game.system?.version.split(".")[0]) >= 6;
}

// The bundled Foundry v13 declarations do not yet include the v14 mode strings.
export function getRollModes(): Record<"PUBLIC" | "PRIVATE" | "BLIND" | "SELF", any> {
  // Settings defaults are constructed during module import, before Game.release
  // is guaranteed to exist. The core mode configuration is already available.
  return (CONFIG.ChatMessage as any).modes?.public
    ? { PUBLIC: "public", PRIVATE: "gm", BLIND: "blind", SELF: "self" }
    : { PUBLIC: "publicroll", PRIVATE: "gmroll", BLIND: "blindroll", SELF: "selfroll" };
}

export function normalizeRollMode(mode: string | null | undefined): any {
  if (!mode) return getRollModes().PUBLIC;
  const keys: Record<string, "PUBLIC" | "PRIVATE" | "BLIND" | "SELF"> = { publicroll: "PUBLIC", gmroll: "PRIVATE", blindroll: "BLIND", selfroll: "SELF" };
  return keys[mode] ? getRollModes()[keys[mode]] : mode;
}

export function effectChange(type: string, key: string, value: string, priority?: number): any {
  const change: any = { key, value };
  if (priority !== undefined) change.priority = priority;
  if (game.release.generation >= 14) change.type = type;
  else change.mode = ({ custom: 0, multiply: 1, add: 2, downgrade: 3, upgrade: 4, override: 5 } as Record<string, number>)[type];
  return change;
}

/** Profiles may refer to local item effects or asynchronously loaded compendium effects. */
export async function resolveActivityEffect(profile: any): Promise<any> {
  return typeof profile.getEffect === "function" ? await profile.getEffect() : profile.effect;
}

export function activityEffectReferences(activity: any): string[] {
  return activity?.applicableEffects?.map(effect => effect.relativeUUID ?? effect.id).filter(Boolean) ?? [];
}

export function countTemplateShapes(templates: any[]): number {
  return templates.reduce((count, template) => count + (template?.documentName === "Region" ? template.shapes.length : 1), 0);
}

/** Automatic emanations and traps already have a location and need no placement prompt. */
export async function createActivityRegions(activity: any, options: any = {}): Promise<any[]> {
  const scene = canvas.scene;
  if (!scene) return [];
  const target = activity.target.template;
  const type = globalThis.dnd5e.config.areaTargetTypes[target.type]?.template;
  if (!type) return [];
  const length = (value: number) => globalThis.dnd5e.utils.convertLength(value, target.units, scene.grid.units, { strict: false });
  const multiplier = scene.grid.size / scene.grid.distance;
  const size = (options.size ?? length(Number(target.size))) * multiplier;
  const width = length(Number(target.width ?? scene.grid.distance)) * multiplier;
  const base = { x: options.x ?? 0, y: options.y ?? 0, rotation: options.direction ?? 0 };
  let shape: any;
  switch (type) {
    case "circle": shape = { ...base, type, radius: size }; break;
    case "cone": shape = { ...base, type, radius: size, angle: CONFIG.MeasuredTemplate.defaults.angle }; break;
    case "rect": case "rectangle": shape = { ...base, type: "rectangle", width: size, height: size }; break;
    case "ray": case "line": shape = { ...base, type: "line", length: size, width }; break;
    case "ring": shape = { ...base, type, radius: size, outerWidth: width, innerWidth: 0 }; break;
    case "emanation": {
      const token = options.token ?? activity.getUsageToken();
      if (!token) return [];
      shape = { type, radius: size, base: { type: "token", x: token.x, y: token.y, width: token.width, height: token.height, shape: token.shape } };
      break;
    }
    default: throw new Error(`Unsupported activity area shape: ${type}`);
  }
  const data = [{
    name: `${activity.item.name} [${game.user?.name}]`, color: game.user?.color,
    shapes: Array.from({ length: Number(target.count) || 1 }, () => foundry.utils.deepClone(shape)),
    levels: [(canvas as any).level.id], visibility: CONST.REGION_VISIBILITY.ALWAYS,
    highlightMode: "coverage", restriction: { enabled: true, type: "move" },
    flags: { dnd5e: { activity: activity.uuid, item: activity.item.uuid, origin: activity.getUsageToken()?.uuid }, ...options.flags }
  }];
  // @ts-expect-error no dnd5e-types
  if (Hooks.call("dnd5e.createMeasuredTemplate", activity, data) === false) return [];
  // @ts-expect-error Region is the v14 replacement, absent from the bundled v13 document types.
  const created = await scene.createEmbeddedDocuments("Region", data);
  // @ts-expect-error no dnd5e-types
  Hooks.callAll("dnd5e.postCreateMeasuredTemplate", activity, created);
  return created;
}

export function setMessageOrigin(message: any, id: any) {
  foundry.utils.setProperty(message, usesSystemChatData() ? "data.system.origin" : "data.flags.dnd5e.originatingMessage", id);
}

export function isCustomEffectChange(change: any): boolean {
  return game.release.generation >= 14 ? change.type === "custom" : change.mode === 0;
}

export function makeEffectChangeCustom(change: any) {
  if (game.release.generation >= 14) change.type = "custom";
  else change.mode = 0;
}

export function getMessageOrigin(message: any): string | undefined {
  return foundry.utils.getProperty(message, "data.system.origin") as string | undefined
    ?? foundry.utils.getProperty(message, "data.flags.dnd5e.originatingMessage") as string | undefined;
}

/** Convert current button descriptors only at the custom HTML template boundary. */
export function renderChatButtons(buttons: any[]): any[] {
  return buttons.map(button => {
    if (!button.action) return button;
    const icon = globalThis.dnd5e.utils.generateIcon(button.icon);
    const label = game.i18n!.localize(button.label?.value ?? "");
    const escape = (value: string) => { const span = document.createElement("span"); span.textContent = value; return span.innerHTML; };
    return {
      ...button,
      dataset: { ...button.dataset, action: button.action, visibility: button.visibility ?? "creator" },
      icon: icon?.outerHTML ?? "",
      label: button.label?.hidden
        ? `<span class="visible-dc">${escape(label)}</span><span class="hidden-dc">${escape(game.i18n!.localize(button.label.hidden))}</span>`
        : escape(label)
    };
  });
}
