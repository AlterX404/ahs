const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav-links');

if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? '✕' : '☰';
  });

  document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = '☰';
    });
  });
}

// Small pop-up animation as elements enter the viewport.
const revealTargets = document.querySelectorAll(
  '.section-heading, .card, .game-card, .price-card, .faq-list details, .community-card, .footer-top, .footer-bottom'
);

revealTargets.forEach((element, index) => {
  element.classList.add('reveal');

  // Add a subtle stagger inside each section/grid.
  const parent = element.parentElement;
  const siblings = parent ? [...parent.children].filter(child => child.matches(
    '.card, .game-card, .price-card, .faq-list details, .community-card'
  )) : [];
  const itemIndex = siblings.indexOf(element);

  if (itemIndex >= 0) {
    element.style.setProperty('--reveal-delay', `${Math.min(itemIndex * 70, 280)}ms`);
  }
});

if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -40px 0px'
  });

  revealTargets.forEach(element => revealObserver.observe(element));
} else {
  revealTargets.forEach(element => element.classList.add('is-visible'));
}
