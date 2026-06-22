/* ============================================================
   Zero-Library · 站点交互脚本
   - 浅色/深色主题切换
   - 移动端目录抽屉
   - 阅读进度条
   - 章内小目录(自动生成 + 滚动高亮)
   - 客户端全文搜索(打开 / 上下选择 / Enter 跳转)
   ============================================================ */
(function () {
  'use strict';

  const THEME_KEY = 'zero-library-theme';
  function getStoredTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
  }
  function storeTheme(t) {
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  }
  function systemPrefers() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('.lib-theme-toggle').forEach((btn) => {
      btn.textContent = theme === 'dark' ? '☀' : '☾';
      btn.setAttribute('aria-label', theme === 'dark' ? '切换为浅色模式' : '切换为深色模式');
      btn.setAttribute('title', theme === 'dark' ? '切换为浅色模式' : '切换为深色模式');
    });
  }

  let current = getStoredTheme() || systemPrefers();
  applyTheme(current);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!getStoredTheme()) {
      current = e.matches ? 'dark' : 'light';
      applyTheme(current);
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    initThemeToggle();
    initDrawer();
    initProgressBar();
    initChapterAside();
    initSearch();
    markActiveLink();
  });

  function initThemeToggle() {
    document.querySelectorAll('.lib-theme-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        current = current === 'dark' ? 'light' : 'dark';
        storeTheme(current);
        applyTheme(current);
      });
    });
  }

  function initDrawer() {
    const toggle = document.querySelector('.lib-nav__drawer-toggle');
    const links = document.querySelector('.lib-nav__links');
    const overlay = document.querySelector('.lib-drawer-overlay');
    if (!toggle || !links) return;
    const close = () => {
      links.classList.remove('is-open');
      if (overlay) overlay.classList.remove('is-open');
      document.body.style.overflow = '';
    };
    const open = () => {
      links.classList.add('is-open');
      if (overlay) overlay.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    };
    toggle.addEventListener('click', () => {
      if (links.classList.contains('is-open')) close();
      else open();
    });
    if (overlay) overlay.addEventListener('click', close);
    links.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
  }

  function initProgressBar() {
    const article = document.querySelector('article');
    if (!article) return;
    const bar = document.createElement('div');
    bar.className = 'lib-progress';
    document.body.appendChild(bar);
    const update = () => {
      const rect = article.getBoundingClientRect();
      const total = article.offsetHeight - window.innerHeight;
      const scrolled = -rect.top;
      const pct = total > 0 ? Math.min(100, Math.max(0, (scrolled / total) * 100)) : 0;
      bar.style.width = pct + '%';
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  function initChapterAside() {
    const body = document.querySelector('.lib-prose');
    if (!body) return;
    const headings = body.querySelectorAll('h2, h3');
    if (headings.length < 2) return;
    headings.forEach((h, i) => { if (!h.id) h.id = 'sec-' + i; });

    const aside = document.createElement('aside');
    aside.className = 'lib-chapter__aside';
    aside.innerHTML = '<div class="lib-chapter__aside__title">本节</div><ul>' +
      Array.from(headings).map((h) =>
        `<li><a href="#${h.id}" class="${h.tagName === 'H3' ? 'is-h3' : ''}">${h.textContent}</a></li>`
      ).join('') + '</ul>';
    document.body.appendChild(aside);

    const links = aside.querySelectorAll('a');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          links.forEach((l) => l.classList.remove('is-active'));
          const active = aside.querySelector(`a[href="#${entry.target.id}"]`);
          if (active) active.classList.add('is-active');
        }
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    headings.forEach((h) => observer.observe(h));

    const showAt = 400;
    const check = () => {
      if (window.scrollY > showAt) aside.classList.add('is-visible');
      else aside.classList.remove('is-visible');
    };
    window.addEventListener('scroll', check, { passive: true });
    check();

    aside.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.getElementById(a.getAttribute('href').slice(1));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  let searchIndex = null;
  async function loadSearchIndex() {
    if (searchIndex) return searchIndex;
    try {
      const res = await fetch('search-index.json');
      searchIndex = await res.json();
    } catch (e) {
      console.warn('搜索索引加载失败', e);
      searchIndex = [];
    }
    return searchIndex;
  }

  function initSearch() {
    const trigger = document.querySelector('.lib-search-trigger');
    if (!trigger) return;
    let modal = null;
    const open = () => {
      modal = document.querySelector('.lib-search-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.className = 'lib-search-modal';
        modal.innerHTML = `
          <div class="lib-search-modal__inner">
            <input type="search" class="lib-search-input" placeholder="搜索 概念 / 章节 / 段落..." autocomplete="off" />
            <div class="lib-search-results"></div>
          </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
        const input = modal.querySelector('.lib-search-input');
        input.addEventListener('input', (e) => doSearch(e.target.value));
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') close();
          if (e.key === 'Enter') {
            const first = modal.querySelector('.lib-search-result');
            if (first) first.click();
          }
        });
      }
      modal.classList.add('is-open');
      const input = modal.querySelector('.lib-search-input');
      input.value = '';
      doSearch('');
      setTimeout(() => input.focus(), 50);
      document.body.style.overflow = 'hidden';
    };
    const close = () => {
      if (modal) modal.classList.remove('is-open');
      document.body.style.overflow = '';
    };
    trigger.addEventListener('click', open);
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); open(); }
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault(); open();
      }
      if (e.key === 'Escape') close();
    });
  }

  async function doSearch(q) {
    if (!searchIndex) await loadSearchIndex();
    const results = document.querySelector('.lib-search-results');
    if (!results) return;
    q = (q || '').trim();
    if (!q) {
      const all = (searchIndex || []).slice(0, 8);
      results.innerHTML = all.length ? all.map(r => renderResult(r, q)).join('') :
        '<div class="lib-search-empty">输入关键词开始搜索</div>';
      return;
    }
    const lower = q.toLowerCase();
    const scored = (searchIndex || [])
      .map(r => {
        let score = 0;
        if (r.title.toLowerCase().includes(lower)) score += 3;
        if (r.body.toLowerCase().includes(lower)) score += 1;
        return { ...r, score };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
    if (scored.length === 0) {
      results.innerHTML = `<div class="lib-search-empty">未找到「${escapeHtml(q)}」相关结果</div>`;
      return;
    }
    results.innerHTML = scored.map(r => renderResult(r, q)).join('');
  }

  function renderResult(r, q) {
    const excerpt = highlight(r.excerpt || r.body.slice(0, 120), q);
    const title = highlight(r.title, q);
    return `<a class="lib-search-result" href="${r.url}">
      <div class="lib-search-result__title">${title}</div>
      <div class="lib-search-result__excerpt">${excerpt}…</div>
    </a>`;
  }

  function highlight(text, q) {
    if (!q || !text) return escapeHtml(text);
    const safe = escapeHtml(text);
    const safeQ = escapeHtml(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp(safeQ, 'gi'), (m) => `<mark>${m}</mark>`);
  }
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function markActiveLink() {
    const path = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.lib-nav__links a').forEach((a) => {
      const href = a.getAttribute('href');
      if (href === path || (path === '' && href === 'index.html')) a.classList.add('active');
    });
  }

  // 平滑滚动到锚点
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    if (id === '#' || id.length < 2) return;
    const target = document.querySelector(id);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
})();