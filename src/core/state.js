import { History } from './history.js';

let counter = 0;
const uid = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 'b' + crypto.randomUUID();
  }
  return `b_${Date.now().toString(36)}_${(++counter).toString(36)}`;
};

const clone = (o) => JSON.parse(JSON.stringify(o));

const COALESCE_MS = 500;

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
  #history = new History();
  #applying = false;
  #batchEntries = null;
  #coalesce = null;

  get blocks() {
    return this.#blocks;
  }

  batch(fn) {
    const isOuter = this.#suspended === 0;
    if (isOuter && !this.#applying) this.#batchEntries = [];
    this.#suspended++;
    try {
      fn();
    } finally {
      this.#suspended--;
      if (this.#suspended === 0) {
        const entries = this.#batchEntries;
        this.#batchEntries = null;
        if (entries && entries.length > 0) {
          this.#history.push({
            undo: () => this.batch(() => {
              for (let i = entries.length - 1; i >= 0; i--) entries[i].undo();
            }),
            redo: () => this.batch(() => {
              for (const e of entries) e.redo();
            }),
          });
          this.#coalesce = null;
        }
        if (this.#dirty) {
          this.#dirty = false;
          for (const listener of this.#listeners) listener({ type: 'batch' }, this.#blocks);
        }
      }
    }
  }

  setBlocks(blocks) {
    this.#blocks = blocks.map(normalizeBlock);
    this.#history.clear();
    this.#coalesce = null;
    this.#emit({ type: 'replace' });
  }

  updateBlock(id, data) {
    const idx = this.#blocks.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const current = this.#blocks[idx];
    const after = { ...current.data, ...data };
    this.#blocks[idx] = { ...current, data: after };
    this.#emit({ type: 'update', id });

    if (this.#applying) return;

    const now = Date.now();
    if (
      this.#coalesce &&
      this.#coalesce.id === id &&
      now - this.#coalesce.time < COALESCE_MS &&
      !this.#batchEntries
    ) {
      this.#coalesce.entry.redo = () => this.#setBlockData(id, after);
      this.#coalesce.time = now;
      return;
    }

    const before = clone(current.data);
    const entry = {
      undo: () => this.#setBlockData(id, before),
      redo: () => this.#setBlockData(id, after),
    };
    this.#recordEntry(entry, id);
  }

  insertBlock({ type, data = {} }, afterId = null) {
    const block = normalizeBlock({ type, data });
    let index;
    if (afterId === null) {
      index = this.#blocks.length;
    } else {
      const ai = this.#blocks.findIndex((b) => b.id === afterId);
      index = ai === -1 ? this.#blocks.length : ai + 1;
    }
    this.#blocks.splice(index, 0, block);
    this.#emit({ type: 'insert', id: block.id, afterId });

    if (!this.#applying) {
      const snapshot = clone(block);
      this.#recordEntry({
        undo: () => this.#removeById(block.id),
        redo: () => this.#insertExisting(snapshot, index),
      });
    }
    return block.id;
  }

  insertBlockAt({ type, data = {} }, index) {
    const block = normalizeBlock({ type, data });
    const i = Math.max(0, Math.min(index, this.#blocks.length));
    this.#blocks.splice(i, 0, block);
    this.#emit({ type: 'insert', id: block.id, index: i });

    if (!this.#applying) {
      const snapshot = clone(block);
      this.#recordEntry({
        undo: () => this.#removeById(block.id),
        redo: () => this.#insertExisting(snapshot, i),
      });
    }
    return block.id;
  }

  removeBlock(id) {
    const idx = this.#blocks.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const removed = clone(this.#blocks[idx]);
    this.#blocks.splice(idx, 1);
    this.#emit({ type: 'remove', id });

    if (!this.#applying) {
      this.#recordEntry({
        undo: () => this.#insertExisting(removed, idx),
        redo: () => this.#removeById(id),
      });
    }
  }

  transformBlock(id, type, data = {}) {
    const idx = this.#blocks.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const before = clone(this.#blocks[idx]);
    const after = { id, type, data: normalizeData(data) };
    this.#blocks[idx] = after;
    this.#emit({ type: 'transform', id });

    if (!this.#applying) {
      const afterSnap = clone(after);
      this.#recordEntry({
        undo: () => this.#setFullBlock(id, before),
        redo: () => this.#setFullBlock(id, afterSnap),
      });
    }
  }

  moveBlock(id, direction) {
    const idx = this.#blocks.findIndex((b) => b.id === id);
    if (idx === -1) return false;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= this.#blocks.length) return false;
    const [block] = this.#blocks.splice(idx, 1);
    this.#blocks.splice(newIdx, 0, block);
    this.#emit({ type: 'move', id });

    if (!this.#applying) {
      this.#recordEntry({
        undo: () => this.#moveTo(id, idx),
        redo: () => this.#moveTo(id, newIdx),
      });
    }
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

  undo() {
    if (this.#applying || !this.#history.canUndo()) return false;
    const entry = this.#history.popUndo();
    this.#applying = true;
    this.#coalesce = null;
    try {
      entry.undo();
    } finally {
      this.#applying = false;
    }
    return true;
  }

  redo() {
    if (this.#applying || !this.#history.canRedo()) return false;
    const entry = this.#history.popRedo();
    this.#applying = true;
    this.#coalesce = null;
    try {
      entry.redo();
    } finally {
      this.#applying = false;
    }
    return true;
  }

  canUndo() {
    return this.#history.canUndo();
  }

  canRedo() {
    return this.#history.canRedo();
  }

  // --- private setters used only by history.apply ---

  #setBlockData(id, data) {
    const idx = this.#blocks.findIndex((b) => b.id === id);
    if (idx === -1) return;
    this.#blocks[idx] = { ...this.#blocks[idx], data: clone(data) };
    this.#emit({ type: 'update', id, replace: true });
  }

  #setFullBlock(id, block) {
    const idx = this.#blocks.findIndex((b) => b.id === id);
    if (idx === -1) return;
    this.#blocks[idx] = clone(block);
    this.#emit({ type: 'transform', id });
  }

  #insertExisting(block, index) {
    const i = Math.max(0, Math.min(index, this.#blocks.length));
    this.#blocks.splice(i, 0, clone(block));
    this.#emit({ type: 'insert', id: block.id, index: i });
  }

  #removeById(id) {
    const idx = this.#blocks.findIndex((b) => b.id === id);
    if (idx === -1) return;
    this.#blocks.splice(idx, 1);
    this.#emit({ type: 'remove', id });
  }

  #moveTo(id, targetIdx) {
    const idx = this.#blocks.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const [block] = this.#blocks.splice(idx, 1);
    this.#blocks.splice(targetIdx, 0, block);
    this.#emit({ type: 'move', id });
  }

  #recordEntry(entry, coalesceKey = null) {
    if (this.#applying) return;
    if (this.#batchEntries) {
      this.#batchEntries.push(entry);
      this.#coalesce = null;
      return;
    }
    this.#history.push(entry);
    if (coalesceKey !== null) {
      this.#coalesce = { id: coalesceKey, time: Date.now(), entry };
    } else {
      this.#coalesce = null;
    }
  }

  #emit(event) {
    if (this.#suspended) {
      this.#dirty = true;
      return;
    }
    for (const fn of this.#listeners) fn(event, this.#blocks);
  }
}
