async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export const CodeBlock = {
  type: 'code',
  defaultData: () => ({ code: '', language: '', showCopy: true }),
  menu: { label: 'Code', hint: 'monospace' },

  render(data, ctx) {
    const pre = document.createElement('pre');
    pre.className = 'kafka-code';

    if (data.showCopy !== false) {
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'kafka-code-copy';
      copyBtn.tabIndex = -1;
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('mousedown', (e) => e.preventDefault());
      copyBtn.addEventListener('click', async () => {
        const ok = await copyText(code.textContent);
        if (!ok) return;
        copyBtn.textContent = 'Copied';
        copyBtn.classList.add('is-copied');
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
          copyBtn.classList.remove('is-copied');
        }, 1200);
      });
      pre.appendChild(copyBtn);
    }

    const code = document.createElement('code');
    code.className = 'kafka-code-content';
    code.contentEditable = 'plaintext-only';
    code.spellcheck = false;
    code.textContent = data.code ?? '';
    code.setAttribute('data-placeholder', 'Code…');

    code.addEventListener('input', () => ctx.onUpdate({ code: code.textContent }));

    code.addEventListener('keydown', (e) => {
      if (e.isComposing) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        document.execCommand('insertText', false, '  ');
        return;
      }

      if (e.key === 'Backspace') {
        const sel = window.getSelection();
        if (sel.isCollapsed && code.textContent === '') {
          e.preventDefault();
          ctx.removeAndFocusPrevious();
        }
      }
    });

    pre.appendChild(code);
    return pre;
  },

  moreMenuItems(data, ctx) {
    return [
      {
        label: 'Show copy button',
        toggled: data.showCopy !== false,
        onSelect: () => {
          ctx.onUpdate({ showCopy: !(data.showCopy !== false) });
          ctx.refresh();
        },
      },
    ];
  },
};
