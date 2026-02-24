// Clipwise Docs — shared interactions

// Map header label → highlight.js language class
const LANG_MAP = {
  bash: 'language-bash',
  shell: 'language-bash',
  typescript: 'language-typescript',
  ts: 'language-typescript',
  javascript: 'language-javascript',
  js: 'language-javascript',
  yaml: 'language-yaml',
  yml: 'language-yaml',
  html: 'language-html',
  css: 'language-css',
  json: 'language-json',
};

/**
 * Extract page content as clean markdown-like text for AI consumption.
 * Walks all sections, converts headings/tables/code blocks into a format
 * that AI tools can parse without HTML noise.
 */
function extractPageText() {
  const parts = [];
  const sections = document.querySelectorAll('.hero, .section');

  sections.forEach(section => {
    // Headings
    section.querySelectorAll('h1, h2, h3, .section-label').forEach(el => {
      const tag = el.tagName;
      const prefix = tag === 'H1' ? '# ' : tag === 'H2' ? '## ' : tag === 'H3' ? '### ' : '#### ';
      parts.push(prefix + el.textContent.trim());
    });

    // Paragraphs and descriptions
    section.querySelectorAll('.hero-sub, .section-sub, .feature-desc, .effect-desc, .step-desc, .ai-ready-desc, p').forEach(el => {
      const text = el.textContent.trim();
      if (text) parts.push(text);
    });

    // Feature/effect cards — titles
    section.querySelectorAll('.feature-title, .effect-title').forEach(el => {
      parts.push('- ' + el.textContent.trim());
    });

    // Tables → markdown table
    section.querySelectorAll('table').forEach(table => {
      const rows = [];
      table.querySelectorAll('tr').forEach(tr => {
        const cells = Array.from(tr.querySelectorAll('th, td')).map(c => c.textContent.trim());
        rows.push('| ' + cells.join(' | ') + ' |');
        // Add separator after header row
        if (tr.querySelector('th') && rows.length === 1) {
          rows.push('| ' + cells.map(() => '---').join(' | ') + ' |');
        }
      });
      parts.push(rows.join('\n'));
    });

    // Code blocks → fenced
    section.querySelectorAll('.code-block').forEach(block => {
      const header = block.querySelector('.code-header');
      const code = block.querySelector('pre > code');
      if (!code) return;
      const lang = header ? header.textContent.trim().split('—')[0].trim().toLowerCase() : '';
      parts.push('```' + lang + '\n' + code.textContent.trimEnd() + '\n```');
    });
  });

  return parts.filter(Boolean).join('\n\n');
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  btn.querySelector('.copy-icon').style.display = 'none';
  btn.querySelector('.check-icon').style.display = '';
  btn.classList.add('copied');
  setTimeout(() => {
    btn.querySelector('.copy-icon').style.display = '';
    btn.querySelector('.check-icon').style.display = 'none';
    btn.classList.remove('copied');
  }, 2000);
}

document.addEventListener('DOMContentLoaded', () => {
  // ── Hero command copy ────────────────────────────────
  const heroBtn = document.getElementById('hero-copy-btn');
  const heroCmd = document.getElementById('hero-cmd');
  if (heroBtn && heroCmd) {
    heroBtn.addEventListener('click', () => {
      const text = heroCmd.querySelector('span').textContent.trim();
      copyText(text, heroBtn);
    });
  }

  // ── AI Schema copy-all button ───────────────────────
  const schemaBtn = document.getElementById('copy-schema-btn');
  const schemaEl = document.getElementById('ai-schema-content');
  if (schemaBtn && schemaEl) {
    schemaBtn.addEventListener('click', () => {
      copyText(schemaEl.innerText, schemaBtn);
    });
  }

  // ── Copy Page FAB ──────────────────────────────────
  const fab = document.getElementById('copy-page-fab');
  if (fab) {
    fab.addEventListener('click', () => {
      const text = extractPageText();
      navigator.clipboard.writeText(text).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      });
      fab.classList.add('copied');
      setTimeout(() => fab.classList.remove('copied'), 2500);
    });
  }

  // ── Syntax highlighting ──────────────────────────────
  document.querySelectorAll('.code-block').forEach(block => {
    const header = block.querySelector('.code-header');
    const codeEl = block.querySelector('pre > code');
    if (!codeEl) return;

    // Apply language class from header text
    if (header) {
      const lang = LANG_MAP[header.textContent.trim().toLowerCase()];
      if (lang) codeEl.classList.add(lang);
    }

    // Run highlight.js on this element
    if (window.hljs) hljs.highlightElement(codeEl);
  });

  // ── Copy buttons ─────────────────────────────────────
  document.querySelectorAll('.code-block').forEach(block => {
    const header = block.querySelector('.code-header');
    const codeEl = block.querySelector('pre > code');
    if (!codeEl) return;

    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.setAttribute('aria-label', 'Copy code');
    btn.innerHTML = `
      <svg class="copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
      <svg class="check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:none">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    `;

    btn.addEventListener('click', () => copyText(codeEl.innerText, btn));

    // Insert into header if it exists, otherwise create a wrapper
    if (header) {
      header.appendChild(btn);
    } else {
      const pre = block.querySelector('pre');
      if (pre) {
        pre.style.position = 'relative';
        btn.classList.add('copy-btn--floating');
        pre.appendChild(btn);
      }
    }
  });
});
