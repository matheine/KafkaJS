import { EditorState } from './state.js';
import { getBlock, listBlocks } from './registry.js';
import { setCaret, getCaretOffset, getSelectionOffsets } from './caret.js';
import {
  isRichTextValue,
  richTextLength,
  richTextToString,
  concatRichText,
  getRichText,
  sliceRichText,
} from './richtext.js';
import { parseClipboard } from './paste.js';

const EDITABLE_SELECTOR =
  '[contenteditable="true"], [contenteditable="plaintext-only"], input, textarea, [data-kafka-focusable="true"]';

const DEFAULT_COLOR_PRESETS = [
  { name: 'Default', value: null },
  { name: 'Black', value: '#111111' },
  { name: 'Gray', value: '#6b7280' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Orange', value: '#ea580c' },
  { name: 'Yellow', value: '#ca8a04' },
  { name: 'Green', value: '#16a34a' },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Purple', value: '#7c3aed' },
];

export class KafkaEditor extends HTMLElement {
  #state = new EditorState();
  #root;
  #pendingFocus = null;
  #focusedBlockId = null;
  #blockEls = new Map();
  #closeMenu = null;
  #parentEditor = null;
  #colorPresets = DEFAULT_COLOR_PRESETS;

  set colorPresets(presets) {
    if (Array.isArray(presets)) this.#colorPresets = presets;
  }
  get colorPresets() {
    return this.#colorPresets;
  }

  connectedCallback() {
    if (this.#root) return;
    this.#root = document.createElement('div');
    this.#root.className = 'kafka-editor';
    this.appendChild(this.#root);
    this.#parentEditor = this.#findParentEditor();
    if (!this.#parentEditor) this.#mountSelectionToolbar();
    this.#state.subscribe((event) => this.#onStateChange(event));
    this.#root.addEventListener('paste', (e) => this.#onPaste(e));
    this.#root.addEventListener('focusin', (e) => {
      const wrapper = this.#findOwnBlock(e.target);
      if (wrapper) this.#setFocusedBlock(wrapper.dataset.blockId);
    });
    this.#root.addEventListener('focusout', () => {
      queueMicrotask(() => {
        if (!this.#root || !this.#root.contains(document.activeElement)) {
          this.#setFocusedBlock(null);
        }
      });
    });
    this.#root.addEventListener(
      'keydown',
      (e) => {
        if (e.isComposing) return;

        // Undo / Redo
        if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) this.#state.redo();
          else this.#state.undo();
          return;
        }
        if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || e.key === 'Y') && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          this.#state.redo();
          return;
        }

        if (e.key === 'Escape') {
          if (this.#closeMenu) return; // popup handles its own Escape
          const active = document.activeElement;
          if (active && this.#root.contains(active) && active !== this.#root) {
            e.preventDefault();
            e.stopPropagation();
            active.blur();
          }
          return;
        }

        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          if (!this.#focusedBlockId) return;
          e.preventDefault();
          e.stopPropagation();
          const newId = this.#state.insertBlock(
            { type: 'paragraph', data: { text: '' } },
            this.#focusedBlockId,
          );
          this.#pendingFocus = { id: newId, offset: 0 };
          this.#applyPendingFocus();
          return;
        }

        // Cmd/Ctrl+B/I/U inline formatting in rich-text editables.
        if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'i' || e.key === 'u')) {
          const active = document.activeElement;
          if (!active || active.contentEditable !== 'true') return;
          e.preventDefault();
          const cmd = { b: 'bold', i: 'italic', u: 'underline' }[e.key];
          document.execCommand(cmd);
          return;
        }

        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
          const active = document.activeElement;
          if (!active) return;
          const isEditable = active.isContentEditable;
          const isFocusable = active.dataset?.kafkaFocusable === 'true';
          if (!isEditable && !isFocusable) return;
          const wrapper = this.#findOwnBlock(active);
          if (!wrapper) return;
          const blocks = this.#state.blocks;
          const idx = blocks.findIndex((b) => b.id === wrapper.dataset.blockId);
          if (idx === -1) return;
          const onFirst = isEditable ? this.#caretOnFirstLine(active) : true;
          const onLast = isEditable ? this.#caretOnLastLine(active) : true;
          if (e.key === 'ArrowUp' && idx > 0 && onFirst) {
            e.preventDefault();
            e.stopPropagation();
            this.#pendingFocus = { id: blocks[idx - 1].id, offset: Number.MAX_SAFE_INTEGER };
            this.#applyPendingFocus();
          } else if (
            e.key === 'ArrowDown' &&
            idx < blocks.length - 1 &&
            onLast
          ) {
            e.preventDefault();
            e.stopPropagation();
            this.#pendingFocus = { id: blocks[idx + 1].id, offset: 0 };
            this.#applyPendingFocus();
          }
        }
      },
      true,
    );
    this.#renderAll();
  }

  setContent(blocks) {
    this.#state.setBlocks(blocks);
  }

  toJSON() {
    return this.#state.toJSON();
  }

  get state() {
    return this.#state;
  }

  undo() {
    return this.#state.undo();
  }

  redo() {
    return this.#state.redo();
  }

  get canUndo() {
    return this.#state.canUndo();
  }

  get canRedo() {
    return this.#state.canRedo();
  }

  #onStateChange(event) {
    if (event.type === 'update' && event.replace) {
      this.#refreshBlock(event.id);
      this.#applyPendingFocus();
    } else if (event.type !== 'update') {
      this.#renderAll();
      this.#applyPendingFocus();
    }
    this.dispatchEvent(new CustomEvent('change', { detail: this.toJSON() }));
    // Editor must always contain at least one block; otherwise it becomes
    // an unclickable dead zone with no way to start typing.
    if (this.#state.blocks.length === 0) {
      const newId = this.#state.insertBlockAt(
        { type: 'paragraph', data: { text: '' } },
        0,
      );
      this.#pendingFocus = { id: newId, offset: 0 };
      this.#applyPendingFocus();
    }
  }

  #renderAll() {
    if (!this.#root) return;
    this.#root.replaceChildren();
    this.#blockEls.clear();
    const blocks = this.#state.blocks;
    for (let i = 0; i < blocks.length; i++) {
      const def = getBlock(blocks[i].type);
      if (!def) continue;
      const wrapper = this.#renderBlock(blocks[i], def);
      this.#blockEls.set(blocks[i].id, wrapper);
      this.#root.appendChild(wrapper);
      this.#root.appendChild(this.#renderInsertSlot(i + 1));
    }
    if (this.#focusedBlockId && this.#blockEls.has(this.#focusedBlockId)) {
      this.#blockEls.get(this.#focusedBlockId).dataset.focused = '';
    }
  }

  #renderInsertSlot(index) {
    const slot = document.createElement('div');
    slot.className = 'kafka-insert-slot';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kafka-insert-btn';
    btn.tabIndex = -1;
    btn.title = 'Insert block here';
    btn.textContent = '+';
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.#openInsertAtMenu(btn, index);
    });
    slot.appendChild(btn);
    return slot;
  }

  #openInsertAtMenu(anchor, index) {
    const items = listBlocks()
      .filter((b) => b.menu)
      .map((opt) => ({
        label: opt.menu.label,
        hint: opt.menu.hint,
        onSelect: () => this.#insertAt(opt, index),
      }));
    this.#openPopup(anchor, items);
  }

  #insertAt(def, index) {
    const data = typeof def.defaultData === 'function' ? def.defaultData() : {};
    const newId = this.#state.insertBlockAt({ type: def.type, data }, index);
    this.#pendingFocus = { id: newId, offset: 0 };
    this.#applyPendingFocus();
  }

  #renderBlock(block, def) {
    const wrapper = document.createElement('div');
    wrapper.className = 'kafka-block';
    wrapper.id = block.id;
    wrapper.dataset.blockId = block.id;
    wrapper.dataset.blockType = block.type;
    wrapper.tabIndex = -1;
    if (typeof block.data.className === 'string' && block.data.className.trim()) {
      for (const cls of block.data.className.trim().split(/\s+/)) {
        wrapper.classList.add(cls);
      }
    }

    wrapper.appendChild(this.#renderToolbar(block, def));

    const content = document.createElement('div');
    content.className = 'kafka-block-content';
    const el = def.render(block.data, this.#blockContext(block));
    content.appendChild(el);
    wrapper.appendChild(content);

    return wrapper;
  }

  #renderToolbar(block, def) {
    const toolbar = document.createElement('div');
    toolbar.className = 'kafka-block-toolbar';
    toolbar.addEventListener('mousedown', (e) => {
      if (e.target.closest('button, [role="button"]')) e.preventDefault();
    });

    const blocks = this.#state.blocks;
    const idx = blocks.findIndex((b) => b.id === block.id);
    const isFirst = idx <= 0;
    const isLast = idx === blocks.length - 1;

    // Parent-block selector (only for nested editors)
    if (this.#parentEditor) {
      toolbar.appendChild(this.#tbButton({
        label: '↑',
        title: 'Select parent block',
        className: 'kafka-tb-parent',
        onClick: () => {
          const parentWrapper = this.#parentEditor.findBlockContaining(this);
          if (parentWrapper) parentWrapper.focus();
        },
      }));
      toolbar.appendChild(this.#tbSep());
    }

    // Block-type switcher
    const typeBtn = this.#tbButton({
      label: def.menu?.label ?? def.type,
      className: 'kafka-tb-type',
      title: 'Change block type',
      onClick: () => this.#openTypeMenu(typeBtn, block),
    });
    toolbar.appendChild(typeBtn);

    toolbar.appendChild(this.#tbSep());

    // Move up / down
    toolbar.appendChild(this.#tbButton({
      label: '↑',
      title: 'Move up',
      disabled: isFirst,
      onClick: () => this.#state.moveBlock(block.id, -1),
    }));
    toolbar.appendChild(this.#tbButton({
      label: '↓',
      title: 'Move down',
      disabled: isLast,
      onClick: () => this.#state.moveBlock(block.id, 1),
    }));

    // Block-specific section
    if (typeof def.toolbar === 'function') {
      const section = def.toolbar(block.data, this.#blockContext(block));
      if (section) {
        toolbar.appendChild(this.#tbSep());
        const wrap = document.createElement('div');
        wrap.className = 'kafka-tb-section';
        wrap.appendChild(section);
        toolbar.appendChild(wrap);
      }
    }

    toolbar.appendChild(this.#tbSep());

    // More menu
    const moreBtn = this.#tbButton({
      label: '⋮',
      className: 'kafka-tb-more',
      title: 'More options',
      onClick: () => this.#openMoreMenu(moreBtn, block),
    });
    toolbar.appendChild(moreBtn);

    return toolbar;
  }

  #tbButton({ label, title, className = '', onClick, disabled = false }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = ('kafka-tb-btn ' + className).trim();
    btn.tabIndex = -1;
    btn.textContent = label;
    if (title) btn.title = title;
    if (disabled) {
      btn.disabled = true;
      btn.classList.add('is-disabled');
    } else if (onClick) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
      });
    }
    return btn;
  }

  #tbSep() {
    const sep = document.createElement('span');
    sep.className = 'kafka-tb-sep';
    sep.setAttribute('aria-hidden', 'true');
    return sep;
  }

  #blockContext(block) {
    return {
      onUpdate: (data) => this.#state.updateBlock(block.id, data),
      split: (beforeData, afterBlock) => this.#splitBlock(block, beforeData, afterBlock),
      mergeWithPrevious: (text) => this.#mergeWithPrevious(block, text),
      remove: () => this.#state.removeBlock(block.id),
      transform: (type, data) => this.#transformBlock(block.id, type, data),
      refresh: () => this.#refreshBlock(block.id),
      removeAndFocusPrevious: () => this.#removeFocusPrev(block),
      getData: () => this.#state.blocks.find((b) => b.id === block.id)?.data,
    };
  }

  #findOwnBlock(target) {
    let node = target;
    while (node && node !== this.#root) {
      if (
        node.parentNode === this.#root &&
        node.classList?.contains('kafka-block')
      ) {
        return node;
      }
      node = node.parentNode;
    }
    return null;
  }

  #findParentEditor() {
    let p = this.parentNode;
    while (p) {
      if (p.tagName === 'KAFKA-EDITOR') return p;
      p = p.parentNode;
    }
    return null;
  }

  findBlockContaining(child) {
    for (const wrapper of this.#blockEls.values()) {
      if (wrapper.contains(child)) return wrapper;
    }
    return null;
  }

  #removeFocusPrev(block) {
    const blocks = this.#state.blocks;
    const idx = blocks.findIndex((b) => b.id === block.id);
    if (idx === -1) return false;
    const prevId = idx > 0 ? blocks[idx - 1].id : null;
    this.#state.removeBlock(block.id);
    if (prevId) {
      this.#pendingFocus = { id: prevId, offset: Number.MAX_SAFE_INTEGER };
      this.#applyPendingFocus();
    }
    return true;
  }

  #setFocusedBlock(id) {
    if (this.#focusedBlockId === id) return;
    if (this.#focusedBlockId && this.#blockEls.has(this.#focusedBlockId)) {
      delete this.#blockEls.get(this.#focusedBlockId).dataset.focused;
    }
    this.#focusedBlockId = id;
    if (id && this.#blockEls.has(id)) {
      this.#blockEls.get(id).dataset.focused = '';
    }
  }

  #refreshBlock(id) {
    const block = this.#state.blocks.find((b) => b.id === id);
    if (!block) return;
    const def = getBlock(block.type);
    if (!def) return;
    const oldWrapper = this.#blockEls.get(id);
    if (!oldWrapper) return;

    const wasFocused = this.#focusedBlockId === id;
    let savedOffset = null;
    const oldEditable = oldWrapper.querySelector(EDITABLE_SELECTOR);
    if (oldEditable && document.activeElement === oldEditable) {
      if (oldEditable.isContentEditable) savedOffset = getCaretOffset(oldEditable);
    }

    const newWrapper = this.#renderBlock(block, def);
    oldWrapper.replaceWith(newWrapper);
    this.#blockEls.set(id, newWrapper);

    if (wasFocused) {
      newWrapper.dataset.focused = '';
      const newEditable = newWrapper.querySelector(EDITABLE_SELECTOR);
      if (newEditable) {
        newEditable.focus();
        if (savedOffset !== null && newEditable.isContentEditable) {
          setCaret(newEditable, savedOffset);
        }
      }
    }
  }

  #openPopup(anchor, items, placement = 'below-left') {
    if (this.#closeMenu) this.#closeMenu();
    const menu = document.createElement('div');
    menu.className = 'kafka-menu';
    for (const item of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kafka-menu-item';
      if (item.toggled) btn.classList.add('is-toggled');
      const label = document.createElement('span');
      label.className = 'kafka-menu-label';
      label.textContent = item.label;
      btn.appendChild(label);
      if (typeof item.toggled === 'boolean') {
        const toggle = document.createElement('span');
        toggle.className = 'kafka-menu-toggle';
        toggle.setAttribute('role', 'switch');
        toggle.setAttribute('aria-checked', String(item.toggled));
        btn.appendChild(toggle);
      } else if (item.hint) {
        const hint = document.createElement('span');
        hint.className = 'kafka-menu-hint';
        hint.textContent = item.hint;
        btn.appendChild(hint);
      }
      btn.addEventListener('click', () => {
        item.onSelect();
        close();
      });
      menu.appendChild(btn);
    }
    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    if (placement === 'right') {
      menu.style.left = rect.right + 6 + window.scrollX + 'px';
      menu.style.top = rect.top + window.scrollY + 'px';
    } else {
      menu.style.left = rect.left + window.scrollX + 'px';
      menu.style.top = rect.bottom + window.scrollY + 4 + 'px';
    }

    const close = () => {
      menu.remove();
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
      if (this.#closeMenu === close) this.#closeMenu = null;
    };
    const onClickOutside = (e) => {
      if (!menu.contains(e.target) && !anchor.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    setTimeout(() => {
      document.addEventListener('mousedown', onClickOutside);
      document.addEventListener('keydown', onKey);
    }, 0);
    this.#closeMenu = close;
    return close;
  }

  #openTypeMenu(anchor, block) {
    const items = listBlocks()
      .filter((b) => b.menu)
      .map((opt) => ({
        label: opt.menu.label,
        hint: opt.menu.hint,
        onSelect: () => this.#switchType(block, opt),
      }));
    this.#openPopup(anchor, items);
  }

  #openMoreMenu(anchor, block) {
    const current = this.#state.blocks.find((b) => b.id === block.id) ?? block;
    const def = getBlock(current.type);
    const items = [];
    if (typeof def?.moreMenuItems === 'function') {
      const blockItems = def.moreMenuItems(current.data, this.#blockContext(current));
      if (Array.isArray(blockItems)) items.push(...blockItems);
    }
    items.push({
      label: 'CSS class…',
      hint: current.data.className || '',
      onSelect: () => this.#openClassEditor(anchor, current),
    });
    items.push({
      label: 'Delete',
      hint: '⌫',
      onSelect: () => this.#removeFocusPrev(current),
    });
    this.#openPopup(anchor, items);
  }

  #openClassEditor(anchor, block) {
    if (this.#closeMenu) this.#closeMenu();
    const popup = document.createElement('div');
    popup.className = 'kafka-menu kafka-class-editor';

    const label = document.createElement('div');
    label.className = 'kafka-class-label';
    label.textContent = 'CSS class';
    popup.appendChild(label);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'kafka-class-input';
    input.value = block.data.className ?? '';
    input.placeholder = 'my-class another-class';
    popup.appendChild(input);

    const submit = () => {
      const value = input.value.trim();
      this.#state.updateBlock(block.id, { className: value || undefined });
      this.#refreshBlock(block.id);
      close();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    });

    document.body.appendChild(popup);
    const rect = anchor.getBoundingClientRect();
    popup.style.left = rect.left + window.scrollX + 'px';
    popup.style.top = rect.bottom + window.scrollY + 4 + 'px';

    const close = () => {
      popup.remove();
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
      if (this.#closeMenu === close) this.#closeMenu = null;
    };
    const onClickOutside = (e) => {
      if (!popup.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    setTimeout(() => {
      document.addEventListener('mousedown', onClickOutside);
      document.addEventListener('keydown', onKey);
      input.focus();
      input.select();
    }, 0);
    this.#closeMenu = close;
  }

  #switchType(block, def) {
    if (block.type === def.type) return;
    const fresh = typeof def.defaultData === 'function' ? def.defaultData() : {};

    if (def.type === 'columns') {
      // Drop the existing block into the first column so its content is preserved.
      const sourceBlock = { type: block.type, data: { ...block.data } };
      fresh.columns = [
        [sourceBlock],
        [{ type: 'paragraph', data: { text: '' } }],
      ];
      this.#transformBlock(block.id, def.type, fresh);
      return;
    }

    const sourceText = block.data.text ?? block.data.code ?? '';
    const richSource = isRichTextValue(sourceText) ? sourceText : '';
    const plainSource = richTextToString(sourceText);

    if (def.type === 'code') {
      if (plainSource) fresh.code = plainSource;
    } else if ('text' in fresh) {
      if (richSource || plainSource) fresh.text = richSource || plainSource;
    } else if ('code' in fresh) {
      if (plainSource) fresh.code = plainSource;
    }
    if (def.type === 'heading' && typeof block.data.level === 'number') {
      fresh.level = block.data.level;
    }
    this.#transformBlock(block.id, def.type, fresh);
  }

  #transformBlock(id, type, data) {
    this.#state.transformBlock(id, type, data);
    this.#pendingFocus = { id, offset: 0 };
    this.#applyPendingFocus();
  }

  #splitBlock(block, beforeData, afterBlock) {
    const newType = afterBlock.type ?? block.type;
    const newData = afterBlock.data ?? {};
    let newId;
    this.#state.batch(() => {
      this.#state.updateBlock(block.id, beforeData);
      newId = this.#state.insertBlock({ type: newType, data: newData }, block.id);
    });
    this.#pendingFocus = { id: newId, offset: 0 };
    this.#applyPendingFocus();
    return newId;
  }

  #onPaste(e) {
    const target = e.target;
    if (!target || !this.#root.contains(target)) return;
    // Native paste in inputs (image URL, class editor).
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    const wrapper = this.#findOwnBlock(target);
    if (!wrapper) return;
    const blockId = wrapper.dataset.blockId;
    const currentBlock = this.#state.blocks.find((b) => b.id === blockId);
    if (!currentBlock) return;

    const editable = target.isContentEditable ? target : null;
    const isTextHost = editable && isRichTextValue(currentBlock.data.text);

    // Non-rich-text editables (e.g. image caption) — let the browser paste natively.
    if (editable && !isTextHost) return;

    const blocks = parseClipboard(e.clipboardData);
    if (blocks.length === 0) return;

    e.preventDefault();
    e.stopPropagation();

    // Inline-insert: a single pasted paragraph merged into the current text-bearing block.
    if (isTextHost && blocks.length === 1 && blocks[0].type === 'paragraph') {
      this.#inlineInsert(currentBlock, editable, blocks[0].data.text);
      return;
    }

    this.#blockInsert(currentBlock, editable, isTextHost, blocks);
  }

  #inlineInsert(block, editable, pastedText) {
    const { start, end } = getSelectionOffsets(editable);
    const text = getRichText(editable);
    const before = sliceRichText(text, 0, start);
    const after = sliceRichText(text, end, Infinity);
    const merged = concatRichText(concatRichText(before, pastedText), after);

    this.#state.updateBlock(block.id, { text: merged });
    this.#refreshBlock(block.id);

    const caretPos = richTextLength(before) + richTextLength(pastedText);
    const newWrapper = this.#blockEls.get(block.id);
    if (!newWrapper) return;
    const newEditable = newWrapper.querySelector(EDITABLE_SELECTOR);
    if (newEditable && newEditable.isContentEditable) {
      newEditable.focus();
      setCaret(newEditable, caretPos);
    }
  }

  #blockInsert(block, editable, isTextHost, pastedBlocks) {
    let beforeText = null;
    let afterText = null;
    if (isTextHost) {
      const { start, end } = getSelectionOffsets(editable);
      const text = getRichText(editable);
      beforeText = sliceRichText(text, 0, start);
      afterText = sliceRichText(text, end, Infinity);
    }

    let lastId = block.id;
    let focusOffset = Number.MAX_SAFE_INTEGER;

    this.#state.batch(() => {
      if (beforeText !== null) {
        this.#state.updateBlock(block.id, { text: beforeText });
      }
      for (const b of pastedBlocks) {
        lastId = this.#state.insertBlock(b, lastId);
      }
      if (afterText !== null && richTextLength(afterText) > 0) {
        lastId = this.#state.insertBlock(
          { type: 'paragraph', data: { text: afterText } },
          lastId,
        );
        focusOffset = 0;
      }
    });

    this.#pendingFocus = { id: lastId, offset: focusOffset };
    this.#applyPendingFocus();
  }

  #mergeWithPrevious(block, appendText) {
    const blocks = this.#state.blocks;
    const idx = blocks.findIndex((b) => b.id === block.id);
    if (idx <= 0) return null;
    const prev = blocks[idx - 1];
    if (!isRichTextValue(prev.data.text)) return null;
    const mergeOffset = richTextLength(prev.data.text);
    const merged = concatRichText(prev.data.text, appendText);
    this.#state.batch(() => {
      this.#state.updateBlock(prev.id, { text: merged });
      this.#state.removeBlock(block.id);
    });
    this.#pendingFocus = { id: prev.id, offset: mergeOffset };
    this.#applyPendingFocus();
    return { prevId: prev.id, mergeOffset };
  }

  #applyPendingFocus() {
    if (!this.#pendingFocus || !this.#root) return;
    const { id, offset } = this.#pendingFocus;
    this.#pendingFocus = null;
    const wrapper = this.#blockEls.get(id);
    if (!wrapper) return;
    const editable = wrapper.querySelector(EDITABLE_SELECTOR);
    if (!editable) return;
    editable.focus();
    if (editable.isContentEditable) setCaret(editable, offset);
    this.#setFocusedBlock(id);
  }

  #selectionToolbar = null;
  #savedSelectionRange = null;

  #mountSelectionToolbar() {
    const bar = document.createElement('div');
    bar.className = 'kafka-selection-toolbar';
    bar.setAttribute('aria-hidden', 'true');
    bar.addEventListener('mousedown', (e) => {
      if (e.target.closest('button, input')) return;
      e.preventDefault();
    });

    const main = document.createElement('div');
    main.className = 'kafka-selection-main';
    main.appendChild(this.#stbButton('B', 'Bold (Cmd+B)', 'bold', () => this.#applyMark('bold')));
    main.appendChild(this.#stbButton('I', 'Italic (Cmd+I)', 'italic', () => this.#applyMark('italic')));
    main.appendChild(this.#stbButton('U', 'Underline (Cmd+U)', 'underline', () => this.#applyMark('underline')));
    main.appendChild(this.#stbButton('🔗', 'Link', 'link', () => this.#openLinkInput(bar, main)));
    main.appendChild(this.#stbButton('A', 'Text color', 'color', (btn) => this.#openColorPicker(btn)));
    bar.appendChild(main);

    document.body.appendChild(bar);
    this.#selectionToolbar = bar;
    try {
      document.execCommand('styleWithCSS', false, true);
    } catch {}

    document.addEventListener('selectionchange', () => this.#updateSelectionToolbar());
    window.addEventListener('scroll', () => this.#updateSelectionToolbar(), true);
    window.addEventListener('resize', () => this.#updateSelectionToolbar());
  }

  #stbButton(label, title, mark, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kafka-stb-btn kafka-stb-' + mark;
    btn.tabIndex = -1;
    btn.title = title;
    btn.textContent = label;
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick(btn);
    });
    return btn;
  }

  #applyMark(mark) {
    this.#restoreSelection();
    document.execCommand(mark);
    this.#updateSelectionToolbar();
  }

  #saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      this.#savedSelectionRange = sel.getRangeAt(0).cloneRange();
    }
  }

  #restoreSelection() {
    if (!this.#savedSelectionRange) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(this.#savedSelectionRange);
  }

  #updateSelectionToolbar() {
    if (!this.#selectionToolbar) return;
    // Don't react to selection changes while the link input or the color
    // picker is open — the user is typing in those, not editing the selection.
    if (this.#selectionToolbar.querySelector('.kafka-selection-link')) return;
    if (document.activeElement?.closest('.kafka-color-picker')) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      this.#hideSelectionToolbar();
      return;
    }
    const range = sel.getRangeAt(0);
    const editable = this.#findRichEditable(range.commonAncestorContainer);
    if (!editable || !this.contains(editable)) {
      this.#hideSelectionToolbar();
      return;
    }
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      this.#hideSelectionToolbar();
      return;
    }
    this.#savedSelectionRange = range.cloneRange();
    this.#showSelectionToolbar(rect);
    this.#refreshMarkButtons();
  }

  #findRichEditable(node) {
    const start = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!start) return null;
    return start.closest('[contenteditable="true"]');
  }

  #caretOnFirstLine(el) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return true;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.startContainer)) return false;
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0 && rect.top === 0) return true;
    const elRect = el.getBoundingClientRect();
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 24;
    return rect.top - elRect.top < lineHeight * 0.5;
  }

  #caretOnLastLine(el) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return true;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.startContainer)) return false;
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0 && rect.top === 0) return true;
    const elRect = el.getBoundingClientRect();
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 24;
    return elRect.bottom - rect.bottom < lineHeight * 0.5;
  }

  #refreshMarkButtons() {
    if (!this.#selectionToolbar) return;
    for (const mark of ['bold', 'italic', 'underline']) {
      const btn = this.#selectionToolbar.querySelector('.kafka-stb-' + mark);
      if (!btn) continue;
      const active = document.queryCommandState?.(mark);
      btn.classList.toggle('is-active', !!active);
    }
  }

  #showSelectionToolbar(rect) {
    const bar = this.#selectionToolbar;
    bar.style.display = 'flex';
    // Provisional placement so we can read its size.
    bar.style.left = '0px';
    bar.style.top = '0px';
    const barRect = bar.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - barRect.width / 2 + window.scrollX;
    left = Math.max(8, Math.min(left, window.innerWidth - barRect.width - 8));
    let top = rect.top - barRect.height - 8 + window.scrollY;
    if (top < window.scrollY + 8) {
      top = rect.bottom + 8 + window.scrollY;
    }
    bar.style.left = left + 'px';
    bar.style.top = top + 'px';
  }

  #hideSelectionToolbar() {
    if (!this.#selectionToolbar) return;
    this.#selectionToolbar.style.display = 'none';
    // Restore the toolbar to its main view in case a link input was open.
    const linkBox = this.#selectionToolbar.querySelector('.kafka-selection-link');
    if (linkBox) linkBox.remove();
    const main = this.#selectionToolbar.querySelector('.kafka-selection-main');
    if (main) main.style.display = '';
    this.#savedSelectionRange = null;
  }

  #openColorPicker(anchor) {
    if (this.#closeMenu) this.#closeMenu();
    const popup = document.createElement('div');
    popup.className = 'kafka-color-picker';

    const swatches = document.createElement('div');
    swatches.className = 'kafka-color-swatches';
    for (const preset of this.#colorPresets) {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'kafka-color-swatch';
      sw.tabIndex = -1;
      sw.title = preset.name;
      if (preset.value) {
        sw.style.background = preset.value;
      } else {
        sw.classList.add('is-default');
      }
      sw.addEventListener('mousedown', (e) => e.preventDefault());
      sw.addEventListener('click', (e) => {
        e.stopPropagation();
        this.#applyColor(preset.value);
        close();
      });
      swatches.appendChild(sw);
    }
    popup.appendChild(swatches);

    const customWrap = document.createElement('div');
    customWrap.className = 'kafka-color-custom';
    const customInput = document.createElement('input');
    customInput.type = 'text';
    customInput.className = 'kafka-color-input';
    customInput.placeholder = '#hex or rgb(…)';
    customInput.addEventListener('mousedown', (e) => e.stopPropagation());
    customInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = customInput.value.trim();
        if (v) this.#applyColor(v);
        close();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    });
    customWrap.appendChild(customInput);
    popup.appendChild(customWrap);

    document.body.appendChild(popup);
    const rect = anchor.getBoundingClientRect();
    popup.style.left = rect.left + window.scrollX + 'px';
    popup.style.top = rect.bottom + window.scrollY + 6 + 'px';

    const close = () => {
      popup.remove();
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
      if (this.#closeMenu === close) this.#closeMenu = null;
    };
    const onClickOutside = (e) => {
      if (!popup.contains(e.target) && !anchor.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    setTimeout(() => {
      document.addEventListener('mousedown', onClickOutside);
      document.addEventListener('keydown', onKey);
    }, 0);
    this.#closeMenu = close;
  }

  #applyColor(value) {
    this.#restoreSelection();
    if (!value) {
      document.execCommand('removeFormat');
      // removeFormat can also strip bold/italic — safer: only strip color via a tighter approach
      // For v0.1, accept that "Default" removes inline formatting on the selection.
    } else {
      document.execCommand('foreColor', false, value);
    }
    this.#updateSelectionToolbar();
  }

  #openLinkInput(bar, main) {
    main.style.display = 'none';
    const box = document.createElement('div');
    box.className = 'kafka-selection-link';
    const input = document.createElement('input');
    input.type = 'url';
    input.placeholder = 'Paste URL';
    input.className = 'kafka-selection-link-input';
    input.addEventListener('mousedown', (e) => e.stopPropagation());

    const submit = () => {
      const url = input.value.trim();
      this.#restoreSelection();
      if (url) {
        document.execCommand('createLink', false, url);
      } else {
        document.execCommand('unlink');
      }
      box.remove();
      main.style.display = '';
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        box.remove();
        main.style.display = '';
      }
    });

    box.appendChild(input);
    bar.appendChild(box);
    setTimeout(() => input.focus(), 0);
  }
}

if (!customElements.get('kafka-editor')) {
  customElements.define('kafka-editor', KafkaEditor);
}
