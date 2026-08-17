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
      "Choose either the recurring monthly or lifetime Keyless option.",
      "Accept the store terms and subscribe securely through PayPal.",
      "After receiving your key, open Alter Hub and go to the Key System.",
      "Enter the key once on the device you want to activate."
    ],
    monthly: {
      cardTitle: "Monthly Key",
      cardDescription: "Keyless access billed automatically every month until cancelled.",
      heroEyebrow: "KEYLESS ACCESS · MONTHLY",
      titleMain: "Skip the key system.",
      titleAccent: "Month after month.",
      description: "A monthly Keyless subscription removes the free key-system checkpoints while your PayPal subscription remains active. It renews automatically every month until cancelled and includes core Alter Hub access, but not Premium or Premium Plus features.",
      features: [
        "No key checkpoints",
        "Monthly recurring access",
        "Core features only"
      ],
      summaryTitle: "Monthly Keyless",
      summaryDescription: "Checkpoint-free Alter Hub access that renews automatically every month until cancelled.",
      oldPrice: "$9.99",
      price: "$5.99",
      discount: "40% OFF",
      badge: "AUTO-RENEW",
      access: "While subscribed",
      billing: "$5.99 every month",
      renewal: "Automatic until cancelled"
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
      "Choose either the recurring monthly or lifetime Premium option.",
      "Accept the store terms and subscribe securely through PayPal.",
      "After receiving your key, open Alter Hub and go to the Key System.",
      "Enter your Premium key to activate every included feature."
    ],
    monthly: {
      cardTitle: "Monthly Key",
      cardDescription: "Complete Premium access billed automatically every month.",
      heroEyebrow: "PREMIUM ACCESS · MONTHLY",
      titleMain: "Unlock more.",
      titleAccent: "Every month.",
      description: "A monthly Premium subscription includes Keyless access, Alter Hub's premium-only features, Premium updates, and priority support. PayPal bills $7.99 automatically every month until you cancel.",
      features: [
        "Everything in Keyless",
        "Premium features",
        "Priority support"
      ],
      summaryTitle: "Monthly Premium",
      summaryDescription: "The complete Premium experience with automatic monthly PayPal renewal until cancelled.",
      oldPrice: "$14.99",
      price: "$7.99",
      discount: "47% OFF",
      badge: "POPULAR",
      access: "While subscribed",
      billing: "$7.99 every month",
      renewal: "Automatic until cancelled"
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
      "Choose either the recurring monthly or lifetime Premium Plus option.",
      "Accept the store terms and subscribe securely through PayPal.",
      "After receiving your key, open Alter Hub and go to the Key System.",
      "Enter your Premium Plus key to activate the complete top-tier package."
    ],
    monthly: {
      cardTitle: "Monthly Key",
      cardDescription: "The complete top-tier experience billed automatically every month.",
      heroEyebrow: "PREMIUM PLUS · MONTHLY",
      titleMain: "Go all in.",
      titleAccent: "Every month.",
      description: "A monthly Premium Plus subscription includes every Premium benefit, exclusive Plus features, earliest access to selected releases, and top-priority support. PayPal bills $9.99 automatically every month until you cancel.",
      features: [
        "Everything in Premium",
        "Exclusive Plus benefits",
        "Top-priority support"
      ],
      summaryTitle: "Monthly Premium Plus",
      summaryDescription: "Alter Hub's highest access tier with automatic monthly PayPal renewal until cancelled.",
      oldPrice: "$19.99",
      price: "$9.99",
      discount: "50% OFF",
      badge: "TOP TIER",
      access: "While subscribed",
      billing: "$9.99 every month",
      renewal: "Automatic until cancelled"
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

const PAYPAL_MONTHLY_PLAN_IDS = Object.freeze({
  keyless: "P-35C963541U1914902NKBVFZY",
  premium: "P-6M06813917127705RNKBVO2I",
  "premium-plus": "P-72H85729L5583625MNKBVQKY"
});

const PAYPAL_CLIENT_ID = "BAAwVHsGOQSMvQW5S6JMpJEMMbOTSeZuXZpkEF4ygqGKi0-4F5o6rj8MAeP5dENFSGaxDhSJcHSRyzzgVI";
const PAYPAL_SDK_ID = "alter-hub-paypal-sdk";
const PAYPAL_SDK_TIMEOUT_MS = 20000;

let paypalSdkPromise = null;

function paypalSdkReady() {
  return Boolean(window.paypal && typeof window.paypal.Buttons === "function");
}

function buildPayPalSdkUrl() {
  const params = new URLSearchParams({
    "client-id": PAYPAL_CLIENT_ID,
    components: "buttons",
    vault: "true",
    intent: "subscription",
    currency: "USD"
  });

  return `https://www.paypal.com/sdk/js?${params.toString()}`;
}

function loadPayPalSdk({ forceReload = false } = {}) {
  if (paypalSdkReady()) return Promise.resolve(window.paypal);

  if (forceReload) {
    document.getElementById(PAYPAL_SDK_ID)?.remove();
    paypalSdkPromise = null;
  }

  if (paypalSdkPromise) return paypalSdkPromise;

  paypalSdkPromise = new Promise((resolve, reject) => {
    let script = document.getElementById(PAYPAL_SDK_ID);
    let settled = false;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      callback(value);
    };

    const handleLoad = () => {
      if (paypalSdkReady()) {
        finish(resolve, window.paypal);
      } else {
        finish(reject, new Error("PayPal SDK loaded but window.paypal is unavailable."));
      }
    };

    const handleError = () => {
      finish(reject, new Error("PayPal SDK request was blocked or failed."));
    };

    const timeoutId = window.setTimeout(() => {
      finish(reject, new Error("PayPal SDK timed out while loading."));
    }, PAYPAL_SDK_TIMEOUT_MS);

    const isNewScript = !script;

    if (isNewScript) {
      script = document.createElement("script");
      script.id = PAYPAL_SDK_ID;
      script.src = buildPayPalSdkUrl();
      script.async = true;
      script.dataset.sdkIntegrationSource = "button-factory";
    }

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (isNewScript) {
      document.head.appendChild(script);
    }

    // The SDK may already be ready if another script instance loaded it.
    if (paypalSdkReady()) handleLoad();
  }).catch((error) => {
    paypalSdkPromise = null;
    throw error;
  });

  return paypalSdkPromise;
}

const tierSlug = document.body.dataset.tier;
const tier = PLAN_CATALOG[tierSlug] || PLAN_CATALOG.keyless;
const durationButtons = Array.from(document.querySelectorAll("[data-duration]"));
const termsCheckbox = document.querySelector("#terms-checkbox");
const termsCopy = document.querySelector("#terms-copy");
const purchaseButton = document.querySelector("#purchase-button");
const purchaseButtonLabel = document.querySelector("#purchase-button-label");
const paypalSubscriptionWrap = document.querySelector("#paypal-subscription-wrap");
const paypalSubscriptionButton = document.querySelector("#paypal-subscription-button");
const checkoutHint = document.querySelector("#checkout-hint");
const animatedElements = Array.from(document.querySelectorAll("[data-plan-content]"));

let selectedDuration = durationFromHash();
let paypalButtonRendered = false;
let paypalRenderStarted = false;
let paypalButtonActions = null;

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

function lifetimePurchaseRequestUrl() {
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

function showPayPalStatus(message, isError = false, allowRetry = false) {
  if (!paypalSubscriptionButton) return;

  paypalSubscriptionButton.replaceChildren();

  const status = document.createElement("div");
  status.className = `paypal-status${isError ? " is-error" : ""}`;

  const text = document.createElement("p");
  text.textContent = message;
  status.appendChild(text);

  if (allowRetry) {
    const retryButton = document.createElement("button");
    retryButton.type = "button";
    retryButton.className = "paypal-retry-button";
    retryButton.textContent = "Retry PayPal";
    retryButton.addEventListener("click", async () => {
      retryButton.disabled = true;
      text.textContent = "Reloading PayPal checkout…";
      paypalButtonRendered = false;
      paypalRenderStarted = false;
      paypalButtonActions = null;

      try {
        await loadPayPalSdk({ forceReload: true });
        paypalSubscriptionButton.replaceChildren();
        await renderPayPalSubscriptionButton();
      } catch (error) {
        console.error("PayPal retry failed:", error);
        showPayPalStatus(
          "PayPal is still blocked or unavailable. Open this page in Chrome/Safari and disable content blockers for alterhub.online, then retry.",
          true,
          true
        );
      }
    });
    status.appendChild(retryButton);
  }

  paypalSubscriptionButton.appendChild(status);
}

async function renderPayPalSubscriptionButton() {
  if (
    !paypalSubscriptionButton ||
    paypalButtonRendered ||
    paypalRenderStarted
  ) {
    return;
  }

  const planId = PAYPAL_MONTHLY_PLAN_IDS[tierSlug];

  if (!planId) {
    showPayPalStatus("This monthly PayPal plan has not been configured.", true);
    return;
  }

  paypalRenderStarted = true;
  paypalSubscriptionButton.replaceChildren();
  showPayPalStatus("Loading secure PayPal checkout…");

  try {
    await loadPayPalSdk();
    paypalSubscriptionButton.replaceChildren();

    const buttons = window.paypal.Buttons({
      style: {
        shape: "pill",
        color: "black",
        layout: "vertical",
        label: "subscribe"
      },

      onInit(data, actions) {
        paypalButtonActions = actions;

        if (termsCheckbox?.checked) {
          actions.enable();
        } else {
          actions.disable();
        }
      },

      onClick() {
        if (termsCheckbox?.checked) return;

        if (checkoutHint) {
          checkoutHint.textContent =
            "Accept the recurring billing terms before continuing to PayPal.";
          checkoutHint.classList.remove("is-ready");
        }

        termsCheckbox?.focus();
      },

      createSubscription(data, actions) {
        return actions.subscription.create({
          plan_id: planId
        });
      },

      onApprove(data) {
        const reference = data.subscriptionID
          ? ` Reference: ${data.subscriptionID}.`
          : "";

        if (checkoutHint) {
          checkoutHint.textContent =
            `Subscription approved.${reference} Your access will be confirmed after payment verification.`;
          checkoutHint.classList.add("is-ready");
        }
      },

      onCancel() {
        if (checkoutHint) {
          checkoutHint.textContent =
            "The PayPal subscription was not completed. You can try again when ready.";
          checkoutHint.classList.remove("is-ready");
        }
      },

      onError(error) {
        console.error("PayPal subscription error:", error);
        showPayPalStatus(
          "PayPal could not start the subscription. Please refresh and try again.",
          true
        );
      }
    });

    if (typeof buttons.isEligible === "function" && !buttons.isEligible()) {
      showPayPalStatus(
        "PayPal subscriptions are not available for this browser or region.",
        true
      );
      return;
    }

    await buttons.render("#paypal-subscription-button");
    paypalButtonRendered = true;
  } catch (error) {
    console.error("Failed to render PayPal subscription button:", error);
    showPayPalStatus(
      "PayPal checkout could not load. It may be blocked by the browser, an ad/content blocker, an in-app browser, or the current network.",
      true,
      true
    );
  } finally {
    paypalRenderStarted = false;
  }
}

function updatePurchaseAvailability() {
  if (!termsCheckbox || !purchaseButton || !checkoutHint) return;

  const accepted = termsCheckbox.checked;
  const isMonthly = selectedDuration === "monthly";

  if (termsCopy) {
    termsCopy.textContent = isMonthly
      ? " and authorize recurring monthly PayPal billing until I cancel."
      : " and understand that lifetime access is a one-time purchase.";
  }

  purchaseButton.removeAttribute("target");
  purchaseButton.removeAttribute("rel");

  if (isMonthly) {
    purchaseButton.removeAttribute("href");
    purchaseButton.setAttribute("aria-disabled", "true");
    purchaseButton.tabIndex = -1;
    purchaseButton.hidden = true;

    if (purchaseButtonLabel) {
      purchaseButtonLabel.textContent = "Accept Terms to Subscribe";
    }

    if (paypalSubscriptionWrap) {
      paypalSubscriptionWrap.hidden = false;
    }

    if (paypalButtonActions) {
      if (accepted) {
        paypalButtonActions.enable();
      } else {
        paypalButtonActions.disable();
      }
    }

    checkoutHint.classList.toggle("is-ready", accepted);
    checkoutHint.textContent = accepted
      ? "Click the PayPal Subscribe button to start secure monthly billing."
      : "Accept the recurring billing terms to activate the PayPal Subscribe button.";

    void renderPayPalSubscriptionButton();

    return;
  }

  if (paypalSubscriptionWrap) {
    paypalSubscriptionWrap.hidden = true;
  }

  purchaseButton.hidden = false;
  purchaseButton.setAttribute("aria-disabled", String(!accepted));
  purchaseButton.tabIndex = accepted ? 0 : -1;

  if (purchaseButtonLabel) {
    purchaseButtonLabel.textContent = "Continue with Lifetime Purchase";
  }

  checkoutHint.classList.toggle("is-ready", accepted);
  checkoutHint.textContent = accepted
    ? "Ready. Continue to receive the official lifetime payment instructions."
    : "Accept the terms to continue with this lifetime purchase.";

  if (accepted) {
    purchaseButton.href = lifetimePurchaseRequestUrl();
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
