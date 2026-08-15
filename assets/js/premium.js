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
    slug: "keyless",
    benefitsEyebrow: "KEYLESS BENEFITS",
    benefitsTitle: "Why Go Keyless",
    checkoutTitle: "Choose Keyless access",
    benefits: [
      ["🔑", "No checkpoint flow while your access is active"],
      ["⚡", "Fast access on your activated device"],
      ["🔄", "Regular Alter Hub platform updates"],
      ["🎮", "Access across supported Alter Hub games"],
      ["💬", "Community support when you need help"]
    ],
    activation: {
      title: "How to Activate Keyless",
      steps: [
        "Choose your Keyless duration and purchase your key.",
        "Open Alter Hub and select <strong>Key System</strong>.",
        "Enter the Keyless key once on the device you want to activate.",
        "Keyless access stays active for your selected duration."
      ]
    },
    monthly: {
      label: "Keyless · Monthly",
      title: "Monthly Keyless",
      price: "$5.99",
      oldPrice: "$9.99",
      discount: "40% OFF",
      breakdown: "30 days of keyless access",
      eyebrow: "KEYLESS ACCESS · 30 DAYS",
      titleMain: "Skip the key grind.",
      titleAccent: "Fast access for 30 days.",
      description:
        "Use Alter Hub for 30 days without completing the free checkpoint flow each time. Activate the Keyless license on your device and keep quick access for the full period.",
      summary:
        "Skip the checkpoint flow and keep fast Alter Hub access for 30 days.",
      badge: "FLEXIBLE",
      features: [
        "No key checkpoints",
        "30-day Keyless access",
        "Device-bound activation"
      ]
    },
    lifetime: {
      label: "Keyless · Lifetime",
      title: "Lifetime Keyless",
      price: "$19.99",
      oldPrice: "$29.99",
      discount: "33% OFF",
      breakdown: "One-time payment · lifetime keyless",
      eyebrow: "KEYLESS ACCESS · LIFETIME",
      titleMain: "Skip the key grind.",
      titleAccent: "Keyless for life.",
      description:
        "Make one payment for permanent Alter Hub Keyless access. Keep the no-checkpoint experience on your activated device without monthly renewals.",
      summary:
        "Permanent Keyless access with one payment and no recurring renewal.",
      badge: "BEST VALUE",
      features: [
        "Permanent Keyless access",
        "No checkpoint flow",
        "Future platform updates"
      ]
    }
  },

  premium: {
    name: "Premium",
    slug: "premium",
    benefitsEyebrow: "PREMIUM BENEFITS",
    benefitsTitle: "Why Go Premium",
    checkoutTitle: "Choose Premium access",
    benefits: [
      ["🔑", "Everything included with Keyless access"],
      ["🧩", "Premium platform features and premium content"],
      ["⚡", "Faster access with a verified Premium license"],
      ["✦", "Early access to selected new Premium features"],
      ["💬", "Priority community support"]
    ],
    activation: {
      title: "How to Activate Premium",
      steps: [
        "Choose your Premium duration and purchase your key.",
        "Open Alter Hub and select <strong>Key System</strong>.",
        "Enter the Premium key and verify it on your device.",
        "Premium features unlock for your selected duration."
      ]
    },
    monthly: {
      label: "Premium · Monthly",
      title: "Monthly Premium",
      price: "$7.99",
      oldPrice: "$14.99",
      discount: "47% OFF",
      breakdown: "30 days of premium access",
      eyebrow: "PREMIUM ACCESS · 30 DAYS",
      titleMain: "Unlock more.",
      titleAccent: "Premium for 30 days.",
      description:
        "Get 30 days of Alter Hub Premium with everything in Keyless plus Premium features, improved access, priority support, and regular Premium updates.",
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
      eyebrow: "PREMIUM ACCESS · LIFETIME",
      titleMain: "Unlock more.",
      titleAccent: "Premium for life.",
      description:
        "Make one payment for permanent Alter Hub Premium access, including Keyless benefits, Premium features, future Premium updates, and priority support.",
      summary:
        "Permanent Premium access with one payment and future Premium updates.",
      badge: "BEST VALUE",
      features: [
        "Permanent Premium access",
        "Future Premium updates",
        "Priority community support"
      ]
    }
  },

  "premium-plus": {
    name: "Premium Plus",
    slug: "premium-plus",
    benefitsEyebrow: "PREMIUM PLUS BENEFITS",
    benefitsTitle: "Why Go Premium Plus",
    checkoutTitle: "Choose Premium Plus access",
    benefits: [
      ["◆", "Everything included with Premium"],
      ["✦", "Exclusive Premium Plus features and benefits"],
      ["🚀", "Earliest access to selected new releases"],
      ["🔄", "Premium Plus updates as the tier expands"],
      ["💬", "Highest-priority community support"]
    ],
    activation: {
      title: "How to Activate Premium Plus",
      steps: [
        "Choose your Premium Plus duration and purchase your key.",
        "Open Alter Hub and select <strong>Key System</strong>.",
        "Enter the Premium Plus key and verify it on your device.",
        "Premium Plus access unlocks with the full top-tier feature set."
      ]
    },
    monthly: {
      label: "Premium Plus · Monthly",
      title: "Monthly Premium Plus",
      price: "$9.99",
      oldPrice: "$19.99",
      discount: "50% OFF",
      breakdown: "30 days of Premium Plus access",
      eyebrow: "PREMIUM PLUS · 30 DAYS",
      titleMain: "Go all in.",
      titleAccent: "The full Alter Hub tier.",
      description:
        "Get 30 days of Alter Hub Premium Plus with everything in Premium, exclusive Plus benefits, early access, and the highest-priority support tier.",
      summary:
        "The highest Alter Hub tier for 30 days, with flexible renewal.",
      badge: "TOP TIER",
      features: [
        "Everything in Premium",
        "Exclusive Plus benefits",
        "Highest-priority support"
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
      titleMain: "Go all in.",
      titleAccent: "The full tier. Forever.",
      description:
        "Make one payment for permanent Premium Plus access with every Premium benefit, exclusive Plus features, early access, future Plus updates, and top-priority support.",
      summary:
        "Permanent access to Alter Hub's highest tier with one payment.",
      badge: "ULTIMATE",
      features: [
        "Permanent Premium Plus access",
        "All future Plus updates",
        "Highest-priority support"
      ]
    }
  }
};

const tierButtons = Array.from(
  document.querySelectorAll(".tier-card")
);

const durationSelect = document.querySelector("#duration-select");
const durationDropdown = document.querySelector("#duration-dropdown");
const durationTrigger = document.querySelector("#duration-trigger");
const durationTriggerLabel = document.querySelector("#duration-trigger-label");
const durationMenu = document.querySelector("#duration-menu");
const durationOptions = Array.from(
  document.querySelectorAll(".duration-option")
);

const termsCheckbox = document.querySelector("#terms-checkbox");
const termsHint = document.querySelector("#terms-hint");
const paypalCheckout = document.querySelector("#paypal-checkout");
const paypalContainer = document.querySelector("#paypal-button-container");

const selectedPlanLabel = document.querySelector("#selected-plan-label");
const totalBreakdown = document.querySelector("#total-breakdown");
const orderTotal = document.querySelector("#order-total");

const productEyebrow = document.querySelector("#product-eyebrow");
const productTitleMain = document.querySelector("#product-title-main");
const productTitleAccent = document.querySelector("#product-title-accent");
const productDescription = document.querySelector("#product-description");
const featureOne = document.querySelector("#feature-one");
const featureTwo = document.querySelector("#feature-two");
const featureThree = document.querySelector("#feature-three");

const benefitsEyebrow = document.querySelector("#benefits-eyebrow");
const benefitsTitle = document.querySelector("#benefits-title");
const benefitIcons = [1, 2, 3, 4, 5].map((index) =>
  document.querySelector(`#benefit-icon-${index}`)
);
const benefitTexts = [1, 2, 3, 4, 5].map((index) =>
  document.querySelector(`#benefit-text-${index}`)
);

const activationEyebrow = document.querySelector("#activation-eyebrow");
const activationTitle = document.querySelector("#activation-title");
const activationSteps = [1, 2, 3, 4].map((index) =>
  document.querySelector(`#activation-step-${index}`)
);

const checkoutTitle = document.querySelector("#checkout-title");

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

function currentTier() {
  return catalog[selectedTier];
}

function currentPlan() {
  return currentTier()[selectedDuration];
}

function isConfiguredButtonId(value) {
  return Boolean(value) && !value.startsWith("REPLACE_WITH_");
}

function getHostedButtonId() {
  return PAYPAL_BUTTON_IDS[selectedTier][selectedDuration];
}

function durationLabel(duration) {
  return duration === "lifetime"
    ? "Lifetime · One Time"
    : "Monthly · 30 Days";
}

function restartPlanAnimation() {
  const animatedElements = [
    productEyebrow,
    productTitleMain,
    productTitleAccent,
    productDescription,
    featureOne,
    featureTwo,
    featureThree,
    benefitsEyebrow,
    benefitsTitle,
    ...benefitTexts,
    activationTitle,
    ...activationSteps,
    checkoutTitle,
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
      `${Math.min(index * 28, 210)}ms`
    );
    element.classList.add("plan-content-enter");
  });
}

function closeDurationDropdown() {
  if (!durationDropdown || !durationTrigger || !durationMenu) return;

  durationDropdown.dataset.open = "false";
  durationTrigger.setAttribute("aria-expanded", "false");
  durationMenu.hidden = true;
}

function openDurationDropdown() {
  if (!durationDropdown || !durationTrigger || !durationMenu) return;

  durationDropdown.dataset.open = "true";
  durationTrigger.setAttribute("aria-expanded", "true");
  durationMenu.hidden = false;

  const selectedOption = durationOptions.find(
    (option) => option.dataset.duration === selectedDuration
  );

  if (selectedOption) {
    selectedOption.focus({ preventScroll: true });
  }
}

function toggleDurationDropdown() {
  const open = durationDropdown?.dataset.open === "true";
  if (open) {
    closeDurationDropdown();
  } else {
    openDurationDropdown();
  }
}

function updateDurationControls() {
  if (durationSelect) {
    durationSelect.value = selectedDuration;
  }

  if (durationTriggerLabel) {
    durationTriggerLabel.textContent = durationLabel(selectedDuration);
  }

  durationOptions.forEach((option) => {
    const selected = option.dataset.duration === selectedDuration;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-selected", String(selected));
  });
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
  if (!paypalCheckout || !termsHint) return;

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

function tierFromHash() {
  const hash = window.location.hash
    .replace("#", "")
    .trim()
    .toLowerCase();

  if (hash === "premium-plus" || hash === "premium_plus") {
    return "premium-plus";
  }

  if (hash === "premium") {
    return "premium";
  }

  return "keyless";
}

function durationFromUrl() {
  const duration = new URL(window.location.href)
    .searchParams
    .get("duration");

  return duration === "lifetime" ? "lifetime" : "monthly";
}

function planUrl(tier = selectedTier, duration = selectedDuration) {
  const url = new URL(window.location.href);

  if (duration === "lifetime") {
    url.searchParams.set("duration", "lifetime");
  } else {
    url.searchParams.delete("duration");
  }

  url.hash = tier;
  return url;
}

function updateUrl({ push = false } = {}) {
  const url = planUrl();

  if (push) {
    history.pushState(
      {
        tier: selectedTier,
        duration: selectedDuration
      },
      "",
      url
    );
  } else {
    history.replaceState(
      {
        tier: selectedTier,
        duration: selectedDuration
      },
      "",
      url
    );
  }
}

function updateSelectedPlan({
  animate = true,
  updateHistory = true,
  pushHistory = false
} = {}) {
  const tier = currentTier();
  const plan = currentPlan();

  tierButtons.forEach((button) => {
    const selected = button.dataset.tier === selectedTier;

    button.classList.toggle("selected", selected);
    button.setAttribute("aria-checked", String(selected));
    button.setAttribute(
      "aria-current",
      selected ? "page" : "false"
    );
  });

  updateDurationControls();

  if (selectedPlanLabel) selectedPlanLabel.textContent = plan.label;
  if (totalBreakdown) totalBreakdown.textContent = plan.breakdown;
  if (orderTotal) orderTotal.textContent = plan.price;

  if (productEyebrow) productEyebrow.textContent = plan.eyebrow;
  if (productTitleMain) productTitleMain.textContent = plan.titleMain;
  if (productTitleAccent) productTitleAccent.textContent = plan.titleAccent;
  if (productDescription) productDescription.textContent = plan.description;

  if (featureOne) featureOne.textContent = plan.features[0];
  if (featureTwo) featureTwo.textContent = plan.features[1];
  if (featureThree) featureThree.textContent = plan.features[2];

  if (benefitsEyebrow) benefitsEyebrow.textContent = tier.benefitsEyebrow;
  if (benefitsTitle) benefitsTitle.textContent = tier.benefitsTitle;

  tier.benefits.forEach(([icon, text], index) => {
    if (benefitIcons[index]) benefitIcons[index].textContent = icon;
    if (benefitTexts[index]) benefitTexts[index].textContent = text;
  });

  if (activationEyebrow) {
    activationEyebrow.textContent =
      `${tier.name.toUpperCase()} SETUP`;
  }

  if (activationTitle) {
    activationTitle.textContent = tier.activation.title;
  }

  tier.activation.steps.forEach((step, index) => {
    if (activationSteps[index]) {
      activationSteps[index].innerHTML = step;
    }
  });

  if (checkoutTitle) checkoutTitle.textContent = tier.checkoutTitle;

  if (summaryTier) summaryTier.textContent = tier.name.toUpperCase();
  if (summaryTitle) summaryTitle.textContent = plan.title;
  if (summaryBadge) summaryBadge.textContent = plan.badge;
  if (summaryDescription) summaryDescription.textContent = plan.summary;
  if (summaryOldPrice) summaryOldPrice.textContent = plan.oldPrice;
  if (summaryPrice) summaryPrice.textContent = plan.price;
  if (summaryDiscount) summaryDiscount.textContent = plan.discount;

  document.title =
    `${plan.title} | Alter Hub Secure Checkout`;

  if (animate) {
    restartPlanAnimation();
  }

  if (updateHistory) {
    updateUrl({ push: pushHistory });
  }

  renderSelectedPayPalButton();
  updateCheckoutAvailability();
}

function syncStateFromUrl({ animate = true } = {}) {
  selectedTier = tierFromHash();
  selectedDuration = durationFromUrl();

  updateSelectedPlan({
    animate,
    updateHistory: false
  });
}

tierButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const tier = button.dataset.tier;

    if (!catalog[tier] || tier === selectedTier) {
      return;
    }

    selectedTier = tier;

    /*
      This changes the actual page URL:
      /premium#keyless
      /premium#premium
      /premium#premium-plus

      Lifetime keeps ?duration=lifetime so Back/Forward preserves
      the selected duration too.
    */
    updateSelectedPlan({
      animate: true,
      updateHistory: true,
      pushHistory: true
    });
  });
});

if (durationTrigger) {
  durationTrigger.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleDurationDropdown();
  });

  durationTrigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDurationDropdown();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeDurationDropdown();
    }
  });
}

durationOptions.forEach((option) => {
  option.addEventListener("click", () => {
    const duration = option.dataset.duration;

    if (duration !== "monthly" && duration !== "lifetime") {
      return;
    }

    selectedDuration = duration;
    closeDurationDropdown();

    updateSelectedPlan({
      animate: true,
      updateHistory: true,
      pushHistory: true
    });

    durationTrigger?.focus({ preventScroll: true });
  });

  option.addEventListener("keydown", (event) => {
    const currentIndex = durationOptions.indexOf(option);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      durationOptions[
        (currentIndex + 1) % durationOptions.length
      ].focus();
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      durationOptions[
        (currentIndex - 1 + durationOptions.length) % durationOptions.length
      ].focus();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeDurationDropdown();
      durationTrigger?.focus({ preventScroll: true });
    }
  });
});

document.addEventListener("click", (event) => {
  if (
    durationDropdown &&
    !durationDropdown.contains(event.target)
  ) {
    closeDurationDropdown();
  }
});

if (termsCheckbox) {
  termsCheckbox.addEventListener("change", () => {
    termsAccepted = termsCheckbox.checked;
    updateCheckoutAvailability();
  });
}

window.addEventListener("popstate", () => {
  syncStateFromUrl({ animate: true });
});

window.addEventListener("hashchange", () => {
  syncStateFromUrl({ animate: true });
});

function initializeCheckout() {
  selectedTier = tierFromHash();
  selectedDuration = durationFromUrl();

  updateSelectedPlan({
    animate: false,
    updateHistory: true,
    pushHistory: false
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeCheckout);
} else {
  initializeCheckout();
}
