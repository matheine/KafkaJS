let counter = 0;
const uid = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 'b' + crypto.randomUUID();
  }
  return `b_${Date.now().toString(36)}_${(++counter).toString(36)}`;
};

function normalizeData(data) {
  const out = { ...data };
  if (Array.isArray(out.columns)) {
    out.columns = out.columns.map((col) =>
      Array.isArray(col) ? col.map(normalizeBlock) : col,
    );
  }
  return out;
}

function normalizeBlock(b) {
  return {
    id: b.id ?? uid(),
    type: b.type,
    data: normalizeData(b.data ?? {}),
  };
}

export class EditorState {
  #blocks = [];
  #listeners = new Set();
  #suspended = 0;
  #dirty = false;

  get blocks() {
    return this.#blocks;
  }

  batch(fn) {
    this.#suspended++;
    try {
      fn();
    } finally {
      this.#suspended--;
      if (this.#suspended === 0 && this.#dirty) {
        this.#dirty = false;
        for (const listener of this.#listeners) listener({ type: 'batch' }, this.#blocks);
      }
    }
  }

  setBlocks(blocks) {
    this.#blocks = blocks.map(normalizeBlock);
    this.#emit({ type: 'replace' });
  }

  updateBlock(id, data) {
    const idx = this.#blocks.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const current = this.#blocks[idx];
    this.#blocks[idx] = { ...current, data: { ...current.data, ...data } };
    this.#emit({ type: 'update', id });
  }

  insertBlock({ type, data = {} }, afterId = null) {
    const block = normalizeBlock({ type, data });
    if (afterId === null) {
      this.#blocks.push(block);
    } else {
      const idx = this.#blocks.findIndex((b) => b.id === afterId);
      this.#blocks.splice(idx === -1 ? this.#blocks.length : idx + 1, 0, block);
    }
    this.#emit({ type: 'insert', id: block.id, afterId });
    return block.id;
  }

  insertBlockAt({ type, data = {} }, index) {
    const block = normalizeBlock({ type, data });
    const i = Math.max(0, Math.min(index, this.#blocks.length));
    this.#blocks.splice(i, 0, block);
    this.#emit({ type: 'insert', id: block.id, index: i });
    return block.id;
  }

  removeBlock(id) {
    const before = this.#blocks.length;
    this.#blocks = this.#blocks.filter((b) => b.id !== id);
    if (this.#blocks.length !== before) this.#emit({ type: 'remove', id });
  }

  transformBlock(id, type, data = {}) {
    const idx = this.#blocks.findIndex((b) => b.id === id);
    if (idx === -1) return;
    this.#blocks[idx] = { id, type, data: normalizeData(data) };
    this.#emit({ type: 'transform', id });
  }

  moveBlock(id, direction) {
    const idx = this.#blocks.findIndex((b) => b.id === id);
    if (idx === -1) return false;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= this.#blocks.length) return false;
    const [block] = this.#blocks.splice(idx, 1);
    this.#blocks.splice(newIdx, 0, block);
    this.#emit({ type: 'move', id });
    return true;
  }

  subscribe(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  toJSON() {
    return this.#blocks.map(({ id, type, data }) => ({
      id,
      type,
      data: { ...data },
    }));
  }

  #emit(event) {
    if (this.#suspended) {
      this.#dirty = true;
      return;
    }
    for (const fn of this.#listeners) fn(event, this.#blocks);
  }
}
