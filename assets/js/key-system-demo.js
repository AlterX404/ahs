(() => {
  const root = document.querySelector('[data-key-demo]');
  if (!root) return;

  const windowEl = root.querySelector('.ah-demo-window');
  const navButtons = [...root.querySelectorAll('[data-demo-tab]')];
  const views = [...root.querySelectorAll('[data-demo-view]')];
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
    closeThemeMenu();
  }

  function showToast(title, message) {
    if (!toast) return;
    clearTimeout(toastTimer);
    toastTitle.textContent = title;
    toastText.textContent = message;
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function positionThemeMenu() {
    if (!themeButton || !themeMenu || !windowEl) return;
    const windowBox = windowEl.getBoundingClientRect();
    const buttonBox = themeButton.getBoundingClientRect();
    const menuWidth = 212.5;
    const left = buttonBox.left - windowBox.left - 1.25;
    const top = buttonBox.top - windowBox.top - 6.25;
    themeMenu.style.left = `${Math.min(left, windowEl.clientWidth - menuWidth - 7.5)}px`;
    themeMenu.style.top = `${Math.max(7.5, top)}px`;
  }

  function openThemeMenu() {
    positionThemeMenu();
    themeMenu?.classList.add('open');
    themeButton?.setAttribute('aria-expanded', 'true');
  }

  function closeThemeMenu() {
    themeMenu?.classList.remove('open');
    themeButton?.setAttribute('aria-expanded', 'false');
  }

  navButtons.forEach(button => button.addEventListener('click', () => setTab(button.dataset.demoTab)));

  themeButton?.addEventListener('click', event => {
    event.stopPropagation();
    themeMenu?.classList.contains('open') ? closeThemeMenu() : openThemeMenu();
  });

  themeOptions.forEach(option => {
    option.addEventListener('click', () => {
      const value = option.dataset.themeValue;
      windowEl.dataset.theme = value;
      themeLabel.textContent = option.textContent.trim();
      themeOptions.forEach(item => item.classList.toggle('selected', item === option));
      closeThemeMenu();
    });
  });

  document.addEventListener('pointerdown', event => {
    if (!themeMenu?.contains(event.target) && !themeButton?.contains(event.target)) closeThemeMenu();
  });

  window.addEventListener('resize', () => {
    if (themeMenu?.classList.contains('open')) positionThemeMenu();
  });

  transparency?.addEventListener('change', () => {
    windowEl.classList.toggle('is-transparent', transparency.checked);
  });

  minimize?.addEventListener('click', () => {
    windowEl.classList.toggle('is-minimized');
    windowEl.classList.remove('is-maximized');
    closeThemeMenu();
  });

  maximize?.addEventListener('click', () => {
    windowEl.classList.remove('is-minimized');
    windowEl.classList.toggle('is-maximized');
    closeThemeMenu();
  });

  close?.addEventListener('click', () => {
    windowEl.classList.add('is-closed');
    reopen?.classList.add('show');
    closeThemeMenu();
  });

  reopen?.addEventListener('click', () => {
    windowEl.classList.remove('is-closed', 'is-minimized', 'is-maximized');
    reopen.classList.remove('show');
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

  root.querySelectorAll('.config-action').forEach(button => {
    button.addEventListener('click', () => {
      const title = button.querySelector('strong')?.textContent?.trim() || 'Configuration';
      showToast('Interface', `${title} demo action.`);
    });
  });
})();
