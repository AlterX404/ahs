(() => {
  const root = document.querySelector('[data-key-demo]');
  if (!root) return;

  const windowEl = root.querySelector('.ah-demo-window');
  const navButtons = Array.from(root.querySelectorAll('[data-demo-tab]'));
  const views = Array.from(root.querySelectorAll('[data-demo-view]'));
  const theme = root.querySelector('#demoTheme');
  const transparency = root.querySelector('#demoTransparency');
  const minimize = root.querySelector('#demoMinimize');
  const close = root.querySelector('#demoClose');
  const reopen = root.querySelector('#demoReopen');
  const modal = root.querySelector('#demoCloseModal');
  const closeYes = root.querySelector('#demoCloseYes');
  const closeNo = root.querySelector('#demoCloseNo');
  const copyLink = root.querySelector('#demoCopyLink');
  const keyInput = root.querySelector('#demoKeyInput');
  const verify = root.querySelector('#demoVerify');
  const toast = root.querySelector('#demoToast');
  const toastTitle = root.querySelector('#demoToastTitle');
  const toastText = root.querySelector('#demoToastText');
  let toastTimer;

  function showToast(title, message, type = '') {
    clearTimeout(toastTimer);
    toast.className = 'demo-toast show' + (type ? ' ' + type : '');
    toastTitle.textContent = title;
    toastText.textContent = message;
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3400);
  }

  function setTab(tab) {
    navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.demoTab === tab));
    views.forEach(view => view.classList.toggle('active', view.dataset.demoView === tab));
  }

  navButtons.forEach(btn => btn.addEventListener('click', () => setTab(btn.dataset.demoTab)));

  if (theme) {
    theme.addEventListener('change', () => {
      windowEl.classList.toggle('theme-rose', theme.value === 'rose');
      showToast('Interface', theme.value === 'rose' ? 'Rose theme preview enabled.' : 'Dark theme preview enabled.');
    });
  }

  if (transparency) {
    transparency.addEventListener('change', () => {
      windowEl.classList.toggle('is-transparent', transparency.checked);
      showToast('Interface', transparency.checked ? 'Transparency enabled.' : 'Transparency disabled.');
    });
  }

  minimize?.addEventListener('click', () => {
    windowEl.classList.toggle('is-minimized');
    minimize.textContent = windowEl.classList.contains('is-minimized') ? '□' : '−';
    minimize.setAttribute('aria-label', windowEl.classList.contains('is-minimized') ? 'Restore demo window' : 'Minimize demo window');
  });

  close?.addEventListener('click', () => modal.classList.add('open'));
  closeNo?.addEventListener('click', () => modal.classList.remove('open'));
  closeYes?.addEventListener('click', () => {
    modal.classList.remove('open');
    windowEl.classList.add('is-closed');
    reopen.classList.add('show');
  });
  reopen?.addEventListener('click', () => {
    windowEl.classList.remove('is-closed', 'is-minimized');
    reopen.classList.remove('show');
    minimize.textContent = '−';
    setTab('key');
  });

  copyLink?.addEventListener('click', async () => {
    const demoUrl = 'https://api.alterhub.online/key/demo-session';
    try {
      await navigator.clipboard.writeText(demoUrl);
      showToast('Alter Hub', 'Demo key link copied. This preview does not create a live session.', 'success');
    } catch {
      showToast('Alter Hub', 'Demo link prepared. Clipboard access is blocked by this browser preview.');
    }
  });

  verify?.addEventListener('click', () => {
    const value = String(keyInput.value || '').trim().toUpperCase();
    if (value === 'ALTER-DEMO-2026') {
      showToast('Key verified', 'Demo accepted. The real client verifies the key against the active device and server session.', 'success');
    } else {
      showToast('Key rejected', 'For this interactive preview, enter ALTER-DEMO-2026.', 'error');
    }
  });

  keyInput?.addEventListener('keydown', event => {
    if (event.key === 'Enter') verify?.click();
  });
})();
