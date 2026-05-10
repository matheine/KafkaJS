// Rich-text values are either a plain string (no marks) or an array of runs:
//   [{ text, bold?, italic?, underline?, link?, color? }, ...]
// `text` may contain `\n` for soft line breaks; rendered as <br>.

const MARK_KEYS = ['bold', 'italic', 'underline', 'link', 'color'];

function isPlainRun(run) {
  return MARK_KEYS.every((k) => !run[k]);
}

function marksEqual(a, b) {
  return MARK_KEYS.every((k) => (a[k] ?? null) === (b[k] ?? null));
}

function pickMarks(run) {
  const out = {};
  for (const k of MARK_KEYS) if (run[k]) out[k] = run[k];
  return out;
}

function applyMarks(textNode, marks) {
  let node = textNode;
  if (marks.color) {
    const span = document.createElement('span');
    span.style.color = marks.color;
    span.appendChild(node);
    node = span;
  }
  if (marks.link) {
    const a = document.createElement('a');
    a.href = marks.link;
    a.appendChild(node);
    node = a;
  }
  if (marks.underline) {
    const u = document.createElement('u');
    u.appendChild(node);
    node = u;
  }
  if (marks.italic) {
    const em = document.createElement('em');
    em.appendChild(node);
    node = em;
  }
  if (marks.bold) {
    const strong = document.createElement('strong');
    strong.appendChild(node);
    node = strong;
  }
  return node;
}

export function setRichText(el, value) {
  el.replaceChildren();
  const runs = typeof value === 'string'
    ? [{ text: value }]
    : Array.isArray(value)
      ? value
      : [];

  let endsWithNewline = false;
  for (const run of runs) {
    const text = run.text ?? '';
    const marks = pickMarks(run);
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (i > 0) el.appendChild(document.createElement('br'));
      if (line === '') return;
      const textNode = document.createTextNode(line);
      el.appendChild(applyMarks(textNode, marks));
    });
    endsWithNewline = text.endsWith('\n');
  }
  // Phantom trailing <br> so the cursor is visible on a final empty line.
  if (endsWithNewline) el.appendChild(document.createElement('br'));
}

export function getRichText(el) {
  const trailingBr =
    el.lastChild && el.lastChild.nodeName === 'BR' ? el.lastChild : null;

  const runs = [];
  let pending = { text: '', marks: {} };

  function flush() {
    if (pending.text) runs.push({ text: pending.text, ...pending.marks });
    pending = { text: '', marks: {} };
  }

  function append(text, marks) {
    if (!marksEqual(pending.marks, marks)) {
      flush();
      pending = { text, marks };
    } else {
      pending.text += text;
    }
  }

  function walk(node, marks) {
    if (node === trailingBr) return;
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) append(node.textContent, marks);
      return;
    }
    if (node.nodeName === 'BR') {
      append('\n', marks);
      return;
    }
    const next = { ...marks };
    const tag = node.nodeName;
    if (tag === 'B' || tag === 'STRONG') next.bold = true;
    else if (tag === 'I' || tag === 'EM') next.italic = true;
    else if (tag === 'U') next.underline = true;
    else if (tag === 'A') next.link = node.getAttribute('href') || '';
    else if (tag === 'SPAN' && node.style?.color) next.color = node.style.color;

    for (const child of node.childNodes) walk(child, next);
  }

  for (const child of el.childNodes) walk(child, {});
  flush();

  if (runs.every(isPlainRun)) {
    return runs.map((r) => r.text).join('');
  }
  return runs;
}

export function richTextLength(value) {
  if (typeof value === 'string') return value.length;
  if (!Array.isArray(value)) return 0;
  return value.reduce((n, r) => n + (r.text?.length ?? 0), 0);
}

export function richTextToString(value) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.map((r) => r.text ?? '').join('');
}

export function concatRichText(a, b) {
  if (typeof a === 'string' && typeof b === 'string') return a + b;
  const aRuns = typeof a === 'string' ? (a ? [{ text: a }] : []) : (a ?? []);
  const bRuns = typeof b === 'string' ? (b ? [{ text: b }] : []) : (b ?? []);
  const merged = [...aRuns, ...bRuns];
  if (merged.every(isPlainRun)) return merged.map((r) => r.text).join('');
  return merged;
}

export function isRichTextValue(value) {
  return typeof value === 'string' || Array.isArray(value);
}

export function sliceRichText(value, start, end) {
  if (typeof value === 'string') return value.slice(start, end);
  if (!Array.isArray(value)) return '';
  const out = [];
  let pos = 0;
  for (const run of value) {
    const len = run.text.length;
    const a = Math.max(start, pos);
    const b = Math.min(end, pos + len);
    if (a < b) {
      out.push({ ...run, text: run.text.slice(a - pos, b - pos) });
    }
    pos += len;
    if (pos >= end) break;
  }
  if (out.every(isPlainRun)) return out.map((r) => r.text).join('');
  return out;
}
