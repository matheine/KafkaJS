const SIZES = ['small', 'medium', 'large'];

function normalizeSize(size) {
  return SIZES.includes(size) ? size : 'medium';
}

function bindBlockKeys(el, ctx) {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      ctx.split({}, { type: 'paragraph', data: { text: '' } });
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      ctx.removeAndFocusPrevious();
    }
  });
}

export const SpacerBlock = {
  type: 'spacer',
  defaultData: () => ({ size: 'medium' }),
  menu: { label: 'Spacer', hint: 'Vertical whitespace' },

  render(data, ctx) {
    const size = normalizeSize(data.size);
    const el = document.createElement('div');
    el.className = 'kafka-spacer kafka-spacer-' + size;
    el.tabIndex = 0;
    el.dataset.kafkaFocusable = 'true';
    el.setAttribute('aria-label', `Spacer (${size})`);
    el.setAttribute('role', 'presentation');

    bindBlockKeys(el, ctx);
    return el;
  },

  toolbar(data, ctx) {
    const bar = document.createElement('div');
    bar.className = 'kafka-spacer-toolbar';
    const current = normalizeSize(data.size);
    const labels = { small: 'S', medium: 'M', large: 'L' };
    for (const size of SIZES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kafka-toolbar-btn';
      btn.tabIndex = -1;
      btn.title = size;
      if (size === current) btn.classList.add('is-active');
      btn.textContent = labels[size];
      btn.addEventListener('click', () => {
        ctx.onUpdate({ size });
        ctx.refresh();
      });
      bar.appendChild(btn);
    }
    return bar;
  },
};
