const PROVIDERS = [
  {
    name: 'youtube',
    match: /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    embed: (id) => `https://www.youtube.com/embed/${id}`,
    aspect: '16 / 9',
  },
  {
    name: 'vimeo',
    match: /vimeo\.com\/(?:video\/)?(\d+)/,
    embed: (id) => `https://player.vimeo.com/video/${id}`,
    aspect: '16 / 9',
  },
];

function detect(url) {
  for (const p of PROVIDERS) {
    const m = p.match.exec(url);
    if (m) return { provider: p, id: m[1] };
  }
  return null;
}

function isSafeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export const EmbedBlock = {
  type: 'embed',
  defaultData: () => ({ url: '' }),
  menu: { label: 'Embed', hint: 'YouTube, Vimeo, …' },

  render(data, ctx) {
    const fig = document.createElement('figure');
    fig.className = 'kafka-embed';

    if (!data.url) {
      const form = document.createElement('div');
      form.className = 'kafka-embed-form';
      const input = document.createElement('input');
      input.type = 'url';
      input.placeholder = 'Paste a YouTube or Vimeo URL';
      input.className = 'kafka-embed-input';
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
          e.preventDefault();
          const url = input.value.trim();
          const found = detect(url);
          ctx.onUpdate({ url, provider: found?.provider.name });
          ctx.refresh();
        }
      });
      form.appendChild(input);
      fig.appendChild(form);
      return fig;
    }

    const found = detect(data.url);
    if (found && isSafeUrl(data.url)) {
      const wrap = document.createElement('div');
      wrap.className = 'kafka-embed-frame';
      wrap.style.aspectRatio = found.provider.aspect;
      const iframe = document.createElement('iframe');
      iframe.src = found.provider.embed(found.id);
      iframe.allow =
        'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.allowFullscreen = true;
      iframe.loading = 'lazy';
      wrap.appendChild(iframe);
      fig.appendChild(wrap);
    } else {
      const fallback = document.createElement('div');
      fallback.className = 'kafka-embed-fallback';
      const link = document.createElement('a');
      if (isSafeUrl(data.url)) {
        link.href = data.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      link.textContent = data.url;
      const note = document.createElement('span');
      note.className = 'kafka-embed-fallback-note';
      note.textContent = 'No preview available';
      fallback.appendChild(link);
      fallback.appendChild(note);
      fig.appendChild(fallback);
    }
    return fig;
  },
};
