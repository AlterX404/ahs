"use strict";

(() => {
  const sale = {
    name: "Birthday 7-Day Lifetime Sale",
    discountPercent: 50,
    start: "2026-09-15T00:30:00+05:30",
    end: "2026-09-22T00:30:00+05:30",
    prices: {
      keyless: { lifetime: "$10.00" },
      premium: { lifetime: "$12.50" },
      "premium-plus": { lifetime: "$20.00" }
    },
    regularPrices: {
      keyless: { monthly: "$5.99", lifetime: "$19.99" },
      premium: { monthly: "$7.99", lifetime: "$24.99" },
      "premium-plus": { monthly: "$9.99", lifetime: "$39.99" }
    },
    previousListPrices: {
      keyless: { monthly: "$9.99", lifetime: "$29.99" },
      premium: { monthly: "$14.99", lifetime: "$39.99" },
      "premium-plus": { monthly: "$19.99", lifetime: "$59.99" }
    }
  };

  const startTime = Date.parse(sale.start);
  const endTime = Date.parse(sale.end);

  const isActive = () => {
    const now = Date.now();
    return now >= startTime && now < endTime;
  };

  sale.active = isActive();
  window.ALTER_BIRTHDAY_SALE = sale;

  function updateHomePricing() {
    const pricingSection = document.querySelector("#pricing");
    if (!pricingSection) return;

    pricingSection.querySelectorAll("[data-sale-tier]").forEach((card) => {
      const tier = card.dataset.saleTier;
      const regular = sale.regularPrices[tier];
      const salePrices = sale.prices[tier];
      const previous = sale.previousListPrices[tier];
      if (!regular || !salePrices || !previous) return;

      const oldPrice = card.querySelector("[data-sale-old-price]");
      const currentPrice = card.querySelector("[data-sale-price]");
      const label = card.querySelector("[data-sale-label]");
      const period = card.querySelector("[data-sale-period]");
      const planLink = card.querySelector(".plan-button");

      if (sale.active) {
        if (label) label.textContent = `Monthly ${regular.monthly} · Lifetime sale`;
        if (oldPrice) oldPrice.textContent = regular.lifetime;
        if (currentPrice) currentPrice.textContent = salePrices.lifetime;
        if (period) period.textContent = "Lifetime · 50% off · 7 days only";
        if (planLink) planLink.href = `${tier}/#lifetime`;
        card.classList.add("birthday-sale-card");
      } else {
        if (label) label.textContent = "Starting from";
        if (oldPrice) oldPrice.textContent = previous.monthly;
        if (currentPrice) currentPrice.textContent = regular.monthly;
        if (period) period.textContent = "per month";
        if (planLink) planLink.href = `${tier}/#monthly`;
        card.classList.remove("birthday-sale-card");
      }
    });

    const eyebrow = pricingSection.querySelector("[data-sale-pricing-eyebrow]");
    if (eyebrow) {
      eyebrow.textContent = sale.active
        ? "BIRTHDAY SALE · 50% OFF LIFETIME · 7 DAYS ONLY"
        : "CHOOSE YOUR ACCESS";
    }
  }

  function updateCheckoutSaleLabels() {
    document.querySelectorAll("[data-sale-checkout-eyebrow]").forEach((eyebrow) => {
      eyebrow.textContent = sale.active
        ? "BIRTHDAY SALE · 50% OFF LIFETIME · 7 DAYS ONLY"
        : "CHOOSE YOUR ACCESS";
    });
  }

  function formatCountdown(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return {
      days: String(days).padStart(2, "0"),
      hours: String(hours).padStart(2, "0"),
      minutes: String(minutes).padStart(2, "0"),
      seconds: String(seconds).padStart(2, "0")
    };
  }

  function createPopup() {
    if (!sale.active) return;

    const storageKey = "alterhub-birthday-lifetime-sale-2026-09-15";
    try {
      if (sessionStorage.getItem(storageKey) === "dismissed") return;
    } catch (error) {
      // Storage can be unavailable in strict privacy modes.
    }

    const overlay = document.createElement("div");
    overlay.className = "birthday-sale-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "birthday-sale-title");

    overlay.innerHTML = `
      <div class="birthday-sale-modal">
        <button class="birthday-sale-close" type="button" aria-label="Close birthday sale popup">×</button>
        <div class="birthday-sale-confetti" aria-hidden="true"></div>
        <span class="birthday-sale-kicker">ALTER HUB BIRTHDAY SALE</span>
        <h2 id="birthday-sale-title">50% OFF <span>LIFETIME</span></h2>
        <p class="birthday-sale-copy">For 7 days only, every Lifetime Keyless, Premium, and Premium Plus purchase is half price. Monthly plans stay at their normal prices.</p>
        <div class="birthday-sale-countdown" aria-label="Birthday sale time remaining">
          <div><strong data-sale-days>00</strong><span>Days</span></div>
          <div><strong data-sale-hours>00</strong><span>Hours</span></div>
          <div><strong data-sale-minutes>00</strong><span>Minutes</span></div>
          <div><strong data-sale-seconds>00</strong><span>Seconds</span></div>
        </div>
        <button class="birthday-sale-cta" type="button">VIEW LIFETIME SALE <span aria-hidden="true">→</span></button>
        <p class="birthday-sale-end">Ends September 22, 2026 at 12:30 AM IST</p>
      </div>
    `;

    const closeButton = overlay.querySelector(".birthday-sale-close");
    const ctaButton = overlay.querySelector(".birthday-sale-cta");
    const dayNode = overlay.querySelector("[data-sale-days]");
    const hourNode = overlay.querySelector("[data-sale-hours]");
    const minuteNode = overlay.querySelector("[data-sale-minutes]");
    const secondNode = overlay.querySelector("[data-sale-seconds]");

    const dismiss = () => {
      overlay.classList.add("is-closing");
      try {
        sessionStorage.setItem(storageKey, "dismissed");
      } catch (error) {
        // Ignore storage failures.
      }
      window.setTimeout(() => overlay.remove(), 220);
    };

    let timer = null;

    const tick = () => {
      const remaining = endTime - Date.now();
      if (remaining <= 0) {
        sale.active = false;
        updateHomePricing();
        updateCheckoutSaleLabels();
        overlay.remove();
        if (timer) window.clearInterval(timer);
        window.dispatchEvent(new CustomEvent("alterhub:birthday-sale-ended"));
        return;
      }

      const countdown = formatCountdown(remaining);
      dayNode.textContent = countdown.days;
      hourNode.textContent = countdown.hours;
      minuteNode.textContent = countdown.minutes;
      secondNode.textContent = countdown.seconds;
    };

    closeButton.addEventListener("click", dismiss);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) dismiss();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && document.body.contains(overlay)) dismiss();
    });

    ctaButton.addEventListener("click", () => {
      const lifetimeButton = document.querySelector('[data-duration="lifetime"]');
      if (lifetimeButton) lifetimeButton.click();

      const target =
        document.querySelector("#pricing") ||
        document.querySelector(".checkout-panel") ||
        document.querySelector("main");

      dismiss();
      if (target) {
        window.setTimeout(() => {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 230);
      }
    });

    document.body.appendChild(overlay);
    tick();
    timer = window.setInterval(tick, 1000);
    window.setTimeout(() => overlay.classList.add("is-visible"), 40);
  }

  function scheduleExpiryRefresh() {
    if (!sale.active) return;
    const delay = Math.max(0, endTime - Date.now() + 150);
    window.setTimeout(() => {
      sale.active = false;
      updateHomePricing();
      updateCheckoutSaleLabels();
      window.dispatchEvent(new CustomEvent("alterhub:birthday-sale-ended"));
    }, delay);
  }

  function initializeSaleUi() {
    sale.active = isActive();
    updateHomePricing();
    updateCheckoutSaleLabels();
    scheduleExpiryRefresh();

    if (sale.active) {
      window.setTimeout(createPopup, 450);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeSaleUi, { once: true });
  } else {
    initializeSaleUi();
  }
})();
