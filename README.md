# KafkaJS

> A minimal, framework-free block editor.

KafkaJS is a block-based content editor built with zero dependencies, surgical Vanilla JavaScript, and a strict JSON-first data model.

It is **not** related to Apache Kafka. The name nods to precision and a quiet, distraction-free writing experience.

## Why

- **Zero frameworks.** No React, no Vue. Plain ES modules and a Web Component.
- **JSON in, JSON out.** Clean, headless-friendly data — no HTML strings.
- **Modular blocks.** Each block type is a small, self-contained module.
- **Drop-in.** Works with any backend — PHP, Laravel, Go, Rust — via a single Web Component.
- **Minimal UI.** Black-and-white, contextual, focused on the text.

## Quick start

```html
<!DOCTYPE html>
<html>
<body>
  <kafka-editor></kafka-editor>

  <script type="module">
    import './src/index.js';

    const editor = document.querySelector('kafka-editor');
    editor.setContent([
      { type: 'heading', data: { level: 1, text: 'Hello' } },
      { type: 'paragraph', data: { text: 'Plain text below.' } },
    ]);
    editor.addEventListener('change', () => {
      console.log(editor.toJSON());
    });
  </script>
</body>
</html>
```

Run the demo locally:

```bash
npm run dev
# open http://localhost:8080
```

## Built-in blocks

| Type        | Data shape                                        | Notes                                          |
|-------------|---------------------------------------------------|------------------------------------------------|
| `paragraph` | `{ text }`                                        | Plain or rich text. Shift+Enter = soft break.  |
| `heading`   | `{ level: 1–6, text }`                            | H1–H6 picker in the block toolbar.             |
| `quote`     | `{ text }`                                        | Italic, left-bordered.                         |
| `list`      | `{ ordered: bool, items: [text, …] }`             | Toggle bullet/numbered in toolbar.             |
| `code`      | `{ code, language?, showCopy? }`                  | Monospace, optional copy button.               |
| `image`     | `{ src, alt?, caption? }`                         | File upload, drag-drop, or URL paste.          |
| `columns`   | `{ columns: [[block, …], [block, …]] }`           | 2 or 3 nested editors side by side.            |

`text` is either a string or an array of runs: `[{ text, bold?, italic?, underline?, link?, color? }, …]`.

## Editing

### Keyboard

- **Enter** — split text block, or exit list/quote into a paragraph
- **Shift + Enter** — soft line break (`\n` inside the same block)
- **Backspace at start** — merge with previous block
- **Cmd/Ctrl + Enter** — exit any block (creates an empty paragraph below)
- **Esc** — leave editing entirely (blurs)
- **↑ / ↓** — move between blocks when caret is on the first/last line
- **Cmd/Ctrl + B / I / U** — bold, italic, underline on selected text

### Mouse

- Click a block → its toolbar floats above (type switcher, move, block-specific controls, more menu)
- Hover between two blocks → `+` slot to insert a block at that position
- Select text → inline toolbar (B I U, link, color)
- In a column block, the inner block toolbar shows a `↑` button to select the parent column block

## API

### Setting and reading content

```js
editor.setContent([{ type: 'paragraph', data: { text: 'Hello' } }]);
const json = editor.toJSON();
editor.addEventListener('change', (e) => console.log(e.detail));
```

### Defining a custom block

```js
import { Kafka } from './src/index.js';

Kafka.registerBlock({
  type: 'callout',
  defaultData: () => ({ text: '', tone: 'info' }),
  menu: { label: 'Callout', hint: 'Highlighted note' },

  render(data, ctx) {
    const el = document.createElement('div');
    el.className = 'kafka-callout tone-' + data.tone;
    el.contentEditable = 'true';
    el.textContent = data.text ?? '';
    el.addEventListener('input', () => ctx.onUpdate({ text: el.textContent }));
    return el;
  },

  // Optional: extra controls in the block's main toolbar.
  toolbar(data, ctx) { /* … */ },

  // Optional: extra items in the block's "more" menu.
  moreMenuItems(data, ctx) {
    return [
      {
        label: 'Info tone',
        toggled: data.tone === 'info',
        onSelect: () => {
          ctx.onUpdate({ tone: 'info' });
          ctx.refresh();
        },
      },
    ];
  },
});
```

The render context exposes:

| Method                                  | What it does                                                   |
|-----------------------------------------|----------------------------------------------------------------|
| `onUpdate(partialData)`                 | Merge fields into the block's data (no re-render).             |
| `refresh()`                             | Re-render this block in place (preserves caret).               |
| `getData()`                             | Get the latest data for this block.                            |
| `split(beforeData, { type?, data })`    | Split block: keep `beforeData`, insert new block after.        |
| `mergeWithPrevious(text)`               | Append `text` to previous block, remove this one.              |
| `removeAndFocusPrevious()`              | Remove this block, focus the previous one.                     |
| `transform(type, data)`                 | Replace this block with a different type.                      |

### Styling individual blocks

Every block wrapper carries:

- `id` — the block's UUID (use as `#<id>` in CSS)
- `data-block-id` — same UUID, attribute form
- `data-block-type` — the block type (`paragraph`, `heading`, …)
- Any classes set via `data.className`

```css
#b9ec16456-6351-49c4-b108-7fae3717efc7 { background: #fffbe6; }
.my-callout { padding: 1rem; border-left: 3px solid hotpink; }
[data-block-type="code"] { font-size: 0.9em; }
```

Set a class on a block from the editor: focus the block → `⋮` menu → "CSS class…" → type the class name → Enter.

### Configuring color presets

The host application can pass its own palette into the inline color picker:

```js
editor.colorPresets = [
  { name: 'Default', value: null },         // null clears the color
  { name: 'Brand',   value: '#ff0066' },
  { name: 'Accent',  value: 'rgb(0, 170, 255)' },
];
```

Users can also type any custom hex / rgb value into the picker's input.

## Project layout

```
src/
├── index.js              Public API
├── core/
│   ├── editor.js         <kafka-editor> Web Component
│   ├── state.js          Observable EditorState
│   ├── registry.js       Block registry
│   ├── caret.js          Selection / caret helpers
│   └── richtext.js       Rich-text run helpers (set/get/slice/concat)
├── blocks/
│   ├── paragraph.js
│   ├── heading.js
│   ├── quote.js
│   ├── list.js
│   ├── code.js
│   ├── image.js
│   └── columns.js
└── styles/
    └── editor.css
```

## Roadmap

- [x] Core state + Web Component shell
- [x] Paragraph, heading, quote, list, code, image, columns blocks
- [x] Keyboard navigation (Enter, Backspace, ↑/↓, Cmd+Enter, Esc)
- [x] Inline formatting (bold, italic, underline, link, color)
- [x] Per-block UUID + custom CSS class
- [x] Configurable color presets
- [ ] Slash menu (`/heading`, `/list`, …)
- [ ] Multi-block selection (select whole blocks with Shift+click)
- [ ] Drag-to-reorder blocks
- [ ] Companion PHP renderer for SSR

## License

MIT
