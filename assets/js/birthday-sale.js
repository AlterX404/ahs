"use strict";

(() => {
  const sale = {
    name: "Birthday Week Sale",
    discountPercent: 50,
    start: "2026-09-11T11:55:00+05:30",
    end: "2026-09-18T11:55:00+05:30",
    prices: {
      keyless: {
        monthly: "$3.00",
        lifetime: "$10.00"
      },
      premium: {
        monthly: "$4.00",
        lifetime: "$12.50"
      },
      "premium-plus": {
        monthly: "$5.00",
        lifetime: "$20.00"
      }
    },
    regularPrices: {
      keyless: {
        monthly: "$5.99",
        lifetime: "$19.99"
      },
      premium: {
        monthly: "$7.99",
        lifetime: "$24.99"
      },
      "premium-plus": {
        monthly: "$9.99",
        lifetime: "$39.99"
      }
    },
    previousListPrices: {
      keyless: {
        monthly: "$9.99",
        lifetime: "$29.99"
      },
      premium: {
        monthly: "$14.99",
        lifetime: "$39.99"
      },
      "premium-plus": {
        monthly: "$19.99",
        lifetime: "$59.99"
      }
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

    const cards = pricingSection.querySelectorAll("[data-sale-tier]");

    cards.forEach((card) => {
      const tier = card.dataset.saleTier;
      const oldPrice = card.querySelector("[data-sale-old-price]");
      const currentPrice = card.querySelector("[data-sale-price]");
      const label = card.querySelector("[data-sale-label]");
      const period = card.querySelector("[data-sale-period]");

      if (!sale.prices[tier]) return;

      if (sale.active) {
        if (oldPrice) oldPrice.textContent = sale.regularPrices[tier].monthly;
        if (currentPrice) currentPrice.textContent = sale.prices[tier].monthly;
        if (label) label.textContent = "Birthday Week · 50% off";
        if (period) period.textContent = "per month · 7 days only";
        card.classList.add("birthday-sale-card");
      } else {
        if (oldPrice) oldPrice.textContent = sale.previousListPrices[tier].monthly;
        if (currentPrice) currentPrice.textContent = sale.regularPrices[tier].monthly;
        if (label) label.textContent = "Starting from";
        if (period) period.textContent = "per month";
        card.classList.remove("birthday-sale-card");
      }
    });

    const eyebrow = pricingSection.querySelector("[data-sale-pricing-eyebrow]");
    if (eyebrow) {
      eyebrow.textContent = sale.active
        ? "BIRTHDAY WEEK · 50% OFF EVERYTHING"
        : "CHOOSE YOUR ACCESS";
    }
  }

  function updateCheckoutSaleLabels() {
    document.querySelectorAll("[data-sale-checkout-eyebrow]").forEach((eyebrow) => {
      eyebrow.textContent = sale.active
        ? "BIRTHDAY WEEK · 50% OFF"
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

    const storageKey = "alterhub-birthday-sale-popup-2026";
    try {
      if (sessionStorage.getItem(storageKey) === "dismissed") return;
    } catch (error) {
      // Storage can be unavailable in strict privacy modes. The popup can still run.
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
        <span class="birthday-sale-kicker">ALTER HUB BIRTHDAY WEEK</span>
        <h2 id="birthday-sale-title">50% OFF <span>EVERYTHING</span></h2>
        <p class="birthday-sale-copy">Seven days only. Every Keyless, Premium, and Premium Plus purchase is half price.</p>
        <div class="birthday-sale-countdown" aria-label="Birthday sale time remaining">
          <div><strong data-sale-days>00</strong><span>Days</span></div>
          <div><strong data-sale-hours>00</strong><span>Hours</span></div>
          <div><strong data-sale-minutes>00</strong><span>Minutes</span></div>
          <div><strong data-sale-seconds>00</strong><span>Seconds</span></div>
        </div>
        <button class="birthday-sale-cta" type="button">SHOP 50% OFF <span aria-hidden="true">→</span></button>
        <p class="birthday-sale-end">Ends September 18, 2026 at 11:55 AM IST</p>
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
        overlay.remove();
        if (timer) window.clearInterval(timer);
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

  function initializeSaleUi() {
    sale.active = isActive();
    updateHomePricing();
    updateCheckoutSaleLabels();

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
