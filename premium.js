"use strict";

/*
|--------------------------------------------------------------------------
| ALTER HUB PREMIUM CHECKOUT
|--------------------------------------------------------------------------
|
| Lifetime PayPal Hosted Button:
| E6G8XUCHW7SU8
|
| Replace REPLACE_WITH_MONTHLY_BUTTON_ID with the hosted button ID
| generated for the $9.99 Monthly product inside PayPal.
|
*/

const PAYPAL_BUTTON_IDS = {
  lifetime: "E6G8XUCHW7SU8",
  monthly: "REPLACE_WITH_MONTHLY_BUTTON_ID"
};

const plans = {
  lifetime: {
    label: "Lifetime Access",
    price: "$34.99",
    breakdown: "One-time payment",
    eyebrow: "LIFETIME ACCESS",
    titleAccent: "Access for life.",
    description:
      "Make one payment and receive permanent Alter Hub premium access, including future platform updates and priority support.",
    features: [
      "Permanent access",
      "Future updates",
      "Best long-term value"
    ]
  },

  monthly: {
    label: "Monthly Access",
    price: "$9.99",
    breakdown: "30 days of premium access",
    eyebrow: "MONTHLY ACCESS",
    titleAccent: "Premium for 30 days.",
    description:
      "Unlock all Alter Hub premium features for 30 days with a flexible plan you can renew whenever you need it.",
    features: [
      "30-day premium access",
      "All premium features",
      "Flexible renewal"
    ]
  }
};


/*
|--------------------------------------------------------------------------
| ELEMENTS
|--------------------------------------------------------------------------
*/

const planButtons = document.querySelectorAll(".plan-card");
const termsCheckbox = document.querySelector("#terms-checkbox");
const termsHint = document.querySelector("#terms-hint");
const paypalCheckout = document.querySelector("#paypal-checkout");

const selectedPlanLabel = document.querySelector(
  "#selected-plan-label"
);

const totalBreakdown = document.querySelector("#total-breakdown");
const orderTotal = document.querySelector("#order-total");

const productEyebrow = document.querySelector("#product-eyebrow");
const productTitleAccent = document.querySelector(
  "#product-title-accent"
);

const productDescription = document.querySelector(
  "#product-description"
);

const featureOne = document.querySelector("#feature-one");
const featureTwo = document.querySelector("#feature-two");
const featureThree = document.querySelector("#feature-three");

const lifetimePayPalWrapper = document.querySelector(
  "#paypal-lifetime-wrapper"
);

const monthlyPayPalWrapper = document.querySelector(
  "#paypal-monthly-wrapper"
);


/*
|--------------------------------------------------------------------------
| STATE
|--------------------------------------------------------------------------
*/

let selectedPlan = "lifetime";
let termsAccepted = false;
let paypalButtonsRendered = false;


/*
|--------------------------------------------------------------------------
| PAYPAL BUTTON RENDERING
|--------------------------------------------------------------------------
*/

function renderPayPalButtons() {
  if (paypalButtonsRendered) {
    return;
  }

  if (
    typeof window.paypal === "undefined" ||
    typeof window.paypal.HostedButtons !== "function"
  ) {
    console.error(
      "PayPal Hosted Buttons failed to load. Check the PayPal SDK script."
    );

    termsHint.textContent =
      "PayPal could not be loaded. Please refresh the page.";

    return;
  }

  try {
    window.paypal
      .HostedButtons({
        hostedButtonId: PAYPAL_BUTTON_IDS.lifetime
      })
      .render("#paypal-container-lifetime");
  } catch (error) {
    console.error(
      "Failed to render the Lifetime PayPal button:",
      error
    );
  }

  if (
    PAYPAL_BUTTON_IDS.monthly &&
    PAYPAL_BUTTON_IDS.monthly !==
      "REPLACE_WITH_MONTHLY_BUTTON_ID"
  ) {
    try {
      window.paypal
        .HostedButtons({
          hostedButtonId: PAYPAL_BUTTON_IDS.monthly
        })
        .render("#paypal-container-monthly");
    } catch (error) {
      console.error(
        "Failed to render the Monthly PayPal button:",
        error
      );
    }
  } else {
    const monthlyContainer = document.querySelector(
      "#paypal-container-monthly"
    );

    if (monthlyContainer) {
      monthlyContainer.innerHTML = `
        <p class="paypal-configuration-message">
          Monthly PayPal checkout has not been configured yet.
        </p>
      `;
    }
  }

  paypalButtonsRendered = true;
}


/*
|--------------------------------------------------------------------------
| PLAN ANIMATION
|--------------------------------------------------------------------------
*/

function restartPlanAnimation() {
  const animatedElements = [
    productEyebrow,
    productTitleAccent,
    productDescription,
    featureOne,
    featureTwo,
    featureThree
  ].filter(Boolean);

  animatedElements.forEach((element) => {
    element.classList.remove("plan-content-enter");
  });

  void document.body.offsetWidth;

  animatedElements.forEach((element, index) => {
    element.style.setProperty(
      "--animation-delay",
      `${index * 55}ms`
    );

    element.classList.add("plan-content-enter");
  });
}


/*
|--------------------------------------------------------------------------
| PLAN SELECTION
|--------------------------------------------------------------------------
*/

function updateSelectedPlan(planName, animate = true) {
  const plan = plans[planName];

  if (!plan) {
    console.error(`Unknown premium plan: ${planName}`);
    return;
  }

  selectedPlan = planName;

  planButtons.forEach((button) => {
    const isSelected = button.dataset.plan === planName;

    button.classList.toggle("selected", isSelected);
    button.setAttribute(
      "aria-checked",
      String(isSelected)
    );
  });

  selectedPlanLabel.textContent = plan.label;
  totalBreakdown.textContent = plan.breakdown;
  orderTotal.textContent = plan.price;

  if (productEyebrow) {
    productEyebrow.textContent = plan.eyebrow;
  }

  if (productTitleAccent) {
    productTitleAccent.textContent = plan.titleAccent;
  }

  if (productDescription) {
    productDescription.textContent = plan.description;
  }

  if (featureOne) {
    featureOne.textContent = plan.features[0];
  }

  if (featureTwo) {
    featureTwo.textContent = plan.features[1];
  }

  if (featureThree) {
    featureThree.textContent = plan.features[2];
  }

  const lifetimeSelected = planName === "lifetime";

  lifetimePayPalWrapper.hidden = !lifetimeSelected;
  monthlyPayPalWrapper.hidden = lifetimeSelected;

  lifetimePayPalWrapper.classList.toggle(
    "active",
    lifetimeSelected
  );

  monthlyPayPalWrapper.classList.toggle(
    "active",
    !lifetimeSelected
  );

  if (animate) {
    restartPlanAnimation();
  }

  updateCheckoutAvailability();

  history.replaceState(
    null,
    "",
    `#${planName}`
  );
}


/*
|--------------------------------------------------------------------------
| TERMS
|--------------------------------------------------------------------------
*/

function updateCheckoutAvailability() {
  const checkoutEnabled = termsAccepted;

  paypalCheckout.classList.toggle(
    "disabled",
    !checkoutEnabled
  );

  paypalCheckout.setAttribute(
    "aria-disabled",
    String(!checkoutEnabled)
  );

  if (!checkoutEnabled) {
    termsHint.textContent =
      "Accept the terms to unlock secure payment.";

    termsHint.classList.remove("accepted");
    return;
  }

  if (
    selectedPlan === "monthly" &&
    PAYPAL_BUTTON_IDS.monthly ===
      "REPLACE_WITH_MONTHLY_BUTTON_ID"
  ) {
    termsHint.textContent =
      "Monthly checkout needs its PayPal hosted button ID.";

    termsHint.classList.remove("accepted");
    return;
  }

  termsHint.textContent =
    `${plans[selectedPlan].label} checkout is ready.`;

  termsHint.classList.add("accepted");
}


/*
|--------------------------------------------------------------------------
| URL HASH SUPPORT
|--------------------------------------------------------------------------
*/

function getPlanFromHash() {
  const hash = window.location.hash
    .replace("#", "")
    .trim()
    .toLowerCase();

  if (hash === "monthly") {
    return "monthly";
  }

  return "lifetime";
}


/*
|--------------------------------------------------------------------------
| EVENTS
|--------------------------------------------------------------------------
*/

planButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const planName = button.dataset.plan;
    updateSelectedPlan(planName);
  });
});

termsCheckbox.addEventListener("change", () => {
  termsAccepted = termsCheckbox.checked;
  updateCheckoutAvailability();
});

window.addEventListener("hashchange", () => {
  updateSelectedPlan(getPlanFromHash());
});


/*
|--------------------------------------------------------------------------
| INITIALIZATION
|--------------------------------------------------------------------------
*/

function initializeCheckout() {
  renderPayPalButtons();

  const initialPlan = getPlanFromHash();

  updateSelectedPlan(initialPlan, false);
  updateCheckoutAvailability();
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initializeCheckout
  );
} else {
  initializeCheckout();
}
