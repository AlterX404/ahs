"use strict";

(() => {
  const sale = {
    name: "Birthday 7-Day Everything Sale",
    discountPercent: 50,
    start: "2026-09-15T00:30:00+05:30",
    end: "2026-09-22T00:30:00+05:30",
    prices: {
      keyless: { monthly: "$2.99", lifetime: "$9.99" },
      premium: { monthly: "$3.99", lifetime: "$12.50" },
      "premium-plus": { monthly: "$4.99", lifetime: "$19.99" }
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

  function formatLocalSaleEnd() {
    const endDate = new Date(endTime);

    try {
      return new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short"
      }).format(endDate);
    } catch (error) {
      return endDate.toLocaleString();
    }
  }

  function setLocalEndLabel(node) {
    if (!node) return;
    node.textContent = `Ends ${formatLocalSaleEnd()} · Your local time`;
  }

  function updateSaleMessages() {
    const pricingHeading = document.querySelector("#pricing .section-heading");
    if (pricingHeading) {
      let note = pricingHeading.querySelector("[data-sale-message]");
      if (sale.active) {
        if (!note) {
          note = document.createElement("p");
          note.className = "birthday-sale-message birthday-sale-message-home";
          note.dataset.saleMessage = "";
          pricingHeading.appendChild(note);
        }
        note.textContent = "Birthday Sale: 50% off every Monthly and Lifetime plan. The lower Monthly sale price is shown on the cards below.";
        note.hidden = false;
      } else if (note) {
        note.remove();
      }
    }

    document.querySelectorAll(".checkout-heading > div").forEach((heading) => {
      let note = heading.querySelector("[data-sale-message]");
      if (sale.active) {
        if (!note) {
          note = document.createElement("p");
          note.className = "birthday-sale-message birthday-sale-message-checkout";
          note.dataset.saleMessage = "";
          heading.appendChild(note);
        }
        note.textContent = "Birthday Sale: all Monthly and Lifetime options are 50% off for 7 days only.";
        note.hidden = false;
      } else if (note) {
        note.remove();
      }
    });
  }

  function updateLocalEndTimes() {
    document.querySelectorAll("[data-sale-local-end]").forEach((node) => {
      if (sale.active) {
        setLocalEndLabel(node);
        node.hidden = false;
      } else {
        node.hidden = true;
      }
    });

    const pricingHeading = document.querySelector("#pricing .section-heading");
    if (pricingHeading) {
      let localEnd = pricingHeading.querySelector("[data-sale-local-end]");
      if (sale.active) {
        if (!localEnd) {
          localEnd = document.createElement("p");
          localEnd.className = "birthday-sale-local-end birthday-sale-local-end-home";
          localEnd.dataset.saleLocalEnd = "";
          pricingHeading.appendChild(localEnd);
        }
        setLocalEndLabel(localEnd);
        localEnd.hidden = false;
      } else if (localEnd) {
        localEnd.remove();
      }
    }

    document.querySelectorAll(".checkout-heading > div").forEach((heading) => {
      let localEnd = heading.querySelector("[data-sale-local-end]");
      if (sale.active) {
        if (!localEnd) {
          localEnd = document.createElement("p");
          localEnd.className = "birthday-sale-local-end birthday-sale-local-end-checkout";
          localEnd.dataset.saleLocalEnd = "";
          heading.appendChild(localEnd);
        }
        setLocalEndLabel(localEnd);
        localEnd.hidden = false;
      } else if (localEnd) {
        localEnd.remove();
      }
    });
  }

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
        if (label) label.textContent = "Birthday Sale · ALL PLANS 50% OFF";
        if (oldPrice) {
          oldPrice.hidden = false;
          oldPrice.textContent = regular.monthly;
        }
        if (currentPrice) currentPrice.textContent = salePrices.monthly;
        if (period) period.textContent = "per month · monthly sale price shown";
        if (planLink) planLink.href = `${tier}/#monthly`;
        card.classList.add("birthday-sale-card");
      } else {
        if (label) label.textContent = "Starting from";
        if (oldPrice) {
          oldPrice.textContent = "";
          oldPrice.hidden = true;
        }
        if (currentPrice) currentPrice.textContent = regular.monthly;
        if (period) period.textContent = "per month";
        if (planLink) planLink.href = `${tier}/#monthly`;
        card.classList.remove("birthday-sale-card");
      }
    });

    const eyebrow = pricingSection.querySelector("[data-sale-pricing-eyebrow]");
    if (eyebrow) {
      eyebrow.textContent = sale.active
        ? "BIRTHDAY SALE · 50% OFF ALL PLANS · 7 DAYS ONLY"
        : "CHOOSE YOUR ACCESS";
    }
  }

  function updateCheckoutSaleLabels() {
    document.querySelectorAll("[data-sale-checkout-eyebrow]").forEach((eyebrow) => {
      eyebrow.textContent = sale.active
        ? "BIRTHDAY SALE · 50% OFF ALL PLANS · 7 DAYS ONLY"
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

    const storageKey = "alterhub-birthday-everything-sale-2026-09-15";
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
        <h2 id="birthday-sale-title">50% OFF <span>ALL PLANS</span></h2>
        <p class="birthday-sale-copy">For 7 days only, every Keyless, Premium, and Premium Plus plan is on sale. That means 50% off both Monthly and Lifetime purchases.</p>
        <div class="birthday-sale-countdown" aria-label="Birthday sale time remaining">
          <div><strong data-sale-days>00</strong><span>Days</span></div>
          <div><strong data-sale-hours>00</strong><span>Hours</span></div>
          <div><strong data-sale-minutes>00</strong><span>Minutes</span></div>
          <div><strong data-sale-seconds>00</strong><span>Seconds</span></div>
        </div>
        <button class="birthday-sale-cta" type="button">VIEW BIRTHDAY SALE <span aria-hidden="true">→</span></button>
        <p class="birthday-sale-end" data-sale-local-end></p>
      </div>
    `;

    const closeButton = overlay.querySelector(".birthday-sale-close");
    const ctaButton = overlay.querySelector(".birthday-sale-cta");
    const dayNode = overlay.querySelector("[data-sale-days]");
    const hourNode = overlay.querySelector("[data-sale-hours]");
    const minuteNode = overlay.querySelector("[data-sale-minutes]");
    const secondNode = overlay.querySelector("[data-sale-seconds]");
    const popupEndNode = overlay.querySelector("[data-sale-local-end]");
    setLocalEndLabel(popupEndNode);

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
        updateSaleMessages();
        updateLocalEndTimes();
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
      updateSaleMessages();
      updateLocalEndTimes();
      window.dispatchEvent(new CustomEvent("alterhub:birthday-sale-ended"));
    }, delay);
  }

  function initializeSaleUi() {
    sale.active = isActive();
    updateHomePricing();
    updateCheckoutSaleLabels();
    updateSaleMessages();
    updateLocalEndTimes();
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
