(() => {
  const root = document.querySelector('[data-key-demo]');
  if (!root) return;

  const windowEl = root.querySelector('.ah-demo-window');
  const navButtons = [...root.querySelectorAll('[data-demo-tab]')];
  const views = [...root.querySelectorAll('[data-demo-view]')];
  const themeDropdown = root.querySelector('#demoThemeDropdown');
  const themeButton = root.querySelector('#demoThemeButton');
  const themeLabel = root.querySelector('#demoThemeLabel');
  const themeMenu = root.querySelector('#demoThemeMenu');
  const themeOptions = [...root.querySelectorAll('[data-theme-value]')];
  const transparency = root.querySelector('#demoTransparency');
  const minimize = root.querySelector('#demoMinimize');
  const maximize = root.querySelector('#demoMaximize');
  const close = root.querySelector('#demoClose');
  const reopen = root.querySelector('#demoReopen');
  const copyLink = root.querySelector('#demoCopyLink');
  const keyInput = root.querySelector('#demoKeyInput');
  const verify = root.querySelector('#demoVerify');
  const toast = root.querySelector('#demoToast');
  const toastTitle = root.querySelector('#demoToastTitle');
  const toastText = root.querySelector('#demoToastText');
  let toastTimer;

  function setTab(tab) {
    navButtons.forEach(button => button.classList.toggle('active', button.dataset.demoTab === tab));
    views.forEach(view => view.classList.toggle('active', view.dataset.demoView === tab));
  }

  function showToast(title, message) {
    if (!toast) return;
    clearTimeout(toastTimer);
    toastTitle.textContent = title;
    toastText.textContent = message;
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  navButtons.forEach(button => button.addEventListener('click', () => setTab(button.dataset.demoTab)));

  themeButton?.addEventListener('click', event => {
    event.stopPropagation();
    const open = !themeDropdown.classList.contains('open');
    themeDropdown.classList.toggle('open', open);
    themeButton.setAttribute('aria-expanded', String(open));
  });

  themeOptions.forEach(option => {
    option.addEventListener('click', () => {
      const value = option.dataset.themeValue;
      windowEl.dataset.theme = value;
      themeLabel.textContent = option.textContent.trim();
      themeOptions.forEach(item => item.classList.toggle('selected', item === option));
      themeDropdown.classList.remove('open');
      themeButton.setAttribute('aria-expanded', 'false');
    });
  });

  document.addEventListener('click', event => {
    if (!themeDropdown?.contains(event.target)) {
      themeDropdown?.classList.remove('open');
      themeButton?.setAttribute('aria-expanded', 'false');
    }
  });

  transparency?.addEventListener('change', () => {
    windowEl.classList.toggle('is-transparent', transparency.checked);
  });

  minimize?.addEventListener('click', () => {
    windowEl.classList.toggle('is-minimized');
    minimize.textContent = windowEl.classList.contains('is-minimized') ? '□' : '−';
  });

  maximize?.addEventListener('click', () => {
    windowEl.classList.remove('is-minimized');
    minimize.textContent = '−';
  });

  close?.addEventListener('click', () => {
    windowEl.classList.add('is-closed');
    reopen?.classList.add('show');
  });

  reopen?.addEventListener('click', () => {
    windowEl.classList.remove('is-closed', 'is-minimized');
    reopen.classList.remove('show');
    minimize.textContent = '−';
    setTab('key');
  });

  copyLink?.addEventListener('click', async () => {
    const value = 'https://api.alterhub.online/key/demo-session';
    try { await navigator.clipboard.writeText(value); } catch {}
    showToast('Alter Hub', 'Demo key link copied.');
  });

  verify?.addEventListener('click', () => {
    const value = String(keyInput?.value || '').trim();
    showToast(value ? 'Alter Hub' : 'Key System', value ? 'Demo key submitted.' : 'Enter a key first.');
  });

  keyInput?.addEventListener('keydown', event => {
    if (event.key === 'Enter') verify?.click();
  });
})();
