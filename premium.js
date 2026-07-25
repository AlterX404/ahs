const plans = {
  lifetime: {
    label: "Lifetime Access",
    price: 34.99,
    link: "https://alter.sell.app/product/alterhubkeys"
  },
  monthly: {
    label: "Monthly Access",
    price: 9.99,
    link: "https://alter.sell.app/product/alterhubkeys?variant=368188"
  }
};

let selectedPlan = "lifetime";
let quantity = 1;
let acceptedTerms = false;

const planButtons = document.querySelectorAll(".plan-card");
const paymentButtons = document.querySelectorAll("[data-payment]");
const decreaseButton = document.querySelector("#decrease-quantity");
const increaseButton = document.querySelector("#increase-quantity");
const quantityValue = document.querySelector("#quantity-value");
const termsCheckbox = document.querySelector("#terms-checkbox");
const selectedPlanLabel = document.querySelector("#selected-plan-label");
const totalBreakdown = document.querySelector("#total-breakdown");
const orderTotal = document.querySelector("#order-total");
const purchaseButton = document.querySelector("#purchase-button");
const termsHint = document.querySelector("#terms-hint");
const providerLogo = document.querySelector("#provider-logo");
const providerName = document.querySelector("#provider-name");
const providerDescription = document.querySelector("#provider-description");

function getCheckoutUrl() {
  const plan = plans[selectedPlan];
  const separator = plan.link.includes("?") ? "&" : "?";

  return `${plan.link}${separator}quantity=${quantity}`;
}

function updateCheckout() {
  const plan = plans[selectedPlan];
  const total = (plan.price * quantity).toFixed(2);

  quantityValue.textContent = quantity;
  selectedPlanLabel.textContent = plan.label;
  totalBreakdown.textContent =
    `$${plan.price.toFixed(2)} × ${quantity}`;
  orderTotal.textContent = `$${total}`;

  planButtons.forEach((button) => {
    const isSelected = button.dataset.plan === selectedPlan;

    button.classList.toggle("selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });

  purchaseButton.classList.toggle("disabled", !acceptedTerms);
  purchaseButton.setAttribute(
    "aria-disabled",
    String(!acceptedTerms)
  );

  purchaseButton.href = acceptedTerms
    ? getCheckoutUrl()
    : "#";

  termsHint.classList.toggle("hidden", acceptedTerms);
}

planButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedPlan = button.dataset.plan;
    updateCheckout();
  });
});

decreaseButton.addEventListener("click", () => {
  quantity = Math.max(1, quantity - 1);
  updateCheckout();
});

increaseButton.addEventListener("click", () => {
  quantity = Math.min(10, quantity + 1);
  updateCheckout();
});

termsCheckbox.addEventListener("change", () => {
  acceptedTerms = termsCheckbox.checked;
  updateCheckout();
});

purchaseButton.addEventListener("click", (event) => {
  if (!acceptedTerms) {
    event.preventDefault();
  }
});

paymentButtons.forEach((button) => {
  button.addEventListener("click", () => {
    paymentButtons.forEach((item) => {
      item.classList.toggle("active", item === button);
    });

    const isFiat = button.dataset.payment === "fiat";

    providerLogo.textContent = isFiat ? "P" : "₿";

    providerName.textContent = isFiat
      ? "PayPal & Cards"
      : "Cryptocurrency";

    providerDescription.textContent = isFiat
      ? "Pay by card, PayPal, Apple Pay, and more"
      : "Available payment options appear at checkout";
  });
});

updateCheckout();
