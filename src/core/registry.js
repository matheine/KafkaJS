const blocks = new Map();

export function registerBlock(def) {
  if (!def || typeof def.type !== 'string' || !def.type) {
    throw new Error('Block definition must have a non-empty `type`.');
  }
  if (typeof def.render !== 'function') {
    throw new Error(`Block "${def.type}" must define a render(data, ctx) function.`);
  }
  blocks.set(def.type, def);
}

export function getBlock(type) {
  return blocks.get(type);
}

export function listBlocks() {
  return [...blocks.values()];
}
