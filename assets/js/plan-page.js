"use strict";

const PLAN_CATALOG = {
  keyless: {
    name: "Keyless",
    benefits: [
      "No free key-system checkpoints while access is active",
      "Fast access on your activated device",
      "Core Alter Hub features across supported games",
      "Regular platform and compatibility updates",
      "Community support for setup and activation"
    ],
    steps: [
      "Choose either the 30-day or lifetime Keyless option.",
      "Accept the store terms and continue with your purchase request.",
      "After receiving your key, open Alter Hub and go to the Key System.",
      "Enter the key once on the device you want to activate."
    ],
    monthly: {
      cardTitle: "Monthly Key",
      cardDescription: "Keyless access for 30 days. Renew only when you want to.",
      heroEyebrow: "KEYLESS ACCESS · 30 DAYS",
      titleMain: "Skip the key system.",
      titleAccent: "For 30 days.",
      description: "A monthly Keyless key lets you use Alter Hub for 30 days without completing the free key-system checkpoints. It includes core Alter Hub access, but it does not unlock features reserved for Premium or Premium Plus.",
      features: [
        "No key checkpoints",
        "30-day access",
        "Core features only"
      ],
      summaryTitle: "Monthly Keyless",
      summaryDescription: "Fast, checkpoint-free Alter Hub access for 30 days without premium-only features.",
      oldPrice: "$9.99",
      price: "$5.99",
      discount: "40% OFF",
      badge: "FLEXIBLE",
      access: "30 days",
      billing: "One-time payment",
      renewal: "Renew manually"
    },
    lifetime: {
      cardTitle: "Lifetime Key",
      cardDescription: "Permanent Keyless access with no monthly renewal.",
      heroEyebrow: "KEYLESS ACCESS · LIFETIME",
      titleMain: "Skip the key system.",
      titleAccent: "For life.",
      description: "A lifetime Keyless key permanently removes the free key-system checkpoints on your activated device. You keep core Alter Hub access without renewals, while Premium and Premium Plus features remain exclusive to their own tiers.",
      features: [
        "Permanent Keyless access",
        "No recurring renewal",
        "Core features only"
      ],
      summaryTitle: "Lifetime Keyless",
      summaryDescription: "Permanent checkpoint-free access to Alter Hub's core experience with one payment.",
      oldPrice: "$29.99",
      price: "$19.99",
      discount: "33% OFF",
      badge: "BEST VALUE",
      access: "Lifetime",
      billing: "One-time payment",
      renewal: "Not required"
    }
  },

  premium: {
    name: "Premium",
    benefits: [
      "Everything included with Keyless access",
      "Alter Hub premium features and premium content",
      "Priority community support",
      "Regular Premium feature updates",
      "Early access to selected new Premium releases"
    ],
    steps: [
      "Choose either the 30-day or lifetime Premium option.",
      "Accept the store terms and continue with your purchase request.",
      "After receiving your key, open Alter Hub and go to the Key System.",
      "Enter your Premium key to activate every included feature."
    ],
    monthly: {
      cardTitle: "Monthly Key",
      cardDescription: "Complete Premium access for 30 days with flexible renewal.",
      heroEyebrow: "PREMIUM ACCESS · 30 DAYS",
      titleMain: "Unlock more.",
      titleAccent: "For 30 days.",
      description: "A monthly Premium key gives you 30 days of Keyless access plus Alter Hub's premium-only features, Premium updates, and priority community support. Renew only when you want another 30 days.",
      features: [
        "Everything in Keyless",
        "Premium features",
        "Priority support"
      ],
      summaryTitle: "Monthly Premium",
      summaryDescription: "The complete Premium experience for 30 days with no long-term commitment.",
      oldPrice: "$14.99",
      price: "$7.99",
      discount: "47% OFF",
      badge: "POPULAR",
      access: "30 days",
      billing: "One-time payment",
      renewal: "Renew manually"
    },
    lifetime: {
      cardTitle: "Lifetime Key",
      cardDescription: "Permanent Premium access and future Premium updates.",
      heroEyebrow: "PREMIUM ACCESS · LIFETIME",
      titleMain: "Unlock more.",
      titleAccent: "For life.",
      description: "A lifetime Premium key permanently unlocks everything in Keyless plus Alter Hub's premium features, future Premium updates, and priority community support, all with one payment.",
      features: [
        "Permanent Premium access",
        "Future Premium updates",
        "Priority support"
      ],
      summaryTitle: "Lifetime Premium",
      summaryDescription: "Permanent access to Keyless and Premium features, including future Premium updates.",
      oldPrice: "$39.99",
      price: "$24.99",
      discount: "38% OFF",
      badge: "BEST VALUE",
      access: "Lifetime",
      billing: "One-time payment",
      renewal: "Not required"
    }
  },

  "premium-plus": {
    name: "Premium Plus",
    benefits: [
      "Everything included with Premium",
      "Exclusive Premium Plus features and benefits",
      "Earliest access to selected new releases",
      "Future Premium Plus feature updates",
      "Highest-priority community support"
    ],
    steps: [
      "Choose either the 30-day or lifetime Premium Plus option.",
      "Accept the store terms and continue with your purchase request.",
      "After receiving your key, open Alter Hub and go to the Key System.",
      "Enter your Premium Plus key to activate the complete top-tier package."
    ],
    monthly: {
      cardTitle: "Monthly Key",
      cardDescription: "The complete top-tier experience for 30 days.",
      heroEyebrow: "PREMIUM PLUS · 30 DAYS",
      titleMain: "Go all in.",
      titleAccent: "For 30 days.",
      description: "A monthly Premium Plus key gives you 30 days of every Premium benefit plus exclusive Plus features, earliest access to selected releases, and Alter Hub's highest-priority support tier.",
      features: [
        "Everything in Premium",
        "Exclusive Plus benefits",
        "Top-priority support"
      ],
      summaryTitle: "Monthly Premium Plus",
      summaryDescription: "Alter Hub's highest access tier for 30 days, with flexible manual renewal.",
      oldPrice: "$19.99",
      price: "$9.99",
      discount: "50% OFF",
      badge: "TOP TIER",
      access: "30 days",
      billing: "One-time payment",
      renewal: "Renew manually"
    },
    lifetime: {
      cardTitle: "Lifetime Key",
      cardDescription: "Permanent top-tier access and all future Plus updates.",
      heroEyebrow: "PREMIUM PLUS · LIFETIME",
      titleMain: "Go all in.",
      titleAccent: "Forever.",
      description: "A lifetime Premium Plus key permanently unlocks every Premium benefit, exclusive Plus features, future Plus updates, earliest access to selected releases, and top-priority support.",
      features: [
        "Permanent Plus access",
        "All future Plus updates",
        "Top-priority support"
      ],
      summaryTitle: "Lifetime Premium Plus",
      summaryDescription: "Permanent access to Alter Hub's complete top-tier experience with one payment.",
      oldPrice: "$59.99",
      price: "$39.99",
      discount: "33% OFF",
      badge: "ULTIMATE",
      access: "Lifetime",
      billing: "One-time payment",
      renewal: "Not required"
    }
  }
};

const tierSlug = document.body.dataset.tier;
const tier = PLAN_CATALOG[tierSlug] || PLAN_CATALOG.keyless;
const durationButtons = Array.from(document.querySelectorAll("[data-duration]"));
const termsCheckbox = document.querySelector("#terms-checkbox");
const purchaseButton = document.querySelector("#purchase-button");
const checkoutHint = document.querySelector("#checkout-hint");
const animatedElements = Array.from(document.querySelectorAll("[data-plan-content]"));

let selectedDuration = durationFromHash();

function durationFromHash() {
  const hash = window.location.hash.slice(1).trim().toLowerCase();
  return hash === "lifetime" ? "lifetime" : "monthly";
}

function currentPlan() {
  return tier[selectedDuration];
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function populateDurationCards() {
  durationButtons.forEach((button) => {
    const duration = button.dataset.duration;
    const plan = tier[duration];
    if (!plan) return;

    const title = button.querySelector("[data-card-title]");
    const description = button.querySelector("[data-card-description]");
    const oldPrice = button.querySelector("[data-card-old-price]");
    const price = button.querySelector("[data-card-price]");

    if (title) title.textContent = plan.cardTitle;
    if (description) description.textContent = plan.cardDescription;
    if (oldPrice) oldPrice.textContent = plan.oldPrice;
    if (price) price.textContent = plan.price;
  });
}

function renderList(selector, items, numbered = false) {
  const list = document.querySelector(selector);
  if (!list) return;

  list.replaceChildren();

  items.forEach((item, index) => {
    const listItem = document.createElement("li");

    if (numbered) {
      const number = document.createElement("span");
      number.className = "step-number";
      number.textContent = String(index + 1);

      const text = document.createElement("p");
      text.textContent = item;

      listItem.append(number, text);
    } else {
      listItem.textContent = item;
    }

    list.appendChild(listItem);
  });
}

function purchaseRequestUrl() {
  const plan = currentPlan();
  const subject = `Alter Hub ${plan.summaryTitle} purchase`;
  const body = [
    "Hello Alter Hub Support,",
    "",
    `I would like to purchase ${plan.summaryTitle} for ${plan.price}.`,
    `Access duration: ${plan.access}.`,
    "",
    "Please send me the available payment instructions."
  ].join("\n");

  return `mailto:support@alterhub.online?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function updatePurchaseAvailability() {
  if (!termsCheckbox || !purchaseButton || !checkoutHint) return;

  const ready = termsCheckbox.checked;
  purchaseButton.setAttribute("aria-disabled", String(!ready));
  purchaseButton.tabIndex = ready ? 0 : -1;
  checkoutHint.classList.toggle("is-ready", ready);
  checkoutHint.textContent = ready
    ? "Ready. Continue to receive the official payment instructions."
    : "Accept the terms to continue with this purchase.";

  if (ready) {
    purchaseButton.href = purchaseRequestUrl();
  } else {
    purchaseButton.removeAttribute("href");
  }
}

function restartAnimation() {
  animatedElements.forEach((element) => element.classList.remove("plan-swap"));
  void document.body.offsetWidth;
  animatedElements.forEach((element, index) => {
    element.style.animationDelay = `${Math.min(index * 24, 160)}ms`;
    element.classList.add("plan-swap");
  });
}

function updateUrl({ push = false } = {}) {
  const nextHash = `#${selectedDuration}`;
  const method = push ? "pushState" : "replaceState";
  window.history[method]({ duration: selectedDuration }, "", nextHash);
}

function renderPlan({ animate = true, updateHistory = true, pushHistory = false } = {}) {
  const plan = currentPlan();

  durationButtons.forEach((button) => {
    const isSelected = button.dataset.duration === selectedDuration;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-checked", String(isSelected));
  });

  setText("#hero-eyebrow", plan.heroEyebrow);
  setText("#hero-title-main", plan.titleMain);
  setText("#hero-title-accent", plan.titleAccent);
  setText("#hero-description", plan.description);
  setText("#feature-one", plan.features[0]);
  setText("#feature-two", plan.features[1]);
  setText("#feature-three", plan.features[2]);
  setText("#summary-tier", tier.name.toUpperCase());
  setText("#summary-badge", plan.badge);
  setText("#summary-title", plan.summaryTitle);
  setText("#summary-description", plan.summaryDescription);
  setText("#summary-old-price", plan.oldPrice);
  setText("#summary-price", plan.price);
  setText("#summary-discount", plan.discount);
  setText("#detail-access", plan.access);
  setText("#detail-billing", plan.billing);
  setText("#detail-renewal", plan.renewal);

  document.title = `${plan.summaryTitle} | Alter Hub`;

  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) metaDescription.content = plan.summaryDescription;

  updatePurchaseAvailability();

  if (animate) restartAnimation();
  if (updateHistory) updateUrl({ push: pushHistory });
}

durationButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const duration = button.dataset.duration;
    if (!tier[duration]) return;

    if (selectedDuration === duration) {
      updateUrl({ push: false });
      return;
    }

    selectedDuration = duration;
    renderPlan({ animate: true, updateHistory: true, pushHistory: true });
  });
});

if (termsCheckbox) {
  termsCheckbox.addEventListener("change", updatePurchaseAvailability);
}

if (purchaseButton) {
  purchaseButton.addEventListener("click", (event) => {
    if (purchaseButton.getAttribute("aria-disabled") === "true") {
      event.preventDefault();
      termsCheckbox?.focus();
    }
  });
}

window.addEventListener("popstate", () => {
  selectedDuration = durationFromHash();
  renderPlan({ animate: true, updateHistory: false });
});

window.addEventListener("hashchange", () => {
  const nextDuration = durationFromHash();
  if (nextDuration === selectedDuration) return;
  selectedDuration = nextDuration;
  renderPlan({ animate: true, updateHistory: false });
});

function initializePlanPage() {
  populateDurationCards();
  renderList("#benefit-list", tier.benefits);
  renderList("#steps-list", tier.steps, true);
  renderPlan({ animate: false, updateHistory: true, pushHistory: false });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializePlanPage);
} else {
  initializePlanPage();
}
