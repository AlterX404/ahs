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

// Official PayPal Hosted Button IDs supplied for the lifetime products.
const PAYPAL_LIFETIME_HOSTED_BUTTON_IDS = Object.freeze({
  keyless: "Z2HWT9UJ6H9SC",
  premium: "HGZSXXKFJEK4N",
  "premium-plus": "4FKKNCSEUJCX6"
});

// Monthly subscriptions use window.paypal. Lifetime Hosted Buttons are loaded
// into window.paypalHosted through PayPal's supported data-namespace option.
// Keeping the two SDK instances in separate namespaces prevents the client IDs
// and components from overwriting each other.
const PAYPAL_CLIENT_ID = "BAAwVHsGOQSMvQW5S6JMpJEMMbOTSeZuXZpkEF4ygqGKi0-4F5o6rj8MAeP5dENFSGaxDhSJcHSRyzzgVI";
const PAYPAL_HOSTED_CLIENT_ID = "BAA_xc_bFzIU_CVMLm-rNFQ84VC1RJQ1DUoSxTb-uGuL0mvlGsz8gGP1G6H9npeJEdSm4GgQNKdZTnd8J4";
const PAYPAL_SDK_ID = "alter-hub-paypal-sdk";
const PAYPAL_HOSTED_SDK_ID = "alter-hub-paypal-hosted-sdk";
const PAYPAL_HOSTED_NAMESPACE = "paypalHosted";
const PAYPAL_SDK_TIMEOUT_MS = 20000;

let paypalSdkPromise = null;
let paypalHostedSdkPromise = null;

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
  if (paypalSdkReady() && !forceReload) return Promise.resolve(window.paypal);

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


function clearPayPalHostedGlobal() {
  try {
    delete window[PAYPAL_HOSTED_NAMESPACE];
  } catch (_) {
    window[PAYPAL_HOSTED_NAMESPACE] = undefined;
  }
}

function paypalHostedSdkReady() {
  const sdk = window[PAYPAL_HOSTED_NAMESPACE];
  return Boolean(sdk && typeof sdk.HostedButtons === "function");
}

function buildPayPalHostedSdkUrl() {
  const params = new URLSearchParams({
    "client-id": PAYPAL_HOSTED_CLIENT_ID,
    components: "hosted-buttons",
    "disable-funding": "venmo",
    currency: "USD"
  });

  return `https://www.paypal.com/sdk/js?${params.toString()}`;
}

function loadPayPalHostedSdk({ forceReload = false } = {}) {
  if (paypalHostedSdkReady() && !forceReload) {
    return Promise.resolve(window[PAYPAL_HOSTED_NAMESPACE]);
  }

  if (forceReload) {
    document.getElementById(PAYPAL_HOSTED_SDK_ID)?.remove();
    paypalHostedSdkPromise = null;
    clearPayPalHostedGlobal();
  }

  if (paypalHostedSdkPromise) return paypalHostedSdkPromise;

  paypalHostedSdkPromise = new Promise((resolve, reject) => {
    let script = document.getElementById(PAYPAL_HOSTED_SDK_ID);
    let settled = false;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      callback(value);
    };

    const handleLoad = () => {
      if (paypalHostedSdkReady()) {
        finish(resolve, window[PAYPAL_HOSTED_NAMESPACE]);
      } else {
        finish(
          reject,
          new Error(
            "PayPal Hosted Buttons SDK loaded, but paypalHosted.HostedButtons is unavailable."
          )
        );
      }
    };

    const handleError = () => {
      finish(
        reject,
        new Error("PayPal Hosted Buttons SDK request failed to load.")
      );
    };

    const timeoutId = window.setTimeout(() => {
      finish(
        reject,
        new Error("PayPal Hosted Buttons SDK timed out while loading.")
      );
    }, PAYPAL_SDK_TIMEOUT_MS);

    const isNewScript = !script;

    if (isNewScript) {
      script = document.createElement("script");
      script.id = PAYPAL_HOSTED_SDK_ID;
      script.src = buildPayPalHostedSdkUrl();
      script.async = true;
      script.setAttribute("data-namespace", PAYPAL_HOSTED_NAMESPACE);
      script.dataset.sdkIntegrationSource = "button-factory";
    }

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (isNewScript) {
      document.head.appendChild(script);
    }

    if (paypalHostedSdkReady()) handleLoad();
  }).catch((error) => {
    paypalHostedSdkPromise = null;
    throw error;
  });

  return paypalHostedSdkPromise;
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
let paypalHostedButtonRendered = false;
let paypalHostedRenderStarted = false;
let checkoutRenderMode = null;

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

function resetPayPalCheckout(mode = selectedDuration) {
  if (!paypalSubscriptionButton) return;

  paypalSubscriptionButton.replaceChildren();
  paypalButtonRendered = false;
  paypalRenderStarted = false;
  paypalButtonActions = null;
  paypalHostedButtonRendered = false;
  paypalHostedRenderStarted = false;
  paypalSubscriptionButton.style.pointerEvents = "auto";
  paypalSubscriptionButton.style.opacity = "1";
  paypalSubscriptionButton.removeAttribute("aria-disabled");
  checkoutRenderMode = mode;
}

function setPayPalHeading(mode) {
  const label = paypalSubscriptionWrap?.querySelector(
    ".paypal-subscription-heading span"
  );
  const secureText = paypalSubscriptionWrap?.querySelector(
    ".paypal-subscription-heading strong"
  );

  if (label) {
    label.textContent =
      mode === "monthly" ? "MONTHLY SUBSCRIPTION" : "LIFETIME PURCHASE";
  }

  if (secureText) secureText.textContent = "Secure checkout by PayPal";
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

      resetPayPalCheckout(selectedDuration);

      try {
        if (selectedDuration === "lifetime") {
          await loadPayPalHostedSdk({ forceReload: true });
          await renderPayPalHostedButton();
        } else {
          await loadPayPalSdk({ forceReload: true });
          await renderPayPalSubscriptionButton();
        }
      } catch (error) {
        console.error("PayPal retry failed:", error);
        showPayPalStatus(
          selectedDuration === "lifetime"
            ? "PayPal Hosted Buttons could not load. Check the browser console/network request for paypal.com/sdk/js."
            : "PayPal checkout could not load. Check the browser console/network request for paypal.com/sdk/js.",
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
    selectedDuration !== "monthly" ||
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

    // The user may have switched to Lifetime while the SDK was loading.
    if (selectedDuration !== "monthly") return;

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
          true,
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

function setLifetimeHostedButtonEnabled(enabled) {
  if (!paypalSubscriptionButton || !paypalHostedButtonRendered) return;

  paypalSubscriptionButton.style.pointerEvents = enabled ? "auto" : "none";
  paypalSubscriptionButton.style.opacity = enabled ? "1" : "0.55";
  paypalSubscriptionButton.setAttribute("aria-disabled", String(!enabled));
}

async function renderPayPalHostedButton() {
  if (
    selectedDuration !== "lifetime" ||
    !paypalSubscriptionButton ||
    paypalHostedButtonRendered ||
    paypalHostedRenderStarted
  ) {
    return;
  }

  const hostedButtonId = PAYPAL_LIFETIME_HOSTED_BUTTON_IDS[tierSlug];

  if (!hostedButtonId) {
    showPayPalStatus("This lifetime PayPal button has not been configured.", true);
    return;
  }

  paypalHostedRenderStarted = true;
  paypalSubscriptionButton.style.pointerEvents = "auto";
  paypalSubscriptionButton.style.opacity = "1";
  paypalSubscriptionButton.removeAttribute("aria-disabled");
  paypalSubscriptionButton.replaceChildren();
  showPayPalStatus("Loading secure PayPal lifetime checkout…");

  try {
    const paypalHosted = await loadPayPalHostedSdk();

    // The user may have changed back to Monthly while the SDK was loading.
    if (selectedDuration !== "lifetime") return;

    // Match PayPal's generated Hosted Button code exactly by rendering into
    // paypal-container-<HOSTED_BUTTON_ID> for each lifetime product.
    const hostedContainer = document.createElement("div");
    hostedContainer.id = `paypal-container-${hostedButtonId}`;
    paypalSubscriptionButton.replaceChildren(hostedContainer);

    const hostedButtons = paypalHosted.HostedButtons({
      hostedButtonId
    });

    await hostedButtons.render(`#${hostedContainer.id}`);
    paypalHostedButtonRendered = true;
    setLifetimeHostedButtonEnabled(Boolean(termsCheckbox?.checked));
  } catch (error) {
    console.error("Failed to render PayPal lifetime Hosted Button:", error);
    console.error("Hosted SDK URL:", buildPayPalHostedSdkUrl());
    console.error("Hosted SDK namespace value:", window[PAYPAL_HOSTED_NAMESPACE]);
    paypalSubscriptionButton.style.pointerEvents = "auto";
    paypalSubscriptionButton.style.opacity = "1";
    paypalSubscriptionButton.removeAttribute("aria-disabled");
    showPayPalStatus(
      `PayPal lifetime checkout could not load: ${error?.message || "unknown PayPal SDK error"}`,
      true,
      true
    );
  } finally {
    paypalHostedRenderStarted = false;
  }
}

function updatePurchaseAvailability() {
  if (!termsCheckbox || !purchaseButton || !checkoutHint) return;

  const accepted = termsCheckbox.checked;
  const isMonthly = selectedDuration === "monthly";

  if (checkoutRenderMode !== selectedDuration) {
    resetPayPalCheckout(selectedDuration);
  }

  setPayPalHeading(selectedDuration);

  if (termsCopy) {
    termsCopy.textContent = isMonthly
      ? " and authorize recurring monthly PayPal billing until I cancel."
      : " and understand that lifetime access is a one-time purchase.";
  }

  // All plans now use PayPal directly, so the old mailto purchase button is
  // kept hidden for both monthly and lifetime checkout.
  purchaseButton.removeAttribute("href");
  purchaseButton.removeAttribute("target");
  purchaseButton.removeAttribute("rel");
  purchaseButton.setAttribute("aria-disabled", "true");
  purchaseButton.tabIndex = -1;
  purchaseButton.hidden = true;

  if (paypalSubscriptionWrap) {
    paypalSubscriptionWrap.hidden = false;
  }

  if (isMonthly) {
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

  checkoutHint.classList.toggle("is-ready", accepted);

  // Render the Lifetime PayPal checkout immediately, exactly like Monthly.
  // Until the terms box is accepted the button stays visible but disabled.
  setLifetimeHostedButtonEnabled(accepted);
  void renderPayPalHostedButton();

  checkoutHint.textContent = accepted
    ? "Click the PayPal button above to complete your one-time lifetime purchase."
    : "Accept the terms to activate the PayPal lifetime purchase button.";
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
    termsCheckbox.checked = false;
    resetPayPalCheckout(duration);
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
  const nextDuration = durationFromHash();
  if (nextDuration !== selectedDuration && tier[nextDuration]) {
    selectedDuration = nextDuration;
    if (termsCheckbox) termsCheckbox.checked = false;
    resetPayPalCheckout(nextDuration);
    renderPlan({ animate: true, updateHistory: false });
  }
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
