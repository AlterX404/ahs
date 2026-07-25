const plans = {
  lifetime: {
    label: "Lifetime Access",
    price: 34.99,
    link: "https://alter.sell.app/product/alterhubkeys",

    eyebrow: "LIFETIME ACCESS",
    title: "One purchase.",
    titleAccent: "Access for life.",

    description:
      "Make one payment and receive permanent Alter Hub premium access, including all future platform updates and priority support.",

    features: [
      "Permanent access",
      "Future updates included",
      "Best long-term value"
    ]
  },

  monthly: {
    label: "Monthly Access",
    price: 9.99,
    link:
      "https://alter.sell.app/product/alterhubkeys?variant=368188",

    eyebrow: "MONTHLY ACCESS",
    title: "Full premium.",
    titleAccent: "Flexible monthly access.",

    description:
      "Get complete Alter Hub premium access for one month with all current features, regular updates, and priority community support.",

    features: [
      "Complete premium access",
      "Flexible monthly plan",
      "Priority support"
    ]
  }
};


let selectedPlan = "lifetime";
let quantity = 1;
let acceptedTerms = false;


/* PLAN AND PAYMENT CONTROLS */

const planButtons =
  document.querySelectorAll(".plan-card");

const paymentButtons =
  document.querySelectorAll("[data-payment]");


/* QUANTITY CONTROLS */

const decreaseButton =
  document.querySelector("#decrease-quantity");

const increaseButton =
  document.querySelector("#increase-quantity");

const quantityValue =
  document.querySelector("#quantity-value");


/* CHECKOUT ELEMENTS */

const termsCheckbox =
  document.querySelector("#terms-checkbox");

const selectedPlanLabel =
  document.querySelector("#selected-plan-label");

const totalBreakdown =
  document.querySelector("#total-breakdown");

const orderTotal =
  document.querySelector("#order-total");

const purchaseButton =
  document.querySelector("#purchase-button");

const termsHint =
  document.querySelector("#terms-hint");


/* PAYMENT PROVIDER ELEMENTS */

const providerLogo =
  document.querySelector("#provider-logo");

const providerName =
  document.querySelector("#provider-name");

const providerDescription =
  document.querySelector("#provider-description");


/* LEFT-SIDE PRODUCT CONTENT */

const productEyebrow =
  document.querySelector("#product-eyebrow");

const productTitle =
  document.querySelector("#product-title");

const productDescription =
  document.querySelector("#product-description");

const featureOne =
  document.querySelector("#feature-one");

const featureTwo =
  document.querySelector("#feature-two");

const featureThree =
  document.querySelector("#feature-three");

const descriptionAnimationItems =
  document.querySelectorAll(
    ".product-heading > *, .feature-strip > div"
  );
/* CREATE CHECKOUT LINK */

function getCheckoutUrl() {
  const plan = plans[selectedPlan];

  const separator =
    plan.link.includes("?") ? "&" : "?";

  return `${plan.link}${separator}quantity=${quantity}`;
}


/* UPDATE PAGE CONTENT */

function updateCheckout() {
  const plan = plans[selectedPlan];

  const total =
    (plan.price * quantity).toFixed(2);


  /* UPDATE LEFT-SIDE CONTENT */

  productEyebrow.textContent =
    plan.eyebrow;

  productTitle.innerHTML = `
    ${plan.title}
    <br>
    <span id="product-title-accent">
      ${plan.titleAccent}
    </span>
  `;

  productDescription.textContent =
    plan.description;

  featureOne.textContent =
    plan.features[0];

  featureTwo.textContent =
    plan.features[1];

  featureThree.textContent =
    plan.features[2];


  /* UPDATE CHECKOUT TOTAL */

  quantityValue.textContent =
    quantity;

  selectedPlanLabel.textContent =
    plan.label;

  totalBreakdown.textContent =
    `$${plan.price.toFixed(2)} × ${quantity}`;

  orderTotal.textContent =
    `$${total}`;


  /* UPDATE SELECTED PLAN CARD */

  planButtons.forEach((button) => {
    const isSelected =
      button.dataset.plan === selectedPlan;

    button.classList.toggle(
      "selected",
      isSelected
    );

    button.setAttribute(
      "aria-pressed",
      String(isSelected)
    );
  });


  /* ENABLE OR DISABLE PURCHASE BUTTON */

  purchaseButton.classList.toggle(
    "disabled",
    !acceptedTerms
  );

  purchaseButton.setAttribute(
    "aria-disabled",
    String(!acceptedTerms)
  );

  purchaseButton.href =
    acceptedTerms
      ? getCheckoutUrl()
      : "#";

  termsHint.classList.toggle(
    "hidden",
    acceptedTerms
  );
}


/* SELECT A PLAN */

planButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const newPlan = button.dataset.plan;

    if (newPlan === selectedPlan) {
      return;
    }

    selectedPlan = newPlan;

    history.pushState(
      null,
      "",
      `#${selectedPlan}`
    );

    updateCheckout();
    playDescriptionAnimation();
  });
});


/* DECREASE QUANTITY */

decreaseButton.addEventListener("click", () => {
  quantity =
    Math.max(1, quantity - 1);

  updateCheckout();
});


/* INCREASE QUANTITY */

increaseButton.addEventListener("click", () => {
  quantity =
    Math.min(10, quantity + 1);

  updateCheckout();
});


/* TERMS CHECKBOX */

termsCheckbox.addEventListener("change", () => {
  acceptedTerms =
    termsCheckbox.checked;

  updateCheckout();
});


/* BLOCK CHECKOUT UNTIL TERMS ARE ACCEPTED */

purchaseButton.addEventListener(
  "click",
  (event) => {
    if (!acceptedTerms) {
      event.preventDefault();
    }
  }
);


/* PAYMENT TYPE SWITCH */

paymentButtons.forEach((button) => {
  button.addEventListener("click", () => {
    paymentButtons.forEach((item) => {
      item.classList.toggle(
        "active",
        item === button
      );
    });

    const isFiat =
      button.dataset.payment === "fiat";

    providerLogo.textContent =
      isFiat ? "P" : "₿";

    providerName.textContent =
      isFiat
        ? "PayPal & Cards"
        : "Cryptocurrency";

    providerDescription.textContent =
      isFiat
        ? "Pay by card, PayPal, Apple Pay, and more"
        : "Available payment options appear at checkout";
  });
});


/* READ PLAN FROM URL */

function getPlanFromUrl() {
  return window.location.hash
    .replace("#", "")
    .toLowerCase();
}


/* LOAD MONTHLY OR LIFETIME FROM URL */

function loadPlanFromUrl() {
  const planFromUrl =
    getPlanFromUrl();

  if (plans[planFromUrl]) {
    selectedPlan =
      planFromUrl;

    updateCheckout();
  }
}


/* SUPPORT BROWSER BACK AND FORWARD */

window.addEventListener(
  "popstate",
  loadPlanFromUrl
);

window.addEventListener(
  "hashchange",
  loadPlanFromUrl
);


/* INITIAL PAGE LOAD */

const initialPlan =
  getPlanFromUrl();

if (plans[initialPlan]) {
  selectedPlan =
    initialPlan;
} else {
  selectedPlan =
    "lifetime";

  history.replaceState(
    { plan: selectedPlan },
    "",
    "#lifetime"
  );
}

updateCheckout();
function playDescriptionAnimation() {
  descriptionAnimationItems.forEach((item, index) => {
    item.classList.remove("plan-pop");

    item.style.setProperty(
      "--plan-pop-delay",
      `${Math.min(index * 70, 280)}ms`
    );
  });

  // Restarts the animation.
  void document.body.offsetWidth;

  descriptionAnimationItems.forEach((item) => {
    item.classList.add("plan-pop");
  });
}
