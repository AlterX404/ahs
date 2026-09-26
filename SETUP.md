# Restore Alter Hub regular pricing

The website and Worker are prepared locally; neither has been deployed to your accounts.

| Tier | Monthly old comparison | Monthly charged | Lifetime old comparison | Lifetime charged |
|---|---:|---:|---:|---:|
| Keyless | $9.99 | $5.99 | $29.99 | $19.99 |
| Premium | $14.99 | $7.99 | $39.99 | $24.99 |
| Premium Plus | $19.99 | $9.99 | $59.99 | $39.99 |

All amounts are USD. The crossed-out figures are display-only historical comparison prices. The normal charged prices match the previous "Create Birthday Sale Popup" conversation; the historical comparisons were retained in the supplied ZIP's `previousListPrices` and plan catalog.

## 1. Cloudflare Worker

Open Cloudflare → Workers & Pages → the Worker serving `api.alterhub.online`. Replace its code with the supplied `alter-hub-worker.js`. Keep your existing D1 bindings, routes, secrets, and webhook configuration. This update requires no database migration.

Under Settings → Variables and Secrets, set these runtime variables as text (without dollar signs):

```text
PAYPAL_CURRENCY = USD
PAYPAL_KEYLESS_LIFETIME_PRICE = 19.99
PAYPAL_PREMIUM_LIFETIME_PRICE = 24.99
PAYPAL_PREMIUM_PLUS_LIFETIME_PRICE = 39.99
PAYPAL_KEYLESS_MONTHLY_PRICE = 5.99
```

The last variable is for the existing legacy one-time 30-day Keyless API route. It does not set the recurring subscription price.

Set the three monthly variables to the PayPal plan IDs with these actual recurring rates:

| Worker variable | Required PayPal plan |
|---|---|
| `PAYPAL_PLAN_KEYLESS_MONTHLY` | $5.99 USD every month |
| `PAYPAL_PLAN_PREMIUM_MONTHLY` | $7.99 USD every month |
| `PAYPAL_PLAN_PREMIUM_PLUS_MONTHLY` | $9.99 USD every month |

These values must be `P-...` IDs, not prices or checkout URLs. Check their rates in your PayPal account; the uploaded source cannot verify your live settings. Explicitly set these variables rather than relying on the old fallback IDs embedded in the Worker.

If you used separate discounted monthly plans, retain their IDs for existing customer verification using the optional variables below. They may contain one ID or comma-separated IDs for that tier:

```text
PAYPAL_PREVIOUS_PLAN_KEYLESS_MONTHLY
PAYPAL_PREVIOUS_PLAN_PREMIUM_MONTHLY
PAYPAL_PREVIOUS_PLAN_PREMIUM_PLUS_MONTHLY
```

Copy the appropriate retired ID from your old `PAYPAL_PLAN_*_MONTHLY_SALE` variable (or from a monthly variable you temporarily replaced). The updated Worker recognizes these IDs only when verifying already-created subscriptions; new checkout always uses the main normal-price plan ID. Omit these variables if you never created separate plans. Existing per-subscription discounted overrides on the same normal plan ID need no extra mapping.

The new Worker has no birthday date window or promotional price overrides. Old `*_SALE` variables are unused; once any needed IDs have been copied to the verification variables above, they can be removed. Keep `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_MODE`, D1 bindings and existing URLs unchanged. The PayPal event named `PAYMENT.SALE.COMPLETED` is required for subscription payment processing and is not a promotional sale feature.

Deploy the code and settings together before publishing the matching website. Follow [Cloudflare's runtime variable instructions](https://developers.cloudflare.com/workers/configuration/environment-variables/).

## 2. PayPal

Lifetime: no PayPal product or plan edit is needed. This Worker creates one-time orders with the amounts from the lifetime variables above.

Monthly: if your normal plans already charge $5.99 / $7.99 / $9.99, use their IDs and make no pricing change in PayPal. If you changed the original plans to discounted rates, create separate normal-rate monthly plans and use their IDs for new checkout. Retain the former IDs in the verification variables above when subscribers still use them.

Existing customers keep their current PayPal subscription terms; switching the Worker's plan ID affects new checkouts. Updating a PayPal plan's own pricing can also change existing subscribers' future charges, so it is a separate action from removing this promotion. See [PayPal's plan pricing behavior](https://developer.paypal.com/subscriptions/change-price).

No API credentials, webhook URL, or website checkout link needs replacing. Historical crossed-out prices are not sent to PayPal.

## 3. Website

Extract `ahs-regular-pricing-website.zip` and upload the contents of its `ahs-main` folder to the existing website root. Do not upload the separate Worker file as a public site asset.

If applying only changed files, replace:

```text
/index.html
/keyless/index.html
/premium/index.html
/premium-plus/index.html
/assets/js/plan-page.js
/plan-page.js
/README.txt
/REPLACE_THESE_FILES.txt
```

Delete the two files below from the old deployment (overlaying a ZIP does not delete them automatically):

```text
/assets/js/birthday-sale.js
/assets/css/birthday-sale.css
```

The updated HTML no longer loads those files. The plan script URL has a new version to refresh browser caches. If your host caches HTML, purge the homepage and three plan pages after publishing.

## 4. Verify after deployment

Check the homepage and both duration options on every plan page. The table above should match, with visible crossed-out comparisons and no promotion popup, timer, or percentage-off badges. Accept the terms and open each PayPal checkout, checking its amount/currency and monthly recurrence before paying. Do not complete a real payment just to check the displayed price.

Local validation covers all six frontend options, terms gating, checkout URLs, monthly/lifetime navigation, mobile overflow, normal Worker prices, retired-plan recognition, previously quoted orders and rejection of incorrect capture amounts/currencies. Real PayPal and live D1 fulfillment require your deployed configuration and were not exercised locally.
