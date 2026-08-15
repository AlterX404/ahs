"use strict";



const PAYPAL_BUTTON_IDS = {
  keyless: {
    monthly: "REPLACE_WITH_KEYLESS_MONTHLY_BUTTON_ID",
    lifetime: "REPLACE_WITH_KEYLESS_LIFETIME_BUTTON_ID"
  },
  premium: {
    monthly: "REPLACE_WITH_PREMIUM_MONTHLY_BUTTON_ID",
    lifetime: "REPLACE_WITH_PREMIUM_LIFETIME_BUTTON_ID"
  },
  "premium-plus": {
    monthly: "REPLACE_WITH_PREMIUM_PLUS_MONTHLY_BUTTON_ID",
    lifetime: "REPLACE_WITH_PREMIUM_PLUS_LIFETIME_BUTTON_ID"
  }
};

const catalog = {
  keyless: {
    name: "Keyless",
    monthly: {
      label: "Keyless · Monthly",
      title: "Monthly Keyless",
      price: "$5.99",
      oldPrice: "$9.99",
      discount: "40% OFF",
      breakdown: "30 days of keyless access",
      eyebrow: "KEYLESS · MONTHLY",
      titleAccent: "Skip the checkpoints.",
      description:
        "Get Alter Hub Keyless access for 30 days with no checkpoint flow, fast activation, and regular platform updates.",
      summary:
        "Skip the checkpoint flow and keep fast Alter Hub access for 30 days.",
      badge: "FLEXIBLE",
      features: [
        "No key checkpoints",
        "30-day access",
        "Fast activation"
      ]
    },
    lifetime: {
      label: "Keyless · Lifetime",
      title: "Lifetime Keyless",
      price: "$19.99",
      oldPrice: "$29.99",
      discount: "33% OFF",
      breakdown: "One-time payment · lifetime keyless",
      eyebrow: "KEYLESS · LIFETIME",
      titleAccent: "Keyless for life.",
      description:
        "Make one payment for permanent Alter Hub Keyless access with no checkpoint flow and continued platform updates.",
      summary:
        "Permanent keyless access with one payment and no recurring renewal.",
      badge: "BEST VALUE",
      features: [
        "Permanent keyless access",
        "No checkpoint flow",
        "Future platform updates"
      ]
    }
  },

  premium: {
    name: "Premium",
    monthly: {
      label: "Premium · Monthly",
      title: "Monthly Premium",
      price: "$7.99",
      oldPrice: "$14.99",
      discount: "47% OFF",
      breakdown: "30 days of premium access",
      eyebrow: "PREMIUM · MONTHLY",
      titleAccent: "Unlock Premium.",
      description:
        "Get 30 days of Alter Hub Premium with premium features, faster access, priority support, and regular premium updates.",
      summary:
        "Full Premium access for 30 days with flexible renewal.",
      badge: "POPULAR",
      features: [
        "Everything in Keyless",
        "Premium platform features",
        "Priority community support"
      ]
    },
    lifetime: {
      label: "Premium · Lifetime",
      title: "Lifetime Premium",
      price: "$24.99",
      oldPrice: "$39.99",
      discount: "38% OFF",
      breakdown: "One-time payment · lifetime premium",
      eyebrow: "PREMIUM · LIFETIME",
      titleAccent: "Premium for life.",
      description:
        "Make one payment for permanent Alter Hub Premium access, including premium features, future updates, and priority support.",
      summary:
        "Permanent Premium access with one payment and future premium updates.",
      badge: "BEST VALUE",
      features: [
        "Permanent Premium access",
        "Future premium updates",
        "Priority community support"
      ]
    }
  },

  "premium-plus": {
    name: "Premium Plus",
    monthly: {
      label: "Premium Plus · Monthly",
      title: "Monthly Premium Plus",
      price: "$9.99",
      oldPrice: "$19.99",
      discount: "50% OFF",
      breakdown: "30 days of Premium Plus access",
      eyebrow: "PREMIUM PLUS · MONTHLY",
      titleAccent: "Get the full experience.",
      description:
        "Get 30 days of Alter Hub Premium Plus with everything in Premium, early access, top-priority support, and exclusive Plus benefits.",
      summary:
        "The highest Alter Hub tier for 30 days, with flexible renewal.",
      badge: "TOP TIER",
      features: [
        "Everything in Premium",
        "Early access to new releases",
        "Highest priority support"
      ]
    },
    lifetime: {
      label: "Premium Plus · Lifetime",
      title: "Lifetime Premium Plus",
      price: "$39.99",
      oldPrice: "$59.99",
      discount: "33% OFF",
      breakdown: "One-time payment · lifetime Premium Plus",
      eyebrow: "PREMIUM PLUS · LIFETIME",
      titleAccent: "The full tier. Forever.",
      description:
        "Make one payment for permanent Premium Plus access with every Premium benefit, early access, exclusive Plus features, and top-priority support.",
      summary:
        "Permanent access to Alter Hub's highest tier with one payment.",
      badge: "ULTIMATE",
      features: [
        "Permanent Premium Plus access",
        "All future Plus updates",
        "Highest priority support"
      ]
    }
  }
};

const tierButtons = Array.from(
  document.querySelectorAll(".tier-card")
);
const durationSelect = document.querySelector("#duration-select");
const termsCheckbox = document.querySelector("#terms-checkbox");
const termsHint = document.querySelector("#terms-hint");
const paypalCheckout = document.querySelector("#paypal-checkout");
const paypalContainer = document.querySelector("#paypal-button-container");

const selectedPlanLabel = document.querySelector("#selected-plan-label");
const totalBreakdown = document.querySelector("#total-breakdown");
const orderTotal = document.querySelector("#order-total");

const productEyebrow = document.querySelector("#product-eyebrow");
const productTitleAccent = document.querySelector("#product-title-accent");
const productDescription = document.querySelector("#product-description");
const featureOne = document.querySelector("#feature-one");
const featureTwo = document.querySelector("#feature-two");
const featureThree = document.querySelector("#feature-three");

const summaryTier = document.querySelector("#summary-tier");
const summaryTitle = document.querySelector("#summary-title");
const summaryBadge = document.querySelector("#summary-badge");
const summaryDescription = document.querySelector("#summary-description");
const summaryOldPrice = document.querySelector("#summary-old-price");
const summaryPrice = document.querySelector("#summary-price");
const summaryDiscount = document.querySelector("#summary-discount");

let selectedTier = "keyless";
let selectedDuration = "monthly";
let termsAccepted = false;
let paypalRenderToken = 0;

function currentPlan() {
  return catalog[selectedTier][selectedDuration];
}

function restartPlanAnimation() {
  const animatedElements = [
    productEyebrow,
    productTitleAccent,
    productDescription,
    featureOne,
    featureTwo,
    featureThree,
    summaryTitle,
    summaryDescription,
    summaryPrice
  ].filter(Boolean);

  animatedElements.forEach((element) => {
    element.classList.remove("plan-content-enter");
  });

  void document.body.offsetWidth;

  animatedElements.forEach((element, index) => {
    element.style.setProperty(
      "--animation-delay",
      `${index * 45}ms`
    );
    element.classList.add("plan-content-enter");
  });
}

function isConfiguredButtonId(value) {
  return Boolean(value) && !value.startsWith("REPLACE_WITH_");
}

function getHostedButtonId() {
  return PAYPAL_BUTTON_IDS[selectedTier][selectedDuration];
}

function renderSelectedPayPalButton() {
  if (!paypalContainer) return;

  const renderToken = ++paypalRenderToken;
  paypalContainer.innerHTML = "";

  const hostedButtonId = getHostedButtonId();

  if (!isConfiguredButtonId(hostedButtonId)) {
    paypalContainer.innerHTML = `
      <p class="paypal-configuration-message">
        Checkout for ${currentPlan().label} has not been configured yet.
      </p>
    `;
    return;
  }

  if (!window.paypal || !window.paypal.HostedButtons) {
    paypalContainer.innerHTML = `
      <p class="paypal-configuration-message">
        PayPal could not be loaded. Please refresh the page.
      </p>
    `;
    return;
  }

  try {
    const mount = document.createElement("div");
    mount.id = `paypal-render-${Date.now()}-${renderToken}`;
    paypalContainer.appendChild(mount);

    window.paypal
      .HostedButtons({ hostedButtonId })
      .render(`#${mount.id}`);
  } catch (error) {
    console.error("Failed to render PayPal button:", error);
    paypalContainer.innerHTML = `
      <p class="paypal-configuration-message">
        Checkout could not be loaded. Please refresh the page.
      </p>
    `;
  }
}

function updateCheckoutAvailability() {
  const configured = isConfiguredButtonId(getHostedButtonId());
  const checkoutEnabled = termsAccepted && configured;

  paypalCheckout.classList.toggle("disabled", !checkoutEnabled);
  paypalCheckout.setAttribute(
    "aria-disabled",
    String(!checkoutEnabled)
  );

  if (!termsAccepted) {
    termsHint.textContent =
      "Accept the terms to unlock secure payment.";
    termsHint.classList.remove("accepted");
    return;
  }

  if (!configured) {
    termsHint.textContent =
      `${currentPlan().label} checkout needs its PayPal hosted button ID.`;
    termsHint.classList.remove("accepted");
    return;
  }

  termsHint.textContent =
    `${currentPlan().label} checkout is ready.`;
  termsHint.classList.add("accepted");
}

function updateUrl() {
  const url = new URL(window.location.href);
  url.hash = selectedTier;
  url.searchParams.set("duration", selectedDuration);
  history.replaceState(null, "", url);
}

function updateSelectedPlan({ animate = true, updateHistory = true } = {}) {
  const tier = catalog[selectedTier];
  const plan = currentPlan();

  tierButtons.forEach((button) => {
    const selected = button.dataset.tier === selectedTier;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-checked", String(selected));
  });

  durationSelect.value = selectedDuration;

  selectedPlanLabel.textContent = plan.label;
  totalBreakdown.textContent = plan.breakdown;
  orderTotal.textContent = plan.price;

  productEyebrow.textContent = plan.eyebrow;
  productTitleAccent.textContent = plan.titleAccent;
  productDescription.textContent = plan.description;
  featureOne.textContent = plan.features[0];
  featureTwo.textContent = plan.features[1];
  featureThree.textContent = plan.features[2];

  summaryTier.textContent = tier.name.toUpperCase();
  summaryTitle.textContent = plan.title;
  summaryBadge.textContent = plan.badge;
  summaryDescription.textContent = plan.summary;
  summaryOldPrice.textContent = plan.oldPrice;
  summaryPrice.textContent = plan.price;
  summaryDiscount.textContent = plan.discount;

  if (animate) restartPlanAnimation();
  if (updateHistory) updateUrl();

  renderSelectedPayPalButton();
  updateCheckoutAvailability();
}

function tierFromHash() {
  const hash = window.location.hash
    .replace("#", "")
    .trim()
    .toLowerCase();

  if (hash === "premium-plus" || hash === "premium_plus") {
    return "premium-plus";
  }

  if (hash === "premium") return "premium";
  return "keyless";
}

function durationFromUrl() {
  const duration = new URL(window.location.href)
    .searchParams
    .get("duration");

  return duration === "lifetime" ? "lifetime" : "monthly";
}

tierButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const tier = button.dataset.tier;
    if (!catalog[tier]) return;
    selectedTier = tier;
    updateSelectedPlan();
  });
});

durationSelect.addEventListener("change", () => {
  selectedDuration =
    durationSelect.value === "lifetime" ? "lifetime" : "monthly";
  updateSelectedPlan();
});

termsCheckbox.addEventListener("change", () => {
  termsAccepted = termsCheckbox.checked;
  updateCheckoutAvailability();
});

window.addEventListener("hashchange", () => {
  selectedTier = tierFromHash();
  updateSelectedPlan({ updateHistory: false });
});

function initializeCheckout() {
  selectedTier = tierFromHash();
  selectedDuration = durationFromUrl();
  updateSelectedPlan({ animate: false, updateHistory: false });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeCheckout);
} else {
  initializeCheckout();
}
