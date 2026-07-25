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
const heroSection = document.querySelector(".hero");
const heroTilt = document.querySelector(".hero-tilt");

if (heroSection && heroTilt) {
  const maximumRotation = 12;

  heroSection.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;

    const heroBounds = heroSection.getBoundingClientRect();

    const cursorX = event.clientX - heroBounds.left;
    const cursorY = event.clientY - heroBounds.top;

    const horizontalPosition = cursorX / heroBounds.width - 0.5;
    const verticalPosition = cursorY / heroBounds.height - 0.5;

    const rotateY = horizontalPosition * maximumRotation * 2;
    const rotateX = verticalPosition * maximumRotation * -2;

    heroSection.classList.add("is-tracking");

    heroTilt.style.setProperty(
      "--hero-rotate-x",
      `${rotateX.toFixed(2)}deg`
    );

    heroTilt.style.setProperty(
      "--hero-rotate-y",
      `${rotateY.toFixed(2)}deg`
    );
  });

  heroSection.addEventListener("pointerleave", () => {
    heroSection.classList.remove("is-tracking");

    heroTilt.style.setProperty("--hero-rotate-x", "0deg");
    heroTilt.style.setProperty("--hero-rotate-y", "0deg");
  });
}
const FINAL_LINK =
  "https://loot-link.com/s?vIdjVjaM";

(() => {
  const MAXIMUM_ROTATION = 14;

  /*
   * The main ALTER HUB heading is excluded because its parent
   * .hero-tilt already handles the cursor-following movement.
   */
  const headings = Array.from(
    document.querySelectorAll("h1, h2, h3")
  ).filter((heading) => {
    return !heading.closest(".hero-tilt");
  });

  headings.forEach((heading) => {
    if (heading.querySelector(":scope > .heading-tilt-inner")) {
      return;
    }

    const inner = document.createElement("span");
    inner.className = "heading-tilt-inner";

    while (heading.firstChild) {
      inner.appendChild(heading.firstChild);
    }

    heading.appendChild(inner);
    heading.classList.add("heading-tilt-target");
  });

  let cursorX = window.innerWidth / 2;
  let cursorY = window.innerHeight / 2;
  let animationFrame = null;

  const clamp = (value, minimum, maximum) => {
    return Math.min(Math.max(value, minimum), maximum);
  };

  const updateHeadings = () => {
    animationFrame = null;

    headings.forEach((heading) => {
      const bounds = heading.getBoundingClientRect();

      /*
       * Skip headings that are currently outside the screen.
       */
      const isVisible =
        bounds.bottom >= 0 &&
        bounds.top <= window.innerHeight;

      if (!isVisible) {
        return;
      }

      const headingCenterX =
        bounds.left + bounds.width / 2;

      const headingCenterY =
        bounds.top + bounds.height / 2;

      const horizontalDistance =
        (cursorX - headingCenterX) /
        (window.innerWidth / 2);

      const verticalDistance =
        (cursorY - headingCenterY) /
        (window.innerHeight / 2);

      const rotateY =
        clamp(horizontalDistance, -1, 1) *
        MAXIMUM_ROTATION;

      const rotateX =
        clamp(-verticalDistance, -1, 1) *
        MAXIMUM_ROTATION;

      heading.classList.add("heading-is-tracking");

      heading.style.setProperty(
        "--heading-rotate-x",
        `${rotateX.toFixed(2)}deg`
      );

      heading.style.setProperty(
        "--heading-rotate-y",
        `${rotateY.toFixed(2)}deg`
      );
    });
  };

  const requestHeadingUpdate = () => {
    if (animationFrame !== null) {
      return;
    }

    animationFrame =
      window.requestAnimationFrame(updateHeadings);
  };

  const resetHeadings = () => {
    headings.forEach((heading) => {
      heading.classList.remove("heading-is-tracking");

      heading.style.setProperty(
        "--heading-rotate-x",
        "0deg"
      );

      heading.style.setProperty(
        "--heading-rotate-y",
        "0deg"
      );
    });
  };

  window.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") {
      return;
    }

    cursorX = event.clientX;
    cursorY = event.clientY;

    requestHeadingUpdate();
  });

  window.addEventListener(
    "scroll",
    requestHeadingUpdate,
    { passive: true }
  );

  window.addEventListener(
    "resize",
    requestHeadingUpdate
  );

  window.addEventListener(
    "blur",
    resetHeadings
  );

  document.addEventListener("mouseout", (event) => {
    if (!event.relatedTarget) {
      resetHeadings();
    }
  });
})();
