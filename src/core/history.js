export class History {
  #undo = [];
  #redo = [];
  #limit;

  constructor({ limit = 200 } = {}) {
    this.#limit = limit;
  }

  push(entry) {
    this.#undo.push(entry);
    if (this.#undo.length > this.#limit) this.#undo.shift();
    this.#redo.length = 0;
  }

  popUndo() {
    if (!this.#undo.length) return null;
    const entry = this.#undo.pop();
    this.#redo.push(entry);
    return entry;
  }

  popRedo() {
    if (!this.#redo.length) return null;
    const entry = this.#redo.pop();
    this.#undo.push(entry);
    return entry;
  }

  canUndo() {
    return this.#undo.length > 0;
  }

  canRedo() {
    return this.#redo.length > 0;
  }

  clear() {
    this.#undo.length = 0;
    this.#redo.length = 0;
  }
}
