// =============================================================
// ALTER HUB WORKER - ADSTERRA MAX-ADS ACCESS FLOW
// =============================================================
// Adsterra display placements are enabled on the live key-verification and result pages.
// The ads are direct parser-order tags with data-cfasync="false" for Cloudflare compatibility.
// Temporary access pages remain noindex and the existing verification/provider flow is unchanged.
// Linkvertise/LootLabs button redirects are left intact.
// =============================================================

export default {
  async fetch(request, env) {

    const url = new URL(request.url);


    // =====================================================
    // CORS
    // =====================================================

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }


    // =====================================================
    // SECURE ADMIN AUTHENTICATION
    // =====================================================

    // The master ADMIN_SECRET is accepted only by this login endpoint.
    // After login, the browser uses an HttpOnly session cookie. The real
    // secret is never stored in dashboard JavaScript or sent with normal
    // admin API calls.
    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/login"
    ) {
      if (!adminRequestSourceAllowed(request, url)) {
        return adminJson({
          success: false,
          error: "Invalid admin request source."
        }, 403);
      }

      if (!env.ADMIN_SECRET) {
        return adminJson({
          success: false,
          error: "Admin login is not configured."
        }, 503);
      }

      let body;

      try {
        body = await request.json();
      } catch {
        return adminJson({
          success: false,
          error: "Invalid request body."
        }, 400);
      }

      const fingerprint =
        await adminLoginFingerprint(
          request,
          env.ADMIN_SECRET
        );

      const now = Date.now();
      const rateStatus =
        await getAdminLoginRateStatus(
          env,
          fingerprint,
          now
        );

      if (!rateStatus.allowed) {
        return adminJson({
          success: false,
          error:
            "Too many failed admin login attempts. Try again later.",
          retry_after_seconds:
            rateStatus.retryAfterSeconds
        }, 429);
      }

      const suppliedSecret =
        String(body.admin_secret || "");

      const secretMatches =
        suppliedSecret.length <= 4096 &&
        await constantTimeSecretMatch(
          suppliedSecret,
          env.ADMIN_SECRET
        );

      await recordAdminLoginAttempt(
        env,
        fingerprint,
        secretMatches,
        now
      );

      if (!secretMatches) {
        await recordAdminActivity(
          env,
          "admin_login_failed",
          "admin",
          "",
          "Failed admin login attempt"
        );

        return adminJson({
          success: false,
          error: "Invalid admin secret."
        }, 401);
      }

      // A successful login resets this source's failed-attempt counter.
      await env.DB.prepare(`
        DELETE FROM admin_login_attempts
        WHERE attempt_hash = ?
          AND success = 0
      `)
        .bind(fingerprint)
        .run();

      const adminSession =
        await createAdminSession(env, now);

      await recordAdminActivity(
        env,
        "admin_login",
        "admin",
        "",
        "Admin signed in"
      );

      return adminJson({
        success: true,
        authenticated: true,
        expires_at: adminSession.expiresAt
      }, 200, {
        "Set-Cookie":
          buildAdminSessionCookie(
            adminSession.token
          )
      });
    }


    // Used by /admin on page load to restore a valid secure session.
    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/session"
    ) {
      if (!adminRequestSourceAllowed(request, url)) {
        return adminJson({
          success: false,
          authenticated: false,
          error: "Invalid admin request source."
        }, 403);
      }

      const adminSession =
        await requireAdminSession(
          request,
          env
        );

      if (!adminSession) {
        return adminJson({
          success: false,
          authenticated: false,
          error: "Admin session expired."
        }, 401, {
          "Set-Cookie": clearAdminSessionCookie()
        });
      }

      return adminJson({
        success: true,
        authenticated: true,
        expires_at:
          Number(adminSession.expires_at)
      });
    }


    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/logout"
    ) {
      if (!adminRequestSourceAllowed(request, url)) {
        return adminJson({
          success: false,
          error: "Invalid admin request source."
        }, 403);
      }

      const adminSession =
        await requireAdminSession(
          request,
          env
        );

      await deleteAdminSessionForRequest(
        request,
        env
      );

      if (adminSession) {
        await recordAdminActivity(
          env,
          "admin_logout",
          "admin",
          "",
          "Admin signed out"
        );
      }

      return adminJson({
        success: true,
        logged_out: true
      }, 200, {
        "Set-Cookie": clearAdminSessionCookie()
      });
    }


    // Protect every other /api/admin/* endpoint with the secure cookie.
    // Existing route handlers still perform their old ADMIN_SECRET checks;
    // after authentication, the Worker injects that secret internally into
    // a cloned request. It never crosses the browser/network again.
    if (url.pathname.startsWith("/api/admin/")) {
      if (!adminRequestSourceAllowed(request, url)) {
        return adminJson({
          success: false,
          error: "Invalid admin request source."
        }, 403);
      }

      const adminSession =
        await requireAdminSession(
          request,
          env
        );

      if (!adminSession) {
        return adminJson({
          success: false,
          error: "Admin session expired."
        }, 401, {
          "Set-Cookie": clearAdminSessionCookie()
        });
      }

      request =
        await injectAdminSecretForLegacyRoutes(
          request,
          env.ADMIN_SECRET
        );
    }


    // =====================================================
    // ALTER HUB TELEMETRY
    // =====================================================
    //
    // Uses a SECOND D1 binding:
    //   TELEMETRY_DB
    //
    // Public ingestion (no access token required):
    //   POST /api/telemetry
    //
    // Admin routes below are automatically protected by the
    // existing secure /api/admin/* cookie authentication block.
    //   GET  /api/admin/telemetry
    //   GET  /api/admin/telemetry/user?roblox_user_id=...
    //   POST /api/admin/telemetry/purge
    // =====================================================

    if (
      request.method === "POST" &&
      url.pathname === "/api/telemetry"
    ) {
      return handleAlterHubTelemetry(
        request,
        env
      );
    }


    if (
      request.method === "GET" &&
      url.pathname === "/api/admin/telemetry"
    ) {
      return handleAlterHubTelemetryAdminList(
        request,
        env,
        url
      );
    }


    if (
      request.method === "GET" &&
      url.pathname === "/api/admin/telemetry/user"
    ) {
      return handleAlterHubTelemetryAdminUser(
        request,
        env,
        url
      );
    }


    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/telemetry/purge"
    ) {
      return handleAlterHubTelemetryAdminPurge(
        request,
        env
      );
    }


    // =====================================================
    // PAYPAL - ALTER HUB PURCHASE FLOW
    // =====================================================
    //
    // Required Worker variables/secrets:
    //   PAYPAL_CLIENT_ID
    //   PAYPAL_CLIENT_SECRET
    //   PAYPAL_MODE = sandbox | live
    //   PAYPAL_WEBHOOK_ID        (required for webhook verification)
    //
    // Monthly subscription plan IDs:
    //   PAYPAL_PLAN_KEYLESS_MONTHLY
    //   PAYPAL_PLAN_PREMIUM_MONTHLY
    //   PAYPAL_PLAN_PREMIUM_PLUS_MONTHLY
    //
    // Lifetime one-time prices:
    //   PAYPAL_KEYLESS_LIFETIME_PRICE
    //   PAYPAL_PREMIUM_LIFETIME_PRICE
    //   PAYPAL_PREMIUM_PLUS_LIFETIME_PRICE
    //
    // Optional:
    //   PAYPAL_CURRENCY          (defaults to USD)
    //   PAYPAL_CANCEL_URL
    //
    // Simple checkout links:
    //   GET /paypal/subscribe/keyless-monthly
    //   GET /paypal/subscribe/premium-monthly
    //   GET /paypal/subscribe/premium-plus-monthly
    //   GET /paypal/buy/keyless-lifetime
    //   GET /paypal/buy/premium-lifetime
    //   GET /paypal/buy/premium-plus-lifetime
    //
    // API checkout:
    //   POST /api/paypal/create-order
    //   POST /api/paypal/capture-order
    //   GET  /api/paypal/purchase-status?purchase_token=...
    //
    // PayPal webhook:
    //   POST /api/paypal/webhook
    // =====================================================


    // =====================================================
    // LIFETIME - SIMPLE ONE-TIME CHECKOUT BUTTON FLOW
    // =====================================================
    // The Worker creates the PayPal order itself, records it in D1,
    // redirects the buyer to PayPal, then fulfills the correct lifetime
    // key after a verified completed capture. No PayPal plan ID is needed.

    const simpleLifetimeProduct =
      getPayPalSimpleLifetimeProductFromPath(
        url.pathname
      );

    if (
      request.method === "GET" &&
      simpleLifetimeProduct
    ) {
      try {
        const rateLimit =
          await checkPayPalCreateRateLimit(
            request,
            env
          );

        if (!rateLimit.allowed) {
          return renderPayPalMessagePage(
            "Please wait",
            "Too many checkout attempts were started from this connection. Try again shortly.",
            429
          );
        }

        const order =
          await createPayPalOrder(
            env,
            url.origin,
            simpleLifetimeProduct
          );

        return Response.redirect(
          order.approval_url,
          302
        );

      } catch (error) {
        console.error(
          "PAYPAL LIFETIME CHECKOUT ERROR:",
          simpleLifetimeProduct,
          error
        );

        return renderPayPalMessagePage(
          "Checkout unavailable",
          paypalPublicError(error),
          paypalErrorStatus(error)
        );
      }
    }


    // =====================================================
    // MONTHLY SUBSCRIPTIONS - SIMPLE CHECKOUT BUTTON FLOW
    // =====================================================
    // One customer-facing button starts the subscription.
    // The webhook itself is server-to-server and is never opened by the buyer.
    // Supported tiers: Keyless, Premium, Premium Plus.

    const simpleSubscriptionTier =
      getPayPalSimpleSubscriptionTierFromPath(
        url.pathname
      );

    if (
      request.method === "GET" &&
      simpleSubscriptionTier
    ) {
      try {
        const rateLimit =
          await checkPayPalCreateRateLimit(
            request,
            env
          );

        if (!rateLimit.allowed) {
          return renderPayPalMessagePage(
            "Please wait",
            "Too many checkout attempts were started from this connection. Try again shortly.",
            429
          );
        }

        const created =
          await createPayPalMonthlySubscription(
            env,
            url.origin,
            simpleSubscriptionTier
          );

        const cookie =
          "ah_paypal_sub=" +
          encodeURIComponent(created.subscription_id) +
          "; Path=/paypal; HttpOnly; Secure; SameSite=Lax; Max-Age=1800";

        return new Response(null, {
          status: 302,
          headers: {
            "Location": created.approval_url,
            "Set-Cookie": cookie,
            "Cache-Control": "no-store"
          }
        });

      } catch (error) {
        console.error(
          "PAYPAL SUBSCRIPTION START ERROR:",
          simpleSubscriptionTier,
          error
        );

        return renderPayPalMessagePage(
          "Checkout unavailable",
          paypalPublicError(error),
          paypalErrorStatus(error)
        );
      }
    }


    if (
      request.method === "GET" &&
      url.pathname === "/paypal/subscription-return"
    ) {
      const cookieHeader =
        request.headers.get("Cookie") || "";

      const cookieSubscriptionId =
        getCookie(
          cookieHeader,
          "ah_paypal_sub"
        );

      const querySubscriptionId =
        String(
          url.searchParams.get("subscription_id") ||
          ""
        ).trim();

      const subscriptionId =
        String(
          cookieSubscriptionId ||
          querySubscriptionId ||
          ""
        ).trim();

      const returnTier =
        normalizePayPalSubscriptionTier(
          url.searchParams.get("tier") ||
          ""
        );

      if (
        !isValidPayPalSubscriptionId(
          subscriptionId
        )
      ) {
        return renderPayPalMessagePage(
          "Subscription received",
          "PayPal returned to Alter Hub, but the subscription reference could not be recovered. If payment completed, the verified PayPal webhook can still fulfill the purchase.",
          202
        );
      }

      try {
        const result =
          await fulfillPayPalSubscription(
            env,
            subscriptionId,
            returnTier
          );

        if (result.pending) {
          return html(`
            <!doctype html>
            <html lang="en">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width,initial-scale=1">
              <meta name="robots" content="noindex,nofollow">
              <meta http-equiv="refresh" content="3">
              <title>Confirming Payment • Alter Hub</title>
              <style>
                :root { color-scheme: dark; }
                * { box-sizing: border-box; }
                body { min-height:100vh; margin:0; display:grid; place-items:center; padding:24px; background:#070708; color:#f7f7f8; font-family:Inter,ui-sans-serif,system-ui,sans-serif; }
                main { width:min(620px,100%); padding:32px; border:1px solid rgba(255,255,255,.1); border-radius:24px; background:#111114; }
                strong { color:#ff3049; }
                p { color:#a4a4ad; line-height:1.65; }
              </style>
            </head>
            <body>
              <main>
                <strong>ALTER HUB • PAYPAL</strong>
                <h1>Confirming your payment</h1>
                <p>Your subscription was approved. PayPal is still confirming the first payment. This page checks again automatically.</p>
              </main>
            </body>
            </html>
          `, 202);
        }

        const clearCookie =
          "ah_paypal_sub=; Path=/paypal; HttpOnly; Secure; SameSite=Lax; Max-Age=0";

        return new Response(null, {
          status: 302,
          headers: {
            "Location":
              `${url.origin}/paypal/result/${result.purchase_token}`,
            "Set-Cookie": clearCookie,
            "Cache-Control": "no-store"
          }
        });

      } catch (error) {
        console.error(
          "PAYPAL SUBSCRIPTION RETURN ERROR:",
          returnTier || "unknown",
          error
        );

        const returnPath =
          returnTier === "premium"
            ? "premium"
            : returnTier === "premium-plus"
              ? "premium-plus"
              : "keyless";

        const returnLabel =
          returnTier === "premium"
            ? "Return to Premium"
            : returnTier === "premium-plus"
              ? "Return to Premium Plus"
              : "Return to Keyless";

        return renderPayPalMessagePage(
          "Payment confirmation",
          paypalPublicError(error),
          paypalErrorStatus(error),
          `https://alterhub.online/${returnPath}/#monthly`,
          returnLabel
        );
      }
    }


    // =====================================================
    // PAYPAL MONTHLY SUBSCRIPTIONS
    // =====================================================
    //
    // Alter Hub can create PayPal subscriptions server-side through the
    // simple checkout routes above. The legacy activation endpoint remains
    // available for compatibility. The Worker always fetches the subscription
    // directly from PayPal, verifies its Plan ID/status/payment, and creates
    // the correct Alter Hub key.
    //
    // POST /api/paypal/activate-subscription
    // =====================================================

    if (
      request.method === "POST" &&
      url.pathname === "/api/paypal/activate-subscription"
    ) {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          success: false,
          error: "Invalid request body."
        }, 400);
      }

      const subscriptionId =
        String(
          body.subscription_id ||
          ""
        ).trim();

      const requestedTier =
        String(
          body.tier ||
          ""
        )
          .trim()
          .toLowerCase();

      if (
        !isValidPayPalSubscriptionId(
          subscriptionId
        )
      ) {
        return json({
          success: false,
          error:
            "Invalid PayPal subscription ID."
        }, 400);
      }

      try {
        const result =
          await fulfillPayPalSubscription(
            env,
            subscriptionId,
            requestedTier
          );

        if (result.pending) {
          return json({
            success: true,
            pending: true,
            subscription_id:
              subscriptionId,
            message:
              "PayPal is still confirming the first subscription payment."
          }, 202);
        }

        return json({
          success: true,
          completed: true,
          subscription_id:
            subscriptionId,
          purchase_token:
            result.purchase_token,
          key:
            result.final_key,
          access_plan:
            result.access_plan,
          duration_ms:
            result.duration_ms,
          result_url:
            `${url.origin}/paypal/result/${result.purchase_token}`
        });

      } catch (error) {
        console.error(
          "PAYPAL SUBSCRIPTION ACTIVATION ERROR:",
          error
        );

        return json({
          success: false,
          error:
            paypalPublicError(error)
        }, paypalErrorStatus(error));
      }
    }


    // -----------------------------------------------------
    // SIMPLE CHECKOUT LINK
    // GET /paypal/buy/keyless-monthly
    // -----------------------------------------------------
    if (
      request.method === "GET" &&
      url.pathname === "/paypal/buy/keyless-monthly"
    ) {
      try {
        const rateLimit =
          await checkPayPalCreateRateLimit(
            request,
            env
          );

        if (!rateLimit.allowed) {
          return renderPayPalMessagePage(
            "Please wait",
            "Too many checkout attempts were started from this connection. Try again shortly.",
            429
          );
        }

        const order =
          await createPayPalOrder(
            env,
            url.origin,
            "keyless_monthly"
          );

        return Response.redirect(
          order.approval_url,
          302
        );

      } catch (error) {
        console.error(
          "PAYPAL SIMPLE CHECKOUT ERROR:",
          error
        );

        return renderPayPalMessagePage(
          "Checkout unavailable",
          paypalPublicError(error),
          paypalErrorStatus(error)
        );
      }
    }


    // -----------------------------------------------------
    // CREATE PAYPAL ORDER
    // POST /api/paypal/create-order
    //
    // Body:
    // {
    //   "product_id": "keyless_monthly"
    // }
    // -----------------------------------------------------
    if (
      request.method === "POST" &&
      url.pathname === "/api/paypal/create-order"
    ) {
      try {
        const rateLimit =
          await checkPayPalCreateRateLimit(
            request,
            env
          );

        if (!rateLimit.allowed) {
          return json({
            success: false,
            error:
              "Too many checkout attempts. Please try again shortly.",
            retry_after_seconds:
              rateLimit.retryAfter
          }, 429);
        }

        let body = {};

        try {
          body = await request.json();
        } catch {
          body = {};
        }

        const productId =
          String(
            body.product_id ||
            "keyless_monthly"
          ).trim();

        const order =
          await createPayPalOrder(
            env,
            url.origin,
            productId
          );

        return json({
          success: true,
          order_id: order.order_id,
          purchase_token: order.purchase_token,
          product_id: order.product_id,
          access_plan: order.access_plan,
          duration_ms: order.duration_ms,
          amount: order.amount,
          currency: order.currency,
          approval_url: order.approval_url
        });

      } catch (error) {
        console.error(
          "PAYPAL CREATE ORDER ERROR:",
          error
        );

        return json({
          success: false,
          error: paypalPublicError(error)
        }, paypalErrorStatus(error));
      }
    }


    // -----------------------------------------------------
    // CAPTURE PAYPAL ORDER
    // POST /api/paypal/capture-order
    //
    // Body:
    // {
    //   "order_id": "...",
    //   "purchase_token": "..."
    // }
    //
    // This endpoint is useful with PayPal JS SDK onApprove.
    // -----------------------------------------------------
    if (
      request.method === "POST" &&
      url.pathname === "/api/paypal/capture-order"
    ) {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          success: false,
          error: "Invalid request body."
        }, 400);
      }

      const orderId =
        String(body.order_id || "")
          .trim();

      const purchaseToken =
        String(body.purchase_token || "")
          .trim();

      if (
        !isValidPayPalOrderId(orderId) ||
        !isValidPayPalPurchaseToken(purchaseToken)
      ) {
        return json({
          success: false,
          error: "Invalid PayPal purchase."
        }, 400);
      }

      try {
        const result =
          await capturePayPalOrderAndFulfill(
            env,
            orderId,
            purchaseToken
          );

        if (result.pending) {
          return json({
            success: true,
            pending: true,
            purchase_token: purchaseToken
          }, 202);
        }

        return json({
          success: true,
          completed: true,
          order_id: orderId,
          purchase_token: purchaseToken,
          key: result.final_key,
          access_plan: result.access_plan,
          duration_ms: result.duration_ms,
          result_url:
            `${url.origin}/paypal/result/${purchaseToken}`
        });

      } catch (error) {
        console.error(
          "PAYPAL CAPTURE ERROR:",
          error
        );

        return json({
          success: false,
          error: paypalPublicError(error)
        }, paypalErrorStatus(error));
      }
    }


    // -----------------------------------------------------
    // PAYPAL APPROVAL RETURN
    //
    // PayPal redirects here after approval.
    // The Worker performs the server-side capture and then
    // sends the customer to the secure purchase result page.
    // -----------------------------------------------------
    if (
      request.method === "GET" &&
      url.pathname === "/paypal/return"
    ) {
      const orderId =
        String(
          url.searchParams.get("token") ||
          ""
        ).trim();

      const purchaseToken =
        String(
          url.searchParams.get("purchase") ||
          ""
        ).trim();

      if (
        !isValidPayPalOrderId(orderId) ||
        !isValidPayPalPurchaseToken(purchaseToken)
      ) {
        return renderPayPalMessagePage(
          "Invalid purchase",
          "The PayPal return link is missing required purchase information.",
          400
        );
      }

      try {
        await capturePayPalOrderAndFulfill(
          env,
          orderId,
          purchaseToken
        );

        return Response.redirect(
          `${url.origin}/paypal/result/${purchaseToken}`,
          302
        );

      } catch (error) {
        console.error(
          "PAYPAL RETURN CAPTURE ERROR:",
          error
        );

        return renderPayPalMessagePage(
          "Payment processing error",
          paypalPublicError(error),
          paypalErrorStatus(error),
          `${url.origin}/paypal/result/${purchaseToken}`,
          "Check purchase status"
        );
      }
    }


    // -----------------------------------------------------
    // PAYPAL CANCEL RETURN
    // -----------------------------------------------------
    if (
      request.method === "GET" &&
      url.pathname === "/paypal/cancel"
    ) {
      let cancelUrl =
        String(
          env.PAYPAL_CANCEL_URL ||
          ""
        ).trim();

      if (!cancelUrl) {
        const purchaseToken =
          String(
            url.searchParams.get("purchase") ||
            ""
          ).trim();

        let productId =
          "keyless_monthly";

        if (
          isValidPayPalPurchaseToken(
            purchaseToken
          )
        ) {
          try {
            await ensurePayPalSchema(env);

            const purchase =
              await getPayPalPurchaseByToken(
                env,
                purchaseToken
              );

            if (purchase?.product_id) {
              productId =
                String(
                  purchase.product_id
                );
            }
          } catch (error) {
            console.error(
              "PAYPAL CANCEL LOOKUP ERROR:",
              error
            );
          }
        }

        cancelUrl =
          getPayPalStoreReturnUrlForProduct(
            productId,
            "cancelled"
          );
      }

      return Response.redirect(
        cancelUrl,
        302
      );
    }


    // -----------------------------------------------------
    // PAYPAL PURCHASE RESULT PAGE
    // GET /paypal/result/PURCHASE_TOKEN
    // -----------------------------------------------------
    const paypalResultMatch =
      url.pathname.match(
        /^\/paypal\/result\/([a-fA-F0-9]{48})$/
      );

    if (
      request.method === "GET" &&
      paypalResultMatch
    ) {
      const purchaseToken =
        paypalResultMatch[1];

      try {
        await ensurePayPalSchema(env);

        let purchase =
          await getPayPalPurchaseByToken(
            env,
            purchaseToken
          );

        if (!purchase) {
          return renderPayPalMessagePage(
            "Purchase not found",
            "This Alter Hub purchase link does not exist.",
            404
          );
        }

        if (purchase.final_key) {
          try {
            purchase =
              await hydratePayPalBuyerEmail(
                env,
                purchase
              );

            await maybeSendAutomaticPayPalReceipt(
              env,
              purchase
            );

            purchase =
              await getPayPalPurchaseByToken(
                env,
                purchaseToken
              ) || purchase;

          } catch (receiptError) {
            console.error(
              "PAYPAL RECEIPT AUTO-SEND ERROR:",
              receiptError
            );
          }
        }

        return renderPayPalPurchasePage(
          purchase
        );

      } catch (error) {
        console.error(
          "PAYPAL RESULT PAGE ERROR:",
          error
        );

        return renderPayPalMessagePage(
          "Purchase unavailable",
          "The purchase record could not be loaded. Try again shortly.",
          500
        );
      }
    }


    // -----------------------------------------------------
    // PAYPAL PURCHASE STATUS API
    // GET /api/paypal/purchase-status?purchase_token=...
    // -----------------------------------------------------
    if (
      request.method === "GET" &&
      url.pathname === "/api/paypal/purchase-status"
    ) {
      const purchaseToken =
        String(
          url.searchParams.get("purchase_token") ||
          ""
        ).trim();

      if (
        !isValidPayPalPurchaseToken(
          purchaseToken
        )
      ) {
        return json({
          success: false,
          error: "Invalid purchase token."
        }, 400);
      }

      try {
        await ensurePayPalSchema(env);

        const purchase =
          await getPayPalPurchaseByToken(
            env,
            purchaseToken
          );

        if (!purchase) {
          return json({
            success: false,
            error: "Purchase not found."
          }, 404);
        }

        const completed =
          Boolean(purchase.final_key);

        return json({
          success: true,
          completed: completed,
          status:
            String(
              purchase.status ||
              "created"
            ),
          product_id:
            purchase.product_id,
          access_plan:
            purchase.access_plan,
          duration_ms:
            Number(
              purchase.duration_ms || 0
            ),
          amount:
            purchase.amount,
          currency:
            purchase.currency,
          key:
            completed
              ? purchase.final_key
              : null
        });

      } catch (error) {
        console.error(
          "PAYPAL STATUS ERROR:",
          error
        );

        return json({
          success: false,
          error:
            "Could not load purchase status."
        }, 500);
      }
    }


    // -----------------------------------------------------
    // DOWNLOAD PAYPAL RECEIPT
    // GET /paypal/receipt/PURCHASE_TOKEN/download
    // -----------------------------------------------------
    const paypalReceiptDownloadMatch =
      url.pathname.match(
        /^\/paypal\/receipt\/([a-fA-F0-9]{48})\/download$/
      );

    if (
      request.method === "GET" &&
      paypalReceiptDownloadMatch
    ) {
      const purchaseToken =
        paypalReceiptDownloadMatch[1];

      try {
        await ensurePayPalSchema(env);

        let purchase =
          await getPayPalPurchaseByToken(
            env,
            purchaseToken
          );

        if (
          !purchase ||
          !purchase.final_key
        ) {
          return renderPayPalMessagePage(
            "Receipt unavailable",
            "This purchase has not been completed yet.",
            404
          );
        }

        purchase =
          await hydratePayPalBuyerEmail(
            env,
            purchase
          );

        const receiptHtml =
          buildPayPalReceiptHtml(
            purchase
          );

        const safeOrderId =
          String(
            purchase.paypal_order_id ||
            "purchase"
          )
            .replace(
              /[^A-Za-z0-9_-]/g,
              ""
            )
            .slice(0, 64) ||
          "purchase";

        return new Response(
          receiptHtml,
          {
            status: 200,

            headers: {
              "Content-Type":
                "text/html; charset=UTF-8",

              "Content-Disposition":
                `attachment; filename="AlterHub-Receipt-${safeOrderId}.html"`,

              "Cache-Control":
                "private, no-store, max-age=0",

              "X-Content-Type-Options":
                "nosniff"
            }
          }
        );

      } catch (error) {
        console.error(
          "PAYPAL RECEIPT DOWNLOAD ERROR:",
          error
        );

        return renderPayPalMessagePage(
          "Receipt unavailable",
          "The receipt could not be generated right now.",
          500
        );
      }
    }


    // -----------------------------------------------------
    // EMAIL PAYPAL RECEIPT
    // POST /api/paypal/email-receipt
    //
    // Body:
    // {
    //   "purchase_token": "...",
    //   "email": "buyer@example.com"
    // }
    //
    // The email can be changed by the buyer. If omitted,
    // the PayPal payer email is used.
    // -----------------------------------------------------
    if (
      request.method === "POST" &&
      url.pathname === "/api/paypal/email-receipt"
    ) {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          success: false,
          error: "Invalid request body."
        }, 400);
      }

      const purchaseToken =
        String(
          body.purchase_token ||
          ""
        ).trim();

      if (
        !isValidPayPalPurchaseToken(
          purchaseToken
        )
      ) {
        return json({
          success: false,
          error: "Invalid purchase token."
        }, 400);
      }

      try {
        await ensurePayPalSchema(env);

        let purchase =
          await getPayPalPurchaseByToken(
            env,
            purchaseToken
          );

        if (
          !purchase ||
          !purchase.final_key
        ) {
          return json({
            success: false,
            error:
              "This purchase has not been completed yet."
          }, 409);
        }

        purchase =
          await hydratePayPalBuyerEmail(
            env,
            purchase
          );

        const requestedEmail =
          String(
            body.email ||
            purchase.payer_email ||
            ""
          )
            .trim()
            .toLowerCase();

        if (
          !isValidReceiptEmail(
            requestedEmail
          )
        ) {
          return json({
            success: false,
            error:
              "Enter a valid email address."
          }, 400);
        }

        const reservation =
          await reservePayPalReceiptSend(
            env,
            purchase,
            false
          );

        if (!reservation.allowed) {
          return json({
            success: false,
            error:
              reservation.error ||
              "Please wait before sending another receipt.",
            retry_after_seconds:
              reservation.retryAfter || 0
          }, 429);
        }

        try {
          await deliverPayPalReceiptEmail(
            env,
            purchase,
            requestedEmail
          );

        } catch (sendError) {
          console.error(
            "PAYPAL MANUAL RECEIPT SEND ERROR:",
            sendError
          );

          return json({
            success: false,
            error:
              receiptEmailPublicError(
                sendError
              )
          }, receiptEmailErrorStatus(sendError));
        }

        await recordSuccessfulReceiptSend(
          env,
          purchase.purchase_token,
          requestedEmail
        );

        return json({
          success: true,
          sent: true,
          email: requestedEmail
        });

      } catch (error) {
        console.error(
          "PAYPAL EMAIL RECEIPT ERROR:",
          error
        );

        return json({
          success: false,
          error:
            receiptEmailPublicError(
              error
            )
        }, receiptEmailErrorStatus(error));
      }
    }


    // -----------------------------------------------------
    // PAYPAL WEBHOOK
    // POST /api/paypal/webhook
    //
    // Lifetime purchases require:
    //   PAYMENT.CAPTURE.COMPLETED
    // Monthly subscriptions also use the BILLING.SUBSCRIPTION.* and
    // PAYMENT.SALE.COMPLETED events handled below.
    //
    // The event is verified against PayPal before any key
    // can be created.
    // -----------------------------------------------------
    if (
      request.method === "POST" &&
      url.pathname === "/api/paypal/webhook"
    ) {
      let event;

      try {
        event = await request.json();
      } catch {
        return json({
          success: false,
          error: "Invalid webhook body."
        }, 400);
      }

      try {
        const verified =
          await verifyPayPalWebhook(
            request,
            env,
            event
          );

        if (!verified) {
          return json({
            success: false,
            error:
              "PayPal webhook verification failed."
          }, 400);
        }

        const eventId =
          String(event.id || "")
            .trim();

        const eventType =
          String(event.event_type || "")
            .trim();

        // One-time order captures (kept for the existing direct
        // checkout/testing route).
        if (
          eventType ===
          "PAYMENT.CAPTURE.COMPLETED"
        ) {
          const capture =
            event.resource || {};

          const orderId =
            extractPayPalOrderIdFromCapture(
              capture
            );

          if (!orderId) {
            console.error(
              "PAYPAL WEBHOOK COMPLETED CAPTURE WITHOUT ORDER ID:",
              eventId
            );

            return json({
              success: false,
              error:
                "Completed capture did not include an order ID."
            }, 400);
          }

          const result =
            await fulfillPayPalCapture(
              env,
              orderId,
              capture,
              {
                eventId: eventId,
                payerEmail:
                  extractPayPalWebhookPayerEmail(
                    event
                  )
              }
            );

          return json({
            success: true,
            verified: true,
            processed: true,
            completed:
              !result.pending,
            duplicate:
              Boolean(result.duplicate)
          });
        }

        // PayPal subscription activation. This makes fulfillment robust
        // even if the buyer closes the browser immediately after approval.
        if (
          eventType ===
          "BILLING.SUBSCRIPTION.ACTIVATED"
        ) {
          const subscriptionId =
            String(
              event?.resource?.id ||
              ""
            ).trim();

          if (
            !isValidPayPalSubscriptionId(
              subscriptionId
            )
          ) {
            return json({
              success: false,
              error:
                "Subscription activation did not include a valid subscription ID."
            }, 400);
          }

          const result =
            await fulfillPayPalSubscription(
              env,
              subscriptionId,
              ""
            );

          return json({
            success: true,
            verified: true,
            processed: true,
            pending:
              Boolean(result.pending)
          });
        }

        // Each successful recurring subscription payment extends the
        // existing Alter Hub entitlement by another billing period.
        if (
          eventType ===
          "PAYMENT.SALE.COMPLETED"
        ) {
          const renewal =
            await handlePayPalSubscriptionPayment(
              env,
              event
            );

          return json({
            success: true,
            verified: true,
            processed:
              Boolean(renewal.processed),
            duplicate:
              Boolean(renewal.duplicate),
            initial_payment:
              Boolean(renewal.initialPayment),
            renewed:
              Boolean(renewal.renewed)
          });
        }

        // Cancelling a subscription stops future extensions. We do not
        // immediately revoke already-paid time.
        if (
          eventType ===
            "BILLING.SUBSCRIPTION.CANCELLED" ||
          eventType ===
            "BILLING.SUBSCRIPTION.SUSPENDED" ||
          eventType ===
            "BILLING.SUBSCRIPTION.EXPIRED"
        ) {
          const subscriptionId =
            String(
              event?.resource?.id ||
              ""
            ).trim();

          if (
            isValidPayPalSubscriptionId(
              subscriptionId
            )
          ) {
            await markPayPalSubscriptionStatus(
              env,
              subscriptionId,
              eventType
            );
          }

          return json({
            success: true,
            verified: true,
            processed: true,
            subscription_status_event:
              eventType
          });
        }

        return json({
          success: true,
          verified: true,
          processed: false,
          ignored_event_type:
            eventType
        });

      } catch (error) {
        console.error(
          "PAYPAL WEBHOOK ERROR:",
          error
        );

        return json({
          success: false,
          error: paypalPublicError(error)
        }, paypalErrorStatus(error));
      }
    }


    // =====================================================
    // CREATE SESSION
    // POST /api/create-session
    // =====================================================

    if (
      request.method === "POST" &&
      url.pathname === "/api/create-session"
    ) {

      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          success: false,
          error: "Invalid JSON"
        }, 400);
      }
      const rateLimit =
        await checkCreateSessionRateLimit(
          request,
          env
        );

      if (!rateLimit.allowed) {
        return json({
          success: false,
          error: "Too many requests. Please try again later.",
          retry_after_seconds: rateLimit.retryAfter
        }, 429);
      }


      const robloxUserId =
        String(body.roblox_user_id || "").trim();

      const username =
        String(body.username || "").trim();

      const clientId =
        String(body.client_id || "").trim();


      if (!/^\d+$/.test(robloxUserId)) {
        return json({
          success: false,
          error: "Invalid Roblox user ID"
        }, 400);
      }


      if (
        !clientId ||
        clientId.length > 500
      ) {
        return json({
          success: false,
          error: "Invalid client ID"
        }, 400);
      }


      // Turn the ClientId into a server-side device hash.
      const deviceHash =
        await hashDevice(
          clientId,
          env.DEVICE_HASH_SECRET
        );
        // =====================================================
        // CHECK FOR EXISTING VALID KEY ON THIS DEVICE
        // =====================================================

        const existingKey =
          await env.DB.prepare(`
            SELECT
              id,
              result_id,
              final_key,
              key_expires_at,
              status
            FROM sessions
            WHERE
              device_hash = ?
              AND status = 'completed'
              AND final_key IS NOT NULL
              AND result_id IS NOT NULL
              AND key_expires_at > ?
            ORDER BY key_expires_at DESC
            LIMIT 1
          `)
          .bind(
            deviceHash,
            Date.now()
          )
          .first();


        if (existingKey) {

          return json({
            success: true,

            already_has_key: true,

            session_url:
              `${url.origin}/result/${existingKey.result_id}`,

            expires_at:
              Number(existingKey.key_expires_at)
          });
        }
        const existingPendingSession =
          await env.DB.prepare(`
            SELECT
              id,
              expires_at
            FROM sessions
            WHERE
              device_hash = ?
              AND status = 'pending'
              AND expires_at > ?
            ORDER BY created_at DESC
            LIMIT 1
          `)
          .bind(
            deviceHash,
            Date.now()
          )
          .first();


        if (existingPendingSession) {

          return json({
            success: true,

            already_has_session: true,

            session_url:
              `${url.origin}/key/${existingPendingSession.id}`,

            expires_at:
              Number(existingPendingSession.expires_at)
          });
        }

      const sessionId =
        crypto.randomUUID().replaceAll("-", "");

      const createdAt =
        Date.now();

      const expiresAt =
        createdAt + (15 * 60 * 1000);


      await env.DB.prepare(`
        INSERT INTO sessions
        (
          id,
          roblox_user_id,
          device_hash,
          created_at,
          expires_at,
          status,
          step
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        sessionId,
        robloxUserId,
        deviceHash,
        createdAt,
        expiresAt,
        "pending",
        0
      )
      .run();


      return json({
        success: true,
        session_id: sessionId,
        session_url:
          `${url.origin}/key/${sessionId}`,
        expires_at: expiresAt
      });
    }



    // =====================================================
    // LEGACY DIRECT ADVANCE ENDPOINT DISABLED
    // =====================================================

    const advanceMatch =
      url.pathname.match(
        /^\/api\/session\/([a-fA-F0-9]{32})\/advance$/
      );

    if (
      request.method === "POST" &&
      advanceMatch
    ) {
      return json({
        success: false,
        error: "Direct session advancement is disabled. Complete a verified checkpoint provider instead."
      }, 403);
    }

    // =====================================================
    // START CHECKPOINT
    // POST /api/session/SESSION_ID/checkpoint/start
    // Body: { "provider": "linkvertise" }
    //    or { "provider": "lootlabs" }
    // =====================================================

    const checkpointStartMatch =
      url.pathname.match(
        /^\/api\/session\/([a-fA-F0-9]{32})\/checkpoint\/start$/
      );

    if (
      request.method === "POST" &&
      checkpointStartMatch
    ) {
      const sessionId = checkpointStartMatch[1];

      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          success: false,
          error: "Invalid JSON"
        }, 400);
      }

      const provider =
        String(body.provider || "").toLowerCase();

      const turnstileToken =
        String(body.turnstile_token || "").trim();

      if (
        provider !== "linkvertise" &&
        provider !== "lootlabs"
      ) {
        return json({
          success: false,
          error: "Invalid checkpoint provider"
        }, 400);
      }

      const session =
        await env.DB.prepare(`
          SELECT
            id,
            expires_at,
            status,
            step,
            checkpoint_provider,
            checkpoint_token,
            checkpoint_created_at
          FROM sessions
          WHERE id = ?
          LIMIT 1
        `)
        .bind(sessionId)
        .first();

      if (!session) {
        return json({
          success: false,
          error: "Session not found"
        }, 404);
      }

      if (Date.now() > Number(session.expires_at)) {
        return json({
          success: false,
          error: "Session expired"
        }, 410);
      }

      if (session.status !== "pending") {
        return json({
          success: false,
          error: "Session is not active"
        }, 409);
      }

      if (Number(session.step) >= 3) {
        return json({
          success: false,
          error: "All checkpoints already completed"
        }, 409);
      }

      // Cloudflare Turnstile is required before the first checkpoint.
      // This is verified here on the Worker, so altering the browser-side
      // widget alone cannot bypass the human-verification gate.
      if (Number(session.step) === 0) {
        const turnstileResult =
          await verifyTurnstileToken(
            request,
            env,
            turnstileToken,
            url.hostname,
            "key_checkpoint"
          );

        if (!turnstileResult.ok) {
          const notConfigured =
            turnstileResult.reason === "not_configured";

          return json({
            success: false,
            code: notConfigured
              ? "human_verification_not_configured"
              : "human_verification_failed",
            error: notConfigured
              ? "Human verification is not configured on this Worker."
              : "Human verification failed or expired. Complete the Cloudflare check again."
          }, notConfigured ? 503 : 403);
        }
      }

      // New token every time they choose a provider.
      // Choosing another provider automatically invalidates
      // the previous token because it gets overwritten.
      if (session.checkpoint_token) {
        await recordCheckpointFunnelStatus(
          env,
          String(session.checkpoint_token),
          "cancelled",
          "superseded_by_new_provider"
        );
      }

      const checkpointToken =
        crypto.randomUUID().replaceAll("-", "");

      const checkpointCreatedAt =
        Date.now();

      await recordCheckpointFunnelStart(
        env,
        checkpointToken,
        sessionId,
        provider,
        Number(session.step) + 1,
        checkpointCreatedAt,
        Number(session.expires_at || 0)
      );

      await env.DB.prepare(`
        UPDATE sessions
        SET
          checkpoint_provider = ?,
          checkpoint_token = ?,
          checkpoint_created_at = ?
        WHERE id = ?
      `)
        .bind(
          provider,
          checkpointToken,
          checkpointCreatedAt,
          sessionId
        )
        .run();

      // Linkvertise needs a temporary browser cookie so
      // we can identify the checkpoint when Linkvertise
      // sends the user back to /linkvertise/complete.

      if (provider === "linkvertise") {

        const cookie =
          `ah_lv=${checkpointToken}; ` +
          `Path=/linkvertise; ` +
          `HttpOnly; ` +
          `Secure; ` +
          `SameSite=Lax; ` +
          `Max-Age=900`;

        return new Response(
          JSON.stringify({
            success: true,
            provider: "linkvertise",
            step: Number(session.step) + 1,
            redirect_url: env.LINKVERTISE_PUBLIC_URL
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json; charset=UTF-8",
              "Set-Cookie": cookie
            }
          }
        );
      }


      // LootLabs will be connected afterward.
      if (provider === "lootlabs") {

        const destinationUrl =
          `${url.origin}/lootlabs/complete/${checkpointToken}`;

        try {

          const response = await fetch(
            "https://creators.lootlabs.gg/api/public/url_encryptor",
            {
              method: "POST",

              headers: {
                "Authorization":
                  `Bearer ${env.LOOTLABS_SECRET}`,

                "Content-Type":
                  "application/json"
              },

              body: JSON.stringify({
                destination_url: destinationUrl,
                api_token: env.LOOTLABS_SECRET
              })
            }
          );


          const rawText =
            await response.text();


          console.log(
            "LootLabs raw response:",
            rawText
          );


          let result;

          try {

            result =
              JSON.parse(rawText);

          } catch (parseError) {

            await recordCheckpointFunnelStatus(
              env,
              checkpointToken,
              "failed",
              "lootlabs_invalid_json"
            );

            return json({
              success: false,
              error: "LootLabs returned invalid JSON",
              details: rawText
            }, 502);
          }


          if (
            !response.ok ||
            !result.message
          ) {

            await recordCheckpointFunnelStatus(
              env,
              checkpointToken,
              "failed",
              "lootlabs_rejected"
            );

            return json({
              success: false,

              error:
                "LootLabs rejected: " +
                JSON.stringify(result),

              status_code:
                response.status
            }, 502);
          }


          const lootData =
            String(result.message);


          const redirectUrl =
            `${env.LOOTLABS_PUBLIC_URL}&data=${lootData}`;


          const cookie =
            `ah_ll=${checkpointToken}; ` +
            `Path=/lootlabs; ` +
            `HttpOnly; ` +
            `Secure; ` +
            `SameSite=Lax; ` +
            `Max-Age=900`;


          return new Response(
            JSON.stringify({
              success: true,
              provider: "lootlabs",
              step: Number(session.step) + 1,
              redirect_url: redirectUrl
            }),
            {
              status: 200,

              headers: {
                "Content-Type":
                  "application/json; charset=UTF-8",

                "Set-Cookie":
                  cookie
              }
            }
          );


        } catch (error) {

          console.error(
            "LootLabs request error:",
            error
          );

          await recordCheckpointFunnelStatus(
            env,
            checkpointToken,
            "failed",
            "lootlabs_request_error"
          );

          return json({
            success: false,
            error: "LootLabs request crashed",
            details: String(error)
          }, 502);
        }
      }
    }
    // =====================================================
    // CANCEL CHECKPOINT
    // POST /api/session/SESSION_ID/checkpoint/cancel
    // =====================================================

    const checkpointCancelMatch =
      url.pathname.match(
        /^\/api\/session\/([a-fA-F0-9]{32})\/checkpoint\/cancel$/
      );

    if (
      request.method === "POST" &&
      checkpointCancelMatch
    ) {
      const sessionId = checkpointCancelMatch[1];

      const session =
        await env.DB.prepare(`
          SELECT
            id,
            expires_at,
            status,
            step,
            checkpoint_provider,
            checkpoint_token
          FROM sessions
          WHERE id = ?
          LIMIT 1
        `)
        .bind(sessionId)
        .first();

      if (!session) {
        return json({
          success: false,
          error: "Session not found"
        }, 404);
      }

      if (Date.now() > Number(session.expires_at)) {
        return json({
          success: false,
          error: "Session expired"
        }, 410);
      }

      if (session.status !== "pending") {
        return json({
          success: false,
          error: "Session is not active"
        }, 409);
      }

      // Remove the current provider choice
      // and invalidate its checkpoint token.
      if (session.checkpoint_token) {
        await recordCheckpointFunnelStatus(
          env,
          String(session.checkpoint_token),
          "cancelled",
          "user_cancelled"
        );
      }

      await env.DB.prepare(`
        UPDATE sessions
        SET
          checkpoint_provider = NULL,
          checkpoint_token = NULL,
          checkpoint_created_at = NULL
        WHERE id = ?
      `)
        .bind(sessionId)
        .run();

      return json({
        success: true,
        cancelled: true
      });
    }

    // =====================================================
    // LINKVERTISE COMPLETION CALLBACK
    // GET /linkvertise/complete?hash=...
    // =====================================================

    if (
      request.method === "GET" &&
      url.pathname === "/linkvertise/complete"
    ) {
      const hash =
        String(url.searchParams.get("hash") || "").trim();

      if (!hash || hash.length !== 64) {
        return html(`
          <h1>Verification Failed</h1>
          <p>Missing or invalid Linkvertise verification hash.</p>
        `, 400);
      }


      // Read our HttpOnly checkpoint cookie.
      const cookieHeader =
        request.headers.get("Cookie") || "";

      const checkpointToken =
        getCookie(cookieHeader, "ah_lv");


      if (
        !checkpointToken ||
        !/^[a-fA-F0-9]{32}$/.test(checkpointToken)
      ) {
        return html(`
          <h1>Verification Failed</h1>
          <p>Your Linkvertise checkpoint session could not be found.</p>
        `, 403);
      }


      // Find the session that owns this checkpoint token.
      const session =
        await env.DB.prepare(`
          SELECT
            id,
            roblox_user_id,
            expires_at,
            status,
            step,
            checkpoint_provider,
            checkpoint_token
          FROM sessions
          WHERE
            checkpoint_token = ?
            AND checkpoint_provider = 'linkvertise'
          LIMIT 1
        `)
        .bind(checkpointToken)
        .first();


      if (!session) {
        await recordCheckpointFunnelStatus(
          env,
          checkpointToken,
          "failed",
          "linkvertise_session_not_found"
        );

        return html(`
          <h1>Verification Failed</h1>
          <p>This checkpoint is no longer valid.</p>
        `, 403);
      }


      if (Date.now() > Number(session.expires_at)) {
        await recordCheckpointFunnelStatus(
          env,
          checkpointToken,
          "abandoned",
          "session_expired"
        );
        return html(`
          <h1>Session Expired</h1>
          <p>Please generate a new Alter Hub key link.</p>
        `, 410);
      }


      if (session.status !== "pending") {
        await recordCheckpointFunnelStatus(
          env,
          checkpointToken,
          "failed",
          "linkvertise_session_unavailable"
        );

        return html(`
          <h1>Session Unavailable</h1>
          <p>This key session is no longer active.</p>
        `, 409);
      }


      // =====================================================
      // VERIFY HASH WITH LINKVERTISE
      // =====================================================

      let verificationPassed = false;

      try {

      const verifyUrl =
        new URL(
          "https://publisher.linkvertise.com/api/v1/anti_bypassing"
        );

      verifyUrl.searchParams.set(
        "token",
        env.LINKVERTISE_ANTI_BYPASS_TOKEN
      );

      verifyUrl.searchParams.set(
        "hash",
        hash
      );


      const verificationResponse =
        await fetch(
          verifyUrl.toString(),
          {
            method: "POST"
          }
        );


      const verificationData =
        await verificationResponse.json();


      console.log(
        "Linkvertise response:",
        verificationData
      );


      verificationPassed =
        verificationData.status === true ||
        verificationData.STATUS === true ||
        String(verificationData.status).toLowerCase() === "true" ||
        String(verificationData.STATUS).toLowerCase() === "true";

      }
      catch (error) {

      console.error(
        "Linkvertise verification error:",
        error
      );

      await recordCheckpointFunnelStatus(
        env,
        checkpointToken,
        "failed",
        "linkvertise_verification_error"
      );

      return html(`
        <h1>Verification Error</h1>

        <p>
          We could not verify your Linkvertise checkpoint.
        </p>
      `, 502);
      }


      // =====================================================
      // CHECK VERIFICATION RESULT
      // =====================================================

      if (!verificationPassed) {

      await recordCheckpointFunnelStatus(
        env,
        checkpointToken,
        "failed",
        "linkvertise_verification_rejected"
      );

      return html(`
        <h1>Verification Failed</h1>

        <p>
          Linkvertise could not confirm that this
          checkpoint was completed.
        </p>

        <p>
          Return to the Alter Hub key page and try again.
        </p>
      `, 403);
      }


      // If we reach this point,
      // Linkvertise successfully verified the visitor.


      // =====================================================
      // LINKVERTISE VERIFIED
      // =====================================================

      const sessionId =
        session.id;

      const oldStep =
        Number(session.step);

      const newStep =
        oldStep + 1;


      // Cookie is no longer needed after verification.
      const clearCookie =
        "ah_lv=; Path=/linkvertise; HttpOnly; Secure; SameSite=Lax; Max-Age=0";


      // =====================================================
      // FINAL CHECKPOINT
      // =====================================================

      if (newStep >= 3) {

        const resultId =
          crypto.randomUUID().replaceAll("-", "");

        const finalKey =
          generateKey();
        const keyExpiresAt =
          Date.now() + (12 * 60 * 60 * 1000);

        const update =
          await env.DB.prepare(`
          UPDATE sessions
          SET
            step = 3,
            status = 'completed',
            final_key = ?,
            result_id = ?,
            key_expires_at = ?
          WHERE id = ?
              AND status = 'pending'
              AND step = ?
              AND checkpoint_token = ?
          `)
          .bind(
            finalKey,
            resultId,
            keyExpiresAt,
            sessionId,
            oldStep,
            checkpointToken
          )
          .run();


        if (!update.meta?.changes) {
          return html(`
            <h1>Checkpoint Already Used</h1>
            <p>This checkpoint has already been processed.</p>
          `, 409);
        }

        await recordCheckpointCompletion(
          env,
          sessionId,
          "linkvertise",
          3,
          checkpointToken
        );

        await recordFinalKeyCountry(
          env,
          session.roblox_user_id,
          request.cf?.country
        );


        return new Response(null, {
          status: 302,

          headers: {
            "Location":
              `${url.origin}/result/${resultId}`,

            "Set-Cookie":
              clearCookie
          }
        });
      }


      // =====================================================
      // CHECKPOINT 1 OR 2
      // =====================================================

      const update =
        await env.DB.prepare(`
          UPDATE sessions
          SET
            step = ?,
            checkpoint_provider = NULL,
            checkpoint_token = NULL,
            checkpoint_created_at = NULL
          WHERE
            id = ?
            AND status = 'pending'
            AND step = ?
            AND checkpoint_token = ?
        `)
        .bind(
          newStep,
          sessionId,
          oldStep,
          checkpointToken
        )
        .run();


      if (!update.meta?.changes) {
        return html(`
          <h1>Checkpoint Already Used</h1>
          <p>This checkpoint has already been processed.</p>
        `, 409);
      }

      await recordCheckpointCompletion(
        env,
        sessionId,
        "linkvertise",
        newStep,
        checkpointToken
      );


      // Return to Alter Hub for the next checkpoint.
      return new Response(null, {
        status: 302,

        headers: {
          "Location":
            `${url.origin}/key/${sessionId}`,

          "Set-Cookie":
            clearCookie
        }
      });
    }

// =====================================================
    // CHECK SESSION
    // GET /api/session/SESSION_ID
    // =====================================================

    const sessionMatch =
      url.pathname.match(
        /^\/api\/session\/([a-fA-F0-9]{32})$/
      );


    if (
      request.method === "GET" &&
      sessionMatch
    ) {

      const sessionId =
        sessionMatch[1];


      const session =
        await env.DB.prepare(`
          SELECT
            id,
            roblox_user_id,
            created_at,
            expires_at,
            status,
            step,
            result_id

          FROM sessions

          WHERE id = ?

          LIMIT 1
        `)

        .bind(sessionId)

        .first();


      if (!session) {

        return json({
          success: false,
          error: "Session not found"
        }, 404);
      }


      // Completed session
      if (session.status === "completed") {

        return json({

          success: true,

          session_id:
            session.id,

          status:
            "completed",

          step:
            3,

          result_url:
            `${url.origin}/result/${session.result_id}`

        });
      }


      // Expired
      if (Date.now() > Number(session.expires_at)) {

        if (session.status === "pending") {

          await env.DB.prepare(`
            UPDATE sessions

            SET status = 'expired'

            WHERE id = ?
          `)

          .bind(sessionId)

          .run();
        }


        return json({
          success: false,
          error: "Session expired"
        }, 410);
      }


      return json({

        success: true,

        session_id:
          session.id,

        status:
          session.status,

        step:
          Number(session.step),

        expires_at:
          Number(session.expires_at)

      });
    }



    // =====================================================
    // KEY PAGE (functional, Adsterra max-ads, noindex)
    // GET /key/SESSION_ID
    // =====================================================

    const keyPageMatch =
      url.pathname.match(
        /^\/key\/([a-fA-F0-9]{32})$/
      );


    if (
      request.method === "GET" &&
      keyPageMatch
    ) {

      const sessionId =
        keyPageMatch[1];


      const session =
        await env.DB.prepare(`
          SELECT
            id,
            expires_at,
            status,
            step,
            result_id

          FROM sessions

          WHERE id = ?

          LIMIT 1
        `)

        .bind(sessionId)

        .first();


      // -----------------------------------------
      // Invalid session
      // -----------------------------------------

      if (!session) {

        return html(`
          <!DOCTYPE html>

          <html>

          <head>

            <meta charset="UTF-8">

            <meta
              name="viewport"
              content="width=device-width, initial-scale=1.0"
            >

            <title>Alter Hub</title>

          </head>

          <body
            style="
              background:#090909;
              color:white;
              font-family:Arial,sans-serif;
              text-align:center;
              padding-top:100px;
            "
          >

            <h1>Invalid Link</h1>

            <p>
              This key session does not exist.
            </p>

          </body>

          </html>
        `, 404);
      }



      // -----------------------------------------
      // Already completed
      // -----------------------------------------

      if (
        session.status === "completed" &&
        session.result_id
      ) {

        return Response.redirect(
          `${url.origin}/result/${session.result_id}`,
          302
        );
      }



      // -----------------------------------------
      // Expired
      // -----------------------------------------

      if (Date.now() > Number(session.expires_at)) {

        if (session.status === "pending") {

          await env.DB.prepare(`
            UPDATE sessions

            SET status = 'expired'

            WHERE id = ?
          `)

          .bind(sessionId)

          .run();
        }


        return html(`
          <!DOCTYPE html>

          <html>

          <head>

            <meta charset="UTF-8">

            <meta
              name="viewport"
              content="width=device-width, initial-scale=1.0"
            >

            <title>Alter Hub</title>

          </head>

          <body
            style="
              background:#090909;
              color:white;
              font-family:Arial,sans-serif;
              text-align:center;
              padding-top:100px;
            "
          >

            <h1>Session Expired</h1>

            <p>
              This key link has expired.
            </p>

          </body>

          </html>
        `, 410);
      }



      // -----------------------------------------
      // Valid session page
      // -----------------------------------------

      const checkpointNumber =
        Math.min(3, Math.max(1, Number(session.step) + 1));

      const checkpointTitles = [
        "Start Verification",
        "Continue Verification",
        "Final Verification"
      ];

      const checkpointDescriptions = [
        "Begin your Alter Hub verification by choosing a checkpoint provider.",
        "Checkpoint one is complete. Continue the secure verification flow.",
        "One last checkpoint remains before your Alter Hub key is generated."
      ];

      const checkpointProgress =
        Math.max(0, Math.min(100, ((checkpointNumber - 1) / 2) * 100));

      const turnstileRequired =
        Number(session.step) === 0;

      const turnstileSiteKey =
        String(env.TURNSTILE_SITE_KEY || "").trim();

      const keyTutorialUrl =
        "https://www.youtube.com/watch?v=ZWJBAVrqkOs&t";

      const buyKeyUrl =
        "https://alterhub.online/keyless/#monthly";

      const turnstileScript =
        turnstileRequired && turnstileSiteKey
          ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>'
          : "";

      const turnstileBlock =
        turnstileRequired
          ? (
              '<div class="human-check" id="humanCheck">' +
                '<div class="human-check-copy">' +
                  '<div class="section-kicker">Human verification</div>' +
                  '<strong>Confirm you are human</strong>' +
                  '<p>Complete the Cloudflare check once before starting checkpoint one. Verification is validated securely by the Alter Hub Worker.</p>' +
                '</div>' +
                (turnstileSiteKey
                  ? '<div class="human-check-widget"><div class="cf-turnstile" data-sitekey="' + escapeHtml(turnstileSiteKey) + '" data-action="key_checkpoint" data-theme="dark" data-callback="onTurnstileSuccess" data-expired-callback="onTurnstileExpired" data-error-callback="onTurnstileError"></div></div>'
                  : '<div class="turnstile-config-error">Turnstile is not configured. Add TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY to the Worker before using this page.</div>') +
              '</div>'
            )
          : "";

      return html(`
      <!DOCTYPE html>
      <html lang="en">

      <head>
        <meta charset="UTF-8">

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        >

        <meta name="theme-color" content="#090909">
        <meta name="robots" content="noindex, nofollow">

        <title>Alter Hub • Checkpoint ${checkpointNumber}</title>
        ${turnstileScript}

        <style>
          :root {
            --bg: #070708;
            --panel: rgba(17, 17, 19, 0.88);
            --panel-strong: #111113;
            --panel-soft: #17171a;
            --line: rgba(255, 255, 255, 0.075);
            --line-red: rgba(235, 33, 52, 0.34);
            --text: #f7f7f8;
            --muted: #8c8c96;
            --muted-2: #65656d;
            --red: #e21d36;
            --red-bright: #ff3049;
            --red-dark: #760815;
            --green: #2fd47a;
            --shadow: 0 24px 80px rgba(0, 0, 0, 0.48);
          }

          * {
            box-sizing: border-box;
          }

          html {
            background: var(--bg);
          }

          body {
            margin: 0;
            min-height: 100vh;
            overflow-x: hidden;
            overflow-x: hidden;
            color: var(--text);
            font-family:
              Inter,
              ui-sans-serif,
              system-ui,
              -apple-system,
              BlinkMacSystemFont,
              "Segoe UI",
              sans-serif;
            background:
              radial-gradient(circle at 50% -10%, rgba(226, 29, 54, 0.22), transparent 38%),
              radial-gradient(circle at 8% 22%, rgba(128, 8, 24, 0.14), transparent 28%),
              radial-gradient(circle at 92% 62%, rgba(226, 29, 54, 0.08), transparent 30%),
              #070708;
          }

          body::before {
            content: "";
            position: fixed;
            inset: 0;
            pointer-events: none;
            opacity: 0.18;
            background-image:
              linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
            background-size: 46px 46px;
            mask-image: linear-gradient(to bottom, black, transparent 88%);
          }

          body::after {
            content: "";
            position: fixed;
            width: 520px;
            height: 520px;
            top: -280px;
            left: calc(50% - 260px);
            border: 1px solid rgba(255, 48, 73, 0.12);
            border-radius: 50%;
            box-shadow:
              0 0 120px rgba(226, 29, 54, 0.11),
              inset 0 0 120px rgba(226, 29, 54, 0.06);
            pointer-events: none;
            animation: haloFloat 9s ease-in-out infinite;
          }

          button,
          a {
            font: inherit;
          }

          button:focus-visible,
          a:focus-visible {
            outline: 2px solid var(--red-bright);
            outline-offset: 3px;
          }

          .page-shell {
            width: min(1480px, calc(100% - 32px));
            margin: 0 auto;
            padding: 22px 0 34px;
            position: relative;
            z-index: 1;
          }

          .topbar {
            min-height: 64px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 18px;
            padding: 10px 14px;
            margin-bottom: 16px;
            background: rgba(11, 11, 13, 0.68);
            border: 1px solid var(--line);
            border-radius: 18px;
            backdrop-filter: blur(18px);
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
          }

          .brand {
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 0;
          }

          .brand-mark {
            position: relative;
            width: 42px;
            height: 42px;
            flex: 0 0 auto;
            display: grid;
            place-items: center;
            border-radius: 13px;
            color: white;
            font-size: 17px;
            font-weight: 900;
            letter-spacing: -0.06em;
            background:
              linear-gradient(145deg, #ff344c 0%, #b80e25 52%, #59050e 100%);
            box-shadow:
              0 0 0 1px rgba(255, 255, 255, 0.1) inset,
              0 8px 30px rgba(226, 29, 54, 0.32);
            animation: brandPulse 3.4s ease-in-out infinite;
          }

          .brand-mark::after {
            content: "";
            position: absolute;
            inset: -5px;
            border: 1px solid rgba(255, 48, 73, 0.24);
            border-radius: 17px;
            opacity: 0;
            animation: brandRing 3.4s ease-out infinite;
          }

          .brand-copy {
            min-width: 0;
          }

          .brand-name {
            font-size: 15px;
            font-weight: 800;
            letter-spacing: 0.01em;
          }

          .brand-sub {
            margin-top: 2px;
            color: var(--muted);
            font-size: 12px;
            white-space: nowrap;
          }

          .session-pill {
            flex: 0 0 auto;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            min-height: 36px;
            padding: 0 12px;
            border-radius: 999px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(255, 255, 255, 0.035);
            color: #d6d6db;
            font-size: 12px;
            font-weight: 700;
          }

          .session-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: var(--green);
            box-shadow: 0 0 12px rgba(47, 212, 122, 0.72);
            animation: statusPulse 1.9s ease-in-out infinite;
          }

          .ad-slot {
            position: relative;
            overflow: hidden;
            min-width: 0;
            max-width: 100%;
            display: grid;
            place-items: center;
            text-align: center;
            color: #6e6e76;
            border: 1px dashed rgba(255, 255, 255, 0.10);
            background:
              linear-gradient(180deg, rgba(255, 255, 255, 0.025), rgba(255, 255, 255, 0.012));
            border-radius: 15px;
            contain: layout paint;
          }

          .ad-slot iframe,
          .ad-slot ins,
          .ad-slot > div {
            max-width: 100%;
          }

          .ad-slot::before {
            content: "";
            position: absolute;
            inset: 0;
            transform: translateX(-120%);
            background: linear-gradient(
              90deg,
              transparent,
              rgba(255, 255, 255, 0.035),
              transparent
            );
            animation: adSweep 7s linear infinite;
          }

          .ad-copy {
            position: relative;
            z-index: 1;
            display: grid;
            gap: 3px;
            padding: 8px;
          }

          .ad-copy span {
            font-size: 9px;
            font-weight: 800;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            color: #55555d;
          }

          .ad-copy strong {
            font-size: 11px;
            font-weight: 750;
            color: #777780;
          }

          .ad-copy small {
            font-size: 9px;
            color: #505058;
          }

          .ad-leaderboard {
            width: min(970px, 100%);
            min-height: 92px;
            margin: 0 auto 16px;
          }

          .compact-banner {
            width: min(320px, 100%);
            min-height: 52px;
            margin: 0 auto 16px;
          }

          .compact-banner iframe {
            max-width: 100%;
          }

          .panel-ad {
            width: 100%;
            min-height: 92px;
            margin: 0;
          }

          .panel-ad.tall {
            min-height: 180px;
          }

          .ad-pair-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 16px;
          }

          .ad-pair-grid .ad-slot {
            min-height: 120px;
          }

          .rail-stack {
            display: grid;
            gap: 16px;
          }

          .rail-primary { min-height: 600px !important; }
          .rail-secondary { min-height: 250px !important; }

          .content-grid {
            display: grid;
            grid-template-columns: minmax(0, 1fr);
            grid-template-areas: "main";
            gap: 16px;
            align-items: start;
          }

          .rail-shell {
            display: none;
            min-width: 0;
            min-height: 600px;
            position: sticky;
            top: 18px;
          }

          .rail-shell .ad-slot { width: 100%; }

          .center-column {
            grid-area: main;
            width: 100%;
            min-width: 0;
            max-width: 1120px;
            margin: 0 auto;
            display: grid;
            gap: 16px;
          }

          .hero-card {
            position: relative;
            overflow: hidden;
            min-width: 0;
            isolation: isolate;
            padding: clamp(8px, 4vw, 18px);
            border: 1px solid rgba(255, 255, 255, 0.085);
            border-radius: 26px;
            background:
              linear-gradient(145deg, rgba(24, 24, 28, 0.96), rgba(13, 13, 15, 0.96));
            box-shadow: var(--shadow);
            animation: cardEnter 650ms cubic-bezier(.2,.75,.25,1) both;
          }

          .hero-card::before {
            content: "";
            position: absolute;
            z-index: -1;
            width: 440px;
            height: 440px;
            right: -240px;
            top: -250px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(255, 48, 73, 0.20), transparent 64%);
            animation: glowDrift 7s ease-in-out infinite;
          }

          .hero-card::after {
            content: "";
            position: absolute;
            left: 0;
            right: 0;
            top: 0;
            height: 1px;
            background: linear-gradient(90deg, transparent, var(--red-bright), transparent);
            opacity: 0.6;
          }

          .eyebrow-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 14px;
            margin-bottom: 22px;
          }

          .eyebrow {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            min-height: 29px;
            padding: 0 10px;
            border-radius: 999px;
            color: #ffb5bf;
            background: rgba(226, 29, 54, 0.10);
            border: 1px solid rgba(255, 48, 73, 0.18);
            font-size: 10px;
            font-weight: 850;
            letter-spacing: 0.12em;
            text-transform: uppercase;
          }

          .eyebrow-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: var(--red-bright);
            box-shadow: 0 0 10px rgba(255, 48, 73, 0.75);
          }

          .step-chip {
            flex: 0 0 auto;
            color: #aaaab2;
            font-size: 12px;
            font-weight: 750;
          }

          .hero-title {
            max-width: 760px;
            margin: 0;
            font-size: clamp(36px, 4.8vw, 64px);
            line-height: 0.98;
            letter-spacing: -0.05em;
            font-weight: 900;
            overflow-wrap: normal;
            word-break: normal;
          }

          .hero-title .accent {
            color: var(--red-bright);
            text-shadow: 0 0 30px rgba(255, 48, 73, 0.22);
          }

          .hero-description {
            max-width: 680px;
            margin: 18px 0 0;
            color: #a7a7af;
            font-size: clamp(14px, 2vw, 16px);
            line-height: 1.72;
          }

          .progress-wrap {
            margin-top: 30px;
            padding: 18px;
            border-radius: 18px;
            border: 1px solid var(--line);
            background: rgba(0, 0, 0, 0.18);
          }

          .progress-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 14px;
          }

          .progress-head strong {
            font-size: 12px;
            letter-spacing: 0.02em;
          }

          .progress-head span {
            color: var(--muted);
            font-size: 11px;
          }

          .progress-track {
            position: relative;
            height: 2px;
            margin: 19px 18px 13px;
            background: #29292e;
          }

          .progress-track-fill {
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: ${checkpointProgress}%;
            background: linear-gradient(90deg, #ad0b20, var(--red-bright));
            box-shadow: 0 0 16px rgba(255, 48, 73, 0.35);
            transition: width 500ms ease;
          }

          .progress-nodes {
            position: absolute;
            inset: 50% 0 auto 0;
            transform: translateY(-50%);
            display: flex;
            align-items: center;
            justify-content: space-between;
          }

          .progress-node {
            width: 28px;
            height: 28px;
            display: grid;
            place-items: center;
            border-radius: 50%;
            border: 2px solid #38383f;
            background: #111113;
            color: #6e6e77;
            font-size: 10px;
            font-weight: 900;
            transition: 240ms ease;
          }

          .progress-node.done {
            border-color: rgba(47, 212, 122, 0.65);
            background: rgba(47, 212, 122, 0.12);
            color: #76eda8;
            box-shadow: 0 0 14px rgba(47, 212, 122, 0.14);
          }

          .progress-node.active {
            border-color: var(--red-bright);
            background: var(--red);
            color: white;
            box-shadow:
              0 0 0 6px rgba(226, 29, 54, 0.10),
              0 0 22px rgba(255, 48, 73, 0.32);
            animation: nodePulse 1.9s ease-in-out infinite;
          }

          .progress-labels {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            margin-top: 25px;
            color: #696971;
            font-size: 10px;
            font-weight: 750;
            letter-spacing: 0.04em;
            text-transform: uppercase;
          }

          .progress-labels span:nth-child(2) {
            text-align: center;
          }

          .progress-labels span:last-child {
            text-align: right;
          }

          .inline-ad-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr);
            gap: 16px;
            align-items: stretch;
          }

          @media (min-width: 980px) {
            .inline-ad-row {
              grid-template-columns: minmax(0, 1fr) minmax(280px, 340px);
            }
          }

          .action-card {
            position: relative;
            overflow: hidden;
            min-width: 0;
            padding: clamp(22px, 4vw, 34px);
            border: 1px solid var(--line);
            border-radius: 24px;
            background: rgba(15, 15, 18, 0.88);
            box-shadow: 0 18px 50px rgba(0, 0, 0, 0.22);
            animation: cardEnter 650ms 80ms cubic-bezier(.2,.75,.25,1) both;
          }

          .section-kicker {
            color: var(--red-bright);
            font-size: 10px;
            font-weight: 850;
            letter-spacing: 0.14em;
            text-transform: uppercase;
          }

          .section-title {
            margin: 8px 0 5px;
            font-size: clamp(22px, 4vw, 30px);
            letter-spacing: -0.035em;
          }

          .section-copy {
            margin: 0 0 22px;
            color: var(--muted);
            font-size: 13px;
            line-height: 1.65;
          }

          .human-check {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 18px;
            margin: 18px 0;
            padding: 16px;
            border: 1px solid rgba(255, 255, 255, 0.085);
            border-radius: 16px;
            background: rgba(255, 255, 255, 0.025);
          }

          .human-check-copy {
            min-width: 0;
            flex: 1 1 auto;
          }

          .human-check-copy strong {
            display: block;
            margin-top: 5px;
            font-size: 15px;
            color: #f2f2f4;
          }

          .human-check-copy p {
            margin: 7px 0 0;
            color: var(--muted);
            font-size: 12px;
            line-height: 1.6;
          }

          .human-check-widget {
            flex: 0 0 auto;
            min-height: 65px;
            display: grid;
            place-items: center;
          }

          .turnstile-config-error {
            flex: 0 1 360px;
            padding: 12px 14px;
            border: 1px solid rgba(255, 48, 73, 0.28);
            border-radius: 12px;
            background: rgba(226, 29, 54, 0.08);
            color: #ffb5bf;
            font-size: 12px;
            line-height: 1.55;
          }

          .resource-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
            margin-bottom: 12px;
          }

          .resource-card {
            position: relative;
            overflow: hidden;
            min-height: 96px;
            display: block;
            padding: 18px;
            border-radius: 18px;
            border: 1px solid rgba(255, 255, 255, 0.085);
            background:
              linear-gradient(
                145deg,
                rgba(30, 30, 34, 0.95),
                rgba(17, 17, 20, 0.95)
              );
            color: white;
            text-decoration: none;
            text-align: left;
            transition:
              transform 220ms ease,
              border-color 220ms ease,
              box-shadow 220ms ease,
              background 220ms ease;
          }

          .resource-card::before {
            content: "";
            position: absolute;
            width: 150px;
            height: 220px;
            left: -190px;
            top: -30px;
            transform: rotate(18deg);
            background:
              linear-gradient(
                90deg,
                transparent,
                rgba(255,255,255,0.08),
                transparent
              );
            transition: left 500ms ease;
          }

          .resource-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 18px 36px rgba(0, 0, 0, 0.28);
          }

          .resource-card:hover::before {
            left: calc(100% + 40px);
          }

          .resource-card.tutorial {
            border-color: rgba(255, 48, 73, 0.16);
          }

          .resource-card.tutorial:hover {
            border-color: rgba(255, 48, 73, 0.46);
            background:
              linear-gradient(
                145deg,
                rgba(40, 22, 26, 0.96),
                rgba(18, 17, 20, 0.96)
              );
          }

          .resource-card.buy {
            border-color: rgba(75, 140, 255, 0.16);
          }

          .resource-card.buy:hover {
            border-color: rgba(75, 140, 255, 0.48);
            background:
              linear-gradient(
                145deg,
                rgba(21, 29, 47, 0.97),
                rgba(17, 18, 22, 0.96)
              );
          }

          .resource-card.tutorial:hover .provider-arrow {
            color: var(--red-bright);
            transform: translateX(3px);
          }

          .resource-card.buy:hover .provider-arrow {
            color: #6da3ff;
            transform: translateX(3px);
          }

          .resource-divider {
            height: 1px;
            margin: 4px 0 12px;
            background:
              linear-gradient(
                90deg,
                transparent,
                rgba(255,255,255,0.075),
                transparent
              );
          }

          .provider-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
          }

          .provider {
            position: relative;
            overflow: hidden;
            min-height: 156px;
            padding: 18px;
            border-radius: 18px;
            border: 1px solid rgba(255, 255, 255, 0.085);
            background:
              linear-gradient(145deg, rgba(30, 30, 34, 0.95), rgba(17, 17, 20, 0.95));
            color: white;
            cursor: pointer;
            text-align: left;
            transition:
              transform 220ms ease,
              border-color 220ms ease,
              box-shadow 220ms ease,
              background 220ms ease;
          }

          .provider::before {
            content: "";
            position: absolute;
            width: 150px;
            height: 220px;
            left: -190px;
            top: -30px;
            transform: rotate(18deg);
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
            transition: left 500ms ease;
          }

          .provider:hover:not(:disabled) {
            transform: translateY(-4px);
            border-color: rgba(255, 48, 73, 0.45);
            box-shadow: 0 18px 36px rgba(0, 0, 0, 0.28);
            background:
              linear-gradient(145deg, rgba(40, 22, 26, 0.96), rgba(18, 17, 20, 0.96));
          }

          .provider:hover:not(:disabled)::before {
            left: calc(100% + 40px);
          }

          /* Linkvertise accent — sampled from supplied image: #FF8114 */
          .provider[data-provider="linkvertise"] {
            border-color: rgba(255, 129, 20, 0.17);
          }

          .provider[data-provider="linkvertise"]:hover:not(:disabled) {
            border-color: rgba(255, 129, 20, 0.56);
            background:
              linear-gradient(
                145deg,
                rgba(47, 31, 18, 0.97),
                rgba(18, 17, 20, 0.96)
              );
            box-shadow:
              0 18px 36px rgba(0, 0, 0, 0.28),
              0 0 0 1px rgba(255, 129, 20, 0.04) inset;
          }

          .provider[data-provider="linkvertise"] .provider-icon {
            background: rgba(255, 129, 20, 0.10);
            border-color: rgba(255, 129, 20, 0.24);
            box-shadow: 0 10px 30px rgba(255, 129, 20, 0.11);
          }

          .provider[data-provider="linkvertise"]:hover .provider-arrow {
            color: #FF8114;
          }

          .provider[data-provider="linkvertise"].is-loading {
            border-color: rgba(255, 129, 20, 0.52);
            box-shadow: 0 0 0 1px rgba(255, 129, 20, 0.14) inset;
          }

          /* LootLabs accent */
          .provider[data-provider="lootlabs"] {
            border-color: rgba(139, 92, 246, 0.18);
          }

          .provider[data-provider="lootlabs"]:hover:not(:disabled) {
            border-color: rgba(139, 92, 246, 0.58);
            background:
              linear-gradient(
                145deg,
                rgba(31, 24, 48, 0.97),
                rgba(18, 17, 21, 0.96)
              );
            box-shadow:
              0 18px 36px rgba(0, 0, 0, 0.28),
              0 0 0 1px rgba(139, 92, 246, 0.05) inset;
          }

          .provider[data-provider="lootlabs"] .provider-icon {
            background: rgba(139, 92, 246, 0.11);
            border-color: rgba(139, 92, 246, 0.25);
            box-shadow: 0 10px 30px rgba(139, 92, 246, 0.12);
          }

          .provider[data-provider="lootlabs"]:hover .provider-arrow {
            color: #8B5CF6;
          }

          .provider[data-provider="lootlabs"].is-loading {
            border-color: rgba(139, 92, 246, 0.54);
            box-shadow: 0 0 0 1px rgba(139, 92, 246, 0.14) inset;
          }

          .provider:disabled {
            cursor: wait;
            opacity: 0.6;
          }

          .provider.is-loading {
            border-color: rgba(255, 48, 73, 0.48);
            box-shadow: 0 0 0 1px rgba(255, 48, 73, 0.12) inset;
          }

          .provider-icon {
            width: 48px;
            height: 48px;
            display: grid;
            place-items: center;
            margin-bottom: 20px;
            padding: 6px;
            overflow: hidden;
            border-radius: 14px;
            color: white;
            font-size: 16px;
            font-weight: 900;
            background: rgba(226, 29, 54, 0.12);
            border: 1px solid rgba(255, 48, 73, 0.18);
            box-shadow: 0 10px 30px rgba(226, 29, 54, 0.12);
          }

          .provider-logo {
            width: 100%;
            height: 100%;
            display: none;
            object-fit: contain;
            object-position: center;
            border-radius: 9px;
          }

          .provider-fallback {
            width: 100%;
            height: 100%;
            display: grid;
            place-items: center;
          }

          .provider-icon.has-image {
            padding: 4px;
            background: rgba(255,255,255,0.035);
          }

          .provider-icon.has-image .provider-logo {
            display: block;
          }

          .provider-icon.has-image .provider-fallback {
            display: none;
          }

          .provider-title {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            font-size: 14px;
            font-weight: 820;
          }

          .provider-arrow {
            color: #696970;
            transform: translateX(0);
            transition: 180ms ease;
          }

          .provider:hover .provider-arrow {
            color: var(--red-bright);
            transform: translateX(3px);
          }

          .provider-sub {
            margin-top: 7px;
            color: #777780;
            font-size: 11px;
            line-height: 1.5;
          }

          .status-line {
            min-height: 42px;
            display: flex;
            align-items: center;
            gap: 9px;
            margin-top: 16px;
            padding: 0 12px;
            border-radius: 12px;
            border: 1px solid transparent;
            color: #81818a;
            background: rgba(255,255,255,0.025);
            font-size: 11px;
            transition: 180ms ease;
          }

          .status-line.active {
            color: #f0b8c0;
            border-color: rgba(255, 48, 73, 0.18);
            background: rgba(226, 29, 54, 0.07);
          }

          .status-line.error {
            color: #ff8897;
            border-color: rgba(255, 48, 73, 0.30);
            background: rgba(226, 29, 54, 0.10);
          }

          .status-spinner {
            width: 12px;
            height: 12px;
            flex: 0 0 auto;
            border: 2px solid rgba(255,255,255,0.15);
            border-top-color: var(--red-bright);
            border-radius: 50%;
            animation: spin 700ms linear infinite;
          }

          #selectedPanel {
            display: none;
            padding: 18px;
            border-radius: 16px;
            border: 1px solid rgba(255, 48, 73, 0.18);
            background: rgba(226, 29, 54, 0.06);
          }

          #selectedPanel h3 {
            margin: 6px 0;
          }

          #selectedPanel p {
            margin: 0;
            color: var(--muted);
            font-size: 12px;
          }

          .back {
            width: 100%;
            min-height: 44px;
            margin-top: 14px;
            border: 1px solid var(--line);
            border-radius: 12px;
            background: #1a1a1e;
            color: #dddde1;
            cursor: pointer;
            font-weight: 750;
            transition: 180ms ease;
          }

          .back:hover {
            border-color: rgba(255, 48, 73, 0.28);
            background: #211317;
            color: white;
          }

          .square-ad {
            width: 100%;
            min-width: 0;
            min-height: 250px;
          }

          .info-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px;
          }

          .info-card {
            min-width: 0;
            min-height: 118px;
            padding: 16px;
            border: 1px solid var(--line);
            border-radius: 17px;
            background: rgba(16, 16, 18, 0.72);
            animation: cardEnter 650ms 160ms cubic-bezier(.2,.75,.25,1) both;
          }

          .info-number {
            color: var(--red-bright);
            font-size: 10px;
            font-weight: 900;
            letter-spacing: 0.12em;
          }

          .info-card strong {
            display: block;
            margin-top: 10px;
            font-size: 12px;
          }

          .info-card p {
            margin: 6px 0 0;
            color: #707078;
            font-size: 10px;
            line-height: 1.55;
          }

          .footer-ad-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 16px;
          }

          .footer-ad-grid .ad-slot {
            min-height: 90px;
          }

          .page-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            padding: 2px 4px;
            color: #55555c;
            font-size: 10px;
          }

          .page-footer strong {
            color: #76767e;
          }

          .mobile-ad {
            display: none;
            min-height: 100px;
          }

          @keyframes spin {
            to { transform: rotate(360deg); }
          }

          @keyframes cardEnter {
            from {
              opacity: 0;
              transform: translateY(16px) scale(0.99);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }

          @keyframes haloFloat {
            0%, 100% { transform: translateY(0) scale(1); }
            50% { transform: translateY(22px) scale(1.04); }
          }

          @keyframes glowDrift {
            0%, 100% { transform: translate(0, 0); }
            50% { transform: translate(-26px, 20px); }
          }

          @keyframes brandPulse {
            0%, 100% { box-shadow: 0 8px 30px rgba(226, 29, 54, 0.28); }
            50% { box-shadow: 0 8px 42px rgba(226, 29, 54, 0.48); }
          }

          @keyframes brandRing {
            0% { opacity: 0; transform: scale(0.86); }
            24% { opacity: 0.7; }
            70%, 100% { opacity: 0; transform: scale(1.16); }
          }

          @keyframes nodePulse {
            0%, 100% { box-shadow: 0 0 0 6px rgba(226, 29, 54, 0.08), 0 0 20px rgba(255, 48, 73, 0.28); }
            50% { box-shadow: 0 0 0 10px rgba(226, 29, 54, 0.02), 0 0 30px rgba(255, 48, 73, 0.42); }
          }

          @keyframes statusPulse {
            0%, 100% { opacity: 0.65; transform: scale(0.9); }
            50% { opacity: 1; transform: scale(1.12); }
          }

          @keyframes adSweep {
            0% { transform: translateX(-120%); }
            45%, 100% { transform: translateX(120%); }
          }

          @media (min-width: 1500px) {
            .content-grid {
              grid-template-columns: 160px minmax(0, 1fr) 160px;
              grid-template-areas: "left main right";
            }

            .rail-shell {
              display: block;
            }

            .key-left-rail { grid-area: left; }
            .key-right-rail { grid-area: right; }
          }

          @media (max-width: 1499px) {
            .content-grid {
              grid-template-columns: minmax(0, 1fr);
              grid-template-areas: "main";
            }

            .rail-shell { display: none; }
          }

          @media (max-width: 760px) {
            .page-shell {
              width: min(720px, calc(100% - 18px));
              padding-top: 10px;
            }

            .topbar {
              min-height: 58px;
              padding: 8px 10px;
              border-radius: 14px;
            }

            .brand-mark {
              width: 38px;
              height: 38px;
              border-radius: 11px;
            }

            .brand-sub {
              display: none;
            }

            .resource-grid,
            .provider-grid,
            .info-grid,
            .footer-ad-grid,
            .ad-pair-grid {
              grid-template-columns: minmax(0, 1fr);
            }

            .session-pill {
              padding: 0 9px;
              font-size: 10px;
            }

            .ad-leaderboard {
              min-height: 82px;
            }

            .hero-card,
            .action-card {
              border-radius: 20px;
            }

            .hero-card {
              padding: 24px 20px;
            }

            .eyebrow-row {
              align-items: flex-start;
              flex-direction: column;
              gap: 10px;
            }

            .inline-ad-row {
              grid-template-columns: minmax(0, 1fr);
            }

            .square-ad {
              min-height: 210px;
            }

            .human-check {
              align-items: stretch;
              flex-direction: column;
            }

            .human-check-widget {
              justify-content: start;
            }

            .resource-grid,
            .provider-grid,
            .info-grid,
            .footer-ad-grid {
              grid-template-columns: minmax(0, 1fr);
            }

            .provider {
              min-height: 136px;
            }

            .mobile-ad {
              display: grid;
            }

            .page-footer {
              align-items: flex-start;
              flex-direction: column;
            }
          }

          @media (prefers-reduced-motion: reduce) {
            *,
            *::before,
            *::after {
              animation-duration: 0.01ms !important;
              animation-iteration-count: 1 !important;
              scroll-behavior: auto !important;
            }
          }
        </style>
      </head>

      <body>

        <div class="page-shell">

          <header class="topbar">
            <div class="brand">
              <div class="brand-mark">AH</div>
              <div class="brand-copy">
                <div class="brand-name">Alter Hub</div>
                <div class="brand-sub">Secure Key Verification</div>
              </div>
            </div>

            <div class="session-pill">
              <span class="session-dot"></span>
              <span id="sessionCountdown">Session active</span>
            </div>
          </header>

          <!-- ADSTERRA: top-leaderboard -->
<div class="ad-slot ad-leaderboard" data-ad-slot="top-leaderboard">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '510441b68afe63cde32426e4f9a64477',
      'format' : 'iframe',
      'height' : 90,
      'width' : 728,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/510441b68afe63cde32426e4f9a64477/invoke.js"></script>
</div>

          <div class="content-grid">

            <aside class="rail-shell key-left-rail" aria-label="Advertisements">
  <div class="rail-stack">
    <!-- ADSTERRA: left-rail -->
<div class="ad-slot rail-primary" data-ad-slot="left-rail">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '5a699b5e53a24d4894357c7b7701963a',
      'format' : 'iframe',
      'height' : 600,
      'width' : 160,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/5a699b5e53a24d4894357c7b7701963a/invoke.js"></script>
</div>
    <!-- ADSTERRA: left-rail-secondary -->
<div class="ad-slot rail-secondary" data-ad-slot="left-rail-secondary">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '3e399fd351c6a3da604f8a9ec10d75a1',
      'format' : 'iframe',
      'height' : 300,
      'width' : 160,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/3e399fd351c6a3da604f8a9ec10d75a1/invoke.js"></script>
</div>
  </div>
</aside>

            <main class="center-column">

              <section class="hero-card">
                <div class="eyebrow-row">
                  <div class="eyebrow">
                    <span class="eyebrow-dot"></span>
                    Secure verification flow
                  </div>
                  <div class="step-chip">Checkpoint ${checkpointNumber} / 3</div>
                </div>

                <h1 class="hero-title">
                  ${checkpointTitles[checkpointNumber - 1]}
                  <span class="accent">.</span>
                </h1>

                <p class="hero-description">
                  ${checkpointDescriptions[checkpointNumber - 1]}
                  Choose a provider below. Once it confirms completion, you will return here automatically for the next checkpoint.
                </p>

                <div class="progress-wrap">
                  <div class="progress-head">
                    <strong>Verification progress</strong>
                    <span>${checkpointNumber} of 3</span>
                  </div>

                  <div class="progress-track">
                    <div class="progress-track-fill"></div>
                    <div class="progress-nodes">
                      <div class="progress-node ${Number(session.step) >= 1 ? "done" : "active"}">${Number(session.step) >= 1 ? "✓" : "1"}</div>
                      <div class="progress-node ${Number(session.step) >= 2 ? "done" : Number(session.step) === 1 ? "active" : ""}">${Number(session.step) >= 2 ? "✓" : "2"}</div>
                      <div class="progress-node ${Number(session.step) === 2 ? "active" : ""}">3</div>
                    </div>
                  </div>

                  <div class="progress-labels">
                    <span>Start</span>
                    <span>Verify</span>
                    <span>Finish</span>
                  </div>
                </div>
              </section>

              <!-- ADSTERRA: between-hero-providers -->
<div class="ad-slot panel-ad" data-ad-slot="between-hero-providers">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '5ca9db4475da01935a98a11e45151c0c',
      'format' : 'iframe',
      'height' : 90,
      'width' : 728,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/5ca9db4475da01935a98a11e45151c0c/invoke.js"></script>
</div>

              <div class="ad-pair-grid" aria-label="Advertisements">
                <!-- ADSTERRA: hero-provider-pair-left -->
<div class="ad-slot " data-ad-slot="hero-provider-pair-left">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '687f9bf984adb7aa6526a7ede3d1de49',
      'format' : 'iframe',
      'height' : 250,
      'width' : 300,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/687f9bf984adb7aa6526a7ede3d1de49/invoke.js"></script>
</div>
                <!-- ADSTERRA: hero-provider-pair-right -->
<div class="ad-slot " data-ad-slot="hero-provider-pair-right">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : 'c2a00c4dd904e5b5cc800b84c4745611',
      'format' : 'iframe',
      'height' : 250,
      'width' : 300,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/c2a00c4dd904e5b5cc800b84c4745611/invoke.js"></script>
</div>
              </div>

              <div class="inline-ad-row">
                <section class="action-card">
                  <div class="section-kicker">Checkpoint provider</div>
                  <h2 class="section-title">Choose your route</h2>
                  <p class="section-copy">
                    Both options continue the same Alter Hub checkpoint. You can switch providers before leaving this page.
                  </p>

                  ${turnstileBlock}

                  <!-- ADSTERRA: provider-panel-native -->
<div class="ad-slot panel-ad" data-ad-slot="provider-panel-native" style="margin-bottom:16px;">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '89ac587bfdfe86f95d12414831c0f7ad',
      'format' : 'iframe',
      'height' : 250,
      'width' : 300,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/89ac587bfdfe86f95d12414831c0f7ad/invoke.js"></script>
</div>

                  <div id="chooser">
                    <div class="resource-grid">
                      <a
                        class="resource-card tutorial"
                        href="${escapeHtml(keyTutorialUrl)}"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <div class="provider-title">
                          <span>How to Get a Key</span>
                          <span class="provider-arrow">→</span>
                        </div>

                        <div class="provider-sub">
                          Watch the quick Alter Hub key-system tutorial.
                        </div>
                      </a>

                      <a
                        class="resource-card buy"
                        href="${escapeHtml(buyKeyUrl)}"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <div class="provider-title">
                          <span>Skip Key System • Buy Key</span>
                          <span class="provider-arrow">→</span>
                        </div>

                        <div class="provider-sub">
                          Get keyless access without completing checkpoints.
                        </div>
                      </a>
                    </div>

                    <div class="resource-divider"></div>

                    <div class="provider-grid">
                      <button
                        type="button"
                        class="provider"
                        data-provider="linkvertise"
                        disabled
                        onclick="chooseProvider('linkvertise', this)"
                      >
                        <div class="provider-icon" data-provider-icon="linkvertise">
                          <img class="provider-logo" alt="Linkvertise logo">
                          <span class="provider-fallback">LV</span>
                        </div>
                        <div class="provider-title">
                          <span>Continue with Linkvertise</span>
                          <span class="provider-arrow">→</span>
                        </div>
                        <div class="provider-sub">
                          Open the Linkvertise checkpoint and return automatically after verification.
                        </div>
                      </button>

                      <button
                        type="button"
                        class="provider"
                        data-provider="lootlabs"
                        disabled
                        onclick="chooseProvider('lootlabs', this)"
                      >
                        <div class="provider-icon" data-provider-icon="lootlabs">
                          <img class="provider-logo" alt="LootLabs logo">
                          <span class="provider-fallback">LL</span>
                        </div>
                        <div class="provider-title">
                          <span>Continue with LootLabs</span>
                          <span class="provider-arrow">→</span>
                        </div>
                        <div class="provider-sub">
                          Open the LootLabs checkpoint and continue after the provider confirms completion.
                        </div>
                      </button>
                    </div>
                  </div>

                  <div id="selectedPanel">
                    <div class="section-kicker">Provider selected</div>
                    <h3 id="selectedName"></h3>
                    <p>Your checkpoint is prepared. You can change provider before continuing.</p>

                    <button
                      type="button"
                      class="back"
                      disabled
                      onclick="changeProvider()"
                    >
                      ← Change provider
                    </button>
                  </div>

                  <div class="status-line" id="message">
                    Ready when you are. Select a checkpoint provider to continue.
                  </div>

                  <!-- ADSTERRA: provider-action-footer -->
<div class="ad-slot panel-ad" data-ad-slot="provider-action-footer" style="margin-top:16px;">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : 'fb6b5faf61603702c762699c66d86cfe',
      'format' : 'iframe',
      'height' : 90,
      'width' : 728,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/fb6b5faf61603702c762699c66d86cfe/invoke.js"></script>
</div>
                </section>

                <aside class="ad-slot square-ad" data-ad-slot="inline-rectangle" aria-label="Advertisement">
                  <script data-cfasync="false" type="text/javascript">
                    atOptions = {
                      'key' : '5c01b4ecc07d6a050b84475efc2504c4',
                      'format' : 'iframe',
                      'height' : 250,
                      'width' : 300,
                      'params' : {}
                    };
                  </script>
                  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/5c01b4ecc07d6a050b84475efc2504c4/invoke.js"></script>
                </aside>
              </div>

              <!-- ADSTERRA: between-providers-info -->
<div class="ad-slot panel-ad" data-ad-slot="between-providers-info">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '510441b68afe63cde32426e4f9a64477',
      'format' : 'iframe',
      'height' : 90,
      'width' : 728,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/510441b68afe63cde32426e4f9a64477/invoke.js"></script>
</div>

              <section class="info-grid" aria-label="Verification information">
                <div class="info-card">
                  <div class="info-number">01</div>
                  <strong>Three checkpoints</strong>
                  <p>Complete all three verification stages to generate your final Alter Hub key.</p>
                </div>

                <div class="info-card">
                  <div class="info-number">02</div>
                  <strong>Provider verification</strong>
                  <p>Your progress only advances after the selected checkpoint provider confirms completion.</p>
                </div>

                <div class="info-card">
                  <div class="info-number">03</div>
                  <strong>Key generated at the end</strong>
                  <p>After checkpoint three succeeds, Alter Hub generates your key and opens the result page.</p>
                </div>
              </section>

              <div class="ad-pair-grid" aria-label="Advertisements">
                <!-- ADSTERRA: info-break-left -->
<div class="ad-slot " data-ad-slot="info-break-left">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : 'a1d8590d1ad23e0d951921421e5b4364',
      'format' : 'iframe',
      'height' : 250,
      'width' : 300,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/a1d8590d1ad23e0d951921421e5b4364/invoke.js"></script>
</div>
                <!-- ADSTERRA: info-break-right -->
<div class="ad-slot " data-ad-slot="info-break-right">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : 'ac921f71aa5be1b091858921f796b4e2',
      'format' : 'iframe',
      'height' : 50,
      'width' : 320,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/ac921f71aa5be1b091858921f796b4e2/invoke.js"></script>
</div>
              </div>

              <!-- ADSTERRA: between-info-lower -->
<div class="ad-slot panel-ad tall" data-ad-slot="between-info-lower">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '93256b403dbf313c197ce9bef66529b3',
      'format' : 'iframe',
      'height' : 90,
      'width' : 728,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/93256b403dbf313c197ce9bef66529b3/invoke.js"></script>
</div>

              <div class="footer-ad-grid" aria-label="Advertisements">
                <!-- ADSTERRA: lower-left -->
<div class="ad-slot " data-ad-slot="lower-left">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '437029fb951fcb0ceef3026887cf2f11',
      'format' : 'iframe',
      'height' : 250,
      'width' : 300,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/437029fb951fcb0ceef3026887cf2f11/invoke.js"></script>
</div>
                <!-- ADSTERRA: lower-right -->
<div class="ad-slot " data-ad-slot="lower-right">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : 'cfde3b064970f5aa070f1f82468e61f8',
      'format' : 'iframe',
      'height' : 250,
      'width' : 300,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/cfde3b064970f5aa070f1f82468e61f8/invoke.js"></script>
</div>
              </div>

              <!-- ADSTERRA: mobile-banner -->
<div class="ad-slot mobile-ad" data-ad-slot="mobile-banner">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '6ba9ead7c07c2157adaa34b8c0085f93',
      'format' : 'iframe',
      'height' : 50,
      'width' : 320,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/6ba9ead7c07c2157adaa34b8c0085f93/invoke.js"></script>
</div>

              <!-- ADSTERRA: before-checkpoint-footer -->
<div class="ad-slot panel-ad" data-ad-slot="before-checkpoint-footer">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : 'b5ec075b4fe347ebcf7fc5fe33c4b73f',
      'format' : 'iframe',
      'height' : 90,
      'width' : 728,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/b5ec075b4fe347ebcf7fc5fe33c4b73f/invoke.js"></script>
</div>

              <footer class="page-footer">
                <span><strong>Alter Hub</strong> • Verification checkpoint ${checkpointNumber}</span>
                <span>Keep this tab open while completing your selected provider.</span>
              </footer>
            </main>

            <aside class="rail-shell key-right-rail" aria-label="Advertisements">
  <div class="rail-stack">
    <!-- ADSTERRA: right-rail -->
<div class="ad-slot rail-primary" data-ad-slot="right-rail">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '5e44863175d7f91cdfa7b4061ac293d4',
      'format' : 'iframe',
      'height' : 600,
      'width' : 160,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/5e44863175d7f91cdfa7b4061ac293d4/invoke.js"></script>
</div>
    <!-- ADSTERRA: right-rail-secondary -->
<div class="ad-slot rail-secondary" data-ad-slot="right-rail-secondary">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '3e399fd351c6a3da604f8a9ec10d75a1',
      'format' : 'iframe',
      'height' : 300,
      'width' : 160,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/3e399fd351c6a3da604f8a9ec10d75a1/invoke.js"></script>
</div>
  </div>
</aside>
          </div>

          <!-- ADSTERRA: bottom-leaderboard -->
<div class="ad-slot ad-leaderboard" data-ad-slot="bottom-leaderboard" style="margin-top:16px; margin-bottom:0;">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '22a86f4d46beeee6ee84bb61167aa3e9',
      'format' : 'iframe',
      'height' : 90,
      'width' : 728,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/22a86f4d46beeee6ee84bb61167aa3e9/invoke.js"></script>
</div>
        </div>

        <!-- ADSTERRA: POPUNDER / FIRST INTERACTION -->
<script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/3c/b6/6e/3cb66e10b6664867e3c2e208dba45c5c.js"></script>

        <script>
          const chooser = document.getElementById("chooser");
          const selectedPanel = document.getElementById("selectedPanel");
          const selectedName = document.getElementById("selectedName");
          const message = document.getElementById("message");
          const sessionCountdown = document.getElementById("sessionCountdown");
          const providerButtons = Array.from(document.querySelectorAll(".provider"));
          const humanVerificationRequired = ${turnstileRequired ? "true" : "false"};
          const humanVerificationConfigured = ${turnstileSiteKey ? "true" : "false"};
          let turnstileToken = "";

          function onTurnstileSuccess(token) {
            turnstileToken = String(token || "").trim();

            if (!turnstileToken) {
              setProviderButtonsDisabled(true);
              setStatus("error", "Cloudflare verification did not return a valid token. Try again.", false);
              return;
            }

            setProviderButtonsDisabled(false);
            setStatus("", "Human verification complete. Choose a checkpoint provider to continue.", false);
          }

          function onTurnstileExpired() {
            turnstileToken = "";
            setProviderButtonsDisabled(true);
            setStatus("error", "Human verification expired. Complete the Cloudflare check again.", false);
          }

          function onTurnstileError() {
            turnstileToken = "";
            setProviderButtonsDisabled(true);
            setStatus("error", "Cloudflare could not complete human verification. Retry the check.", false);
          }

          const providerLogoUrls = {
            linkvertise: "https://raw.githubusercontent.com/AlterX404/ahs/refs/heads/main/assets/images/linkvertise.jpg",
            lootlabs: "https://raw.githubusercontent.com/AlterX404/ahs/refs/heads/main/assets/images/lootlabs.jpg"
          };

          Object.keys(providerLogoUrls).forEach(function(provider) {
            const icon = document.querySelector('[data-provider-icon="' + provider + '"]');
            if (!icon) return;
            const image = icon.querySelector(".provider-logo");
            const source = String(providerLogoUrls[provider] || "").trim();
            if (!image || !source) return;
            image.addEventListener("load", function() { icon.classList.add("has-image"); });
            image.addEventListener("error", function() {
              icon.classList.remove("has-image");
              image.removeAttribute("src");
            });
            image.src = source;
          });

          const sessionExpiresAt = ${Number(session.expires_at)};

          function setProviderButtonsDisabled(disabled) {
            providerButtons.forEach(function(button) { button.disabled = Boolean(disabled); });
            const backButton = document.querySelector(".back");
            if (backButton) backButton.disabled = Boolean(disabled);
          }

          function setStatus(type, text, spinning) {
            message.className = "status-line" + (type ? " " + type : "");
            message.innerHTML = "";
            if (spinning) {
              const spinner = document.createElement("span");
              spinner.className = "status-spinner";
              message.appendChild(spinner);
            }
            const copy = document.createElement("span");
            copy.textContent = text;
            message.appendChild(copy);
          }

          function formatSessionRemaining(ms) {
            const seconds = Math.max(0, Math.floor(ms / 1000));
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            return minutes + ":" + String(remainingSeconds).padStart(2, "0");
          }

          function updateSessionCountdown() {
            const remaining = sessionExpiresAt - Date.now();
            if (remaining <= 0) {
              sessionCountdown.textContent = "Session expired";
              setProviderButtonsDisabled(true);
              return;
            }
            sessionCountdown.textContent = "Session " + formatSessionRemaining(remaining);
          }

          async function chooseProvider(provider, button) {
            if (humanVerificationRequired && !turnstileToken) {
              setProviderButtonsDisabled(true);
              setStatus("error", "Complete the Cloudflare human verification before continuing.", false);
              return;
            }

            setProviderButtonsDisabled(true);
            if (button) button.classList.add("is-loading");

            setStatus(
              "active",
              "Preparing " + (provider === "linkvertise" ? "Linkvertise" : "LootLabs") + " checkpoint...",
              true
            );

            try {
              const response = await fetch(
                "/api/session/${sessionId}/checkpoint/start",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    provider: provider,
                    turnstile_token: turnstileToken
                  })
                }
              );
              const data = await response.json();

              if (!data.success) {
                if (humanVerificationRequired) {
                  turnstileToken = "";
                  if (window.turnstile) {
                    try { window.turnstile.reset(); } catch (_) {}
                  }
                  setProviderButtonsDisabled(true);
                } else {
                  setProviderButtonsDisabled(false);
                }

                setStatus("error", data.error || "Unable to start checkpoint.", false);
                if (button) button.classList.remove("is-loading");
                return;
              }

              if (data.redirect_url) {
                setStatus(
                  "active",
                  provider === "linkvertise" ? "Opening Linkvertise..." : "Opening LootLabs...",
                  true
                );
                window.location.href = data.redirect_url;
                return;
              }

              chooser.style.display = "none";
              selectedPanel.style.display = "block";
              selectedName.textContent = provider === "linkvertise" ? "Linkvertise" : "LootLabs";
              setStatus("active", "Checkpoint prepared successfully.", false);
            } catch (error) {
              console.error(error);

              if (humanVerificationRequired) {
                turnstileToken = "";
                if (window.turnstile) {
                  try { window.turnstile.reset(); } catch (_) {}
                }
                setProviderButtonsDisabled(true);
              } else {
                setProviderButtonsDisabled(false);
              }

              setStatus("error", "Unable to contact Alter Hub. Try again.", false);
              if (button) button.classList.remove("is-loading");
            }
          }

          async function changeProvider() {
            setStatus("active", "Resetting checkpoint provider...", true);
            try {
              const response = await fetch(
                "/api/session/${sessionId}/checkpoint/cancel",
                { method: "POST" }
              );
              const data = await response.json();
              if (!data.success) {
                setStatus("error", data.error || "Unable to change provider.", false);
                return;
              }
              selectedPanel.style.display = "none";
              chooser.style.display = "block";
              selectedName.textContent = "";
              providerButtons.forEach(function(button) { button.classList.remove("is-loading"); });
              setProviderButtonsDisabled(false);
              setStatus("", "Provider reset. Choose a route to continue.", false);
            } catch (error) {
              console.error(error);
              setStatus("error", "Unable to contact Alter Hub. Try again.", false);
            }
          }

          window.chooseProvider = chooseProvider;
          window.changeProvider = changeProvider;
          window.onTurnstileSuccess = onTurnstileSuccess;
          window.onTurnstileExpired = onTurnstileExpired;
          window.onTurnstileError = onTurnstileError;

          if (humanVerificationRequired) {
            setProviderButtonsDisabled(true);

            if (humanVerificationConfigured) {
              setStatus("active", "Complete the Cloudflare human verification above to continue.", false);
            } else {
              setStatus("error", "Human verification is not configured on this Worker.", false);
            }
          } else {
            setProviderButtonsDisabled(false);
          }

          updateSessionCountdown();
          setInterval(updateSessionCountdown, 1000);
        </script>





      </body>

      </html>
      `);
    }


    // =====================================================
    // RESULT PAGE (functional, Adsterra max-ads, noindex)
    // GET /result/RESULT_ID
    // =====================================================

    const resultMatch =
      url.pathname.match(
        /^\/result\/([a-fA-F0-9]{32})$/
      );


    if (
      request.method === "GET" &&
      resultMatch
    ) {

      const resultId =
        resultMatch[1];


      const session =
        await env.DB.prepare(`
          SELECT
            final_key,
            status,
            result_id,
            key_expires_at
          FROM sessions
          WHERE result_id = ?
          LIMIT 1
        `)
        .bind(resultId)
        .first();


      if (
        !session ||
        session.status !== "completed" ||
        !session.final_key
      ) {

        return html(`
          <!DOCTYPE html>

          <html>

          <head>

            <meta charset="UTF-8">

            <meta
              name="viewport"
              content="width=device-width, initial-scale=1.0"
            >

            <title>Alter Hub</title>

          </head>

          <body
            style="
              background:#090909;
              color:white;
              font-family:Arial,sans-serif;
              text-align:center;
              padding-top:100px;
            "
          >

            <h1>Invalid Result</h1>

            <p>
              This result page does not exist.
            </p>

          </body>

          </html>
        `, 404);
      }
      if (
        !session.key_expires_at ||
        Date.now() > Number(session.key_expires_at)
      ) {
        return html(`
          <h1>Key Expired</h1>
          <p>This Alter Hub key has expired.</p>
        `, 410);
      }



      return html(`
        <!DOCTYPE html>
        <html lang="en">

        <head>
          <meta charset="UTF-8">
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          >
          <meta name="theme-color" content="#090909">
          <meta name="robots" content="noindex, nofollow">

          <title>Alter Hub • Key Ready</title>

          <style>
            :root {
              --bg: #070708;
              --panel: rgba(17, 17, 19, 0.90);
              --panel-strong: #111113;
              --panel-soft: #17171a;
              --line: rgba(255, 255, 255, 0.075);
              --text: #f7f7f8;
              --muted: #8c8c96;
              --muted-2: #65656d;
              --red: #e21d36;
              --red-bright: #ff3049;
              --red-dark: #760815;
              --green: #2fd47a;
              --shadow: 0 28px 90px rgba(0, 0, 0, 0.46);
            }

            * {
              box-sizing: border-box;
            }

            html {
              background: var(--bg);
              color-scheme: dark;
            }

            body {
              margin: 0;
              min-height: 100vh;
              overflow-x: hidden;
              color: var(--text);
              font-family:
                Inter,
                ui-sans-serif,
                system-ui,
                -apple-system,
                BlinkMacSystemFont,
                "Segoe UI",
                sans-serif;
              background:
                radial-gradient(circle at 50% -140px, rgba(226, 29, 54, 0.24), transparent 37%),
                radial-gradient(circle at 88% 25%, rgba(226, 29, 54, 0.10), transparent 28%),
                linear-gradient(180deg, #0b0809 0%, #070708 44%, #080708 100%);
            }

            body::before {
              content: "";
              position: fixed;
              inset: 0;
              pointer-events: none;
              background-image:
                linear-gradient(rgba(255,255,255,0.017) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.017) 1px, transparent 1px);
              background-size: 46px 46px;
              mask-image: linear-gradient(to bottom, rgba(0,0,0,0.55), transparent 72%);
            }

            body::after {
              content: "";
              position: fixed;
              width: 560px;
              height: 560px;
              top: -320px;
              left: calc(50% - 280px);
              border: 1px solid rgba(255, 48, 73, 0.12);
              border-radius: 50%;
              box-shadow:
                0 0 140px rgba(226, 29, 54, 0.10),
                inset 0 0 130px rgba(226, 29, 54, 0.05);
              pointer-events: none;
              animation: finalHalo 10s ease-in-out infinite;
            }

            button {
              font: inherit;
            }

            button:focus-visible {
              outline: 2px solid var(--red-bright);
              outline-offset: 3px;
            }

            .page-shell {
              width: min(1500px, calc(100% - 28px));
              margin: 0 auto;
              padding: 22px 0 34px;
              position: relative;
              z-index: 1;
            }

            .topbar {
              min-height: 64px;
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 18px;
              padding: 10px 14px;
              margin-bottom: 16px;
              background: rgba(11, 11, 13, 0.72);
              border: 1px solid var(--line);
              border-radius: 18px;
              backdrop-filter: blur(18px);
              box-shadow: 0 10px 40px rgba(0, 0, 0, 0.20);
            }

            .brand {
              display: flex;
              align-items: center;
              gap: 12px;
              min-width: 0;
            }

            .brand-mark {
              position: relative;
              width: 42px;
              height: 42px;
              flex: 0 0 auto;
              display: grid;
              place-items: center;
              border-radius: 13px;
              color: white;
              font-size: 17px;
              font-weight: 900;
              letter-spacing: -0.06em;
              background: linear-gradient(145deg, #ff344c 0%, #b80e25 52%, #59050e 100%);
              box-shadow:
                0 0 0 1px rgba(255,255,255,0.10) inset,
                0 8px 30px rgba(226, 29, 54, 0.32);
              animation: brandPulse 3.4s ease-in-out infinite;
            }

            .brand-mark::after {
              content: "";
              position: absolute;
              inset: -5px;
              border: 1px solid rgba(255, 48, 73, 0.24);
              border-radius: 17px;
              opacity: 0;
              animation: brandRing 3.4s ease-out infinite;
            }

            .brand-name {
              font-size: 15px;
              font-weight: 850;
            }

            .brand-sub {
              margin-top: 2px;
              color: var(--muted);
              font-size: 12px;
              white-space: nowrap;
            }

            .complete-pill {
              flex: 0 0 auto;
              display: inline-flex;
              align-items: center;
              gap: 8px;
              min-height: 36px;
              padding: 0 12px;
              border-radius: 999px;
              border: 1px solid rgba(47, 212, 122, 0.20);
              background: rgba(47, 212, 122, 0.07);
              color: #b8f5d2;
              font-size: 12px;
              font-weight: 800;
            }

            .complete-dot {
              width: 7px;
              height: 7px;
              border-radius: 50%;
              background: var(--green);
              box-shadow: 0 0 14px rgba(47, 212, 122, 0.75);
              animation: statusPulse 1.9s ease-in-out infinite;
            }

            .ad-slot {
              position: relative;
              min-width: 0;
              overflow: hidden;
              display: grid;
              place-items: center;
              text-align: center;
              color: #6e6e76;
              border: 1px dashed rgba(255,255,255,0.10);
              background: linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.012));
              border-radius: 15px;
            }

            .ad-slot::before {
              content: "";
              position: absolute;
              inset: 0;
              transform: translateX(-120%);
              background: linear-gradient(90deg, transparent, rgba(255,255,255,0.035), transparent);
              animation: adSweep 7s linear infinite;
            }

            .ad-copy {
              position: relative;
              z-index: 1;
              display: grid;
              gap: 3px;
              padding: 8px;
            }

            .ad-copy span {
              font-size: 9px;
              font-weight: 800;
              letter-spacing: 0.18em;
              text-transform: uppercase;
              color: #55555d;
            }

            .ad-copy strong {
              font-size: 11px;
              color: #777780;
            }

            .ad-copy small {
              font-size: 9px;
              color: #505058;
            }

            .ad-leaderboard {
              width: min(970px, 100%);
              min-height: 92px;
              margin: 0 auto 16px;
            }

            .compact-banner {
              width: min(320px, 100%);
              min-height: 52px;
              margin: 0 auto 16px;
            }

            .compact-banner iframe {
              max-width: 100%;
            }

            .panel-ad {
              width: 100%;
              min-height: 92px;
              margin: 0;
            }

            .panel-ad.tall {
              min-height: 180px;
            }

            .ad-pair-grid {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 16px;
            }

            .ad-pair-grid .ad-slot {
              min-height: 120px;
            }

            .rail-stack {
              display: grid;
              gap: 16px;
            }

            .rail-primary { min-height: 600px !important; }
            .rail-secondary { min-height: 250px !important; }

            .result-grid {
              display: grid;
              grid-template-columns: minmax(0, 1fr);
              grid-template-areas: "main";
              gap: 16px;
              align-items: start;
            }

            .result-rail-shell {
              display: none;
              min-width: 0;
              min-height: 600px;
              position: sticky;
              top: 18px;
            }
            .result-rail-shell .ad-slot { width: 100%; }

            .center-column {
              grid-area: main;
              min-width: 0;
              width: 100%;
              max-width: 1040px;
              margin: 0 auto;
              display: grid;
              gap: 16px;
            }

            .hero-card,
            .key-card,
            .info-card {
              border: 1px solid var(--line);
              background: rgba(15, 15, 18, 0.88);
              box-shadow: 0 18px 50px rgba(0,0,0,0.22);
            }

            .hero-card {
              position: relative;
              overflow: hidden;
              isolation: isolate;
              padding: clamp(24px, 4vw, 42px);
              border-radius: 26px;
              background: linear-gradient(145deg, rgba(24,24,28,0.96), rgba(13,13,15,0.96));
              box-shadow: var(--shadow);
              animation: cardEnter 650ms cubic-bezier(.2,.75,.25,1) both;
            }

            .hero-card::before {
              content: "";
              position: absolute;
              z-index: -1;
              width: 470px;
              height: 470px;
              right: -230px;
              top: -260px;
              border-radius: 50%;
              background: radial-gradient(circle, rgba(47,212,122,0.16), rgba(255,48,73,0.08) 40%, transparent 68%);
              animation: glowDrift 7s ease-in-out infinite;
            }

            .hero-card::after {
              content: "";
              position: absolute;
              left: 0;
              right: 0;
              top: 0;
              height: 1px;
              background: linear-gradient(90deg, transparent, var(--green), var(--red-bright), transparent);
              opacity: 0.65;
            }

            .eyebrow-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 14px;
              margin-bottom: 22px;
            }

            .eyebrow {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              min-height: 29px;
              padding: 0 10px;
              border-radius: 999px;
              color: #b8f5d2;
              background: rgba(47,212,122,0.08);
              border: 1px solid rgba(47,212,122,0.18);
              font-size: 10px;
              font-weight: 850;
              letter-spacing: 0.12em;
              text-transform: uppercase;
            }

            .eyebrow-dot {
              width: 6px;
              height: 6px;
              border-radius: 50%;
              background: var(--green);
              box-shadow: 0 0 10px rgba(47,212,122,0.75);
            }

            .step-chip {
              color: #aaaab2;
              font-size: 12px;
              font-weight: 800;
            }

            .hero-title {
              max-width: 780px;
              margin: 0;
              font-size: clamp(36px, 6vw, 66px);
              line-height: 0.98;
              letter-spacing: -0.055em;
              font-weight: 900;
            }

            .hero-title .accent {
              color: var(--green);
              text-shadow: 0 0 30px rgba(47,212,122,0.20);
            }

            .hero-description {
              max-width: 700px;
              margin: 18px 0 0;
              color: #a7a7af;
              font-size: clamp(14px, 2vw, 16px);
              line-height: 1.72;
            }

            .progress-wrap {
              margin-top: 30px;
              padding: 18px;
              border-radius: 18px;
              border: 1px solid var(--line);
              background: rgba(0,0,0,0.18);
            }

            .progress-head {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 10px;
              margin-bottom: 14px;
            }

            .progress-head strong {
              font-size: 12px;
            }

            .progress-head span {
              color: #76eda8;
              font-size: 11px;
              font-weight: 800;
            }

            .progress-track {
              position: relative;
              height: 2px;
              margin: 19px 18px 13px;
              background: #29292e;
            }

            .progress-track-fill {
              position: absolute;
              inset: 0;
              width: 100%;
              background: linear-gradient(90deg, #8b0e20, var(--red-bright), var(--green));
              box-shadow: 0 0 16px rgba(47,212,122,0.28);
              animation: progressGlow 2.6s ease-in-out infinite;
            }

            .progress-nodes {
              position: absolute;
              inset: 50% 0 auto 0;
              transform: translateY(-50%);
              display: flex;
              align-items: center;
              justify-content: space-between;
            }

            .progress-node {
              width: 29px;
              height: 29px;
              display: grid;
              place-items: center;
              border-radius: 50%;
              border: 2px solid rgba(47,212,122,0.65);
              background: rgba(47,212,122,0.12);
              color: #76eda8;
              font-size: 11px;
              font-weight: 900;
              box-shadow: 0 0 18px rgba(47,212,122,0.15);
            }

            .progress-labels {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              margin-top: 25px;
              color: #777780;
              font-size: 10px;
              font-weight: 800;
              letter-spacing: 0.04em;
              text-transform: uppercase;
            }

            .progress-labels span:nth-child(2) {
              text-align: center;
            }

            .progress-labels span:last-child {
              text-align: right;
            }

            .key-card {
              position: relative;
              overflow: hidden;
              padding: clamp(24px, 4vw, 36px);
              border-radius: 24px;
              animation: cardEnter 650ms 80ms cubic-bezier(.2,.75,.25,1) both;
            }

            .key-card::before {
              content: "";
              position: absolute;
              width: 320px;
              height: 320px;
              right: -180px;
              bottom: -210px;
              border-radius: 50%;
              background: radial-gradient(circle, rgba(226,29,54,0.17), transparent 66%);
              pointer-events: none;
            }

            .section-kicker {
              color: var(--red-bright);
              font-size: 10px;
              font-weight: 850;
              letter-spacing: 0.14em;
              text-transform: uppercase;
            }

            .section-title {
              margin: 8px 0 5px;
              font-size: clamp(24px, 4vw, 34px);
              letter-spacing: -0.035em;
            }

            .section-copy {
              margin: 0 0 22px;
              color: var(--muted);
              font-size: 13px;
              line-height: 1.65;
            }

            .key-box {
              position: relative;
              display: flex;
              align-items: center;
              gap: 12px;
              min-width: 0;
              padding: 18px;
              border-radius: 17px;
              border: 1px solid rgba(255,48,73,0.22);
              background: linear-gradient(145deg, rgba(9,9,10,0.96), rgba(17,12,14,0.96));
              box-shadow:
                0 0 0 1px rgba(255,255,255,0.025) inset,
                0 18px 45px rgba(0,0,0,0.28);
            }

            .key-value {
              min-width: 0;
              flex: 1 1 auto;
              overflow-wrap: anywhere;
              color: #fff;
              font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
              font-size: clamp(14px, 2vw, 17px);
              font-weight: 800;
              letter-spacing: 0.02em;
              text-shadow: 0 0 18px rgba(255,48,73,0.13);
            }

            .copy-button {
              position: relative;
              overflow: hidden;
              flex: 0 0 auto;
              min-width: 132px;
              min-height: 48px;
              border: 0;
              border-radius: 13px;
              color: white;
              background: linear-gradient(145deg, #ff3049, #b60f25 56%, #780914);
              box-shadow: 0 12px 32px rgba(226,29,54,0.28);
              cursor: pointer;
              font-size: 13px;
              font-weight: 850;
              transition: 190ms ease;
            }

            .copy-button::before {
              content: "";
              position: absolute;
              width: 90px;
              height: 160px;
              left: -120px;
              top: -60px;
              transform: rotate(18deg);
              background: linear-gradient(90deg, transparent, rgba(255,255,255,0.24), transparent);
              transition: left 500ms ease;
            }

            .copy-button:hover {
              transform: translateY(-2px);
              box-shadow: 0 16px 40px rgba(226,29,54,0.38);
            }

            .copy-button:hover::before {
              left: calc(100% + 40px);
            }

            .copy-button.copied {
              background: linear-gradient(145deg, #36d984, #168f55);
              box-shadow: 0 14px 38px rgba(47,212,122,0.24);
            }

            .key-meta {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 12px;
              margin-top: 14px;
            }

            .meta-card {
              min-width: 0;
              padding: 14px;
              border: 1px solid var(--line);
              border-radius: 14px;
              background: rgba(255,255,255,0.025);
            }

            .meta-label {
              color: #67676f;
              font-size: 9px;
              font-weight: 850;
              letter-spacing: 0.12em;
              text-transform: uppercase;
            }

            .meta-value {
              margin-top: 6px;
              color: #dcdce1;
              font-size: 12px;
              font-weight: 800;
            }

            .meta-value.live {
              color: #b8f5d2;
            }

            .info-grid {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              gap: 12px;
            }

            .info-card {
              min-width: 0;
              min-height: 124px;
              padding: 17px;
              border-radius: 17px;
              animation: cardEnter 650ms 150ms cubic-bezier(.2,.75,.25,1) both;
            }

            .info-number {
              color: var(--red-bright);
              font-size: 10px;
              font-weight: 900;
              letter-spacing: 0.12em;
            }

            .info-card strong {
              display: block;
              margin-top: 10px;
              font-size: 12px;
            }

            .info-card p {
              margin: 6px 0 0;
              color: #707078;
              font-size: 10px;
              line-height: 1.55;
            }

            .footer-ad-grid {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 16px;
            }

            .footer-ad-grid .ad-slot {
              min-height: 90px;
            }

            .mobile-ad {
              display: none;
              min-height: 100px;
            }

            .page-footer {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
              padding: 2px 4px;
              color: #55555c;
              font-size: 10px;
            }

            .page-footer strong {
              color: #76767e;
            }

            @keyframes cardEnter {
              from { opacity: 0; transform: translateY(16px) scale(0.99); }
              to { opacity: 1; transform: translateY(0) scale(1); }
            }

            @keyframes finalHalo {
              0%, 100% { transform: translateY(0) scale(1); }
              50% { transform: translateY(22px) scale(1.04); }
            }

            @keyframes glowDrift {
              0%, 100% { transform: translate(0,0); }
              50% { transform: translate(-26px,20px); }
            }

            @keyframes brandPulse {
              0%, 100% { box-shadow: 0 8px 30px rgba(226,29,54,0.28); }
              50% { box-shadow: 0 8px 42px rgba(226,29,54,0.48); }
            }

            @keyframes brandRing {
              0% { opacity: 0; transform: scale(0.86); }
              24% { opacity: 0.7; }
              70%, 100% { opacity: 0; transform: scale(1.16); }
            }

            @keyframes statusPulse {
              0%, 100% { opacity: 0.65; transform: scale(0.9); }
              50% { opacity: 1; transform: scale(1.12); }
            }

            @keyframes progressGlow {
              0%, 100% { filter: brightness(0.90); }
              50% { filter: brightness(1.25); }
            }

            @keyframes adSweep {
              0% { transform: translateX(-120%); }
              45%, 100% { transform: translateX(120%); }
            }

            @media (min-width: 1500px) {
              .result-grid {
                grid-template-columns: 160px minmax(0, 1fr) 160px;
                grid-template-areas: "left main right";
              }

              .result-rail-shell {
                display: block;
              }

              .result-left-rail { grid-area: left; }
              .result-right-rail { grid-area: right; }
            }

            @media (max-width: 780px) {
              .page-shell {
                width: min(100% - 18px, 720px);
                padding-top: 10px;
              }

              .topbar {
                min-height: 58px;
                padding: 8px 10px;
                border-radius: 14px;
              }

              .brand-mark {
                width: 38px;
                height: 38px;
                border-radius: 11px;
              }

              .brand-sub {
                display: none;
              }

              .complete-pill {
                padding: 0 9px;
              }

              .hero-card,
              .key-card {
                border-radius: 20px;
              }

              .hero-title {
                font-size: clamp(34px, 11vw, 52px);
              }

              .key-box {
                align-items: stretch;
                flex-direction: column;
              }

              .copy-button {
                width: 100%;
                min-width: 0;
              }

              .key-meta,
              .info-grid,
              .footer-ad-grid,
              .ad-pair-grid {
                grid-template-columns: minmax(0, 1fr);
              }

              .mobile-ad {
                display: grid;
              }

              .page-footer {
                align-items: flex-start;
                flex-direction: column;
              }
            }

            @media (prefers-reduced-motion: reduce) {
              *,
              *::before,
              *::after {
                animation-duration: 0.001ms !important;
                animation-iteration-count: 1 !important;
                scroll-behavior: auto !important;
              }
            }
          </style>
        </head>

        <body>

          <div class="page-shell">
            <header class="topbar">
              <div class="brand">
                <div class="brand-mark">AH</div>
                <div>
                  <div class="brand-name">Alter Hub</div>
                  <div class="brand-sub">Secure Key Verification</div>
                </div>
              </div>

              <div class="complete-pill">
                <span class="complete-dot"></span>
                Verification Complete
              </div>
            </header>

            <!-- ADSTERRA: final-top-leaderboard -->
<div class="ad-slot ad-leaderboard" data-ad-slot="final-top-leaderboard">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '510441b68afe63cde32426e4f9a64477',
      'format' : 'iframe',
      'height' : 90,
      'width' : 728,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/510441b68afe63cde32426e4f9a64477/invoke.js"></script>
</div>

            <div class="result-grid">
              <aside class="result-rail-shell result-left-rail" aria-label="Advertisements">
  <div class="rail-stack">
    <!-- ADSTERRA: final-left-rail -->
<div class="ad-slot rail-primary" data-ad-slot="final-left-rail">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '5a699b5e53a24d4894357c7b7701963a',
      'format' : 'iframe',
      'height' : 600,
      'width' : 160,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/5a699b5e53a24d4894357c7b7701963a/invoke.js"></script>
</div>
    <!-- ADSTERRA: final-left-rail-secondary -->
<div class="ad-slot rail-secondary" data-ad-slot="final-left-rail-secondary">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '3e399fd351c6a3da604f8a9ec10d75a1',
      'format' : 'iframe',
      'height' : 300,
      'width' : 160,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/3e399fd351c6a3da604f8a9ec10d75a1/invoke.js"></script>
</div>
  </div>
</aside>

              <main class="center-column">
                <section class="hero-card">
                  <div class="eyebrow-row">
                    <div class="eyebrow">
                      <span class="eyebrow-dot"></span>
                      Verification successful
                    </div>
                    <div class="step-chip">3 / 3 Complete</div>
                  </div>

                  <h1 class="hero-title">
                    Verification complete<span class="accent">.</span>
                  </h1>

                  <p class="hero-description">
                    All three Alter Hub checkpoints have been completed successfully. Your key is ready below.
                    Keep it private and redeem it on the same device used for verification.
                  </p>

                  <div class="progress-wrap">
                    <div class="progress-head">
                      <strong>Verification progress</strong>
                      <span>Complete</span>
                    </div>

                    <div class="progress-track">
                      <div class="progress-track-fill"></div>
                      <div class="progress-nodes">
                        <div class="progress-node">✓</div>
                        <div class="progress-node">✓</div>
                        <div class="progress-node">✓</div>
                      </div>
                    </div>

                    <div class="progress-labels">
                      <span>Start</span>
                      <span>Verify</span>
                      <span>Finish</span>
                    </div>
                  </div>
                </section>

                <!-- ADSTERRA: final-between-hero-key -->
<div class="ad-slot panel-ad" data-ad-slot="final-between-hero-key">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '5ca9db4475da01935a98a11e45151c0c',
      'format' : 'iframe',
      'height' : 90,
      'width' : 728,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/5ca9db4475da01935a98a11e45151c0c/invoke.js"></script>
</div>

                <div class="ad-pair-grid" aria-label="Advertisements">
                  <!-- ADSTERRA: final-completion-pair-left -->
<div class="ad-slot " data-ad-slot="final-completion-pair-left">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '687f9bf984adb7aa6526a7ede3d1de49',
      'format' : 'iframe',
      'height' : 250,
      'width' : 300,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/687f9bf984adb7aa6526a7ede3d1de49/invoke.js"></script>
</div>
                  <!-- ADSTERRA: final-completion-pair-right -->
<div class="ad-slot " data-ad-slot="final-completion-pair-right">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : 'c2a00c4dd904e5b5cc800b84c4745611',
      'format' : 'iframe',
      'height' : 250,
      'width' : 300,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/c2a00c4dd904e5b5cc800b84c4745611/invoke.js"></script>
</div>
                </div>

                <section class="key-card">
                  <div class="section-kicker">Your generated key</div>
                  <h2 class="section-title">Alter Hub key ready</h2>
                  <p class="section-copy">
                    Copy the key below and return to Alter Hub. The timer begins when this key is generated.
                  </p>

                  <div class="key-box">
                    <div class="key-value" id="key">${escapeHtml(session.final_key)}</div>
                    <button class="copy-button" id="copyButton" type="button" disabled>Copy Key</button>
                  </div>

                  <div class="key-meta">
                    <div class="meta-card">
                      <div class="meta-label">Key status</div>
                      <div class="meta-value live">Active &amp; ready</div>
                    </div>

                    <div class="meta-card">
                      <div class="meta-label">Time remaining</div>
                      <div class="meta-value" id="countdown">Calculating...</div>
                    </div>
                  </div>

                  <!-- ADSTERRA: final-key-panel-native -->
<div class="ad-slot panel-ad" data-ad-slot="final-key-panel-native" style="margin-top:16px;">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '89ac587bfdfe86f95d12414831c0f7ad',
      'format' : 'iframe',
      'height' : 250,
      'width' : 300,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/89ac587bfdfe86f95d12414831c0f7ad/invoke.js"></script>
</div>

                  <!-- ADSTERRA: final-key-panel-secondary -->
<div class="ad-slot panel-ad" data-ad-slot="final-key-panel-secondary" style="margin-top:16px;">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '5c01b4ecc07d6a050b84475efc2504c4',
      'format' : 'iframe',
      'height' : 250,
      'width' : 300,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/5c01b4ecc07d6a050b84475efc2504c4/invoke.js"></script>
</div>
                </section>

                <!-- ADSTERRA: final-between-key-info -->
<div class="ad-slot panel-ad" data-ad-slot="final-between-key-info">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : 'fb6b5faf61603702c762699c66d86cfe',
      'format' : 'iframe',
      'height' : 90,
      'width' : 728,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/fb6b5faf61603702c762699c66d86cfe/invoke.js"></script>
</div>

                <section class="info-grid" aria-label="Key information">
                  <div class="info-card">
                    <div class="info-number">01</div>
                    <strong>Keep your key private</strong>
                    <p>Do not post or share your generated key. Treat it like a temporary credential.</p>
                  </div>

                  <div class="info-card">
                    <div class="info-number">02</div>
                    <strong>Use the same device</strong>
                    <p>Device checks protect the verification flow and help prevent key sharing.</p>
                  </div>

                  <div class="info-card">
                    <div class="info-number">03</div>
                    <strong>Watch the timer</strong>
                    <p>Redeem the key before the remaining time reaches zero.</p>
                  </div>
                </section>

                <div class="ad-pair-grid" aria-label="Advertisements">
                  <!-- ADSTERRA: final-info-break-left -->
<div class="ad-slot " data-ad-slot="final-info-break-left">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : 'a1d8590d1ad23e0d951921421e5b4364',
      'format' : 'iframe',
      'height' : 250,
      'width' : 300,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/a1d8590d1ad23e0d951921421e5b4364/invoke.js"></script>
</div>
                  <!-- ADSTERRA: final-info-break-right -->
<div class="ad-slot " data-ad-slot="final-info-break-right">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '437029fb951fcb0ceef3026887cf2f11',
      'format' : 'iframe',
      'height' : 250,
      'width' : 300,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/437029fb951fcb0ceef3026887cf2f11/invoke.js"></script>
</div>
                </div>

                <!-- ADSTERRA: final-between-info-lower -->
<div class="ad-slot panel-ad tall" data-ad-slot="final-between-info-lower">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '93256b403dbf313c197ce9bef66529b3',
      'format' : 'iframe',
      'height' : 90,
      'width' : 728,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/93256b403dbf313c197ce9bef66529b3/invoke.js"></script>
</div>

                <div class="footer-ad-grid" aria-label="Advertisements">
                  <!-- ADSTERRA: final-lower-left -->
<div class="ad-slot " data-ad-slot="final-lower-left">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : 'cfde3b064970f5aa070f1f82468e61f8',
      'format' : 'iframe',
      'height' : 250,
      'width' : 300,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/cfde3b064970f5aa070f1f82468e61f8/invoke.js"></script>
</div>
                  <!-- ADSTERRA: final-lower-right -->
<div class="ad-slot " data-ad-slot="final-lower-right">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '687f9bf984adb7aa6526a7ede3d1de49',
      'format' : 'iframe',
      'height' : 250,
      'width' : 300,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/687f9bf984adb7aa6526a7ede3d1de49/invoke.js"></script>
</div>
                </div>

                <!-- ADSTERRA: final-mobile-banner -->
<div class="ad-slot mobile-ad" data-ad-slot="final-mobile-banner">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '6ba9ead7c07c2157adaa34b8c0085f93',
      'format' : 'iframe',
      'height' : 50,
      'width' : 320,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/6ba9ead7c07c2157adaa34b8c0085f93/invoke.js"></script>
</div>

                <!-- ADSTERRA: final-before-footer -->
<div class="ad-slot panel-ad" data-ad-slot="final-before-footer">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : 'b5ec075b4fe347ebcf7fc5fe33c4b73f',
      'format' : 'iframe',
      'height' : 90,
      'width' : 728,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/b5ec075b4fe347ebcf7fc5fe33c4b73f/invoke.js"></script>
</div>

                <footer class="page-footer">
                  <span><strong>Alter Hub</strong> • Verification complete</span>
                  <span>You can close this page after copying your key.</span>
                </footer>
              </main>

              <aside class="result-rail-shell result-right-rail" aria-label="Advertisements">
  <div class="rail-stack">
    <!-- ADSTERRA: final-right-rail -->
<div class="ad-slot rail-primary" data-ad-slot="final-right-rail">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '5e44863175d7f91cdfa7b4061ac293d4',
      'format' : 'iframe',
      'height' : 600,
      'width' : 160,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/5e44863175d7f91cdfa7b4061ac293d4/invoke.js"></script>
</div>
    <!-- ADSTERRA: final-right-rail-secondary -->
<div class="ad-slot rail-secondary" data-ad-slot="final-right-rail-secondary">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '3e399fd351c6a3da604f8a9ec10d75a1',
      'format' : 'iframe',
      'height' : 300,
      'width' : 160,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/3e399fd351c6a3da604f8a9ec10d75a1/invoke.js"></script>
</div>
  </div>
</aside>
            </div>

            <!-- ADSTERRA: final-bottom-leaderboard -->
<div class="ad-slot ad-leaderboard" data-ad-slot="final-bottom-leaderboard" style="margin-top:16px; margin-bottom:0;">
  <script data-cfasync="false" type="text/javascript">
    atOptions = {
      'key' : '22a86f4d46beeee6ee84bb61167aa3e9',
      'format' : 'iframe',
      'height' : 90,
      'width' : 728,
      'params' : {}
    };
  </script>
  <script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/22a86f4d46beeee6ee84bb61167aa3e9/invoke.js"></script>
</div>
          </div>

          <!-- ADSTERRA: POPUNDER / FIRST INTERACTION -->
<script data-cfasync="false" type="text/javascript" src="https://regrettablewageralways.com/3c/b6/6e/3cb66e10b6664867e3c2e208dba45c5c.js"></script>

          <script>
            const key = document.getElementById("key").textContent;
            const copyButton = document.getElementById("copyButton");
            const expiresAt = ${Number(session.key_expires_at)};
            const countdownEl = document.getElementById("countdown");

            copyButton.disabled = false;

            copyButton.addEventListener("click", async function() {
              copyButton.disabled = true;
              try {
                await navigator.clipboard.writeText(key);
                copyButton.textContent = "Copied!";
                copyButton.classList.add("copied");
              } catch (error) {
                copyButton.textContent = "Copy manually";
              }

              setTimeout(function() {
                copyButton.textContent = "Copy Key";
                copyButton.classList.remove("copied");
                copyButton.disabled = false;
              }, 1300);
            });

            function formatRemaining(ms) {
              if (ms <= 0) return "Expired";
              let totalSeconds = Math.floor(ms / 1000);
              const days = Math.floor(totalSeconds / 86400);
              totalSeconds %= 86400;
              const hours = Math.floor(totalSeconds / 3600);
              totalSeconds %= 3600;
              const minutes = Math.floor(totalSeconds / 60);
              const seconds = totalSeconds % 60;
              if (days >= 1) return days + "d " + hours + "h " + minutes + "m " + seconds + "s";
              if (hours >= 1) return hours + "h " + minutes + "m " + seconds + "s";
              if (minutes >= 1) return minutes + "m " + seconds + "s";
              return seconds + "s";
            }

            function updateCountdown() {
              const remaining = expiresAt - Date.now();
              countdownEl.textContent = formatRemaining(remaining);
              if (remaining <= 0) copyButton.disabled = true;
            }

            updateCountdown();
            setInterval(updateCountdown, 1000);
          </script>



        </body>
        </html>
      `);
    }


    // =====================================================
    // LOOTLABS COMPLETION CALLBACK
    // GET /lootlabs/complete/CHECKPOINT_TOKEN
    // =====================================================

    const lootlabsCompleteMatch =
      url.pathname.match(
        /^\/lootlabs\/complete\/([a-fA-F0-9]{32})$/
      );


    if (
      request.method === "GET" &&
      lootlabsCompleteMatch
    ) {

      const checkpointToken =
        lootlabsCompleteMatch[1];


      // Read browser cookie
      const cookieHeader =
        request.headers.get("Cookie") || "";

      const cookieToken =
        getCookie(cookieHeader, "ah_ll");


      // The browser that started the checkpoint
      // should also have the matching cookie.
      if (
        !cookieToken ||
        cookieToken !== checkpointToken
      ) {

        return html(`
          <h1>Verification Failed</h1>

          <p>
            This LootLabs checkpoint does not belong
            to this browser session.
          </p>
        `, 403);
      }


      // Find the session that owns this token
      const session =
        await env.DB.prepare(`
          SELECT
            id,
            roblox_user_id,
            expires_at,
            status,
            step,
            checkpoint_provider,
            checkpoint_token

          FROM sessions

          WHERE
            checkpoint_token = ?
            AND checkpoint_provider = 'lootlabs'

          LIMIT 1
        `)

        .bind(checkpointToken)

        .first();


      if (!session) {

        await recordCheckpointFunnelStatus(
          env,
          checkpointToken,
          "failed",
          "lootlabs_session_not_found"
        );

        return html(`
          <h1>Verification Failed</h1>

          <p>
            This LootLabs checkpoint is no longer valid.
          </p>
        `, 403);
      }


      // Check expiry
      if (
        !session.expires_at ||
        Date.now() > Number(session.expires_at)
      ) {
        await recordCheckpointFunnelStatus(
          env,
          checkpointToken,
          "abandoned",
          "session_expired"
        );

        return html(`
          <h1>Session Expired</h1>
          <p>Please generate a new Alter Hub key link.</p>
        `, 410);
      }


      if (session.status !== "pending") {

        await recordCheckpointFunnelStatus(
          env,
          checkpointToken,
          "failed",
          "lootlabs_session_unavailable"
        );

        return html(`
          <h1>Session Unavailable</h1>

          <p>
            This session is no longer active.
          </p>
        `, 409);
      }


      const sessionId =
        session.id;

      const oldStep =
        Number(session.step);

      const newStep =
        oldStep + 1;


      // Delete browser checkpoint cookie
      const clearCookie =
        "ah_ll=; " +
        "Path=/lootlabs; " +
        "HttpOnly; " +
        "Secure; " +
        "SameSite=Lax; " +
        "Max-Age=0";


      // =====================================================
      // FINAL CHECKPOINT
      // =====================================================

      if (newStep >= 3) {

        const resultId =
          crypto.randomUUID().replaceAll("-", "");

        const finalKey =
          generateKey();
        const keyExpiresAt =
          Date.now() + (12 * 60 * 60 * 1000)


        const update =
        await env.DB.prepare(`
          UPDATE sessions
          SET
            step = 3,
            status = 'completed',
            final_key = ?,
            result_id = ?,
            key_expires_at = ?,
            checkpoint_provider = NULL,
            checkpoint_token = NULL,
            checkpoint_created_at = NULL
          WHERE
            id = ?
            AND status = 'pending'
            AND step = ?
            AND checkpoint_token = ?
        `)
        .bind(
          finalKey,
          resultId,
          keyExpiresAt,
          sessionId,
          oldStep,
          checkpointToken
        )
        .run();


        if (!update.meta?.changes) {

          return html(`
            <h1>Checkpoint Already Used</h1>

            <p>
              This checkpoint has already been processed.
            </p>
          `, 409);
        }

        await recordCheckpointCompletion(
          env,
          sessionId,
          "lootlabs",
          3,
          checkpointToken
        );

        await recordFinalKeyCountry(
          env,
          session.roblox_user_id,
          request.cf?.country
        );


        return new Response(null, {

          status: 302,

          headers: {

            "Location":
              `${url.origin}/result/${resultId}`,

            "Set-Cookie":
              clearCookie

          }

        });
      }


      // =====================================================
      // CHECKPOINT 1 OR 2
      // =====================================================

      const update =
        await env.DB.prepare(`
          UPDATE sessions

          SET
            step = ?,
            checkpoint_provider = NULL,
            checkpoint_token = NULL,
            checkpoint_created_at = NULL

          WHERE
            id = ?
            AND status = 'pending'
            AND step = ?
            AND checkpoint_token = ?
            AND checkpoint_provider = 'lootlabs'
        `)

        .bind(
          newStep,
          sessionId,
          oldStep,
          checkpointToken
        )

        .run();


      if (!update.meta?.changes) {

        return html(`
          <h1>Checkpoint Already Used</h1>

          <p>
            This checkpoint has already been processed.
          </p>
        `, 409);
      }

      await recordCheckpointCompletion(
        env,
        sessionId,
        "lootlabs",
        newStep,
        checkpointToken
      );


      // Back to Alter Hub for next checkpoint
      return new Response(null, {

        status: 302,

        headers: {

          "Location":
            `${url.origin}/key/${sessionId}`,

          "Set-Cookie":
            clearCookie

        }

      });
    }


    // =====================================================
    // REDEEM KEY
    // POST /api/redeem-key
    // =====================================================

    if (
      request.method === "POST" &&
      url.pathname === "/api/redeem-key"
    ) {

      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          success: false,
          error: "Invalid JSON"
        }, 400);
      }
      const redeemRateLimit =
        await checkRedeemRateLimit(
          request,
          env
        );

      if (!redeemRateLimit.allowed) {
        return json({
          success: false,
          error: "Too many key attempts. Please try again later.",
          retry_after_seconds: redeemRateLimit.retryAfter
        }, 429);
      }


      const suppliedKey =
        String(body.key || "").trim();

      const clientId =
        String(body.client_id || "").trim();

      const robloxUserId =
        String(body.roblox_user_id || "").trim();

      const username =
        String(body.username || "").trim();

      if (!suppliedKey || !clientId) {
        return json({
          success: false,
          error: "Key and client ID are required"
        }, 400);
      }
      


      // Turn the supplied ClientId into the same
      // server-side device hash used during session creation.
      const deviceHash =
        await hashDevice(
          clientId,
          env.DEVICE_HASH_SECRET
        );


      // Find the key-system session that generated this key.
      const session =
        await env.DB.prepare(`
          SELECT
            id,
            final_key,
            device_hash,
            key_expires_at,
            access_plan,
            license_duration_ms,
            redeemed_at,
            status
          FROM sessions
          WHERE final_key = ?
          LIMIT 1
        `)
        .bind(suppliedKey)
        .first();


      if (!session) {
        return json({
          success: false,
          error: "Invalid key"
        }, 404);
      }


      if (session.status !== "completed") {
        return json({
          success: false,
          error: "Key is not active"
        }, 403);
      }


      // 12-hour timer started when the key was generated.
      if (
        !session.key_expires_at ||
        Date.now() > Number(session.key_expires_at)
      ) {
        return json({
          success: false,
          error: "Key expired"
        }, 410);
      }


      // The key must be redeemed on the same device
      // that originally created the key-system session.
      if (
        session.device_hash &&
        session.device_hash !== deviceHash
      ) {
        return json({
          success: false,
          error: "This key belongs to another device"
        }, 403);
      }


      // Key was already redeemed before.
      // Allow it again ONLY on the same device.
      if (session.redeemed_at) {

        if (
          !session.device_hash ||
          session.device_hash !== deviceHash
        ) {
          return json({
            success: false,
            error: "This key is bound to another device."
          }, 403);
        }


        const existingLicense = await env.DB.prepare(`
          SELECT
            license_id,
            expires_at,
            revoked
          FROM licenses
          WHERE session_id = ?
            AND device_hash = ?
          LIMIT 1
        `)
          .bind(
            session.id,
            deviceHash
          )
          .first();


        if (!existingLicense) {
          return json({
            success: false,
            error: "Existing license not found."
          }, 404);
        }


        if (Number(existingLicense.revoked) === 1) {
          return json({
            success: false,
            error: "License has been revoked."
          }, 403);
        }


        if (
          !existingLicense.expires_at ||
          Date.now() >= Number(existingLicense.expires_at)
        ) {
          return json({
            success: false,
            error: "Key has expired."
          }, 403);
        }


        await env.DB.prepare(`
          UPDATE licenses
          SET last_seen_at = ?
          WHERE license_id = ?
        `)
          .bind(
            Date.now(),
            existingLicense.license_id
          )
          .run();


          if (
            robloxUserId &&
            username
          ) {
            const now = Date.now();

            await env.DB.prepare(`
              INSERT INTO key_redeemers (
                session_id,
                license_id,
                roblox_user_id,
                username,
                device_hash,
                first_seen_at,
                last_seen_at,
                redeem_count
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, 1)

              ON CONFLICT(
                session_id,
                roblox_user_id,
                device_hash
              )
              DO UPDATE SET
                username = excluded.username,
                license_id = excluded.license_id,
                last_seen_at = excluded.last_seen_at,
                redeem_count = key_redeemers.redeem_count + 1
            `)
            .bind(
              session.id,
              existingLicense.license_id,
              robloxUserId,
              username,
              deviceHash,
              now,
              now
            )
            .run();
          }



        await recordAnalytics(
          env,
          {
            redeems: 1
          }
        );

        return json({
          success: true,
          redeemed: true,
          reused: true,
          license_id: existingLicense.license_id,
          expires_at: Number(existingLicense.expires_at)
        });
      }


      const now =
        Date.now();
      const licenseExpiresAt =
        !session.device_hash
          ? (
              Number(session.license_duration_ms) === 0
                ? 253402300799000
                : now + Number(session.license_duration_ms)
            )
          : Number(session.key_expires_at);

      const previousDeviceLicense =
        await env.DB.prepare(`
          SELECT
            license_id,
            revoked,
            expires_at
          FROM licenses
          WHERE device_hash = ?
          LIMIT 1
        `)
          .bind(deviceHash)
          .first();

      const licenseId =
        crypto.randomUUID().replaceAll("-", "");


      // Create the permanent server-side device license.
      await env.DB.prepare(`
        INSERT INTO licenses
        (
          license_id,
          device_hash,
          session_id,
          created_at,
          last_seen_at,
          revoked,
          expires_at,
          access_plan
        )
        VALUES (?, ?, ?, ?, ?, 0, ?, ?)

        ON CONFLICT(device_hash)
        DO UPDATE SET
          session_id = excluded.session_id,
          last_seen_at = excluded.last_seen_at,
          revoked = 0,
          expires_at = excluded.expires_at,
          access_plan = excluded.access_plan
      `)
        .bind(
          licenseId,
          deviceHash,
          session.id,
          now,
          now,
          licenseExpiresAt,
          session.access_plan || "free"
        )
        .run();

        if (
          robloxUserId &&
          username
        ) {
          const now = Date.now();

          await env.DB.prepare(`
            INSERT INTO key_redeemers (
              session_id,
              license_id,
              roblox_user_id,
              username,
              device_hash,
              first_seen_at,
              last_seen_at,
              redeem_count
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)

            ON CONFLICT(
              session_id,
              roblox_user_id,
              device_hash
            )
            DO UPDATE SET
              username = excluded.username,
              license_id = excluded.license_id,
              last_seen_at = excluded.last_seen_at,
              redeem_count = key_redeemers.redeem_count + 1
          `)
          .bind(
            session.id,
            licenseId,
            robloxUserId,
            username,
            deviceHash,
            now,
            now
          )
          .run();
        }


      // Mark the visible key as redeemed.
      const redemption =
        await env.DB.prepare(`
          UPDATE sessions
          SET
            redeemed_at = ?,
            redeemed_device_hash = ?,
            device_hash = COALESCE(device_hash, ?)
          WHERE
            id = ?
            AND redeemed_at IS NULL
        `)
        .bind(
          now,
          deviceHash,
          deviceHash,
          session.id
        )
        .run();


      if (!redemption.meta?.changes) {
        return json({
          success: false,
          error: "Key has already been redeemed"
        }, 409);
      }


      // Retrieve the actual license ID.
      // This matters if this device already had a license
      // and the ON CONFLICT path updated it.
      const license =
        await env.DB.prepare(`
          SELECT
            license_id,
            expires_at
          FROM licenses
          WHERE device_hash = ?
          LIMIT 1
        `)
        .bind(deviceHash)
        .first();


      const previousWasActive =
        Boolean(previousDeviceLicense) &&
        Number(previousDeviceLicense.revoked) !== 1 &&
        Number(previousDeviceLicense.expires_at) > now;

      await recordAnalytics(
        env,
        {
          redeems: 1,
          license_delta:
            previousWasActive
              ? 0
              : 1,
          licenses_activated:
            previousWasActive
              ? 0
              : 1
        },
        now
      );


      return json({
        success: true,
        redeemed: true,
        license_id: license.license_id,
        expires_at: Number(license.expires_at)
      });
    }




    // =====================================================
    // VALIDATE LICENSE + ISSUE ACCESS TOKEN
    // POST /api/validate-license
    // =====================================================

    if (
      request.method === "POST" &&
      url.pathname === "/api/validate-license"
    ) {

      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          success: false,
          error: "Invalid JSON"
        }, 400);
      }


      const licenseId =
        String(body.license_id || "").trim();

      const clientId =
        String(body.client_id || "").trim();

      const robloxUserId =
        String(body.roblox_user_id || "").trim();

      const username =
        String(body.username || "").trim();


      if (!licenseId || !clientId) {
        return json({
          success: false,
          error: "License ID and client ID are required"
        }, 400);
      }


      // Re-create the device hash from the current device
      const deviceHash =
        await hashDevice(
          clientId,
          env.DEVICE_HASH_SECRET
        );


      // Find the license
      const license =
        await env.DB.prepare(`
          SELECT
            license_id,
            session_id,
            device_hash,
            expires_at,
            revoked,
            access_plan
          FROM licenses
          WHERE license_id = ?
          LIMIT 1
        `)
        .bind(licenseId)
        .first();


      if (!license) {
        return json({
          success: false,
          error: "Invalid license"
        }, 404);
      }


      // Revoked license
      if (Number(license.revoked) === 1) {
        return json({
          success: false,
          error: "License revoked"
        }, 403);
      }


      // Expired license
      const now =
        Date.now();

      if (
        !license.expires_at ||
        now > Number(license.expires_at)
      ) {
        return json({
          success: false,
          error: "License expired"
        }, 410);
      }


      // Wrong device
      if (license.device_hash !== deviceHash) {
        return json({
          success: false,
          error: "License belongs to another device"
        }, 403);
      }

      if (
        robloxUserId &&
        username
      ) {
        const now = Date.now();

        await env.DB.prepare(`
          INSERT INTO key_redeemers (
            session_id,
            license_id,
            roblox_user_id,
            username,
            device_hash,
            first_seen_at,
            last_seen_at,
            redeem_count
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, 0)

          ON CONFLICT(
            session_id,
            roblox_user_id,
            device_hash
          )
          DO UPDATE SET
            username = excluded.username,
            license_id = excluded.license_id,
            last_seen_at = excluded.last_seen_at
        `)
        .bind(
          license.session_id,
          license.license_id,
          robloxUserId,
          username,
          deviceHash,
          now,
          now
        )
        .run();
      }

      // =====================================================
      // CREATE TEMPORARY ACCESS TOKEN
      // =====================================================

      const accessToken =
        generateAccessToken();

      const tokenHash =
        await hashAccessToken(accessToken);


      // Token normally lasts 20 minutes,
      // but NEVER longer than the license itself.
      const normalTokenExpiry =
        now + (20 * 60 * 1000);

      const tokenExpiresAt =
        Math.min(
          normalTokenExpiry,
          Number(license.expires_at)
        );


      // Only keep the newest token for this license/device
      await env.DB.prepare(`
        DELETE FROM access_tokens
        WHERE
          license_id = ?
          AND device_hash = ?
      `)
        .bind(
          licenseId,
          deviceHash
        )
        .run();


      await env.DB.prepare(`
        INSERT INTO access_tokens
        (
          token_hash,
          license_id,
          device_hash,
          created_at,
          expires_at
        )
        VALUES (?, ?, ?, ?, ?)
      `)
        .bind(
          tokenHash,
          licenseId,
          deviceHash,
          now,
          tokenExpiresAt
        )
        .run();


      // Update last-seen time
      await env.DB.prepare(`
        UPDATE licenses
        SET last_seen_at = ?
        WHERE license_id = ?
      `)
        .bind(
          now,
          licenseId
        )
        .run();


      return json({
        success: true,
        valid: true,
        access_token: accessToken,
        expires_at: tokenExpiresAt,
        access_plan: license.access_plan || "free"
      });
    }




    // =====================================================
    // CHECK ACCESS TOKEN
    // POST /api/check-access
    // =====================================================

    if (
      request.method === "POST" &&
      url.pathname === "/api/check-access"
    ) {

      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          success: false,
          error: "Invalid JSON"
        }, 400);
      }

      const accessToken =
        String(body.access_token || "").trim();

      const clientId =
        String(body.client_id || "").trim();

      if (!accessToken || !clientId) {
        return json({
          success: false,
          error: "Access token and client ID are required"
        }, 400);
      }

      const deviceHash =
        await hashDevice(
          clientId,
          env.DEVICE_HASH_SECRET
        );

      const tokenHash =
        await hashAccessToken(
          accessToken
        );

      const token =
        await env.DB.prepare(`
          SELECT
            token_hash,
            license_id,
            device_hash,
            expires_at
          FROM access_tokens
          WHERE token_hash = ?
          LIMIT 1
        `)
        .bind(tokenHash)
        .first();

      if (!token) {
        return json({
          success: false,
          access: false,
          error: "Invalid access token"
        }, 404);
      }

      const now =
        Date.now();

      if (
        now > Number(token.expires_at)
      ) {

        await env.DB.prepare(`
          DELETE FROM access_tokens
          WHERE token_hash = ?
        `)
          .bind(tokenHash)
          .run();

        return json({
          success: false,
          access: false,
          error: "Access token expired"
        }, 410);
      }

      if (
        token.device_hash !== deviceHash
      ) {
        return json({
          success: false,
          access: false,
          error: "Access token belongs to another device"
        }, 403);
      }

      const license =
        await env.DB.prepare(`
          SELECT
            license_id,
            device_hash,
            expires_at,
            revoked
          FROM licenses
          WHERE license_id = ?
          LIMIT 1
        `)
        .bind(token.license_id)
        .first();

      if (!license) {
        return json({
          success: false,
          access: false,
          error: "License not found"
        }, 404);
      }

      if (Number(license.revoked) === 1) {
        return json({
          success: false,
          access: false,
          error: "License revoked"
        }, 403);
      }

      if (
        now > Number(license.expires_at)
      ) {
        return json({
          success: false,
          access: false,
          error: "License expired"
        }, 410);
      }

      if (
        license.device_hash !== deviceHash
      ) {
        return json({
          success: false,
          access: false,
          error: "License belongs to another device"
        }, 403);
      }

      return json({
        success: true,
        access: true,
        license_id: license.license_id,
        token_expires_at: Number(token.expires_at),
        license_expires_at: Number(license.expires_at)
      });
    }

    // =====================================================
    // CREATE ONE-TIME SCRIPT TICKET
    // POST /api/script-ticket
    // =====================================================

    if (
      request.method === "POST" &&
      url.pathname === "/api/script-ticket"
    ) {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          success: false,
          error: "Invalid request body."
        }, 400);
      }

      const accessToken =
        String(body.access_token || "").trim();

      const clientId =
        String(body.client_id || "").trim();

      const placeId =
        String(body.place_id || "").trim();

      // Bind an explicit allowlisted module to the one-time ticket.
      // Omitting script_name preserves the existing place-based loader.
      const scriptName = body.script_name === undefined
        ? "game"
        : body.script_name;

      if (!["game", "Universal", "ESP"].includes(scriptName)) {
        return json({success: false, error: "Unsupported script selection."}, 400);
      }

      if (
        !accessToken ||
        !accessToken.startsWith("AT_") ||
        !clientId ||
        !placeId
      ) {
        return json({
          success: false,
          error: "Missing or invalid credentials."
        }, 400);
      }


      const now = Date.now();

      const deviceHash =
        await hashDevice(
          clientId,
          env.DEVICE_HASH_SECRET
        );

      const tokenHash =
        await hashAccessToken(
          accessToken
        );


      // Check AT_ token
      const token =
        await env.DB.prepare(`
          SELECT
            license_id,
            device_hash,
            expires_at
          FROM access_tokens
          WHERE token_hash = ?
          LIMIT 1
        `)
        .bind(tokenHash)
        .first();


      if (!token) {
        return json({
          success: false,
          error: "Access denied."
        }, 403);
      }


      if (
        Number(token.expires_at) <= now ||
        token.device_hash !== deviceHash
      ) {
        return json({
          success: false,
          error: "Access denied."
        }, 403);
      }


      // Check license
      const license =
        await env.DB.prepare(`
          SELECT
            license_id,
            device_hash,
            expires_at,
            revoked
          FROM licenses
          WHERE license_id = ?
          LIMIT 1
        `)
        .bind(token.license_id)
        .first();


      if (!license) {
        return json({
          success: false,
          error: "Access denied."
        }, 403);
      }


      if (
        Number(license.revoked) === 1 ||
        Number(license.expires_at) <= now ||
        license.device_hash !== deviceHash
      ) {
        return json({
          success: false,
          error: "Access denied."
        }, 403);
      }


      // Create ticket
      const scriptTicket =
        generateScriptTicket();

      const ticketHash =
        await hashAccessToken(
          scriptTicket
        );

      // Ticket lasts only 30 seconds
      const ticketExpiresAt =
        Math.min(
          now + (30 * 1000),
          Number(license.expires_at)
        );


      // Remove old tickets for this license/device
      await env.DB.prepare(`
        DELETE FROM script_tickets
        WHERE license_id = ?
          AND device_hash = ?
      `)
        .bind(
          license.license_id,
          deviceHash
        )
        .run();


      // Save only HASH, never raw ST_
      await env.DB.prepare(`
        INSERT INTO script_tickets (
          ticket_hash,
          license_id,
          device_hash,
          place_id,
          script_name,
          created_at,
          expires_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          ticketHash,
          license.license_id,
          deviceHash,
          placeId,
          scriptName,
          now,
          ticketExpiresAt
        )
        .run();


      return json({
        success: true,
        script_ticket: scriptTicket,
        script_name: scriptName,
        expires_at: ticketExpiresAt
      });
    }
    // =====================================================
    // GET PRIVATE SCRIPT USING ONE-TIME TICKET
    // POST /api/get-script
    // =====================================================

    if (
      request.method === "POST" &&
      url.pathname === "/api/get-script"
    ) {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          success: false,
          error: "Invalid request body."
        }, 400);
      }


      const scriptTicket =
        String(body.script_ticket || "").trim();

      const clientId =
        String(body.client_id || "").trim();


      if (
        !scriptTicket ||
        !scriptTicket.startsWith("ST_") ||
        !clientId
      ) {
        return json({
          success: false,
          error: "Missing or invalid credentials."
        }, 400);
      }


      const now = Date.now();

      const deviceHash =
        await hashDevice(
          clientId,
          env.DEVICE_HASH_SECRET
        );

      const ticketHash =
        await hashAccessToken(
          scriptTicket
        );


      // =====================================================
      // ATOMICALLY CONSUME TICKET
      // Once this succeeds, the ST_ can NEVER be reused.
      // =====================================================

      const ticket =
        await env.DB.prepare(`
          DELETE FROM script_tickets
          WHERE ticket_hash = ?
            AND device_hash = ?
            AND expires_at > ?
          RETURNING
            license_id,
            device_hash,
            place_id,
            script_name,
            expires_at
        `)
        .bind(
          ticketHash,
          deviceHash,
          now
        )
        .first();


      if (!ticket) {
        return json({
          success: false,
          error: "Invalid, expired, or already used script ticket."
        }, 403);
      }


      // =====================================================
      // VERIFY LICENSE IS STILL VALID
      // =====================================================

      const license =
        await env.DB.prepare(`
          SELECT
            license_id,
            device_hash,
            expires_at,
            revoked,
            access_plan
          FROM licenses
          WHERE license_id = ?
          LIMIT 1
        `)
        .bind(ticket.license_id)
        .first();


      if (!license) {
        return json({
          success: false,
          error: "Access denied."
        }, 403);
      }


      if (
        Number(license.revoked) === 1 ||
        Number(license.expires_at) <= now ||
        license.device_hash !== deviceHash
      ) {
        return json({
          success: false,
          error: "Access denied."
        }, 403);
      }


      // The PlaceId comes from the ticket itself.
      // Client cannot change it after the ticket was issued.
      const placeId =
        String(ticket.place_id);

      const scriptName = ticket.script_name || "game";
      const MODULE_SCRIPTS = {
        Universal: "Scripts/Universal.obfuscated.lua",
        ESP: "Scripts/ESP.obfuscated.lua"
      };
      if (!["game", "Universal", "ESP"].includes(scriptName)) {
        return json({success: false, error: "Invalid script ticket selection."}, 403);
      }


      // =====================================================
      // PLACE ID -> PRIVATE R2 SCRIPT
      // =====================================================

      const SCRIPT_BY_PLACE = {

        // Blox Fruits
        "2753915549":
          "Scripts/BloxFruits.obfuscated.lua",

        "4442272183":
          "Scripts/BloxFruits.obfuscated.lua",

        "7449423635":
          "Scripts/BloxFruits.obfuscated.lua",

        "79091703265657":
          "Scripts/BloxFruits.obfuscated.lua",


        // Devas Of Creation
        "71693982988714":
          "Scripts/Devas_Of_Creation.obfuscated.lua",


        // Demonfall
        "5094651510":
          "Scripts/Demonfall.obfuscated.lua",


        // Jujutsu Infinite
        "10450270085":
          "Scripts/Jujutsu_Infinite.obfuscated.lua",

        "16379684339":
          "Scripts/Jujutsu_Infinite.obfuscated.lua",

        "16379688837":
          "Scripts/Jujutsu_Infinite.obfuscated.lua",


        // Haikyuu Legends
        "73956553001240":
          "Scripts/Haikyuu_Legends.obfuscated.lua",


        // Build A Boat
        "537413528":
          "Scripts/Build_A_Boat.obfuscated.lua",


        // Criminality
        "8343259840":
          "Scripts/Criminality.obfuscated.lua",


        // Project Delta
        "7336302630":
          "Scripts/Project_Delta.obfuscated.lua",


        // Fisch
        "16732694052":
          "Scripts/Fisch.obfuscated.lua",


        // Anime Kingdom
        "17334984034":
          "Scripts/Anime_Kingdom.obfuscated.lua",


        // Phantom Forces
        "292439477":
          "Scripts/Phantom_Forces.obfuscated.lua",


        // Dead Rails
        "70876832253163":
          "Scripts/Dead_Rails.obfuscated.lua",


        // Spiked
        "17435076424":
          "Scripts/Spiked.obfuscated.lua",


        // Blue Lock Rivals
        "18668065416":
          "Scripts/Blue_Lock_Rivals.obfuscated.lua",


        // Beaks
        "122678592501168":
          "Scripts/Beaks.obfuscated.lua"

      };


      // Demonfall Premium Plus gets its own private R2 script.
      // Every other Demonfall plan keeps the existing script.
      const gameScriptKey =
        (
          placeId === "5094651510" &&
          String(license.access_plan || "free") === "premium_plus"
        )
          ? "premium+scripts/Demonfallpp.lua"
          : (
              SCRIPT_BY_PLACE[placeId]
              || "Scripts/Universal.obfuscated.lua"
            );

      const scriptKey = MODULE_SCRIPTS[scriptName] || gameScriptKey;


      // =====================================================
      // GET ONLY REQUIRED SCRIPT FROM PRIVATE R2
      // =====================================================

      const scriptObject =
        await env.PRIVATE_SCRIPTS.get(
          scriptKey
        );


      if (!scriptObject) {
        return json({
          success: false,
          error: "Script unavailable."
        }, 503);
      }


      return new Response(
        scriptObject.body,
        {
          status: 200,

          headers: {
            "Content-Type":
              "text/plain; charset=utf-8",

            "Cache-Control":
              "no-store, no-cache, must-revalidate",

            "Pragma":
              "no-cache",

            "X-Content-Type-Options":
              "nosniff"
          }
        }
      );
    }
    



    if (
      url.pathname === "/api/admin/create-key" &&
      request.method === "POST"
    ) {
      const body = await request.json();

      const adminSecret =
        String(body.admin_secret || "");

      if (
        !adminSecret ||
        adminSecret !== env.ADMIN_SECRET
      ) {
        return Response.json(
          {
            success: false,
            error: "Unauthorized"
          },
          { status: 401 }
        );
      }

      const allowedPlans = [
        "free",
        "keyless",
        "premium",
        "premium_plus"
      ];

      const accessPlan =
        String(body.access_plan || "free");

      if (!allowedPlans.includes(accessPlan)) {
        return Response.json(
          {
            success: false,
            error: "Invalid access plan"
          },
          { status: 400 }
        );
      }

      let key =
        String(body.key || "")
          .trim()
          .toUpperCase();

      if (!key) {
        key = generateAdminKey();
      } else if (!key.startsWith("ALTER_")) {
        key = "ALTER_" + key;
      }

      const durationMs =
        Number(body.duration_ms);

      const adminTags =
        normalizeCreationTags(body.tags);

      if (adminTags === null) {
        return json({
          success: false,
          error: "Invalid tag. Choose an existing preset tag."
        }, 400);
      }

      if (
        !Number.isFinite(durationMs) ||
        durationMs < 0
      ) {
        return Response.json(
          {
            success: false,
            error: "Invalid duration"
          },
          { status: 400 }
        );
      }

      const existing =
        await env.DB.prepare(`
          SELECT id
          FROM sessions
          WHERE final_key = ?
          LIMIT 1
        `)
          .bind(key)
          .first();

      if (existing) {
        return Response.json(
          {
            success: false,
            error: "That key already exists"
          },
          { status: 409 }
        );
      }

      const now = Date.now();

      const sessionId =
        crypto.randomUUID()
          .replaceAll("-", "");

      const unusedKeyExpiry =
        253402300799000;

      await env.DB.prepare(`
        INSERT INTO sessions (
          id,
          roblox_user_id,
          created_at,
          expires_at,
          status,
          step,
          final_key,
          key_expires_at,
          access_plan,
          license_duration_ms,
          admin_tags
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          sessionId,
          "ADMIN_CREATED",
          now,
          unusedKeyExpiry,
          "completed",
          3,
          key,
          unusedKeyExpiry,
          accessPlan,
          durationMs,
          adminTags
        )
        .run();

      await recordAnalytics(
        env,
        {
          keys_generated: 1
        },
        now
      );

      await recordAdminActivity(
        env,
        "create_key",
        "key",
        sessionId,
        "Created 1 " +
          accessPlan +
          " key" +
          (adminTags ?
            " with tags: " + adminTags :
            "")
      );

      return Response.json({
        success: true,
        key: key,
        access_plan: accessPlan,
        duration_ms: durationMs,
        tags: parseAdminTags(adminTags),
        session_id: sessionId
      });
    }


    // =====================================================
    // ADMIN - CREATE BULK KEYS
    // POST /api/admin/create-keys-bulk
    // =====================================================

    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/create-keys-bulk"
    ) {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          success: false,
          error: "Invalid request body."
        }, 400);
      }

      const adminSecret =
        String(body.admin_secret || "");

      if (
        !adminSecret ||
        adminSecret !== env.ADMIN_SECRET
      ) {
        return json({
          success: false,
          error: "Unauthorized"
        }, 401);
      }

      const allowedPlans = [
        "free",
        "keyless",
        "premium",
        "premium_plus"
      ];

      const accessPlan =
        String(body.access_plan || "free");

      if (!allowedPlans.includes(accessPlan)) {
        return json({
          success: false,
          error: "Invalid access plan"
        }, 400);
      }

      const durationMs =
        Number(body.duration_ms);

      const adminTags =
        normalizeCreationTags(body.tags);

      if (adminTags === null) {
        return json({
          success: false,
          error: "Invalid tag. Choose an existing preset tag."
        }, 400);
      }

      if (
        !Number.isFinite(durationMs) ||
        durationMs < 0
      ) {
        return json({
          success: false,
          error: "Invalid duration"
        }, 400);
      }

      const source =
        String(body.source || "generated")
          .toLowerCase();

      if (
        source !== "generated" &&
        source !== "manual"
      ) {
        return json({
          success: false,
          error: "Invalid bulk key source"
        }, 400);
      }

      const MAX_BULK_KEYS = 250;
      let candidates = [];

      if (source === "generated") {
        const count =
          Math.floor(Number(body.count));

        if (
          !Number.isFinite(count) ||
          count < 1 ||
          count > MAX_BULK_KEYS
        ) {
          return json({
            success: false,
            error:
              "Bulk count must be between 1 and " +
              String(MAX_BULK_KEYS) +
              "."
          }, 400);
        }

        const local = new Set();

        while (local.size < count) {
          local.add(generateAdminKey());
        }

        candidates =
          Array.from(local);
      } else {
        const raw =
          String(body.keys || "");

        const rawItems =
          raw
            .split(/[,\n\r]+/)
            .map(function(value) {
              return String(value || "")
                .trim()
                .toUpperCase();
            })
            .filter(Boolean);

        if (rawItems.length === 0) {
          return json({
            success: false,
            error:
              "Enter at least one custom key."
          }, 400);
        }

        if (rawItems.length > MAX_BULK_KEYS) {
          return json({
            success: false,
            error:
              "You can create at most " +
              String(MAX_BULK_KEYS) +
              " keys per batch."
          }, 400);
        }

        const local = new Set();

        for (let key of rawItems) {
          if (!key.startsWith("ALTER_")) {
            key = "ALTER_" + key;
          }

          if (
            key.length < 7 ||
            key.length > 160
          ) {
            continue;
          }

          local.add(key);
        }

        candidates =
          Array.from(local);

        if (candidates.length === 0) {
          return json({
            success: false,
            error:
              "No valid custom keys were provided."
          }, 400);
        }
      }

      const existingKeys =
        new Set();

      for (
        let offset = 0;
        offset < candidates.length;
        offset += 50
      ) {
        const chunk =
          candidates.slice(
            offset,
            offset + 50
          );

        const placeholders =
          chunk
            .map(function() {
              return "?";
            })
            .join(",");

        const existing =
          await env.DB.prepare(
            "SELECT final_key " +
            "FROM sessions " +
            "WHERE final_key IN (" +
            placeholders +
            ")"
          )
            .bind(...chunk)
            .all();

        for (
          const row of existing.results || []
        ) {
          existingKeys.add(
            String(row.final_key || "")
          );
        }
      }

      if (source === "generated") {
        for (
          let index = 0;
          index < candidates.length;
          index++
        ) {
          let key = candidates[index];
          let attempts = 0;

          while (
            existingKeys.has(key) &&
            attempts < 8
          ) {
            key = generateAdminKey();
            attempts += 1;
          }

          candidates[index] = key;
        }
      }

      const keysToCreate =
        candidates.filter(
          function(key) {
            return !existingKeys.has(key);
          }
        );

      if (keysToCreate.length === 0) {
        return json({
          success: false,
          error:
            "All supplied keys already exist."
        }, 409);
      }

      const now = Date.now();
      const unusedKeyExpiry =
        253402300799000;

      const statements =
        keysToCreate.map(
          function(key) {
            const sessionId =
              crypto.randomUUID()
                .replaceAll("-", "");

            return env.DB.prepare(`
              INSERT INTO sessions (
                id,
                roblox_user_id,
                created_at,
                expires_at,
                status,
                step,
                final_key,
                key_expires_at,
                access_plan,
                license_duration_ms,
                admin_tags
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
              .bind(
                sessionId,
                "ADMIN_CREATED",
                now,
                unusedKeyExpiry,
                "completed",
                3,
                key,
                unusedKeyExpiry,
                accessPlan,
                durationMs,
                adminTags
              );
          }
        );

      for (
        let offset = 0;
        offset < statements.length;
        offset += 50
      ) {
        await env.DB.batch(
          statements.slice(
            offset,
            offset + 50
          )
        );
      }

      await recordAnalytics(
        env,
        {
          keys_generated:
            keysToCreate.length
        },
        now
      );

      await recordAdminActivity(
        env,
        "bulk_create",
        "batch",
        "",
        "Created " +
          String(keysToCreate.length) +
          " " +
          accessPlan +
          " keys" +
          (adminTags ?
            " with tags: " + adminTags :
            "")
      );

      return json({
        success: true,
        source: source,
        access_plan: accessPlan,
        duration_ms: durationMs,
        tags: parseAdminTags(adminTags),
        created_count:
          keysToCreate.length,
        skipped_count:
          candidates.length -
          keysToCreate.length,
        keys: keysToCreate
      });
    }


    // =====================================================
    // ADMIN - LIST KEYS
    // POST /api/admin/keys
    // =====================================================

    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/keys"
    ) {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          success: false,
          error: "Invalid request body."
        }, 400);
      }

      const adminSecret =
        String(body.admin_secret || "").trim();

      if (
        !env.ADMIN_SECRET ||
        adminSecret !== env.ADMIN_SECRET
      ) {
        return json({
          success: false,
          error: "Access denied."
        }, 403);
      }


      const now = Date.now();


      let rows;

      try {

        rows =
          await env.DB.prepare(`
          SELECT
            s.id AS session_id,
            s.roblox_user_id AS session_owner_id,
            s.final_key,
            s.key_expires_at,
            s.created_at,
            s.access_plan,
            s.license_duration_ms,
            s.admin_note,
            s.admin_tags,

            l.license_id,
            l.device_hash,
            l.expires_at AS license_expires_at,
            l.revoked,
            l.last_seen_at,

            COUNT(kr.id) AS redeemer_rows,
            COALESCE(SUM(kr.redeem_count), 0) AS total_redeems

          FROM sessions s

          LEFT JOIN licenses l
            ON l.session_id = s.id

          LEFT JOIN key_redeemers kr
            ON kr.session_id = s.id

          WHERE
            s.final_key IS NOT NULL

          GROUP BY
            s.id,
            s.roblox_user_id,
            s.final_key,
            s.key_expires_at,
            s.created_at,
            s.license_duration_ms,
            s.access_plan,
            s.admin_note,
            s.admin_tags,
            l.license_id,
            l.device_hash,
            l.expires_at,
            l.revoked,
            l.last_seen_at

          ORDER BY
            s.key_expires_at DESC
        `)
        .all();
        } catch (error) {

          return json({
            success: false,
            error:
              "ADMIN KEYS SQL ERROR: " +
              String(error)
          }, 500);

        }

      const result = [];


      for (const row of rows.results || []) {

        const redeemers =
          await env.DB.prepare(`
            SELECT
              roblox_user_id,
              username,
              device_hash,
              first_seen_at,
              last_seen_at,
              redeem_count
            FROM key_redeemers
            WHERE session_id = ?
            ORDER BY last_seen_at DESC
          `)
          .bind(row.session_id)
          .all();


        const expiresAt =
          Number(
            row.license_expires_at
            || row.key_expires_at
            || 0
          );


        result.push({
          session_id:
            row.session_id,

          key:
            row.final_key,

          admin_created:
            row.session_owner_id === "ADMIN_CREATED",

          access_plan:
            row.access_plan || "free",

          note:
            row.admin_note || "",

          tags:
            parseAdminTags(row.admin_tags),

          created_at:
            Number(row.created_at || 0),

          license_id:
            row.license_id || null,

          device_hash:
            row.device_hash || null,

          expires_at:
            expiresAt,


          license_duration_ms:
            Number(
              row.license_duration_ms || 0
            ),

          time_left_ms:
            Math.max(
              0,
              expiresAt - now
            ),

          revoked:
            Number(row.revoked || 0) === 1,

          last_seen_at:
            row.last_seen_at
            ? Number(row.last_seen_at)
            : null,

          total_redeems:
            Number(row.total_redeems || 0),

          redeemers:
            (redeemers.results || []).map(item => ({
              roblox_user_id:
                item.roblox_user_id,

              username:
                item.username,

              device_hash:
                item.device_hash,

              first_seen_at:
                Number(item.first_seen_at),

              last_seen_at:
                Number(item.last_seen_at),

              redeem_count:
                Number(item.redeem_count)
            }))
        });
      }


      return json({
        success: true,
        keys: result
      });
    }

    // =====================================================
    // ADMIN - SET KEY NOTE
    // POST /api/admin/set-key-note
    // =====================================================

    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/set-key-note"
    ) {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          success: false,
          error: "Invalid request body."
        }, 400);
      }

      const adminSecret =
        String(body.admin_secret || "").trim();

      const sessionId =
        String(body.session_id || "").trim();

      const note =
        String(body.note || "").trim();

      if (
        !env.ADMIN_SECRET ||
        adminSecret !== env.ADMIN_SECRET
      ) {
        return json({
          success: false,
          error: "Access denied."
        }, 403);
      }

      if (!sessionId) {
        return json({
          success: false,
          error: "session_id is required."
        }, 400);
      }

      if (note.length > 500) {
        return json({
          success: false,
          error: "Notes can be up to 500 characters."
        }, 400);
      }

      const update =
        await env.DB.prepare(`
          UPDATE sessions
          SET admin_note = ?
          WHERE id = ?
        `)
          .bind(
            note,
            sessionId
          )
          .run();

      if (!update.meta?.changes) {
        return json({
          success: false,
          error: "Key not found."
        }, 404);
      }

      await recordAdminActivity(
        env,
        "update_note",
        "key",
        sessionId,
        note
          ? "Updated admin note"
          : "Cleared admin note"
      );

      return json({
        success: true,
        session_id: sessionId,
        note: note
      });
    }


    // =====================================================
    // ADMIN - SET KEY TAGS
    // POST /api/admin/set-key-tags
    // =====================================================

    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/set-key-tags"
    ) {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          success: false,
          error: "Invalid request body."
        }, 400);
      }

      const adminSecret =
        String(body.admin_secret || "").trim();

      const sessionId =
        String(body.session_id || "").trim();

      const tags =
        normalizeAdminTags(body.tags);

      if (
        !env.ADMIN_SECRET ||
        adminSecret !== env.ADMIN_SECRET
      ) {
        return json({
          success: false,
          error: "Access denied."
        }, 403);
      }

      if (!sessionId) {
        return json({
          success: false,
          error: "session_id is required."
        }, 400);
      }

      const update =
        await env.DB.prepare(`
          UPDATE sessions
          SET admin_tags = ?
          WHERE id = ?
        `)
          .bind(
            tags,
            sessionId
          )
          .run();

      if (!update.meta?.changes) {
        return json({
          success: false,
          error: "Key not found."
        }, 404);
      }

      await recordAdminActivity(
        env,
        "update_tags",
        "key",
        sessionId,
        tags
          ? "Updated tags: " + tags
          : "Cleared key tags"
      );

      return json({
        success: true,
        session_id: sessionId,
        tags: parseAdminTags(tags)
      });
    }


    // =====================================================
    // ADMIN - SET KEY ACCESS PLAN
    // POST /api/admin/set-key-plan
    // =====================================================

    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/set-key-plan"
    ) {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          success: false,
          error: "Invalid request body."
        }, 400);
      }

      const adminSecret =
        String(body.admin_secret || "").trim();

      const sessionId =
        String(body.session_id || "").trim();

      const accessPlan =
        String(body.access_plan || "")
          .trim()
          .toLowerCase();

      const allowedPlans = [
        "free",
        "keyless",
        "premium",
        "premium_plus"
      ];

      if (
        !env.ADMIN_SECRET ||
        adminSecret !== env.ADMIN_SECRET
      ) {
        return json({
          success: false,
          error: "Access denied."
        }, 403);
      }

      if (!sessionId) {
        return json({
          success: false,
          error: "session_id is required."
        }, 400);
      }

      if (!allowedPlans.includes(accessPlan)) {
        return json({
          success: false,
          error: "Invalid access plan."
        }, 400);
      }

      const existing =
        await env.DB.prepare(`
          SELECT
            id,
            access_plan
          FROM sessions
          WHERE id = ?
          LIMIT 1
        `)
          .bind(sessionId)
          .first();

      if (!existing) {
        return json({
          success: false,
          error: "Key not found."
        }, 404);
      }

      const previousPlan =
        String(existing.access_plan || "free");

      if (previousPlan !== accessPlan) {
        await env.DB.batch([
          env.DB.prepare(`
            UPDATE sessions
            SET access_plan = ?
            WHERE id = ?
          `).bind(
            accessPlan,
            sessionId
          ),

          env.DB.prepare(`
            UPDATE licenses
            SET access_plan = ?
            WHERE session_id = ?
          `).bind(
            accessPlan,
            sessionId
          )
        ]);

        await recordAdminActivity(
          env,
          "update_plan",
          "key",
          sessionId,
          "Changed access plan from " +
            previousPlan +
            " to " +
            accessPlan
        );
      }

      return json({
        success: true,
        session_id: sessionId,
        access_plan: accessPlan,
        previous_access_plan: previousPlan
      });
    }


    // =====================================================
    // ADMIN - PERSISTENT ANALYTICS STATISTICS
    // POST /api/admin/checkpoint-stats
    // =====================================================

    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/checkpoint-stats"
    ) {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          success: false,
          error: "Invalid request body."
        }, 400);
      }

      const adminSecret =
        String(body.admin_secret || "").trim();

      if (
        !env.ADMIN_SECRET ||
        adminSecret !== env.ADMIN_SECRET
      ) {
        return json({
          success: false,
          error: "Access denied."
        }, 403);
      }

      const allowedPeriods = [
        "1d",
        "7d",
        "30d",
        "1y",
        "lifetime"
      ];

      const period =
        allowedPeriods.includes(body.period)
          ? body.period
          : "1d";

      const now = Date.now();

      let lifetimeStart = null;

      if (period === "lifetime") {
        try {
          const earliest =
            await env.DB.prepare(`
              SELECT MIN(bucket_start) AS earliest
              FROM analytics_hourly
            `)
              .first();

          lifetimeStart =
            Number(earliest?.earliest || now);
        } catch (error) {
          return json({
            success: false,
            error:
              "Persistent analytics are not ready. " +
              "Run the analytics_hourly D1 migration first."
          }, 500);
        }
      }

      const bucketData =
        buildCheckpointBuckets(
          period,
          now,
          lifetimeStart
        );

      let baselineRow;
      let rows;
      let totalsRow;

      try {
        baselineRow =
          await env.DB.prepare(`
            SELECT
              COALESCE(SUM(license_delta), 0)
                AS active_before_range
            FROM analytics_hourly
            WHERE bucket_start < ?
          `)
            .bind(bucketData.start)
            .first();

        rows =
          await env.DB.prepare(`
            SELECT
              bucket_start,
              checkpoints_passed,
              license_delta,
              redeems
            FROM analytics_hourly
            WHERE bucket_start >= ?
              AND bucket_start <= ?
            ORDER BY bucket_start ASC
          `)
            .bind(
              bucketData.start,
              now
            )
            .all();

        totalsRow =
          await env.DB.prepare(`
            SELECT
              COALESCE(SUM(redeems), 0)
                AS redeems_total
            FROM analytics_hourly
          `)
            .first();
      } catch (error) {
        return json({
          success: false,
          error:
            "Persistent analytics are not ready. " +
            "Run the analytics_hourly D1 migration first."
        }, 500);
      }

      const buckets =
        bucketData.buckets.map(function(bucket) {
          return {
            start: bucket.start,
            end: bucket.end,
            count: 0,
            valid_licenses: 0
          };
        });

      const analyticsRows =
        (rows.results || []).map(
          function(row) {
            return {
              bucket_start:
                Number(row.bucket_start || 0),

              checkpoints_passed:
                Number(row.checkpoints_passed || 0),

              license_delta:
                Number(row.license_delta || 0)
            };
          }
        );

      let activeLicenses =
        Number(
          baselineRow?.active_before_range || 0
        );

      let rowIndex = 0;

      for (
        let bucketIndex = 0;
        bucketIndex < buckets.length;
        bucketIndex++
      ) {
        const bucket = buckets[bucketIndex];
        const isLast =
          bucketIndex === buckets.length - 1;

        while (
          rowIndex < analyticsRows.length
        ) {
          const row =
            analyticsRows[rowIndex];

          const belongsToBucket =
            row.bucket_start >= bucket.start &&
            (
              row.bucket_start < bucket.end ||
              (
                isLast &&
                row.bucket_start <= now
              )
            );

          if (!belongsToBucket) {
            if (row.bucket_start < bucket.start) {
              activeLicenses +=
                row.license_delta;

              rowIndex += 1;
              continue;
            }

            break;
          }

          bucket.count +=
            row.checkpoints_passed;

          activeLicenses +=
            row.license_delta;

          rowIndex += 1;
        }

        bucket.valid_licenses =
          Math.max(
            0,
            activeLicenses
          );
      }

      const total =
        buckets.reduce(
          function(sum, bucket) {
            return sum + bucket.count;
          },
          0
        );

      const validLicenses =
        buckets.length > 0
          ? Number(
              buckets[
                buckets.length - 1
              ].valid_licenses || 0
            )
          : Math.max(
              0,
              activeLicenses
            );

      return json({
        success: true,
        period: period,
        total: total,
        valid_licenses: validLicenses,
        redeems_total:
          Number(
            totalsRow?.redeems_total || 0
          ),
        range_start: bucketData.start,
        range_end: now,
        points: buckets
      });
    }


    // =====================================================
    // ADMIN - CHECKPOINT PROVIDER FUNNEL
    // POST /api/admin/checkpoint-funnel
    // =====================================================

    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/checkpoint-funnel"
    ) {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          success: false,
          error: "Invalid request body."
        }, 400);
      }

      const adminSecret =
        String(body.admin_secret || "").trim();

      if (
        !env.ADMIN_SECRET ||
        adminSecret !== env.ADMIN_SECRET
      ) {
        return json({
          success: false,
          error: "Access denied."
        }, 403);
      }

      const allowedPeriods = [
        "1d",
        "7d",
        "30d",
        "1y",
        "lifetime"
      ];

      const period =
        allowedPeriods.includes(body.period)
          ? body.period
          : "1d";

      const now = Date.now();
      const DAY = 24 * 60 * 60 * 1000;

      let rangeStart = 0;

      if (period === "1d") {
        rangeStart = now - DAY;
      } else if (period === "7d") {
        rangeStart = now - (7 * DAY);
      } else if (period === "30d") {
        rangeStart = now - (30 * DAY);
      } else if (period === "1y") {
        rangeStart = now - (366 * DAY);
      }

      try {
        await ensureCheckpointFunnelSchema(env);
      } catch (error) {
        return json({
          success: false,
          error: "Checkpoint funnel analytics could not be initialized."
        }, 500);
      }

      let rows;

      try {
        rows =
          await env.DB.prepare(`
            SELECT
              checkpoint_token,
              session_id,
              provider,
              checkpoint,
              started_at,
              session_expires_at,
              status,
              finished_at,
              failure_reason
            FROM analytics_checkpoint_attempts
            WHERE started_at >= ?
              AND started_at <= ?
            ORDER BY started_at ASC
          `)
            .bind(rangeStart, now)
            .all();
      } catch (error) {
        return json({
          success: false,
          error: "Unable to read checkpoint funnel analytics."
        }, 500);
      }

      function emptyCheckpoint(number) {
        return {
          checkpoint: number,
          starts: 0,
          completions: 0,
          failures: 0,
          abandoned: 0,
          cancelled: 0,
          pending: 0
        };
      }

      function emptyProvider(provider) {
        return {
          provider: provider,
          starts: 0,
          completions: 0,
          failures: 0,
          abandoned: 0,
          cancelled: 0,
          pending: 0,
          completion_rate: 0,
          checkpoints: [
            emptyCheckpoint(1),
            emptyCheckpoint(2),
            emptyCheckpoint(3)
          ]
        };
      }

      const providers = {
        linkvertise: emptyProvider("linkvertise"),
        lootlabs: emptyProvider("lootlabs")
      };

      for (const row of rows.results || []) {
        const provider =
          String(row.provider || "").toLowerCase();

        if (!providers[provider]) {
          continue;
        }

        const checkpoint =
          Math.min(
            3,
            Math.max(
              1,
              Number(row.checkpoint || 1)
            )
          );

        const providerStats = providers[provider];
        const checkpointStats =
          providerStats.checkpoints[checkpoint - 1];

        providerStats.starts += 1;
        checkpointStats.starts += 1;

        let status =
          String(row.status || "started").toLowerCase();

        if (
          status === "started" &&
          (
            (
              Number(row.session_expires_at || 0) > 0 &&
              Number(row.session_expires_at || 0) <= now
            ) ||
            Number(row.started_at || 0) <= now - (15 * 60 * 1000)
          )
        ) {
          status = "abandoned";
        }

        if (status === "completed") {
          providerStats.completions += 1;
          checkpointStats.completions += 1;
        } else if (status === "failed") {
          providerStats.failures += 1;
          checkpointStats.failures += 1;
        } else if (status === "abandoned") {
          providerStats.abandoned += 1;
          checkpointStats.abandoned += 1;
        } else if (status === "cancelled") {
          providerStats.cancelled += 1;
          checkpointStats.cancelled += 1;
        } else {
          providerStats.pending += 1;
          checkpointStats.pending += 1;
        }
      }

      for (const provider of Object.values(providers)) {
        provider.completion_rate =
          provider.starts > 0
            ? Math.round(
                (provider.completions / provider.starts) * 1000
              ) / 10
            : 0;
      }

      let bestProvider = "";

      if (
        providers.linkvertise.starts > 0 ||
        providers.lootlabs.starts > 0
      ) {
        bestProvider =
          providers.linkvertise.completion_rate >=
          providers.lootlabs.completion_rate
            ? "linkvertise"
            : "lootlabs";
      }

      return json({
        success: true,
        period: period,
        range_start: rangeStart,
        range_end: now,
        best_provider: bestProvider,
        providers: providers
      });
    }


    // =====================================================
    // ADMIN - COUNTRY STATISTICS
    // POST /api/admin/country-stats
    // =====================================================

    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/country-stats"
    ) {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          success: false,
          error: "Invalid request body."
        }, 400);
      }

      const adminSecret =
        String(body.admin_secret || "").trim();

      if (
        !env.ADMIN_SECRET ||
        adminSecret !== env.ADMIN_SECRET
      ) {
        return json({
          success: false,
          error: "Access denied."
        }, 403);
      }

      let rows;

      try {
        rows =
          await env.DB.prepare(`
            SELECT
              country_code,
              users_count
            FROM analytics_country_totals
            WHERE users_count > 0
            ORDER BY
              users_count DESC,
              country_code ASC
          `)
            .all();
      } catch (error) {
        return json({
          success: false,
          error:
            "Country analytics are not ready. " +
            "Run the country analytics D1 migration first."
        }, 500);
      }

      const countries = {};
      const ordered = [];
      let totalUsers = 0;

      for (
        const row of rows.results || []
      ) {
        const code =
          String(row.country_code || "")
            .toUpperCase();

        const users =
          Math.max(
            0,
            Number(row.users_count || 0)
          );

        if (!/^[A-Z]{2}$/.test(code)) {
          continue;
        }

        countries[code] = users;
        totalUsers += users;

        ordered.push({
          country_code: code,
          users: users
        });
      }

      return json({
        success: true,
        total_users: totalUsers,
        countries: countries,
        top5: ordered.slice(0, 5)
      });
    }

    // =====================================================
    // ADMIN - ACTIVITY LOG
    // POST /api/admin/activity-log
    // =====================================================

    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/activity-log"
    ) {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          success: false,
          error: "Invalid request body."
        }, 400);
      }

      const adminSecret =
        String(body.admin_secret || "").trim();

      if (
        !env.ADMIN_SECRET ||
        adminSecret !== env.ADMIN_SECRET
      ) {
        return json({
          success: false,
          error: "Access denied."
        }, 403);
      }

      const action =
        String(body.action || "all")
          .trim()
          .toLowerCase();

      const search =
        String(body.search || "")
          .trim();

      const period =
        String(body.period || "30d")
          .trim()
          .toLowerCase();

      const now = Date.now();
      const start =
        adminPeriodStart(period, now);

      let sql = `
        SELECT
          id,
          created_at,
          action,
          target_type,
          target_ref,
          description
        FROM admin_activity_log
        WHERE created_at >= ?
      `;

      const binds = [start];

      if (
        action &&
        action !== "all"
      ) {
        sql += " AND action = ?";
        binds.push(action);
      }

      if (search) {
        sql += `
          AND (
            action LIKE ?
            OR target_type LIKE ?
            OR target_ref LIKE ?
            OR description LIKE ?
          )
        `;

        const pattern =
          "%" + search + "%";

        binds.push(
          pattern,
          pattern,
          pattern,
          pattern
        );
      }

      sql += `
        ORDER BY created_at DESC
        LIMIT 500
      `;

      try {
        const rows =
          await env.DB.prepare(sql)
            .bind(...binds)
            .all();

        return json({
          success: true,
          events:
            (rows.results || []).map(
              function(row) {
                return {
                  id: String(row.id || ""),
                  created_at:
                    Number(row.created_at || 0),
                  action:
                    String(row.action || ""),
                  target_type:
                    String(row.target_type || ""),
                  target_ref:
                    String(row.target_ref || ""),
                  description:
                    String(row.description || "")
                };
              }
            )
        });
      } catch (error) {
        return json({
          success: false,
          error:
            "Admin activity logging is not ready. " +
            "Run the admin activity D1 migration first."
        }, 500);
      }
    }


    // =====================================================
    // ADMIN - SYSTEM HEALTH
    // POST /api/admin/system-health
    // =====================================================

    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/system-health"
    ) {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          success: false,
          error: "Invalid request body."
        }, 400);
      }

      const adminSecret =
        String(body.admin_secret || "").trim();

      if (
        !env.ADMIN_SECRET ||
        adminSecret !== env.ADMIN_SECRET
      ) {
        return json({
          success: false,
          error: "Access denied."
        }, 403);
      }

      let d1Ok = false;
      let analyticsOk = false;
      let activityOk = false;
      let lastAnalyticsAt = 0;
      let lastActivityAt = 0;

      try {
        await env.DB.prepare(
          "SELECT 1 AS ok"
        ).first();
        d1Ok = true;
      } catch (error) {
        d1Ok = false;
      }

      try {
        const row =
          await env.DB.prepare(`
            SELECT MAX(bucket_start) AS latest
            FROM analytics_hourly
          `)
            .first();

        analyticsOk = true;
        lastAnalyticsAt =
          Number(row?.latest || 0);
      } catch (error) {
        analyticsOk = false;
      }

      try {
        const row =
          await env.DB.prepare(`
            SELECT MAX(created_at) AS latest
            FROM admin_activity_log
          `)
            .first();

        activityOk = true;
        lastActivityAt =
          Number(row?.latest || 0);
      } catch (error) {
        activityOk = false;
      }

      const r2Ok =
        Boolean(env.PRIVATE_SCRIPTS);

      const linkvertiseOk =
        Boolean(
          env.LINKVERTISE_PUBLIC_URL &&
          env.LINKVERTISE_ANTI_BYPASS_TOKEN
        );

      const lootlabsOk =
        Boolean(
          env.LOOTLABS_PUBLIC_URL &&
          env.LOOTLABS_SECRET
        );

      const overall =
        d1Ok &&
        analyticsOk &&
        activityOk &&
        r2Ok &&
        linkvertiseOk &&
        lootlabsOk
          ? "healthy"
          : "attention";

      return json({
        success: true,
        overall: overall,
        checked_at: Date.now(),
        components: {
          database: {
            ok: d1Ok,
            label: "D1 Database"
          },
          analytics: {
            ok: analyticsOk,
            label: "Persistent Analytics",
            last_event_at: lastAnalyticsAt
          },
          activity_log: {
            ok: activityOk,
            label: "Admin Activity Log",
            last_event_at: lastActivityAt
          },
          private_scripts: {
            ok: r2Ok,
            label: "Private Scripts R2"
          },
          linkvertise: {
            ok: linkvertiseOk,
            label: "Linkvertise Config"
          },
          lootlabs: {
            ok: lootlabsOk,
            label: "LootLabs Config"
          }
        }
      });
    }


    // =====================================================
    // ADMIN - EXPORT CSV
    // POST /api/admin/export-csv
    // =====================================================

    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/export-csv"
    ) {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          success: false,
          error: "Invalid request body."
        }, 400);
      }

      const adminSecret =
        String(body.admin_secret || "").trim();

      if (
        !env.ADMIN_SECRET ||
        adminSecret !== env.ADMIN_SECRET
      ) {
        return json({
          success: false,
          error: "Access denied."
        }, 403);
      }

      const allowedTypes = [
        "analytics",
        "countries",
        "keys",
        "activity"
      ];

      const exportType =
        allowedTypes.includes(body.export_type)
          ? body.export_type
          : "analytics";

      const allowedPeriods = [
        "1d",
        "7d",
        "30d",
        "1y",
        "lifetime"
      ];

      const period =
        allowedPeriods.includes(body.period)
          ? body.period
          : "30d";

      const now = Date.now();
      let csv = "";

      try {
        if (exportType === "analytics") {
          const rows =
            await buildAnalyticsExportRows(
              env,
              period,
              now
            );

          csv = [
            [
              "Period Start",
              "Period End",
              "Checkpoints Passed",
              "Valid Licenses",
              "Keys Generated",
              "Keys Deleted",
              "Redeems",
              "Licenses Activated",
              "Licenses Revoked",
              "Licenses Unrevoked",
              "Licenses Expired",
              "Licenses Deleted"
            ],
            ...rows.map(function(row) {
              return [
                new Date(row.start).toISOString(),
                new Date(row.end).toISOString(),
                row.checkpoints_passed,
                row.valid_licenses,
                row.keys_generated,
                row.keys_deleted,
                row.redeems,
                row.licenses_activated,
                row.licenses_revoked,
                row.licenses_unrevoked,
                row.licenses_expired,
                row.licenses_deleted
              ];
            })
          ]
            .map(csvRow)
            .join("\n");
        }

        if (exportType === "countries") {
          const rows =
            await env.DB.prepare(`
              SELECT
                country_code,
                users_count
              FROM analytics_country_totals
              WHERE users_count > 0
              ORDER BY users_count DESC
            `)
              .all();

          csv = [
            ["Country Code", "Users"],
            ...(rows.results || []).map(
              function(row) {
                return [
                  row.country_code,
                  Number(row.users_count || 0)
                ];
              }
            )
          ]
            .map(csvRow)
            .join("\n");
        }

        if (exportType === "keys") {
          const start =
            adminPeriodStart(period, now);

          const rows =
            await env.DB.prepare(`
              SELECT
                s.final_key,
                s.access_plan,
                s.admin_tags,
                s.admin_note,
                s.created_at,
                s.license_duration_ms,
                l.license_id,
                l.expires_at,
                l.revoked
              FROM sessions s
              LEFT JOIN licenses l
                ON l.session_id = s.id
              WHERE
                s.final_key IS NOT NULL
                AND s.created_at >= ?
              ORDER BY s.created_at DESC
            `)
              .bind(start)
              .all();

          csv = [
            [
              "Key",
              "Access Plan",
              "Tags",
              "Note",
              "Created At",
              "Duration Ms",
              "License ID",
              "License Expires At",
              "Revoked"
            ],
            ...(rows.results || []).map(
              function(row) {
                return [
                  row.final_key,
                  row.access_plan,
                  row.admin_tags,
                  row.admin_note,
                  new Date(
                    Number(row.created_at || 0)
                  ).toISOString(),
                  Number(
                    row.license_duration_ms || 0
                  ),
                  row.license_id || "",
                  row.expires_at
                    ? new Date(
                        Number(row.expires_at)
                      ).toISOString()
                    : "",
                  Number(row.revoked || 0) === 1
                    ? "yes"
                    : "no"
                ];
              }
            )
          ]
            .map(csvRow)
            .join("\n");
        }

        if (exportType === "activity") {
          const start =
            adminPeriodStart(period, now);

          const rows =
            await env.DB.prepare(`
              SELECT
                created_at,
                action,
                target_type,
                target_ref,
                description
              FROM admin_activity_log
              WHERE created_at >= ?
              ORDER BY created_at DESC
            `)
              .bind(start)
              .all();

          csv = [
            [
              "Time",
              "Action",
              "Target Type",
              "Target Ref",
              "Description"
            ],
            ...(rows.results || []).map(
              function(row) {
                return [
                  new Date(
                    Number(row.created_at || 0)
                  ).toISOString(),
                  row.action,
                  row.target_type,
                  row.target_ref,
                  row.description
                ];
              }
            )
          ]
            .map(csvRow)
            .join("\n");
        }
      } catch (error) {
        return json({
          success: false,
          error:
            "Unable to build CSV export: " +
            String(error)
        }, 500);
      }

      await recordAdminActivity(
        env,
        "export_csv",
        exportType,
        "",
        "Exported " +
          exportType +
          " CSV for " +
          period
      );

      const stamp =
        new Date(now)
          .toISOString()
          .slice(0, 10);

      const filename =
        "AlterHub_" +
        exportType +
        "_" +
        period +
        "_" +
        stamp +
        ".csv";

      return new Response(
        csv,
        {
          status: 200,
          headers: {
            "Content-Type":
              "text/csv; charset=UTF-8",
            "Content-Disposition":
              "attachment; filename=\"" +
              filename +
              "\"",
            "Cache-Control": "no-store",
            ...corsHeaders()
          }
        }
      );
    }


    // =====================================================
    // ADMIN - BULK DELETE KEYS
    // POST /api/admin/delete-keys-bulk
    // =====================================================

    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/delete-keys-bulk"
    ) {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          success: false,
          error: "Invalid request body."
        }, 400);
      }

      const adminSecret =
        String(body.admin_secret || "").trim();

      if (
        !env.ADMIN_SECRET ||
        adminSecret !== env.ADMIN_SECRET
      ) {
        return json({
          success: false,
          error: "Access denied."
        }, 403);
      }

      const MAX_BULK_DELETE = 250;

      const suppliedSessionIds =
        Array.isArray(body.session_ids)
          ? body.session_ids
              .map(function(value) {
                return String(value || "").trim();
              })
              .filter(Boolean)
          : [];

      const suppliedKeys =
        String(body.keys || "")
          .split(/[,\n\r]+/)
          .map(function(value) {
            return String(value || "")
              .trim()
              .toUpperCase();
          })
          .filter(Boolean)
          .map(function(value) {
            return value.startsWith("ALTER_")
              ? value
              : "ALTER_" + value;
          });

      const sessionIds =
        new Set(
          suppliedSessionIds.slice(
            0,
            MAX_BULK_DELETE
          )
        );

      if (suppliedKeys.length > 0) {
        for (
          let offset = 0;
          offset < Math.min(
            suppliedKeys.length,
            MAX_BULK_DELETE
          );
          offset += 50
        ) {
          const chunk =
            suppliedKeys.slice(
              offset,
              offset + 50
            );

          const placeholders =
            chunk
              .map(function() {
                return "?";
              })
              .join(",");

          const rows =
            await env.DB.prepare(
              "SELECT id FROM sessions " +
              "WHERE final_key IN (" +
              placeholders +
              ")"
            )
              .bind(...chunk)
              .all();

          for (
            const row of rows.results || []
          ) {
            if (
              sessionIds.size <
              MAX_BULK_DELETE
            ) {
              sessionIds.add(
                String(row.id || "")
              );
            }
          }
        }
      }

      if (sessionIds.size === 0) {
        return json({
          success: false,
          error:
            "Select keys or paste keys to delete."
        }, 400);
      }

      const deleted = [];
      const skipped = [];
      const now = Date.now();

      for (const sessionId of sessionIds) {
        try {
          const result =
            await deleteKeySessionForAdmin(
              env,
              sessionId,
              now
            );

          if (result.deleted) {
            deleted.push(result.key || sessionId);
          } else {
            skipped.push({
              session_id: sessionId,
              reason:
                result.reason || "Skipped"
            });
          }
        } catch (error) {
          skipped.push({
            session_id: sessionId,
            reason: String(error)
          });
        }
      }

      await recordAdminActivity(
        env,
        "bulk_delete",
        "batch",
        "",
        "Deleted " +
          String(deleted.length) +
          " keys; skipped " +
          String(skipped.length)
      );

      return json({
        success: true,
        deleted_count: deleted.length,
        skipped_count: skipped.length,
        deleted_keys: deleted,
        skipped: skipped
      });
    }


    // =====================================================
    // ALTER HUB ADMIN PANEL
    // GET /admin
    // =====================================================

    if (
      request.method === "GET" &&
      url.pathname === "/admin"
    ) {
      return new Response(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <title>Alter Hub Admin</title>

  <link
    rel="stylesheet"
    href="https://cdn.jsdelivr.net/npm/jsvectormap/dist/css/jsvectormap.min.css"
  >

  <style>
    :root {
      --ah-bg: #07080a;
      --ah-bg-soft: #0b0d11;
      --ah-panel: #101217;
      --ah-panel-2: #14171d;
      --ah-panel-hover: #181c23;
      --ah-border: #252a33;
      --ah-border-soft: #1b1f27;
      --ah-red: #ff342e;
      --ah-red-hover: #ff4d47;
      --ah-red-deep: #8f1717;
      --ah-red-glow: rgba(255, 52, 46, 0.16);
      --ah-text: #f6f7f9;
      --ah-muted: #949aa6;
      --ah-dim: #626873;
      --ah-success: #55d98a;
      --ah-warning: #f2b84b;
      --ah-danger: #ff5964;
      --ah-radius: 12px;
      --ah-sidebar: 232px;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      min-height: 100%;
    }

    body {
      min-height: 100vh;
      font-family:
        Inter,
        ui-sans-serif,
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
      color: var(--ah-text);
      background:
        radial-gradient(
          circle at 18% -10%,
          rgba(255, 52, 46, 0.11),
          transparent 30%
        ),
        var(--ah-bg);
    }

    button,
    input,
    select {
      font: inherit;
    }

    button {
      cursor: pointer;
    }

    .login-screen {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .login-card {
      width: 420px;
      max-width: 100%;
      padding: 28px;
      border: 1px solid var(--ah-border);
      border-radius: 16px;
      background:
        linear-gradient(
          180deg,
          rgba(255, 255, 255, 0.025),
          transparent
        ),
        var(--ah-panel);
      box-shadow:
        0 24px 70px rgba(0, 0, 0, 0.42),
        0 0 38px rgba(255, 52, 46, 0.06);
    }

    .login-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 22px;
    }

    .brand-mark {
      width: 42px;
      height: 42px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 11px;
      color: #fff;
      font-weight: 900;
      font-size: 21px;
      background:
        linear-gradient(
          135deg,
          var(--ah-red),
          var(--ah-red-deep)
        );
      box-shadow: 0 0 24px var(--ah-red-glow);
    }

    .brand-name {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: -0.01em;
    }

    .brand-subtitle {
      margin-top: 2px;
      color: var(--ah-muted);
      font-size: 12px;
    }

    .login-card h1 {
      margin: 0 0 8px;
      font-size: 24px;
      letter-spacing: -0.02em;
    }

    .login-card > p {
      margin: 0 0 20px;
      color: var(--ah-muted);
      line-height: 1.55;
      font-size: 13px;
    }

    .field-label {
      display: block;
      margin: 0 0 7px;
      color: var(--ah-muted);
      font-size: 12px;
      font-weight: 700;
    }

    input,
    select {
      width: 100%;
      border: 1px solid var(--ah-border);
      border-radius: 9px;
      outline: none;
      color: var(--ah-text);
      background: #0b0d11;
      padding: 11px 12px;
      transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease,
        background 0.15s ease;
    }

    input:focus,
    select:focus {
      border-color: rgba(255, 52, 46, 0.7);
      box-shadow: 0 0 0 3px rgba(255, 52, 46, 0.10);
      background: #0d0f14;
    }

    select {
      border-radius: 12px;
      border-color: rgba(255, 52, 46, 0.30);
      background: #12090c;
      color-scheme: dark;
      cursor: pointer;
    }

    select:hover {
      border-color: rgba(255, 52, 46, 0.52);
      background: #160a0d;
    }

    select option,
    select optgroup {
      background: #12090c;
      color: var(--ah-text);
    }

    .primary-button,
    .secondary-button,
    .danger-button,
    .ghost-button,
    .table-action {
      border-radius: 8px;
      font-weight: 750;
      transition:
        background 0.15s ease,
        border-color 0.15s ease,
        transform 0.15s ease,
        color 0.15s ease;
    }

    .primary-button {
      border: 1px solid var(--ah-red);
      color: #fff;
      background: var(--ah-red);
      padding: 10px 14px;
      box-shadow: 0 0 18px rgba(255, 52, 46, 0.11);
    }

    .primary-button:hover {
      background: var(--ah-red-hover);
      border-color: var(--ah-red-hover);
      transform: translateY(-1px);
    }

    .secondary-button,
    .ghost-button {
      border: 1px solid var(--ah-border);
      color: var(--ah-text);
      background: var(--ah-panel-2);
      padding: 10px 14px;
    }

    .secondary-button:hover,
    .ghost-button:hover {
      border-color: rgba(255, 52, 46, 0.42);
      background: var(--ah-panel-hover);
    }

    .danger-button {
      border: 1px solid rgba(255, 89, 100, 0.45);
      color: #fff;
      background: rgba(255, 89, 100, 0.15);
      padding: 10px 14px;
    }

    .danger-button:hover {
      background: rgba(255, 89, 100, 0.23);
    }

    .login-button {
      width: 100%;
      margin-top: 14px;
    }

    .error {
      min-height: 18px;
      margin-top: 10px;
      color: var(--ah-danger);
      font-size: 12px;
    }

    .admin-shell {
      min-height: 100vh;
      display: none;
    }

    .sidebar {
      position: fixed;
      inset: 0 auto 0 0;
      width: var(--ah-sidebar);
      display: flex;
      flex-direction: column;
      padding: 16px 12px;
      border-right: 1px solid var(--ah-border-soft);
      background:
        linear-gradient(
          180deg,
          #0c0e12 0%,
          #090a0d 100%
        );
      z-index: 20;
    }

    .sidebar-brand {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 8px 10px 20px;
    }

    .sidebar-logo {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      border-radius: 9px;
      color: #fff;
      font-weight: 900;
      background:
        linear-gradient(
          135deg,
          var(--ah-red),
          var(--ah-red-deep)
        );
      box-shadow: 0 0 22px var(--ah-red-glow);
    }

    .sidebar-title {
      font-size: 14px;
      font-weight: 800;
    }

    .sidebar-subtitle {
      margin-top: 2px;
      color: var(--ah-muted);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .sidebar-nav {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .sidebar-item {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 10px 11px;
      border: 1px solid transparent;
      border-radius: 8px;
      color: var(--ah-muted);
      background: transparent;
      text-align: left;
      font-size: 13px;
    }

    .sidebar-item:hover {
      color: var(--ah-text);
      background: var(--ah-panel-hover);
    }

    .sidebar-item.active {
      color: #fff;
      border-color: rgba(255, 52, 46, 0.22);
      background: var(--ah-red-glow);
    }

    .sidebar-item.active .sidebar-icon {
      color: var(--ah-red);
    }

    .sidebar-icon {
      width: 18px;
      display: inline-flex;
      justify-content: center;
      color: var(--ah-dim);
      font-size: 14px;
    }

    .sidebar-divider {
      height: 1px;
      margin: 10px 8px;
      background: var(--ah-border-soft);
    }

    .sidebar-footer {
      margin-top: auto;
      padding: 12px 10px 4px;
      border-top: 1px solid var(--ah-border-soft);
    }

    .sidebar-status {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--ah-muted);
      font-size: 11px;
    }

    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--ah-success);
      box-shadow: 0 0 10px rgba(85, 217, 138, 0.35);
    }

    .admin-main {
      width: calc(100% - var(--ah-sidebar));
      min-height: 100vh;
      margin-left: var(--ah-sidebar);
    }

    .content {
      width: 100%;
      max-width: 1600px;
      margin: 0 auto;
      padding: 28px 32px 48px;
    }

    .page-section {
      display: none;
    }

    .page-section.active-page {
      display: block;
    }

    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      margin-bottom: 22px;
    }

    .page-heading h1 {
      margin: 0;
      font-size: 23px;
      letter-spacing: -0.025em;
    }

    .page-heading p {
      margin: 6px 0 0;
      color: var(--ah-muted);
      font-size: 12px;
    }

    .page-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 14px;
    }

    .stat-card,
    .panel-card {
      border: 1px solid var(--ah-border-soft);
      border-radius: var(--ah-radius);
      background:
        linear-gradient(
          180deg,
          rgba(255, 255, 255, 0.018),
          transparent
        ),
        var(--ah-panel);
    }

    .stat-card {
      min-height: 118px;
      padding: 17px;
    }

    .stat-label {
      color: var(--ah-muted);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .stat-value {
      margin-top: 13px;
      font-size: 28px;
      line-height: 1;
      font-weight: 850;
      letter-spacing: -0.04em;
    }

    .stat-note {
      margin-top: 10px;
      color: var(--ah-dim);
      font-size: 11px;
    }

    .stat-accent {
      color: var(--ah-red);
    }

    .period-select {
      min-width: 154px;
      padding: 8px 32px 8px 10px;
      border: 1px solid rgba(255, 52, 46, 0.30);
      border-radius: 12px;
      background: #12090c;
      color: var(--ah-text);
      font: inherit;
      font-size: 11px;
      font-weight: 700;
      outline: none;
      cursor: pointer;
    }

    .period-select:focus {
      border-color: rgba(255, 52, 46, 0.58);
      box-shadow: 0 0 0 3px rgba(255, 52, 46, 0.08);
    }

    .checkpoint-chart-card {
      margin-bottom: 14px;
      overflow: hidden;
    }

    .chart-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 8px;
    }

    .chart-legend {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 12px;
      color: var(--ah-muted);
      font-size: 11px;
      font-weight: 700;
    }

    .chart-legend-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }

    .chart-legend-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      display: inline-block;
    }

    .chart-legend-dot.checkpoints {
      background: var(--ah-red);
      box-shadow: 0 0 10px var(--ah-red-glow);
    }

    .chart-legend-dot.licenses {
      background: #d7d9df;
      box-shadow: 0 0 8px rgba(215, 217, 223, 0.10);
    }

    .chart-wrap {
      position: relative;
      width: 100%;
      height: 285px;
      margin-top: 8px;
    }

    #checkpointChart {
      display: block;
      width: 100%;
      height: 285px;
    }

    .funnel-card {
      margin-bottom: 14px;
      overflow: hidden;
    }

    .funnel-provider-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .funnel-provider-card {
      min-width: 0;
      padding: 14px;
      border: 1px solid var(--ah-border-soft);
      border-radius: 12px;
      background: linear-gradient(180deg, #0d0f14, #090b0f);
    }

    .funnel-provider-card.best-provider {
      border-color: rgba(255, 52, 46, 0.34);
      box-shadow: 0 0 0 1px rgba(255, 52, 46, 0.04) inset;
    }

    .funnel-provider-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }

    .funnel-provider-name {
      font-size: 13px;
      font-weight: 850;
      color: var(--ah-text);
    }

    .funnel-provider-note {
      margin-top: 3px;
      color: var(--ah-dim);
      font-size: 10px;
    }

    .funnel-rate {
      flex: 0 0 auto;
      min-width: 58px;
      padding: 6px 8px;
      border-radius: 9px;
      background: rgba(255, 52, 46, 0.08);
      color: #ff7b76;
      text-align: center;
      font-size: 12px;
      font-weight: 850;
    }

    .funnel-metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 7px;
    }

    .funnel-metric {
      min-width: 0;
      padding: 9px 8px;
      border: 1px solid rgba(255, 255, 255, 0.055);
      border-radius: 9px;
      background: #0a0c10;
    }

    .funnel-metric span {
      display: block;
      color: var(--ah-dim);
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .funnel-metric strong {
      display: block;
      margin-top: 5px;
      color: var(--ah-text);
      font-size: 16px;
      line-height: 1;
    }

    .funnel-metric.completed strong { color: var(--ah-success); }
    .funnel-metric.failed strong { color: var(--ah-danger); }
    .funnel-metric.abandoned strong { color: var(--ah-warning); }

    .funnel-checkpoints {
      display: grid;
      gap: 6px;
      margin-top: 10px;
    }

    .funnel-checkpoint-row {
      display: grid;
      grid-template-columns: 42px repeat(4, minmax(0, 1fr));
      gap: 6px;
      align-items: center;
      padding: 7px 8px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.025);
      color: var(--ah-muted);
      font-size: 9px;
    }

    .funnel-checkpoint-row strong {
      color: var(--ah-text);
      font-size: 10px;
    }

    .funnel-checkpoint-cell {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .funnel-empty {
      grid-column: 1 / -1;
      padding: 22px;
      border: 1px dashed var(--ah-border-soft);
      border-radius: 10px;
      color: var(--ah-dim);
      text-align: center;
      font-size: 11px;
    }

    .analytics-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.3fr) minmax(320px, 0.7fr);
      gap: 14px;
    }

    .panel-card {
      padding: 18px;
    }

    .panel-title {
      margin: 0 0 4px;
      font-size: 14px;
      font-weight: 800;
    }

    .panel-subtitle {
      margin: 0 0 20px;
      color: var(--ah-muted);
      font-size: 11px;
    }

    .bar-list {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .bar-row {
      display: grid;
      grid-template-columns: 100px minmax(80px, 1fr) 42px;
      align-items: center;
      gap: 10px;
    }

    .bar-label,
    .bar-value {
      font-size: 11px;
    }

    .bar-label {
      color: var(--ah-muted);
    }

    .bar-value {
      color: var(--ah-text);
      text-align: right;
      font-weight: 750;
    }

    .bar-track {
      height: 7px;
      overflow: hidden;
      border-radius: 999px;
      background: #090b0f;
      border: 1px solid var(--ah-border-soft);
    }

    .bar-fill {
      width: 0;
      height: 100%;
      border-radius: inherit;
      background:
        linear-gradient(
          90deg,
          var(--ah-red-deep),
          var(--ah-red)
        );
      transition: width 0.25s ease;
    }

    .status-breakdown {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .mini-stat {
      padding: 13px;
      border: 1px solid var(--ah-border-soft);
      border-radius: 9px;
      background: #0c0e12;
    }

    .mini-stat strong {
      display: block;
      margin-top: 6px;
      font-size: 20px;
    }

    .mini-stat span {
      color: var(--ah-muted);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .key-toolbar {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) auto auto auto;
      gap: 8px;
      margin-bottom: 12px;
    }

    .selection-button {
      display: none;
      border: 1px solid var(--ah-red);
      border-radius: 8px;
      color: #fff;
      background: var(--ah-red);
      padding: 10px 14px;
      font-weight: 750;
      box-shadow: 0 0 18px rgba(255, 52, 46, 0.11);
      transition:
        background 0.15s ease,
        border-color 0.15s ease,
        transform 0.15s ease,
        color 0.15s ease;
    }

    .selection-button:hover {
      background: var(--ah-red-hover);
      border-color: var(--ah-red-hover);
      transform: translateY(-1px);
    }

    .selection-cell {
      width: 42px;
      text-align: center;
    }

    .selection-cell input {
      width: 16px;
      height: 16px;
      margin: 0;
      appearance: none;
      -webkit-appearance: none;
      border: 1px solid #30343d;
      border-radius: 4px;
      background: #07080a;
      cursor: pointer;
      position: relative;
      transition:
        background 0.14s ease,
        border-color 0.14s ease,
        box-shadow 0.14s ease;
    }

    .selection-cell input:hover {
      border-color: #4a505c;
      background: #0b0d11;
    }

    .selection-cell input:checked {
      background: var(--ah-red);
      border-color: var(--ah-red);
      box-shadow: 0 0 9px rgba(255, 52, 46, 0.22);
    }

    .selection-cell input:checked::after {
      content: "✓";
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      color: #fff;
      font-size: 11px;
      line-height: 1;
      font-weight: 900;
    }

    .selection-cell input:indeterminate {
      background: var(--ah-red);
      border-color: var(--ah-red);
    }

    .selection-cell input:indeterminate::after {
      content: "";
      position: absolute;
      left: 3px;
      right: 3px;
      top: 7px;
      height: 2px;
      border-radius: 999px;
      background: #fff;
    }

    .selection-cell input:disabled {
      opacity: 0.28;
      cursor: not-allowed;
    }

    .key-copy-cell {
      max-width: 230px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--ah-text);
      cursor: copy;
      transition: color 0.16s ease;
    }

    .key-copy-cell:hover {
      color: var(--ah-red-hover);
    }

    .note-cell {
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--ah-muted);
    }

    .note-cell.has-note {
      color: var(--ah-text);
    }

    .key-toolbar input {
      min-width: 0;
    }

    .summary {
      margin: 0 0 10px;
      color: var(--ah-muted);
      font-size: 11px;
    }

    .table-wrapper {
      overflow: auto;
      border: 1px solid var(--ah-border-soft);
      border-radius: 11px;
      background: var(--ah-panel);
      scrollbar-width: thin;
      scrollbar-color: var(--ah-red-deep) #07080a;
    }

    .table-wrapper::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }

    .table-wrapper::-webkit-scrollbar-track {
      background: #07080a;
      border-radius: 999px;
    }

    .table-wrapper::-webkit-scrollbar-thumb {
      border: 2px solid #07080a;
      border-radius: 999px;
      background: linear-gradient(90deg, #5d1113, var(--ah-red));
    }

    .table-wrapper::-webkit-scrollbar-thumb:hover {
      background: var(--ah-red-hover);
    }

    .table-wrapper::-webkit-scrollbar-corner {
      background: #07080a;
    }

    table {
      width: 100%;
      min-width: 1240px;
      border-collapse: collapse;
    }

    th,
    td {
      padding: 12px 13px;
      border-bottom: 1px solid var(--ah-border-soft);
      text-align: left;
      vertical-align: middle;
      font-size: 12px;
    }

    th {
      position: sticky;
      top: 0;
      z-index: 2;
      color: var(--ah-muted);
      background: #0d0f14;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    tr.key-row {
      cursor: pointer;
    }

    tr.key-row:hover {
      background: rgba(255, 52, 46, 0.035);
    }

    .mono {
      font-family:
        "SFMono-Regular",
        Consolas,
        "Liberation Mono",
        monospace;
      font-size: 11px;
    }

    .active-status {
      color: var(--ah-success);
      font-weight: 800;
    }

    .revoked-status {
      color: var(--ah-danger);
      font-weight: 800;
    }

    .expired-status {
      color: var(--ah-muted);
      font-weight: 800;
    }

    .not-redeemed-status {
      color: var(--ah-warning);
      font-weight: 800;
    }

    .table-action {
      padding: 6px 9px;
      border: 1px solid var(--ah-border);
      color: var(--ah-text);
      background: #0e1015;
      font-size: 10px;
    }

    .table-action:hover {
      border-color: rgba(255, 52, 46, 0.55);
      background: rgba(255, 52, 46, 0.09);
    }

    .table-action.danger {
      color: var(--ah-danger);
      border-color: rgba(255, 89, 100, 0.27);
    }

    .key-plan-select {
      width: 132px;
      min-width: 132px;
      padding: 7px 9px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 750;
    }

    .key-plan-select:disabled {
      cursor: wait;
      opacity: 0.65;
    }

    .details {
      display: none;
      background: #0a0c10;
    }

    .details-content {
      padding: 8px 3px 13px;
    }

    .detail-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }

    .detail-box,
    .account-card {
      padding: 12px;
      border: 1px solid var(--ah-border-soft);
      border-radius: 8px;
      background: var(--ah-panel-2);
    }

    .detail-box span {
      display: block;
      margin-bottom: 5px;
      color: var(--ah-muted);
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .accounts-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-top: 8px;
    }

    .account-card {
      color: var(--ah-muted);
      font-size: 11px;
      line-height: 1.55;
    }

    .account-card b {
      color: var(--ah-text);
      font-size: 12px;
    }

    .empty-state {
      padding: 34px;
      color: var(--ah-muted);
      text-align: center;
      font-size: 12px;
    }

    .settings-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }

    .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 13px 0;
      border-bottom: 1px solid var(--ah-border-soft);
    }

    .setting-row:last-child {
      border-bottom: 0;
    }

    .setting-label strong {
      display: block;
      font-size: 12px;
    }

    .setting-label span {
      display: block;
      margin-top: 4px;
      color: var(--ah-muted);
      font-size: 10px;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 8px;
      border: 1px solid var(--ah-border-soft);
      border-radius: 999px;
      color: var(--ah-muted);
      background: #0b0d11;
      font-size: 10px;
      font-weight: 700;
    }

    .pill .status-dot {
      width: 6px;
      height: 6px;
    }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(0, 0, 0, 0.76);
      backdrop-filter: blur(4px);
    }

    .modal-card {
      position: relative;
      width: 440px;
      max-width: 100%;
      padding: 20px;
      border: 1px solid var(--ah-border);
      border-radius: 13px;
      background: var(--ah-panel);
      box-shadow: 0 22px 70px rgba(0, 0, 0, 0.45);
    }

    .modal-close-x {
      position: absolute;
      top: 12px;
      right: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      padding: 0;
      border: 1px solid var(--ah-border-soft);
      border-radius: 8px;
      background: #0c0e12;
      color: var(--ah-muted);
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
    }

    .modal-close-x:hover {
      border-color: rgba(255, 52, 46, 0.50);
      color: var(--ah-text);
      background: rgba(255, 52, 46, 0.08);
    }

    .modal-card h2 {
      margin: 0 0 7px;
      font-size: 18px;
    }

    .modal-card > p {
      margin: 0 0 16px;
      color: var(--ah-muted);
      font-size: 11px;
      line-height: 1.5;
    }

    .modal-card select,
    .modal-card input {
      margin-bottom: 14px;
    }

    .modal-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 6px;
    }

    .modal-message {
      min-height: 17px;
      margin: 12px 0 0;
      color: var(--ah-muted);
      font-size: 11px;
    }

    .modal-card textarea {
      width: 100%;
      min-height: 120px;
      resize: vertical;
      margin-bottom: 14px;
      padding: 11px 12px;
      border: 1px solid var(--ah-border);
      border-radius: 9px;
      outline: none;
      background: #090b0f;
      color: var(--ah-text);
      font: inherit;
      line-height: 1.45;
    }

    .modal-card textarea:focus {
      border-color: rgba(255, 52, 46, 0.58);
      box-shadow: 0 0 0 3px var(--ah-red-glow);
    }

    .bulk-help {
      margin: -7px 0 12px;
      color: var(--ah-dim);
      font-size: 10px;
      line-height: 1.45;
    }

    .bulk-results {
      display: none;
    }

    .bulk-results textarea {
      min-height: 260px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 10px;
    }

    .bulk-result-count {
      margin: 0 0 12px;
      color: var(--ah-muted);
      font-size: 11px;
      line-height: 1.5;
    }

    .note-editor {
      margin-top: 14px;
      padding: 13px;
      border: 1px solid var(--ah-border-soft);
      border-radius: 9px;
      background: #0c0e12;
    }

    .note-editor textarea {
      width: 100%;
      min-height: 72px;
      resize: vertical;
      margin-top: 7px;
      padding: 10px 11px;
      border: 1px solid var(--ah-border);
      border-radius: 8px;
      outline: none;
      background: #090b0f;
      color: var(--ah-text);
      font: inherit;
      font-size: 11px;
      line-height: 1.45;
    }

    .note-editor textarea:focus {
      border-color: rgba(255, 52, 46, 0.58);
      box-shadow: 0 0 0 3px var(--ah-red-glow);
    }

    .copy-toast {
      position: fixed;
      right: 22px;
      bottom: 22px;
      z-index: 1500;
      padding: 10px 13px;
      border: 1px solid rgba(255, 52, 46, 0.30);
      border-radius: 9px;
      background: rgba(16, 18, 23, 0.96);
      color: var(--ah-text);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.32);
      font-size: 11px;
      font-weight: 800;
      opacity: 0;
      transform: translateY(6px);
      pointer-events: none;
      transition: opacity 0.16s ease, transform 0.16s ease;
    }

    .copy-toast.show {
      opacity: 1;
      transform: translateY(0);
    }

    .country-map-card {
      margin-top: 14px;
      overflow: hidden;
    }

    .country-map-wrap {
      position: relative;
      min-height: 420px;
      margin-top: 12px;
      overflow: hidden;
      border: 1px solid var(--ah-border-soft);
      border-radius: 11px;
      background:
        radial-gradient(
          circle at 50% 45%,
          rgba(255, 52, 46, 0.035),
          transparent 48%
        ),
        #090b0f;
    }

    #countryMap {
      width: 100%;
      height: 420px;
    }

    .country-map-empty {
      position: absolute;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
      color: var(--ah-muted);
      text-align: center;
      font-size: 11px;
      pointer-events: none;
    }

    .country-top-five {
      position: absolute;
      top: 14px;
      right: 14px;
      z-index: 10;
      width: 220px;
      max-width: calc(100% - 28px);
      padding: 12px;
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 10px;
      background: rgba(10, 11, 14, 0.90);
      box-shadow: 0 10px 32px rgba(0, 0, 0, 0.28);
      backdrop-filter: blur(10px);
    }

    .country-top-title {
      margin-bottom: 8px;
      color: var(--ah-text);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.01em;
    }

    .country-top-row {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr) auto;
      gap: 7px;
      align-items: center;
      padding: 5px 0;
      color: var(--ah-muted);
      font-size: 10px;
    }

    .country-top-row + .country-top-row {
      border-top: 1px solid rgba(255, 255, 255, 0.045);
    }

    .country-top-rank {
      color: var(--ah-red);
      font-weight: 850;
    }

    .country-top-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .country-top-count {
      color: var(--ah-text);
      font-weight: 800;
    }


    .key-filter-row {
      display: grid;
      grid-template-columns:
        repeat(6, minmax(120px, 1fr));
      gap: 8px;
      margin: -2px 0 12px;
    }

    .key-filter-row select,
    .activity-toolbar select,
    .activity-toolbar input {
      width: 100%;
      min-width: 0;
      padding: 9px 10px;
      border: 1px solid var(--ah-border);
      border-radius: 8px;
      outline: none;
      background: #0b0d11;
      color: var(--ah-text);
      font: inherit;
      font-size: 11px;
    }

    .key-filter-row select:focus,
    .activity-toolbar select:focus,
    .activity-toolbar input:focus {
      border-color: rgba(255, 52, 46, 0.58);
      box-shadow: 0 0 0 3px var(--ah-red-glow);
    }

    .tag-list {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 5px;
      min-width: 120px;
    }

    .tag-chip {
      display: inline-flex;
      align-items: center;
      min-height: 21px;
      padding: 3px 7px;
      border: 1px solid rgba(255, 52, 46, 0.22);
      border-radius: 999px;
      background: rgba(255, 52, 46, 0.07);
      color: #d9dce2;
      font-size: 9px;
      font-weight: 750;
      white-space: nowrap;
    }

    .tag-chip.tag-owner,
    .tag-chip.tag-developer {
      border-color: rgba(255, 52, 46, 0.54);
      background: rgba(255, 52, 46, 0.14);
      color: #fff;
    }

    .tag-editor {
      margin-top: 14px;
      padding: 13px;
      border: 1px solid var(--ah-border-soft);
      border-radius: 9px;
      background: #0c0e12;
    }

    .tag-options {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      margin: 9px 0 10px;
    }

    .tag-option {
      padding: 6px 9px;
      border: 1px solid var(--ah-border);
      border-radius: 999px;
      background: #090b0f;
      color: var(--ah-muted);
      font-size: 10px;
      font-weight: 750;
    }

    .tag-option:hover {
      border-color: rgba(255, 52, 46, 0.42);
      color: var(--ah-text);
    }

    .tag-option.selected {
      border-color: rgba(255, 52, 46, 0.62);
      background: rgba(255, 52, 46, 0.13);
      color: #fff;
    }

    .tag-editor input {
      width: 100%;
      margin: 0 0 8px;
    }

    .activity-toolbar {
      display: grid;
      grid-template-columns:
        minmax(180px, 1fr)
        170px
        150px
        auto;
      gap: 8px;
      margin-bottom: 12px;
    }

    .activity-table-wrapper {
      overflow: auto;
      border: 1px solid var(--ah-border-soft);
      border-radius: 11px;
      background: var(--ah-panel);
    }

    .activity-table {
      min-width: 880px;
    }

    .activity-action {
      display: inline-flex;
      align-items: center;
      padding: 4px 7px;
      border: 1px solid var(--ah-border);
      border-radius: 999px;
      background: #0b0d11;
      color: var(--ah-muted);
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .activity-action.create_key,
    .activity-action.bulk_create,
    .activity-action.unrevoke {
      border-color: rgba(85, 217, 138, 0.28);
      color: var(--ah-success);
      background: rgba(85, 217, 138, 0.06);
    }

    .activity-action.delete_key,
    .activity-action.bulk_delete,
    .activity-action.revoke,
    .activity-action.revoke_delete {
      border-color: rgba(255, 89, 100, 0.32);
      color: var(--ah-danger);
      background: rgba(255, 89, 100, 0.06);
    }

    .activity-action.update_note,
    .activity-action.update_tags,
    .activity-action.update_plan,
    .activity-action.export_csv {
      border-color: rgba(242, 184, 75, 0.26);
      color: var(--ah-warning);
      background: rgba(242, 184, 75, 0.055);
    }

    .alerts-card {
      margin: 0 0 14px;
    }

    .alerts-list {
      display: grid;
      gap: 8px;
      margin-top: 12px;
    }

    .alert-row {
      display: grid;
      grid-template-columns: 9px minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
      padding: 11px 12px;
      border: 1px solid var(--ah-border-soft);
      border-radius: 9px;
      background: #0b0d11;
    }

    .alert-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--ah-muted);
    }

    .alert-row.warning .alert-indicator {
      background: var(--ah-warning);
      box-shadow: 0 0 9px rgba(242, 184, 75, 0.22);
    }

    .alert-row.danger .alert-indicator {
      background: var(--ah-danger);
      box-shadow: 0 0 9px rgba(255, 89, 100, 0.22);
    }

    .alert-row.success .alert-indicator {
      background: var(--ah-success);
      box-shadow: 0 0 9px rgba(85, 217, 138, 0.20);
    }

    .alert-copy strong {
      display: block;
      font-size: 11px;
    }

    .alert-copy span {
      display: block;
      margin-top: 3px;
      color: var(--ah-muted);
      font-size: 10px;
    }

    .alert-meta {
      color: var(--ah-muted);
      font-size: 10px;
      font-weight: 750;
    }

    .health-list {
      display: grid;
      gap: 8px;
      margin-top: 12px;
    }

    .health-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 11px;
      border: 1px solid var(--ah-border-soft);
      border-radius: 9px;
      background: #0b0d11;
    }

    .health-name {
      font-size: 11px;
      font-weight: 750;
    }

    .health-detail {
      margin-top: 3px;
      color: var(--ah-dim);
      font-size: 9px;
    }

    .health-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--ah-muted);
      font-size: 10px;
      font-weight: 800;
    }

    .health-status::before {
      content: "";
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--ah-muted);
    }

    .health-status.ok {
      color: var(--ah-success);
    }

    .health-status.ok::before {
      background: var(--ah-success);
      box-shadow: 0 0 8px rgba(85, 217, 138, 0.28);
    }

    .health-status.bad {
      color: var(--ah-danger);
    }

    .health-status.bad::before {
      background: var(--ah-danger);
    }

    .health-refresh-button {
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }

    .health-refresh-button::before {
      content: "↻";
      display: inline-block;
      font-size: 14px;
      line-height: 1;
      transform-origin: center;
    }

    .health-refresh-button.is-refreshing::before {
      animation: ah-refresh-spin 0.68s linear infinite;
    }

    @keyframes ah-refresh-spin {
      to {
        transform: rotate(360deg);
      }
    }

    .copy-flash {
      border-color: rgba(255, 52, 46, 0.74) !important;
      background: rgba(255, 52, 46, 0.13) !important;
      color: #fff !important;
      box-shadow: 0 0 18px rgba(255, 52, 46, 0.14);
    }

    .bulk-delete-option-panel {
      margin-bottom: 12px;
      padding: 11px;
      border: 1px solid var(--ah-border-soft);
      border-radius: 11px;
      background: #090b0f;
    }

    .bulk-delete-option-panel select {
      margin-bottom: 0;
    }

    .bulk-management-choice {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 14px;
    }

    .bulk-choice-button {
      min-height: 118px;
      padding: 16px;
      border: 1px solid var(--ah-border);
      border-radius: 11px;
      background: #0b0d11;
      color: var(--ah-text);
      text-align: left;
    }

    .bulk-choice-button:hover {
      border-color: rgba(255, 52, 46, 0.48);
      background: rgba(255, 52, 46, 0.055);
    }

    .bulk-choice-button strong {
      display: block;
      margin-bottom: 6px;
      font-size: 13px;
    }

    .bulk-choice-button span {
      color: var(--ah-muted);
      font-size: 10px;
      line-height: 1.5;
    }

    .bulk-choice-button.danger:hover {
      border-color: rgba(255, 89, 100, 0.54);
      background: rgba(255, 89, 100, 0.06);
    }

    .bulk-delete-summary {
      padding: 10px 11px;
      margin-bottom: 12px;
      border: 1px solid var(--ah-border-soft);
      border-radius: 9px;
      background: #090b0f;
      color: var(--ah-muted);
      font-size: 10px;
      line-height: 1.5;
    }

    .export-note {
      margin: -5px 0 14px;
      color: var(--ah-dim);
      font-size: 10px;
      line-height: 1.5;
    }

    .settings-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 14px;
    }

    .jvm-tooltip {
      border: 1px solid rgba(255, 52, 46, 0.35) !important;
      border-radius: 8px !important;
      background: #111318 !important;
      color: var(--ah-text) !important;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.34) !important;
      font-family: Inter, Arial, sans-serif !important;
      font-size: 11px !important;
    }

    .jvm-zoom-btn {
      border: 1px solid var(--ah-border) !important;
      border-radius: 6px !important;
      background: #111318 !important;
      color: var(--ah-text) !important;
    }

    @media (max-width: 1050px) {
      .stats-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .analytics-grid,
      .settings-grid,
      .funnel-provider-grid {
        grid-template-columns: 1fr;
      }

      .key-filter-row {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }

    @media (max-width: 760px) {
      :root {
        --ah-sidebar: 72px;
      }

      .sidebar {
        padding-inline: 8px;
      }

      .sidebar-brand {
        justify-content: center;
        padding-inline: 0;
      }

      .sidebar-brand > div:last-child,
      .sidebar-item span:last-child,
      .sidebar-footer {
        display: none;
      }

      .sidebar-item {
        justify-content: center;
        padding-inline: 0;
      }

      .content {
        padding: 20px 14px 36px;
      }

      .page-header {
        align-items: flex-start;
        flex-direction: column;
      }

      .country-map-wrap,
      #countryMap {
        height: 360px;
        min-height: 360px;
      }

      .country-top-five {
        width: 190px;
      }

      .page-actions,
      .key-toolbar {
        width: 100%;
      }

      .key-toolbar {
        grid-template-columns: 1fr 1fr;
      }

      .key-toolbar input {
        grid-column: 1 / -1;
      }

      .key-filter-row,
      .activity-toolbar,
      .bulk-management-choice {
        grid-template-columns: 1fr;
      }

      .stats-grid,
      .status-breakdown,
      .detail-grid,
      .accounts-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>

<body>

  <div
    class="login-screen"
    id="loginScreen"
  >
    <div class="login-card">
      <div class="login-brand">
        <div class="brand-mark">A</div>
        <div>
          <div class="brand-name">Alter Hub</div>
          <div class="brand-subtitle">Administration</div>
        </div>
      </div>

      <h1>Admin Dashboard</h1>
      <p>
        Sign in to manage Alter Hub keys, licenses, and access plans.
        Your admin secret is used only to create a secure session.
      </p>

      <label
        class="field-label"
        for="adminSecret"
      >
        Admin Secret
      </label>

      <input
        type="password"
        id="adminSecret"
        placeholder="Enter admin secret"
        autocomplete="current-password"
      >

      <button
        class="primary-button login-button"
        id="loginButton"
      >
        Open Dashboard
      </button>

      <div
        class="error"
        id="loginError"
      ></div>
    </div>
  </div>

  <div
    class="admin-shell"
    id="adminShell"
  >
    <aside class="sidebar">
      <div class="sidebar-brand">
        <div class="sidebar-logo">A</div>
        <div>
          <div class="sidebar-title">Alter Hub</div>
          <div class="sidebar-subtitle">Admin Panel</div>
        </div>
      </div>

      <nav class="sidebar-nav">
        <button
          class="sidebar-item active"
          id="statisticsNavButton"
        >
          <span class="sidebar-icon">▥</span>
          <span>Statistics</span>
        </button>

        <button
          class="sidebar-item"
          id="explorerNavButton"
        >
          <span class="sidebar-icon">◉</span>
          <span>Standard</span>
        </button>

        <button
          class="sidebar-item"
          id="giftsNavButton"
        >
          <span class="sidebar-icon">◆</span>
          <span>Premium</span>
        </button>

        <button
          class="sidebar-item"
          id="activityNavButton"
        >
          <span class="sidebar-icon">≡</span>
          <span>Activity Log</span>
        </button>

        <div class="sidebar-divider"></div>

        <button
          class="sidebar-item"
          id="settingsNavButton"
        >
          <span class="sidebar-icon">⚙</span>
          <span>Settings</span>
        </button>
      </nav>

      <div class="sidebar-footer">
        <div class="sidebar-status">
          <span class="status-dot"></span>
          <span>Alter Hub API</span>
        </div>
      </div>
    </aside>

    <main class="admin-main">
      <div class="content">

        <section
          class="page-section active-page"
          id="statisticsPage"
        >
          <div class="panel-card alerts-card">
            <div class="chart-header">
              <div>
                <h2 class="panel-title">Alter Hub Alerts</h2>
                <p class="panel-subtitle">
                  Operational notices based on keys, licenses, analytics, and system health.
                </p>
              </div>

              <div class="pill" id="alertSummaryPill">Checking</div>
            </div>

            <div class="alerts-list" id="dashboardAlerts"></div>
          </div>

          <div class="page-header">
            <div class="page-heading">
              <h1>Statistics</h1>
              <p>Overview of Alter Hub licensing activity.</p>
            </div>

            <div class="page-actions">
              <select
                class="period-select"
                id="statsPeriodSelect"
                aria-label="Statistics period"
              >
                <option value="1d">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="1y">Last 12 Months</option>
                <option value="lifetime">Lifetime</option>
              </select>

              <button
                class="secondary-button"
                id="statsRefreshButton"
              >
                Refresh
              </button>
            </div>
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">Total Keys</div>
              <div class="stat-value" id="statTotalKeys">0</div>
              <div class="stat-note">Across all access plans</div>
            </div>

            <div class="stat-card">
              <div class="stat-label">Active Licenses</div>
              <div class="stat-value stat-accent" id="statActiveLicenses">0</div>
              <div class="stat-note">Redeemed and currently valid</div>
            </div>

            <div class="stat-card">
              <div class="stat-label">Checkpoints Passed</div>
              <div class="stat-value" id="statCheckpointsPassed">0</div>
              <div class="stat-note" id="statCheckpointsNote">Last 24 hours</div>
            </div>

            <div class="stat-card">
              <div class="stat-label">Total Redeems</div>
              <div class="stat-value" id="statTotalRedeems">0</div>
              <div class="stat-note">Recorded redemption attempts</div>
            </div>
          </div>

          <div class="panel-card checkpoint-chart-card">
            <div class="chart-header">
              <div>
                <h2 class="panel-title">Checkpoint & License Activity</h2>
                <p class="panel-subtitle" id="checkpointChartSubtitle">
                  Checkpoints passed and valid licenses over the selected period.
                </p>
              </div>

              <div class="chart-legend" aria-label="Chart legend">
                <span class="chart-legend-item">
                  <span class="chart-legend-dot checkpoints"></span>
                  Checkpoints
                </span>
                <span class="chart-legend-item">
                  <span class="chart-legend-dot licenses"></span>
                  Valid Licenses
                </span>
              </div>
            </div>

            <div class="chart-wrap">
              <canvas id="checkpointChart"></canvas>
            </div>
          </div>

          <div class="panel-card funnel-card">
            <div class="chart-header">
              <div>
                <h2 class="panel-title">Checkpoint Provider Funnel</h2>
                <p class="panel-subtitle">
                  Starts, completions, failures and abandoned checkpoint attempts by provider.
                </p>
              </div>

              <div class="pill" id="checkpointFunnelPeriodPill">Last 24 hours</div>
            </div>

            <div
              class="funnel-provider-grid"
              id="checkpointFunnelProviders"
            >
              <div class="funnel-empty">Loading provider funnel…</div>
            </div>
          </div>

          <div class="analytics-grid">
            <div class="panel-card">
              <h2 class="panel-title">Access Distribution</h2>
              <p class="panel-subtitle">
                Key count by Alter Hub access plan.
              </p>

              <div class="bar-list">
                <div class="bar-row">
                  <div class="bar-label">Free</div>
                  <div class="bar-track">
                    <div class="bar-fill" id="barFree"></div>
                  </div>
                  <div class="bar-value" id="barFreeValue">0</div>
                </div>

                <div class="bar-row">
                  <div class="bar-label">Keyless</div>
                  <div class="bar-track">
                    <div class="bar-fill" id="barKeyless"></div>
                  </div>
                  <div class="bar-value" id="barKeylessValue">0</div>
                </div>

                <div class="bar-row">
                  <div class="bar-label">Premium</div>
                  <div class="bar-track">
                    <div class="bar-fill" id="barPremium"></div>
                  </div>
                  <div class="bar-value" id="barPremiumValue">0</div>
                </div>

                <div class="bar-row">
                  <div class="bar-label">Premium+</div>
                  <div class="bar-track">
                    <div class="bar-fill" id="barPremiumPlus"></div>
                  </div>
                  <div class="bar-value" id="barPremiumPlusValue">0</div>
                </div>
              </div>
            </div>

            <div class="panel-card">
              <h2 class="panel-title">License Status</h2>
              <p class="panel-subtitle">
                Current key and license state.
              </p>

              <div class="status-breakdown">
                <div class="mini-stat">
                  <span>Active</span>
                  <strong id="statusActive">0</strong>
                </div>

                <div class="mini-stat">
                  <span>NR</span>
                  <strong id="statusNR">0</strong>
                </div>

                <div class="mini-stat">
                  <span>Revoked</span>
                  <strong id="statusRevoked">0</strong>
                </div>

                <div class="mini-stat">
                  <span>Expired</span>
                  <strong id="statusExpired">0</strong>
                </div>
              </div>
            </div>
          </div>

          <div class="panel-card country-map-card">
            <div class="chart-header">
              <div>
                <h2 class="panel-title">User Geography</h2>
                <p class="panel-subtitle">
                  Unique users are counted when they successfully receive a final key.
                </p>
              </div>

              <div class="pill">
                Lifetime country distribution
              </div>
            </div>

            <div class="country-map-wrap">
              <div
                class="country-top-five"
                id="countryTopFive"
              >
                <div class="country-top-title">Top 5 Countries</div>
                <div class="country-top-row">
                  <span class="country-top-rank">—</span>
                  <span class="country-top-name">No data yet</span>
                  <span class="country-top-count">0</span>
                </div>
              </div>

              <div id="countryMap"></div>

              <div
                class="country-map-empty"
                id="countryMapEmpty"
              >
                Country data will appear after users receive new final keys.
              </div>
            </div>
          </div>

        </section>

        <section
          class="page-section"
          id="keysPage"
        >
          <div class="page-header">
            <div class="page-heading">
              <h1 id="keysPageTitle">Explorer</h1>
              <p id="keysPageSubtitle">
                Free and Keyless Alter Hub access.
              </p>
            </div>

            <div class="page-actions">
              <button
                class="secondary-button"
                id="bulkKeyButton"
              >
                Bulk Management
              </button>

              <button
                class="primary-button"
                id="createKeyButton"
              >
                + Create Key
              </button>
            </div>
          </div>

          <div class="key-toolbar">
            <input
              id="search"
              placeholder="Search username, ID, key, note, tag, license or device..."
            >

            <button
              class="selection-button"
              id="manageSelectedButton"
            >
              Manage Selected (0)
            </button>

            <button
              class="secondary-button"
              id="refreshButton"
            >
              Refresh
            </button>

            <button
              class="ghost-button"
              id="clearSearchButton"
            >
              Clear
            </button>
          </div>

          <div class="key-filter-row">
            <select id="filterPlan" aria-label="Filter by plan">
              <option value="all">All Plans</option>
              <option value="free">Free</option>
              <option value="keyless">Keyless</option>
              <option value="premium">Premium</option>
              <option value="premium_plus">Premium Plus</option>
            </select>

            <select id="filterStatus" aria-label="Filter by status">
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="nr">Not Redeemed</option>
              <option value="revoked">Revoked</option>
              <option value="expired">Expired</option>
            </select>

            <select id="filterDuration" aria-label="Filter by duration">
              <option value="all">All Durations</option>
              <option value="86400000">1 Day</option>
              <option value="604800000">1 Week</option>
              <option value="2592000000">1 Month</option>
              <option value="31536000000">1 Year</option>
              <option value="0">Lifetime</option>
            </select>

            <select id="filterTag" aria-label="Filter by tag">
              <option value="all">All Tags</option>
            </select>

            <select id="filterCreated" aria-label="Filter by creation date">
              <option value="all">Created: Any Time</option>
              <option value="1d">Created: Last 24 Hours</option>
              <option value="7d">Created: Last 7 Days</option>
              <option value="30d">Created: Last 30 Days</option>
              <option value="1y">Created: Last Year</option>
            </select>

            <select id="filterNote" aria-label="Filter by note">
              <option value="all">Any Note</option>
              <option value="with">With Note</option>
              <option value="without">Without Note</option>
            </select>
          </div>

          <div
            class="summary"
            id="summary"
          ></div>

          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th class="selection-cell">
                    <input
                      type="checkbox"
                      id="selectAllKeys"
                      aria-label="Select all actionable keys in this view"
                    >
                  </th>
                  <th>Username</th>
                  <th>User ID</th>
                  <th>Key</th>
                  <th>Plan</th>
                  <th>Note</th>
                  <th>Tags</th>
                  <th>Time Left</th>
                  <th>Status</th>
                  <th>Redeems</th>
                  <th>Last Seen</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody id="keyTable"></tbody>
            </table>
          </div>
        </section>

        <section
          class="page-section"
          id="activityPage"
        >
          <div class="page-header">
            <div class="page-heading">
              <h1>Admin Activity Log</h1>
              <p>Permanent history of Alter Hub admin changes.</p>
            </div>

            <div class="page-actions">
              <button class="secondary-button" id="activityRefreshButton">Refresh</button>
            </div>
          </div>

          <div class="activity-toolbar">
            <input id="activitySearch" placeholder="Search action, target or details...">

            <select id="activityActionFilter">
              <option value="all">All Actions</option>
              <option value="create_key">Create Key</option>
              <option value="bulk_create">Bulk Create</option>
              <option value="delete_key">Delete Key</option>
              <option value="bulk_delete">Bulk Delete</option>
              <option value="revoke">Revoke</option>
              <option value="unrevoke">Unrevoke</option>
              <option value="revoke_delete">Revoke + Delete</option>
              <option value="update_note">Update Note</option>
              <option value="update_tags">Update Tags</option>
              <option value="update_plan">Update Plan</option>
              <option value="export_csv">CSV Export</option>
            </select>

            <select id="activityPeriodFilter">
              <option value="1d">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d" selected>Last 30 Days</option>
              <option value="1y">Last Year</option>
              <option value="lifetime">Lifetime</option>
            </select>

            <button class="ghost-button" id="activityClearButton">Clear</button>
          </div>

          <div class="summary" id="activitySummary">0 events</div>

          <div class="activity-table-wrapper">
            <table class="activity-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody id="activityTable"></tbody>
            </table>
          </div>
        </section>

        <section
          class="page-section"
          id="settingsPage"
        >
          <div class="page-header">
            <div class="page-heading">
              <h1>Settings</h1>
              <p>Admin session and Alter Hub dashboard controls.</p>
            </div>
          </div>

          <div class="settings-grid">
            <div class="panel-card">
              <h2 class="panel-title">Dashboard</h2>
              <p class="panel-subtitle">
                Current admin connection status.
              </p>

              <div class="setting-row">
                <div class="setting-label">
                  <strong>API Connection</strong>
                  <span>Worker admin API</span>
                </div>

                <div class="pill">
                  <span class="status-dot"></span>
                  Connected
                </div>
              </div>

              <div class="setting-row">
                <div class="setting-label">
                  <strong>Key Data</strong>
                  <span>Reload all dashboard records</span>
                </div>

                <button
                  class="secondary-button"
                  id="settingsRefreshButton"
                >
                  Refresh
                </button>
              </div>
            </div>

            <div class="panel-card">
              <h2 class="panel-title">Data Export</h2>
              <p class="panel-subtitle">
                Export analytics, geography, key inventory, or admin history as CSV.
              </p>

              <div class="setting-row">
                <div class="setting-label">
                  <strong>Export CSV</strong>
                  <span>Choose what data and time period to export</span>
                </div>

                <button class="secondary-button" id="exportCsvButton">
                  Export CSV
                </button>
              </div>
            </div>

            <div class="panel-card">
              <div class="chart-header">
                <div>
                  <h2 class="panel-title">System Health</h2>
                  <p class="panel-subtitle">
                    Worker dependencies and Alter Hub service configuration.
                  </p>
                </div>

                <button class="ghost-button health-refresh-button" id="healthRefreshButton">Refresh</button>
              </div>

              <div class="health-list" id="systemHealthList">
                <div class="health-row">
                  <div>
                    <div class="health-name">Checking Alter Hub services...</div>
                  </div>
                  <div class="health-status">Checking</div>
                </div>
              </div>
            </div>

            <div class="panel-card">
              <h2 class="panel-title">Session</h2>
              <p class="panel-subtitle">
                The admin secret stays in this browser tab only.
              </p>

              <div class="setting-row">
                <div class="setting-label">
                  <strong>Admin Session</strong>
                  <span>Clear the current dashboard session</span>
                </div>

                <button
                  class="danger-button"
                  id="logoutButton"
                >
                  Log Out
                </button>
              </div>
            </div>
          </div>
        </section>

      </div>
    </main>
  </div>

  <div
    class="modal-backdrop"
    id="revokeModal"
  >
    <div class="modal-card">
      <h2 id="revokeModalTitle">Revoke License</h2>
      <p id="revokeModalDescription">
        Choose what Alter Hub should do with this license.
      </p>

      <div
        class="mono"
        id="revokeModalKey"
        style="word-break:break-all;margin-bottom:16px;"
      ></div>

      <div class="modal-actions">
        <button
          class="secondary-button"
          id="revokeOnlyButton"
        >
          Revoke Only
        </button>

        <button
          class="danger-button"
          id="revokeDeleteButton"
        >
          Revoke + Delete Key
        </button>

        <button
          class="ghost-button"
          id="revokeCancelButton"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>

  <div
    class="modal-backdrop"
    id="createKeyModal"
  >
    <div class="modal-card">
      <h2>Create Key</h2>
      <p>
        Leave the key blank to generate a random ALTER_ key.
        The selected duration begins on first redemption.
      </p>

      <label
        class="field-label"
        for="createKeyValue"
      >
        Custom Key
      </label>

      <input
        id="createKeyValue"
        type="text"
        placeholder="Optional custom key"
      >

      <label
        class="field-label"
        for="createKeyPlan"
      >
        Access Plan
      </label>

      <select id="createKeyPlan">
        <option value="free">Free</option>
        <option value="keyless">Keyless</option>
        <option value="premium">Premium</option>
        <option value="premium_plus">Premium Plus</option>
      </select>

      <label
        class="field-label"
        for="createKeyDuration"
      >
        Duration
      </label>

      <select id="createKeyDuration">
        <option value="43200000">12 Hours</option>
        <option value="86400000">1 Day</option>
        <option value="604800000">1 Week</option>
        <option value="2592000000">1 Month</option>
        <option value="31536000000">1 Year</option>
        <option value="0">Lifetime</option>
      </select>

      <label class="field-label" for="createKeyTags">Tag</label>
      <select id="createKeyTags">
        <option value="">No Tag</option>
      </select>
      <div class="bulk-help">
        Choose from existing Alter Hub preset tags only.
      </div>

      <div class="modal-actions">
        <button
          class="primary-button"
          id="confirmCreateKeyButton"
        >
          Create Key
        </button>

        <button
          class="ghost-button"
          id="cancelCreateKeyButton"
        >
          Cancel
        </button>
      </div>

      <p
        class="modal-message"
        id="createKeyMessage"
      ></p>
    </div>
  </div>

  <div
    class="modal-backdrop"
    id="bulkKeyModal"
  >
    <div class="modal-card">
      <button
        class="modal-close-x"
        id="closeBulkKeyX"
        type="button"
        aria-label="Close bulk management"
      >×</button>

      <div id="bulkManagementChoiceView">
        <h2>Bulk Management</h2>
        <p>
          Choose whether you want to create or permanently delete multiple Alter Hub keys.
        </p>

        <div class="bulk-management-choice">
          <button class="bulk-choice-button" id="openBulkCreateButton" type="button">
            <strong>Bulk Creation</strong>
            <span>Create up to 250 keys with a shared access plan, duration, and optional tags.</span>
          </button>

          <button class="bulk-choice-button danger" id="openBulkDeleteButton" type="button">
            <strong>Bulk Deletion</strong>
            <span>Delete selected keys or paste a comma-separated list of keys to remove.</span>
          </button>
        </div>
      </div>

      <div id="bulkKeyCreateView" style="display:none">
        <h2>Bulk Creation</h2>
        <p>
          Generate keys automatically or enter your own keys separated by commas.
        </p>

        <label class="field-label" for="bulkKeySource">Key Source</label>
        <select id="bulkKeySource">
          <option value="generated">System Generate</option>
          <option value="manual">My Own Keys</option>
        </select>

        <div id="bulkKeyGeneratedFields">
          <label class="field-label" for="bulkKeyCount">Number of Keys</label>
          <input id="bulkKeyCount" type="number" min="1" max="250" value="10">
          <div class="bulk-help">Up to 250 keys can be created in one batch.</div>
        </div>

        <div id="bulkKeyManualFields" style="display:none">
          <label class="field-label" for="bulkKeyManualValues">Custom Keys</label>
          <textarea id="bulkKeyManualValues" placeholder="ALPHA, BETA, GAMMA"></textarea>
          <div class="bulk-help">
            Separate keys with commas or new lines. ALTER_ is added automatically when missing.
          </div>
        </div>

        <label class="field-label" for="bulkKeyPlan">Access Plan</label>
        <select id="bulkKeyPlan">
          <option value="free">Free</option>
          <option value="keyless">Keyless</option>
          <option value="premium">Premium</option>
          <option value="premium_plus">Premium Plus</option>
        </select>

        <label class="field-label" for="bulkKeyDuration">Duration</label>
        <select id="bulkKeyDuration">
          <option value="43200000">12 Hours</option>
          <option value="86400000">1 Day</option>
          <option value="604800000">1 Week</option>
          <option value="2592000000">1 Month</option>
          <option value="31536000000">1 Year</option>
          <option value="0">Lifetime</option>
        </select>

        <label class="field-label" for="bulkKeyTags">Tag</label>
        <select id="bulkKeyTags">
          <option value="">No Tag</option>
        </select>
        <div class="bulk-help">
          Choose from existing Alter Hub preset tags only.
        </div>

        <div class="modal-actions">
          <button class="primary-button" id="confirmBulkKeyButton">Create Bulk Keys</button>
          <button class="ghost-button" id="bulkCreateBackButton">Back</button>
        </div>

        <p class="modal-message" id="bulkKeyMessage"></p>
      </div>

      <div id="bulkDeleteView" style="display:none">
        <h2>Bulk Deletion</h2>
        <p>
          Permanently remove multiple keys. Redeemed licenses are deleted with their key data.
        </p>

        <label class="field-label" for="bulkDeleteSource">Deletion Method</label>
        <select id="bulkDeleteSource">
          <option value="selected">Use Selected Keys</option>
          <option value="manual">Paste Keys</option>
          <option value="current_view">Current Filtered View</option>
          <option value="current_tab">Everything in Current Tab</option>
          <option value="tag">Keys With a Tag</option>
          <option value="plan">Keys by Access Plan</option>
          <option value="status">Keys by Status</option>
          <option value="duration">Keys by Duration</option>
          <option value="created_period">Keys Created Recently</option>
        </select>

        <div id="bulkDeleteSelectedFields">
          <div class="bulk-delete-summary" id="bulkDeleteSelectedSummary">
            No keys are selected in the current management view.
          </div>
        </div>

        <div id="bulkDeleteManualFields" style="display:none">
          <label class="field-label" for="bulkDeleteManualValues">Keys</label>
          <textarea id="bulkDeleteManualValues" placeholder="ALTER_ABC, ALTER_DEF, ALTER_GHI"></textarea>
          <div class="bulk-help">
            Separate keys with commas or new lines. Up to 250 keys can be processed at once.
          </div>
        </div>

        <div class="bulk-delete-option-panel" id="bulkDeleteTagFields" style="display:none">
          <label class="field-label" for="bulkDeleteTag">Tag</label>
          <select id="bulkDeleteTag"></select>
        </div>

        <div class="bulk-delete-option-panel" id="bulkDeletePlanFields" style="display:none">
          <label class="field-label" for="bulkDeletePlan">Access Plan</label>
          <select id="bulkDeletePlan">
            <option value="free">Free</option>
            <option value="keyless">Keyless</option>
            <option value="premium">Premium</option>
            <option value="premium_plus">Premium Plus</option>
          </select>
        </div>

        <div class="bulk-delete-option-panel" id="bulkDeleteStatusFields" style="display:none">
          <label class="field-label" for="bulkDeleteStatus">Status</label>
          <select id="bulkDeleteStatus">
            <option value="active">Active</option>
            <option value="nr">Not Redeemed</option>
            <option value="revoked">Revoked</option>
            <option value="expired">Expired</option>
          </select>
        </div>

        <div class="bulk-delete-option-panel" id="bulkDeleteDurationFields" style="display:none">
          <label class="field-label" for="bulkDeleteDuration">Duration</label>
          <select id="bulkDeleteDuration">
            <option value="43200000">12 Hours</option>
            <option value="86400000">1 Day</option>
            <option value="604800000">1 Week</option>
            <option value="2592000000">1 Month</option>
            <option value="31536000000">1 Year</option>
            <option value="0">Lifetime</option>
          </select>
        </div>

        <div class="bulk-delete-option-panel" id="bulkDeleteCreatedFields" style="display:none">
          <label class="field-label" for="bulkDeleteCreated">Created During</label>
          <select id="bulkDeleteCreated">
            <option value="1d">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="1y">Last 12 Months</option>
          </select>
        </div>

        <div class="bulk-delete-summary" id="bulkDeleteDynamicSummary" style="display:none"></div>

        <div class="modal-actions">
          <button class="danger-button" id="confirmBulkDeleteButton">Delete Keys</button>
          <button class="ghost-button" id="bulkDeleteBackButton">Back</button>
        </div>

        <p class="modal-message" id="bulkDeleteMessage"></p>
      </div>

      <div class="bulk-results" id="bulkKeyResultsWrap">
        <h2>Bulk Keys Created</h2>
        <p class="bulk-result-count" id="bulkKeyResultMessage"></p>

        <label class="field-label" for="bulkKeyResults">Created Keys</label>
        <textarea id="bulkKeyResults" readonly></textarea>

        <div class="modal-actions">
          <button class="secondary-button" id="downloadBulkKeysButton">Download .txt</button>
          <button class="ghost-button" id="copyBulkKeysButton">Copy List</button>
          <button class="ghost-button" id="closeBulkKeyResultButton">Close</button>
        </div>
      </div>

      <div class="bulk-results" id="bulkDeleteResultsWrap">
        <h2>Bulk Deletion Complete</h2>
        <p class="bulk-result-count" id="bulkDeleteResultMessage"></p>

        <label class="field-label" for="bulkDeleteResults">Deleted Keys</label>
        <textarea id="bulkDeleteResults" readonly></textarea>

        <div class="modal-actions">
          <button class="ghost-button" id="closeBulkDeleteResultButton">Close</button>
        </div>
      </div>
    </div>
  </div>

  <div
    class="modal-backdrop"
    id="exportCsvModal"
  >
    <div class="modal-card">
      <button class="modal-close-x" id="closeExportCsvX" type="button" aria-label="Close CSV export">×</button>

      <h2>Export CSV</h2>
      <p>
        Choose what Alter Hub data should be exported and how much history to include.
      </p>

      <label class="field-label" for="exportCsvType">Data Set</label>
      <select id="exportCsvType">
        <option value="analytics">Statistics & Analytics</option>
        <option value="countries">Country Summary</option>
        <option value="keys">Key Inventory</option>
        <option value="activity">Admin Activity Log</option>
      </select>

      <label class="field-label" for="exportCsvPeriod">Time Period</label>
      <select id="exportCsvPeriod">
        <option value="1d">Last 24 Hours</option>
        <option value="7d">Last 7 Days</option>
        <option value="30d" selected>Last 30 Days</option>
        <option value="1y">Last Year</option>
        <option value="lifetime">Lifetime</option>
      </select>

      <div class="export-note" id="exportCsvNote">
        Analytics exports use the same hourly, daily, and monthly buckets as the Statistics chart.
      </div>

      <div class="modal-actions">
        <button class="primary-button" id="confirmExportCsvButton">Download CSV</button>
        <button class="ghost-button" id="cancelExportCsvButton">Cancel</button>
      </div>

      <p class="modal-message" id="exportCsvMessage"></p>
    </div>
  </div>

  <div class="copy-toast" id="keyCopiedToast">Key Copied!</div>

  <script src="https://cdn.jsdelivr.net/npm/jsvectormap"></script>
  <script src="https://cdn.jsdelivr.net/npm/jsvectormap/dist/maps/world.js"></script>

  <script>
    // Preserve the dashboard's existing request code while moving real
    // authentication into an HttpOnly cookie. ADMIN_SECRET below is only
    // a harmless in-memory "session active" sentinel; it never contains
    // the Cloudflare ADMIN_SECRET after this security upgrade.
    let ADMIN_SECRET = "";

    const AH_NATIVE_FETCH =
      window.fetch.bind(window);

    window.fetch = async function(input, init) {
      let targetUrl = null;

      try {
        const rawUrl =
          typeof input === "string"
            ? input
            : input.url;

        targetUrl =
          new URL(rawUrl, window.location.href);
      } catch (error) {
        targetUrl = null;
      }

      const isAdminApi =
        targetUrl &&
        targetUrl.origin === window.location.origin &&
        targetUrl.pathname.startsWith("/api/admin/");

      if (!isAdminApi) {
        return AH_NATIVE_FETCH(input, init);
      }

      const nextInit =
        Object.assign({}, init || {});

      const headers =
        new Headers(
          nextInit.headers || undefined
        );

      // This non-CORS-whitelisted header is an additional CSRF barrier.
      headers.set(
        "X-AlterHub-Admin",
        "1"
      );

      nextInit.headers = headers;
      nextInit.credentials = "same-origin";

      const response =
        await AH_NATIVE_FETCH(
          input,
          nextInit
        );

      if (
        response.status === 401 &&
        targetUrl.pathname !== "/api/admin/login" &&
        targetUrl.pathname !== "/api/admin/session" &&
        targetUrl.pathname !== "/api/admin/logout"
      ) {
        showAdminLogin(
          "Your admin session expired. Please sign in again."
        );
      }

      return response;
    };

    let KEYS = [];
    let ACTIVE_TAB = "free";
    let ACTIVE_PAGE = "statistics";
    let CHECKPOINT_STATS = {
      total: 0,
      validLicenses: 0,
      redeemsTotal: 0,
      points: []
    };
    let CHECKPOINT_FUNNEL = {
      period: "1d",
      bestProvider: "",
      providers: {
        linkvertise: null,
        lootlabs: null
      }
    };
    let PendingRevokeLicenseId = null;
    let PendingRevokeKey = null;
    let PendingRevokeItems = [];
    let SELECTED_KEY_IDS = new Set();
    let KEY_COPY_TOAST_TIMER = null;
    let LAST_BULK_KEYS = [];
    let COUNTRY_STATS = {
      countries: {},
      top5: [],
      totalUsers: 0
    };
    let COUNTRY_MAP = null;
    let ACTIVITY_EVENTS = [];
    let ACTIVITY_SEARCH_TIMER = null;
    let SYSTEM_HEALTH = {
      overall: "unknown",
      components: {}
    };

    const PRESET_TAGS = [
      "Owner",
      "Developer",
      "Staff",
      "Tester",
      "Partner",
      "Giveaway",
      "YouTube",
      "Moderator",
      "Sponsor"
    ];

    function populateCreationTagSelect(selectId) {
      const select =
        document.getElementById(selectId);

      if (!select) {
        return;
      }

      select.innerHTML = "";

      const none =
        document.createElement("option");

      none.value = "";
      none.textContent = "No Tag";
      select.appendChild(none);

      PRESET_TAGS.forEach(function(tag) {
        const option =
          document.createElement("option");

        option.value = tag;
        option.textContent = tag;
        select.appendChild(option);
      });

      select.value = "";
    }

    populateCreationTagSelect("createKeyTags");
    populateCreationTagSelect("bulkKeyTags");

    const loginScreen =
      document.getElementById("loginScreen");

    const adminShell =
      document.getElementById("adminShell");

    const loginError =
      document.getElementById("loginError");

    function escapeHtml(value) {
      return String(value == null ? "" : value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function formatTime(ms) {
      ms = Math.max(0, Number(ms) || 0);

      if (ms <= 0) {
        return "Expired";
      }

      const totalSeconds =
        Math.floor(ms / 1000);

      const days =
        Math.floor(totalSeconds / 86400);

      const hours =
        Math.floor(
          (totalSeconds % 86400) / 3600
        );

      const minutes =
        Math.floor(
          (totalSeconds % 3600) / 60
        );

      if (days > 0) {
        return days + "d " + hours + "h " + minutes + "m";
      }

      return hours + "h " + minutes + "m";
    }

    function formatKeyDuration(ms) {
      ms = Number(ms) || 0;

      if (ms === 0) {
        return "Lifetime";
      }

      const totalDays =
        Math.round(
          ms / (24 * 60 * 60 * 1000)
        );

      return totalDays === 1
        ? "1 day"
        : totalDays + " days";
    }

    function formatDate(timestamp) {
      if (!timestamp) {
        return "Never";
      }

      return new Date(
        Number(timestamp)
      ).toLocaleString();
    }

    function statusFor(item) {
      if (item.revoked) {
        return {
          text: "Revoked",
          className: "revoked-status"
        };
      }

      if (!item.license_id) {
        return {
          text: "NR",
          className: "not-redeemed-status"
        };
      }

      if (
        Number(item.expires_at) <= Date.now()
      ) {
        return {
          text: "Expired",
          className: "expired-status"
        };
      }

      return {
        text: "Active",
        className: "active-status"
      };
    }

    function setActiveNav(page) {
      const ids = {
        statistics: "statisticsNavButton",
        explorer: "explorerNavButton",
        gifts: "giftsNavButton",
        activity: "activityNavButton",
        settings: "settingsNavButton"
      };

      document
        .querySelectorAll(".sidebar-item")
        .forEach(function(button) {
          button.classList.remove("active");
        });

      const activeButton =
        document.getElementById(ids[page]);

      if (activeButton) {
        activeButton.classList.add("active");
      }
    }

    function countryName(code) {
      const normalized =
        String(code || "").toUpperCase();

      try {
        if (
          typeof Intl !== "undefined" &&
          Intl.DisplayNames
        ) {
          return new Intl.DisplayNames(
            ["en"],
            { type: "region" }
          ).of(normalized) || normalized;
        }
      } catch (error) {
        // Fall back to the ISO code.
      }

      return normalized || "Unknown";
    }

    function renderTopCountries() {
      const root =
        document.getElementById(
          "countryTopFive"
        );

      if (!root) {
        return;
      }

      const top =
        Array.isArray(COUNTRY_STATS.top5)
          ? COUNTRY_STATS.top5
          : [];

      let html =
        '<div class="country-top-title">Top 5 Countries</div>';

      if (top.length === 0) {
        html +=
          '<div class="country-top-row">' +
            '<span class="country-top-rank">—</span>' +
            '<span class="country-top-name">No data yet</span>' +
            '<span class="country-top-count">0</span>' +
          '</div>';
      } else {
        top.forEach(
          function(item, index) {
            const code =
              String(
                item.country_code || ""
              ).toUpperCase();

            const users =
              Number(item.users || 0);

            html +=
              '<div class="country-top-row">' +
                '<span class="country-top-rank">' +
                  String(index + 1) +
                '</span>' +
                '<span class="country-top-name">' +
                  escapeHtml(
                    countryName(code)
                  ) +
                '</span>' +
                '<span class="country-top-count">' +
                  String(users) +
                '</span>' +
              '</div>';
          }
        );
      }

      root.innerHTML = html;
    }

    function renderCountryMap() {
      const mapElement =
        document.getElementById(
          "countryMap"
        );

      const empty =
        document.getElementById(
          "countryMapEmpty"
        );

      if (!mapElement) {
        return;
      }

      const values =
        COUNTRY_STATS.countries || {};

      const hasData =
        Object.keys(values).some(
          function(code) {
            return Number(values[code] || 0) > 0;
          }
        );

      if (empty) {
        empty.style.display =
          hasData ? "none" : "flex";
      }

      if (
        typeof window.jsVectorMap !==
        "function"
      ) {
        if (empty) {
          empty.style.display = "flex";
          empty.textContent =
            "The map library could not load. Top country data is still available.";
        }
        return;
      }

      try {
        if (
          COUNTRY_MAP &&
          typeof COUNTRY_MAP.destroy ===
            "function"
        ) {
          COUNTRY_MAP.destroy();
        }
      } catch (error) {
        // Recreate the map below.
      }

      mapElement.innerHTML = "";

      try {
        COUNTRY_MAP =
          new window.jsVectorMap({
            selector: "#countryMap",
            map: "world",
            backgroundColor: "transparent",
            zoomButtons: true,
            zoomOnScroll: true,
            regionStyle: {
              initial: {
                fill: "#20232b",
                stroke: "#090b0f",
                strokeWidth: 0.65,
                fillOpacity: 1
              },
              hover: {
                fillOpacity: 1,
                cursor: "pointer"
              }
            },
            series: {
              regions: [
                {
                  attribute: "fill",
                  values: values,
                  // Low-volume countries are lighter red;
                  // the most popular countries become the darkest red.
                  scale: [
                    "#7a0d18",
                    "#ff9aa4"
                  ],
                  normalizeFunction: "linear"
                }
              ]
            },
            onRegionTooltipShow:
              function(event, tooltip, code) {
                const normalized =
                  String(code || "")
                    .toUpperCase();

                const users =
                  Number(
                    values[normalized] || 0
                  );

                tooltip.text(
                  countryName(normalized) +
                  " — " +
                  String(users) +
                  (
                    users === 1
                      ? " user"
                      : " users"
                  )
                );
              }
          });
      } catch (error) {
        console.error(
          "COUNTRY MAP ERROR:",
          error
        );

        if (empty) {
          empty.style.display = "flex";
          empty.textContent =
            "Unable to render the world map. Top country data is still available.";
        }
      }
    }

    async function loadCountryStats() {
      if (!ADMIN_SECRET) {
        return false;
      }

      try {
        const response =
          await fetch(
            "/api/admin/country-stats",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json"
              },
              body: JSON.stringify({})
            }
          );

        const data =
          await response.json();

        if (
          !response.ok ||
          data.success !== true
        ) {
          console.error(
            "COUNTRY STATS ERROR:",
            data.error || "Unknown error"
          );
          return false;
        }

        COUNTRY_STATS = {
          countries:
            data.countries || {},
          top5:
            data.top5 || [],
          totalUsers:
            Number(data.total_users || 0)
        };

        renderTopCountries();
        renderCountryMap();
        renderDashboardAlerts();

        return true;
      } catch (error) {
        console.error(
          "COUNTRY STATS REQUEST ERROR:",
          error
        );
        return false;
      }
    }


    function getItemTags(item) {
      return Array.isArray(item.tags)
        ? item.tags
            .map(function(tag) {
              return String(tag || "").trim();
            })
            .filter(Boolean)
        : [];
    }

    function renderTagChips(container, tags) {
      container.innerHTML = "";

      const values = Array.isArray(tags)
        ? tags
        : [];

      if (values.length === 0) {
        const empty = document.createElement("span");
        empty.className = "note-cell";
        empty.textContent = "—";
        container.appendChild(empty);
        return;
      }

      values.forEach(function(tag) {
        const chip = document.createElement("span");
        const normalized =
          String(tag || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-");

        chip.className =
          "tag-chip tag-" + normalized;
        chip.textContent = tag;
        container.appendChild(chip);
      });
    }

    function populateTagFilter() {
      const select =
        document.getElementById("filterTag");

      if (!select) {
        return;
      }

      const previous = select.value || "all";
      const seen = new Map();

      PRESET_TAGS.forEach(function(tag) {
        seen.set(tag.toLowerCase(), tag);
      });

      KEYS.forEach(function(item) {
        getItemTags(item).forEach(function(tag) {
          const key = tag.toLowerCase();
          if (!seen.has(key)) {
            seen.set(key, tag);
          }
        });
      });

      select.innerHTML = "";

      const all = document.createElement("option");
      all.value = "all";
      all.textContent = "All Tags";
      select.appendChild(all);

      Array.from(seen.values())
        .sort(function(a, b) {
          return a.localeCompare(b);
        })
        .forEach(function(tag) {
          const option = document.createElement("option");
          option.value = tag.toLowerCase();
          option.textContent = tag;
          select.appendChild(option);
        });

      const exists =
        Array.from(select.options)
          .some(function(option) {
            return option.value === previous;
          });

      select.value = exists ? previous : "all";
    }

    function createdFilterStart(value) {
      const DAY = 24 * 60 * 60 * 1000;
      const now = Date.now();

      if (value === "1d") {
        return now - DAY;
      }

      if (value === "7d") {
        return now - 7 * DAY;
      }

      if (value === "30d") {
        return now - 30 * DAY;
      }

      if (value === "1y") {
        return now - 366 * DAY;
      }

      return 0;
    }

    function renderDashboardAlerts() {
      const root =
        document.getElementById("dashboardAlerts");

      const pill =
        document.getElementById("alertSummaryPill");

      if (!root || !pill) {
        return;
      }

      const now = Date.now();
      const DAY = 24 * 60 * 60 * 1000;

      const expiring24 =
        KEYS.filter(function(item) {
          return (
            Boolean(item.license_id) &&
            item.access_plan === "premium" &&
            Number(item.license_duration_ms) > DAY &&
            !item.revoked &&
            Number(item.expires_at) > now &&
            Number(item.expires_at) <= now + DAY
          );
        }).length;

      const revoked =
        KEYS.filter(function(item) {
          return Boolean(item.revoked);
        }).length;

      const alerts = [];

      if (
        SYSTEM_HEALTH.overall === "attention"
      ) {
        alerts.push({
          severity: "danger",
          title: "System health needs attention",
          detail:
            "One or more Alter Hub dependencies are unavailable or not configured.",
          meta: "Health"
        });
      }

      if (expiring24 > 0) {
        alerts.push({
          severity: "danger",
          title:
            String(expiring24) +
            (expiring24 === 1
              ? " premium license expires within 24 hours"
              : " premium licenses expire within 24 hours"),
          detail:
            "Review these premium licenses before access ends.",
          meta: "24h"
        });
      }



      if (revoked > 0) {
        alerts.push({
          severity: "warning",
          title:
            String(revoked) +
            (revoked === 1
              ? " revoked license"
              : " revoked licenses"),
          detail:
            "Revoked licenses remain visible for management and audit history.",
          meta: "Access"
        });
      }

      if (alerts.length === 0) {
        alerts.push({
          severity: "success",
          title: "No active dashboard alerts",
          detail:
            "Licenses and Alter Hub services currently look normal.",
          meta: "Clear"
        });
      }

      pill.textContent =
        alerts.length === 1 &&
        alerts[0].severity === "success"
          ? "All Clear"
          : String(alerts.length) + " active";

      root.innerHTML = "";

      alerts.forEach(function(alert) {
        const row = document.createElement("div");
        row.className =
          "alert-row " + alert.severity;

        const dot = document.createElement("span");
        dot.className = "alert-indicator";

        const copy = document.createElement("div");
        copy.className = "alert-copy";

        const title = document.createElement("strong");
        title.textContent = alert.title;

        const detail = document.createElement("span");
        detail.textContent = alert.detail;

        copy.appendChild(title);
        copy.appendChild(detail);

        const meta = document.createElement("div");
        meta.className = "alert-meta";
        meta.textContent = alert.meta;

        row.appendChild(dot);
        row.appendChild(copy);
        row.appendChild(meta);
        root.appendChild(row);
      });
    }

    function renderSystemHealth() {
      const root =
        document.getElementById("systemHealthList");

      if (!root) {
        return;
      }

      const components =
        SYSTEM_HEALTH.components || {};

      const orderedKeys = [
        "database",
        "analytics",
        "activity_log",
        "private_scripts",
        "linkvertise",
        "lootlabs"
      ];

      root.innerHTML = "";

      orderedKeys.forEach(function(key) {
        const component = components[key];

        if (!component) {
          return;
        }

        const row = document.createElement("div");
        row.className = "health-row";

        const copy = document.createElement("div");
        const name = document.createElement("div");
        name.className = "health-name";
        name.textContent =
          component.label || key;

        copy.appendChild(name);

        if (component.last_event_at) {
          const detail = document.createElement("div");
          detail.className = "health-detail";
          detail.textContent =
            "Last event: " +
            formatDate(component.last_event_at);
          copy.appendChild(detail);
        }

        const status = document.createElement("div");
        status.className =
          "health-status " +
          (component.ok ? "ok" : "bad");
        status.textContent =
          component.ok ? "Online" : "Attention";

        row.appendChild(copy);
        row.appendChild(status);
        root.appendChild(row);
      });

      if (root.children.length === 0) {
        root.innerHTML =
          '<div class="health-row"><div><div class="health-name">Health data unavailable</div></div><div class="health-status bad">Attention</div></div>';
      }
    }

    async function loadSystemHealth() {
      if (!ADMIN_SECRET) {
        return false;
      }

      try {
        const response =
          await fetch(
            "/api/admin/system-health",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({})
            }
          );

        const data = await response.json();

        if (
          !response.ok ||
          data.success !== true
        ) {
          throw new Error(
            data.error || "Unable to load system health."
          );
        }

        SYSTEM_HEALTH = {
          overall: data.overall || "unknown",
          components: data.components || {}
        };

        renderSystemHealth();
        renderDashboardAlerts();
        return true;
      } catch (error) {
        console.error("SYSTEM HEALTH ERROR:", error);
        SYSTEM_HEALTH = {
          overall: "attention",
          components: {}
        };
        renderSystemHealth();
        renderDashboardAlerts();
        return false;
      }
    }

    function activityActionLabel(action) {
      const labels = {
        create_key: "Create Key",
        bulk_create: "Bulk Create",
        delete_key: "Delete Key",
        bulk_delete: "Bulk Delete",
        revoke: "Revoke",
        unrevoke: "Unrevoke",
        revoke_delete: "Revoke + Delete",
        update_note: "Update Note",
        update_tags: "Update Tags",
        export_csv: "CSV Export"
      };

      return labels[action] ||
        String(action || "Activity");
    }

    function renderActivityLog() {
      const table =
        document.getElementById("activityTable");

      const summary =
        document.getElementById("activitySummary");

      if (!table || !summary) {
        return;
      }

      table.innerHTML = "";
      summary.textContent =
        String(ACTIVITY_EVENTS.length) +
        (ACTIVITY_EVENTS.length === 1
          ? " event"
          : " events");

      if (ACTIVITY_EVENTS.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 4;
        cell.className = "empty-state";
        cell.textContent =
          "No admin activity matches these filters.";
        row.appendChild(cell);
        table.appendChild(row);
        return;
      }

      ACTIVITY_EVENTS.forEach(function(item) {
        const row = document.createElement("tr");

        createTextCell(
          row,
          formatDate(item.created_at)
        );

        const actionCell =
          document.createElement("td");

        const badge =
          document.createElement("span");

        badge.className =
          "activity-action " +
          String(item.action || "");

        badge.textContent =
          activityActionLabel(item.action);

        actionCell.appendChild(badge);
        row.appendChild(actionCell);

        createTextCell(
          row,
          item.target_ref
            ? (
                String(item.target_type || "item") +
                " · …" +
                String(item.target_ref).slice(-8)
              )
            : String(item.target_type || "—"),
          "mono"
        );

        createTextCell(
          row,
          item.description || "—"
        );

        table.appendChild(row);
      });
    }

    async function loadActivityLog() {
      if (!ADMIN_SECRET) {
        return false;
      }

      const action =
        document
          .getElementById("activityActionFilter")
          .value;

      const period =
        document
          .getElementById("activityPeriodFilter")
          .value;

      const search =
        document
          .getElementById("activitySearch")
          .value
          .trim();

      try {
        const response =
          await fetch(
            "/api/admin/activity-log",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                action: action,
                period: period,
                search: search
              })
            }
          );

        const data = await response.json();

        if (
          !response.ok ||
          data.success !== true
        ) {
          throw new Error(
            data.error || "Unable to load activity log."
          );
        }

        ACTIVITY_EVENTS =
          Array.isArray(data.events)
            ? data.events
            : [];

        renderActivityLog();
        return true;
      } catch (error) {
        console.error("ACTIVITY LOG ERROR:", error);
        ACTIVITY_EVENTS = [];
        renderActivityLog();
        return false;
      }
    }

    function updateExportCsvNote() {
      const type =
        document.getElementById("exportCsvType").value;

      const note =
        document.getElementById("exportCsvNote");

      const periodSelect =
        document.getElementById("exportCsvPeriod");

      periodSelect.disabled =
        type === "countries";

      if (type === "countries") {
        periodSelect.value = "lifetime";
        note.textContent =
          "Country Summary exports the current lifetime country totals.";
        return;
      }

      if (type === "keys") {
        note.textContent =
          "Key Inventory includes keys created during the selected period, with plan, tags, note and current license state.";
        return;
      }

      if (type === "activity") {
        note.textContent =
          "Admin Activity exports actions recorded during the selected period.";
        return;
      }

      note.textContent =
        "Analytics uses the same hourly, daily, and monthly periods as the Statistics chart.";
    }

    function openExportCsv() {
      document.getElementById("exportCsvMessage")
        .textContent = "";
      updateExportCsvNote();
      document.getElementById("exportCsvModal")
        .style.display = "flex";
    }

    function closeExportCsv() {
      document.getElementById("exportCsvModal")
        .style.display = "none";
      document.getElementById("exportCsvMessage")
        .textContent = "";
    }

    async function exportCsv() {
      const type =
        document.getElementById("exportCsvType").value;

      const period =
        document.getElementById("exportCsvPeriod").value;

      const message =
        document.getElementById("exportCsvMessage");

      const button =
        document.getElementById("confirmExportCsvButton");

      message.textContent = "Preparing CSV...";
      button.disabled = true;

      try {
        const response =
          await fetch(
            "/api/admin/export-csv",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                export_type: type,
                period: period
              })
            }
          );

        if (!response.ok) {
          let errorMessage = "CSV export failed.";

          try {
            const data = await response.json();
            errorMessage = data.error || errorMessage;
          } catch (error) {
            // Use default error.
          }

          throw new Error(errorMessage);
        }

        const blob = await response.blob();
        const disposition =
          response.headers.get("Content-Disposition") || "";

        const match =
          disposition.match(/filename="([^"]+)"/i);

        const filename =
          match && match[1]
            ? match[1]
            : "AlterHub_Export.csv";

        const objectUrl =
          URL.createObjectURL(blob);

        const anchor =
          document.createElement("a");

        anchor.href = objectUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();

        setTimeout(function() {
          URL.revokeObjectURL(objectUrl);
        }, 1000);

        message.textContent = "CSV downloaded.";

        setTimeout(function() {
          closeExportCsv();
        }, 500);
      } catch (error) {
        message.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    }

    function showPage(page) {
      ACTIVE_PAGE = page;
      setActiveNav(page);

      document
        .querySelectorAll(".page-section")
        .forEach(function(section) {
          section.classList.remove("active-page");
        });

      if (page === "statistics") {
        document
          .getElementById("statisticsPage")
          .classList.add("active-page");

        updateStatistics();
        loadCheckpointStats();
        loadCheckpointFunnelStats();
        loadCountryStats();
        loadSystemHealth();
        return;
      }

      if (page === "activity") {
        document
          .getElementById("activityPage")
          .classList.add("active-page");
        loadActivityLog();
        return;
      }

      if (page === "settings") {
        document
          .getElementById("settingsPage")
          .classList.add("active-page");
        loadSystemHealth();
        return;
      }

      clearSelectedKeys();

      ACTIVE_TAB =
        page === "gifts"
          ? "premium"
          : "free";

      document
        .getElementById("keysPage")
        .classList.add("active-page");

      document
        .getElementById("keysPageTitle")
        .textContent =
          page === "gifts"
            ? "Premium"
            : "Standard";

      document
        .getElementById("keysPageSubtitle")
        .textContent =
          page === "gifts"
            ? "Premium and Premium Plus Alter Hub access."
            : "Free and Keyless Alter Hub access.";

      document
        .getElementById("filterPlan")
        .value = "all";

      renderKeys();
    }

    function updateBar(
      fillId,
      valueId,
      value,
      total
    ) {
      const percent =
        total > 0
          ? Math.max(
              4,
              Math.round((value / total) * 100)
            )
          : 0;

      document
        .getElementById(fillId)
        .style.width = percent + "%";

      document
        .getElementById(valueId)
        .textContent = String(value);
    }

    function updateStatistics() {
      const now = Date.now();

      const total = KEYS.length;

      const active =
        KEYS.filter(function(item) {
          return Boolean(item.license_id) &&
            !item.revoked &&
            Number(item.expires_at) > now;
        }).length;

      const nr =
        KEYS.filter(function(item) {
          return !item.license_id;
        }).length;

      const revoked =
        KEYS.filter(function(item) {
          return item.revoked;
        }).length;

      const expired =
        KEYS.filter(function(item) {
          return Boolean(item.license_id) &&
            !item.revoked &&
            Number(item.expires_at) <= now;
        }).length;

      const totalRedeems =
        Number(
          CHECKPOINT_STATS.redeemsTotal || 0
        );

      const planCounts = {
        free: 0,
        keyless: 0,
        premium: 0,
        premium_plus: 0
      };

      KEYS.forEach(function(item) {
        const plan =
          String(item.access_plan || "free");

        if (
          Object.prototype.hasOwnProperty.call(
            planCounts,
            plan
          )
        ) {
          planCounts[plan] += 1;
        }
      });

      document
        .getElementById("statTotalKeys")
        .textContent = String(total);

      document
        .getElementById("statActiveLicenses")
        .textContent = String(active);

      document
        .getElementById("statCheckpointsPassed")
        .textContent =
          String(CHECKPOINT_STATS.total || 0);

      document
        .getElementById("statTotalRedeems")
        .textContent = String(totalRedeems);

      document
        .getElementById("statusActive")
        .textContent = String(active);

      document
        .getElementById("statusNR")
        .textContent = String(nr);

      document
        .getElementById("statusRevoked")
        .textContent = String(revoked);

      document
        .getElementById("statusExpired")
        .textContent = String(expired);

      updateBar(
        "barFree",
        "barFreeValue",
        planCounts.free,
        total
      );

      updateBar(
        "barKeyless",
        "barKeylessValue",
        planCounts.keyless,
        total
      );

      updateBar(
        "barPremium",
        "barPremiumValue",
        planCounts.premium,
        total
      );

      updateBar(
        "barPremiumPlus",
        "barPremiumPlusValue",
        planCounts.premium_plus,
        total
      );

      renderDashboardAlerts();
    }

    function checkpointPeriodText(period) {
      if (period === "7d") {
        return "Last 7 days";
      }

      if (period === "30d") {
        return "Last 30 days";
      }

      if (period === "1y") {
        return "Last 12 months";
      }

      if (period === "lifetime") {
        return "Lifetime";
      }

      return "Last 24 hours";
    }

    function checkpointChartLabel(timestamp, period) {
      const date =
        new Date(Number(timestamp));

      if (period === "1d") {
        return date.toLocaleTimeString(
          [],
          {
            hour: "numeric",
            hour12: true
          }
        );
      }

      if (
        period === "1y" ||
        period === "lifetime"
      ) {
        return date.toLocaleDateString(
          [],
          {
            month: "short",
            year:
              period === "lifetime"
                ? "2-digit"
                : undefined
          }
        );
      }

      return date.toLocaleDateString(
        [],
        {
          month: "short",
          day: "2-digit"
        }
      );
    }

    function checkpointTooltipDate(timestamp, period) {
      const date =
        new Date(Number(timestamp));

      if (period === "1d") {
        return date.toLocaleString(
          [],
          {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          }
        );
      }

      if (
        period === "1y" ||
        period === "lifetime"
      ) {
        return date.toLocaleDateString(
          [],
          {
            month: "long",
            year: "numeric"
          }
        );
      }

      return date.toLocaleDateString(
        [],
        {
          day: "2-digit",
          month: "short",
          year: "numeric"
        }
      );
    }

    let CHECKPOINT_CHART_POINTS = [];
    let CHECKPOINT_CHART_HOVER_INDEX = null;

    function drawCheckpointChart(
      points,
      hoverIndex = CHECKPOINT_CHART_HOVER_INDEX
    ) {
      CHECKPOINT_CHART_POINTS =
        Array.isArray(points)
          ? points
          : [];

      const canvas =
        document.getElementById(
          "checkpointChart"
        );

      if (!canvas) {
        return;
      }

      const parent =
        canvas.parentElement;

      const width =
        Math.max(
          320,
          Math.floor(
            parent.clientWidth || 0
          )
        );

      const height = 285;

      const dpr =
        Math.max(
          1,
          window.devicePixelRatio || 1
        );

      canvas.width =
        Math.floor(width * dpr);

      canvas.height =
        Math.floor(height * dpr);

      const context =
        canvas.getContext("2d");

      context.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
      );

      context.clearRect(
        0,
        0,
        width,
        height
      );

      const period =
        document
          .getElementById(
            "statsPeriodSelect"
          )
          .value;

      const bottomPadding =
        period === "30d"
          ? 54
          : 34;

      const padding = {
        left: 42,
        right: 14,
        top: 18,
        bottom: bottomPadding
      };

      const chartWidth =
        width -
        padding.left -
        padding.right;

      const chartHeight =
        height -
        padding.top -
        padding.bottom;

      const checkpointValues =
        CHECKPOINT_CHART_POINTS.map(
          function(point) {
            return Number(
              point.count || 0
            );
          }
        );

      const licenseValues =
        CHECKPOINT_CHART_POINTS.map(
          function(point) {
            return Number(
              point.valid_licenses || 0
            );
          }
        );

      const maxValue =
        Math.max(
          1,
          ...checkpointValues,
          ...licenseValues
        );

      context.font =
        "10px Inter, Arial, sans-serif";

      context.textBaseline =
        "middle";

      for (
        let line = 0;
        line <= 4;
        line++
      ) {
        const y =
          padding.top +
          (
            chartHeight *
            line /
            4
          );

        context.beginPath();

        context.moveTo(
          padding.left,
          y
        );

        context.lineTo(
          width - padding.right,
          y
        );

        context.strokeStyle =
          "rgba(255,255,255,0.055)";

        context.lineWidth = 1;
        context.stroke();

        const value =
          Math.round(
            maxValue *
            (
              1 -
              line / 4
            )
          );

        context.fillStyle =
          "#676d78";

        context.textAlign =
          "right";

        context.fillText(
          String(value),
          padding.left - 8,
          y
        );
      }

      if (
        CHECKPOINT_CHART_POINTS.length === 0
      ) {
        context.fillStyle =
          "#8c929f";

        context.textAlign =
          "center";

        context.fillText(
          "No checkpoint data for this period",
          width / 2,
          height / 2
        );

        return;
      }

      const coordinates =
        CHECKPOINT_CHART_POINTS.map(
          function(point, index) {
            const x =
              CHECKPOINT_CHART_POINTS.length === 1
                ? (
                    padding.left +
                    chartWidth / 2
                  )
                : (
                    padding.left +
                    (
                      chartWidth *
                      index /
                      (
                        CHECKPOINT_CHART_POINTS.length -
                        1
                      )
                    )
                  );

            const count =
              Number(
                point.count || 0
              );

            const validLicenses =
              Number(
                point.valid_licenses || 0
              );

            const y =
              padding.top +
              chartHeight -
              (
                count /
                maxValue
              ) *
              chartHeight;

            const licenseY =
              padding.top +
              chartHeight -
              (
                validLicenses /
                maxValue
              ) *
              chartHeight;

            return {
              x: x,
              y: y,
              licenseY: licenseY,
              count: count,
              validLicenses: validLicenses,
              start: point.start
            };
          }
        );

      const gradient =
        context.createLinearGradient(
          0,
          padding.top,
          0,
          padding.top +
            chartHeight
        );

      gradient.addColorStop(
        0,
        "rgba(255, 52, 46, 0.24)"
      );

      gradient.addColorStop(
        1,
        "rgba(255, 52, 46, 0.00)"
      );

      context.beginPath();

      context.moveTo(
        coordinates[0].x,
        padding.top +
          chartHeight
      );

      coordinates.forEach(
        function(point) {
          context.lineTo(
            point.x,
            point.y
          );
        }
      );

      context.lineTo(
        coordinates[
          coordinates.length - 1
        ].x,
        padding.top +
          chartHeight
      );

      context.closePath();

      context.fillStyle =
        gradient;

      context.fill();

      context.beginPath();

      coordinates.forEach(
        function(point, index) {
          if (index === 0) {
            context.moveTo(
              point.x,
              point.y
            );
          } else {
            context.lineTo(
              point.x,
              point.y
            );
          }
        }
      );

      context.strokeStyle =
        "#ff342e";

      context.lineWidth = 2;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.stroke();

      coordinates.forEach(
        function(point) {
          if (point.count <= 0) {
            return;
          }

          context.beginPath();

          context.arc(
            point.x,
            point.y,
            3,
            0,
            Math.PI * 2
          );

          context.fillStyle =
            "#ff342e";

          context.fill();
        }
      );

      // Valid-license series
      context.beginPath();

      coordinates.forEach(
        function(point, index) {
          if (index === 0) {
            context.moveTo(
              point.x,
              point.licenseY
            );
          } else {
            context.lineTo(
              point.x,
              point.licenseY
            );
          }
        }
      );

      context.strokeStyle =
        "#d7d9df";

      context.lineWidth = 2;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.stroke();

      coordinates.forEach(
        function(point) {
          if (point.validLicenses <= 0) {
            return;
          }

          context.beginPath();

          context.arc(
            point.x,
            point.licenseY,
            3,
            0,
            Math.PI * 2
          );

          context.fillStyle =
            "#d7d9df";

          context.fill();
        }
      );

      context.fillStyle =
        "#676d78";

      context.font =
        "10px Inter, Arial, sans-serif";

      context.textBaseline =
        "top";

      const lifetimeLabelStep =
        period === "lifetime"
          ? Math.max(
              1,
              Math.ceil(
                coordinates.length / 12
              )
            )
          : 1;

      coordinates.forEach(
        function(point, index) {
          if (
            period === "lifetime" &&
            index %
              lifetimeLabelStep !==
              0 &&
            index !==
              coordinates.length - 1
          ) {
            return;
          }

          const label =
            checkpointChartLabel(
              point.start,
              period
            );

          if (period === "30d") {
            context.save();

            context.translate(
              point.x,
              padding.top +
                chartHeight +
                9
            );

            context.rotate(
              -Math.PI / 4
            );

            context.textAlign =
              "right";

            context.fillText(
              label,
              0,
              0
            );

            context.restore();

            return;
          }

          context.textAlign =
            "center";

          context.fillText(
            label,
            point.x,
            padding.top +
              chartHeight +
              10
          );
        }
      );

      if (
        hoverIndex === null ||
        !coordinates[hoverIndex]
      ) {
        return;
      }

      const hoverPoint =
        coordinates[hoverIndex];

      // Vertical hover guide
      context.beginPath();

      context.moveTo(
        hoverPoint.x,
        padding.top
      );

      context.lineTo(
        hoverPoint.x,
        padding.top +
          chartHeight
      );

      context.strokeStyle =
        "rgba(255,255,255,0.30)";

      context.lineWidth = 1;
      context.setLineDash([4, 4]);
      context.stroke();
      context.setLineDash([]);

      // Highlight hovered point
      context.beginPath();

      context.arc(
        hoverPoint.x,
        hoverPoint.y,
        5,
        0,
        Math.PI * 2
      );

      context.fillStyle =
        "#ff342e";

      context.fill();

      context.lineWidth = 2;

      context.strokeStyle =
        "#ffffff";

      context.stroke();

      // Highlight valid-license point
      context.beginPath();

      context.arc(
        hoverPoint.x,
        hoverPoint.licenseY,
        5,
        0,
        Math.PI * 2
      );

      context.fillStyle =
        "#d7d9df";

      context.fill();

      context.lineWidth = 2;

      context.strokeStyle =
        "#101217";

      context.stroke();

      const dateText =
        checkpointTooltipDate(
          hoverPoint.start,
          period
        );

      const tooltipWidth =
        period === "1d"
          ? 210
          : 190;

      const tooltipHeight = 104;

      let tooltipX =
        hoverPoint.x + 14;

      if (
        tooltipX +
          tooltipWidth >
        width - 8
      ) {
        tooltipX =
          hoverPoint.x -
          tooltipWidth -
          14;
      }

      tooltipX =
        Math.max(
          8,
          Math.min(
            tooltipX,
            width -
              tooltipWidth -
              8
          )
        );

      let tooltipY =
        hoverPoint.y -
        tooltipHeight -
        12;

      if (tooltipY < 8) {
        tooltipY =
          hoverPoint.y + 12;
      }

      tooltipY =
        Math.max(
          8,
          Math.min(
            tooltipY,
            height -
              tooltipHeight -
              8
          )
        );

      // Tooltip card
      context.beginPath();

      if (
        typeof context.roundRect ===
        "function"
      ) {
        context.roundRect(
          tooltipX,
          tooltipY,
          tooltipWidth,
          tooltipHeight,
          9
        );
      } else {
        context.rect(
          tooltipX,
          tooltipY,
          tooltipWidth,
          tooltipHeight
        );
      }

      context.fillStyle =
        "#101217";

      context.fill();

      context.strokeStyle =
        "#2a2f39";

      context.lineWidth = 1;
      context.stroke();

      context.textAlign =
        "left";

      context.textBaseline =
        "top";

      context.fillStyle =
        "#f6f7f9";

      context.font =
        "600 12px Inter, Arial, sans-serif";

      context.fillText(
        dateText,
        tooltipX + 12,
        tooltipY + 11
      );

      context.beginPath();

      context.arc(
        tooltipX + 16,
        tooltipY + 52,
        4,
        0,
        Math.PI * 2
      );

      context.fillStyle =
        "#ff342e";

      context.fill();

      context.fillStyle =
        "#949aa6";

      context.font =
        "12px Inter, Arial, sans-serif";

      context.textAlign =
        "left";

      context.fillText(
        "Checkpoints",
        tooltipX + 28,
        tooltipY + 44
      );

      context.fillStyle =
        "#ffffff";

      context.font =
        "700 12px Inter, Arial, sans-serif";

      context.textAlign =
        "right";

      context.fillText(
        String(
          hoverPoint.count
        ),
        tooltipX +
          tooltipWidth -
          12,
        tooltipY + 44
      );

      context.beginPath();

      context.arc(
        tooltipX + 16,
        tooltipY + 78,
        4,
        0,
        Math.PI * 2
      );

      context.fillStyle =
        "#d7d9df";

      context.fill();

      context.fillStyle =
        "#949aa6";

      context.font =
        "12px Inter, Arial, sans-serif";

      context.textAlign =
        "left";

      context.fillText(
        "Valid Licenses",
        tooltipX + 28,
        tooltipY + 70
      );

      context.fillStyle =
        "#ffffff";

      context.font =
        "700 12px Inter, Arial, sans-serif";

      context.textAlign =
        "right";

      context.fillText(
        String(
          hoverPoint.validLicenses
        ),
        tooltipX +
          tooltipWidth -
          12,
        tooltipY + 70
      );
    }

    function handleCheckpointChartMove(event) {
      const canvas =
        document.getElementById(
          "checkpointChart"
        );

      if (
        !canvas ||
        CHECKPOINT_CHART_POINTS.length === 0
      ) {
        return;
      }

      const rect =
        canvas.getBoundingClientRect();

      const paddingLeft = 42;
      const paddingRight = 14;

      const x =
        event.clientX -
        rect.left;

      const chartWidth =
        rect.width -
        paddingLeft -
        paddingRight;

      if (chartWidth <= 0) {
        return;
      }

      const clampedX =
        Math.max(
          paddingLeft,
          Math.min(
            x,
            rect.width -
              paddingRight
          )
        );

      const ratio =
        (
          clampedX -
          paddingLeft
        ) /
        chartWidth;

      const index =
        CHECKPOINT_CHART_POINTS.length === 1
          ? 0
          : Math.round(
              ratio *
              (
                CHECKPOINT_CHART_POINTS.length -
                1
              )
            );

      if (
        CHECKPOINT_CHART_HOVER_INDEX ===
        index
      ) {
        return;
      }

      CHECKPOINT_CHART_HOVER_INDEX =
        index;

      drawCheckpointChart(
        CHECKPOINT_CHART_POINTS,
        CHECKPOINT_CHART_HOVER_INDEX
      );
    }

    function handleCheckpointChartLeave() {
      if (
        CHECKPOINT_CHART_HOVER_INDEX ===
        null
      ) {
        return;
      }

      CHECKPOINT_CHART_HOVER_INDEX =
        null;

      drawCheckpointChart(
        CHECKPOINT_CHART_POINTS,
        null
      );
    }

    function checkpointProviderLabel(provider) {
      return provider === "lootlabs"
        ? "LootLabs"
        : "Linkvertise";
    }

    function renderCheckpointFunnel() {
      const root =
        document.getElementById(
          "checkpointFunnelProviders"
        );

      const periodPill =
        document.getElementById(
          "checkpointFunnelPeriodPill"
        );

      if (!root) {
        return;
      }

      const period =
        CHECKPOINT_FUNNEL.period || "1d";

      if (periodPill) {
        periodPill.textContent =
          checkpointPeriodText(period);
      }

      const providerOrder = [
        "linkvertise",
        "lootlabs"
      ];

      let html = "";

      providerOrder.forEach(function(provider) {
        const data =
          CHECKPOINT_FUNNEL.providers[provider] || {
            starts: 0,
            completions: 0,
            failures: 0,
            abandoned: 0,
            cancelled: 0,
            pending: 0,
            completion_rate: 0,
            checkpoints: []
          };

        const isBest =
          CHECKPOINT_FUNNEL.bestProvider === provider &&
          Number(data.starts || 0) > 0;

        html +=
          '<div class="funnel-provider-card' +
          (isBest ? ' best-provider' : '') +
          '">' +
            '<div class="funnel-provider-head">' +
              '<div>' +
                '<div class="funnel-provider-name">' +
                  escapeHtml(
                    checkpointProviderLabel(provider)
                  ) +
                '</div>' +
                '<div class="funnel-provider-note">' +
                  (isBest
                    ? 'Best completion rate in this period'
                    : 'Checkpoint conversion performance') +
                '</div>' +
              '</div>' +
              '<div class="funnel-rate">' +
                String(
                  Number(data.completion_rate || 0)
                    .toFixed(1)
                ) +
                '%</div>' +
            '</div>' +
            '<div class="funnel-metrics">' +
              '<div class="funnel-metric">' +
                '<span>Starts</span><strong>' +
                String(Number(data.starts || 0)) +
                '</strong></div>' +
              '<div class="funnel-metric completed">' +
                '<span>Complete</span><strong>' +
                String(Number(data.completions || 0)) +
                '</strong></div>' +
              '<div class="funnel-metric failed">' +
                '<span>Failed</span><strong>' +
                String(Number(data.failures || 0)) +
                '</strong></div>' +
              '<div class="funnel-metric abandoned">' +
                '<span>Abandoned</span><strong>' +
                String(Number(data.abandoned || 0)) +
                '</strong></div>' +
            '</div>' +
            '<div class="funnel-checkpoints">';

        const checkpoints =
          Array.isArray(data.checkpoints)
            ? data.checkpoints
            : [];

        [1, 2, 3].forEach(function(number) {
          const row =
            checkpoints.find(function(item) {
              return Number(item.checkpoint) === number;
            }) || {};

          html +=
            '<div class="funnel-checkpoint-row">' +
              '<strong>CP' + String(number) + '</strong>' +
              '<span class="funnel-checkpoint-cell">S ' +
                String(Number(row.starts || 0)) +
              '</span>' +
              '<span class="funnel-checkpoint-cell">C ' +
                String(Number(row.completions || 0)) +
              '</span>' +
              '<span class="funnel-checkpoint-cell">F ' +
                String(Number(row.failures || 0)) +
              '</span>' +
              '<span class="funnel-checkpoint-cell">A ' +
                String(Number(row.abandoned || 0)) +
              '</span>' +
            '</div>';
        });

        const extra = [];

        if (Number(data.cancelled || 0) > 0) {
          extra.push(
            String(Number(data.cancelled || 0)) +
            " cancelled"
          );
        }

        if (Number(data.pending || 0) > 0) {
          extra.push(
            String(Number(data.pending || 0)) +
            " still pending"
          );
        }

        if (extra.length > 0) {
          html +=
            '<div class="funnel-provider-note">' +
              escapeHtml(extra.join(" · ")) +
            '</div>';
        }

        html += '</div></div>';
      });

      root.innerHTML = html;
    }

    async function loadCheckpointFunnelStats() {
      if (!ADMIN_SECRET) {
        return false;
      }

      const period =
        document
          .getElementById("statsPeriodSelect")
          .value;

      try {
        const response =
          await fetch(
            "/api/admin/checkpoint-funnel",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json"
              },
              body: JSON.stringify({
                period: period
              })
            }
          );

        const data =
          await response.json();

        if (
          !response.ok ||
          data.success !== true
        ) {
          console.error(
            "CHECKPOINT FUNNEL ERROR:",
            data.error || "Unknown error"
          );
          return false;
        }

        CHECKPOINT_FUNNEL = {
          period: period,
          bestProvider:
            String(data.best_provider || ""),
          providers:
            data.providers || {
              linkvertise: null,
              lootlabs: null
            }
        };

        renderCheckpointFunnel();
        return true;
      } catch (error) {
        console.error(
          "CHECKPOINT FUNNEL REQUEST ERROR:",
          error
        );
        return false;
      }
    }

    async function loadCheckpointStats() {
      if (!ADMIN_SECRET) {
        return false;
      }

      const period =
        document
          .getElementById("statsPeriodSelect")
          .value;

      try {
        const response =
          await fetch(
            "/api/admin/checkpoint-stats",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json"
              },
              body: JSON.stringify({
                period: period
              })
            }
          );

        const data =
          await response.json();

        if (
          !response.ok ||
          data.success !== true
        ) {
          console.error(
            "CHECKPOINT STATS ERROR:",
            data.error || "Unknown error"
          );
          return false;
        }

        CHECKPOINT_STATS = {
          total:
            Number(data.total || 0),

          validLicenses:
            Number(
              data.valid_licenses || 0
            ),

          redeemsTotal:
            Number(
              data.redeems_total || 0
            ),

          points:
            data.points || []
        };

        const periodText =
          checkpointPeriodText(period);

        document
          .getElementById("statCheckpointsPassed")
          .textContent =
            String(CHECKPOINT_STATS.total);

        document
          .getElementById("statCheckpointsNote")
          .textContent = periodText;

        document
          .getElementById("checkpointChartSubtitle")
          .textContent =
            "Checkpoints passed and valid licenses · " +
            periodText;

        CHECKPOINT_CHART_HOVER_INDEX =
          null;

        drawCheckpointChart(
          CHECKPOINT_STATS.points,
          null
        );

        updateStatistics();

        return true;

      } catch (error) {
        console.error(
          "CHECKPOINT STATS REQUEST ERROR:",
          error
        );
        return false;
      }
    }

    function showAdminLogin(message) {
      ADMIN_SECRET = "";
      KEYS = [];

      adminShell.style.display = "none";
      loginScreen.style.display = "flex";
      loginError.textContent = message || "";
    }

    function showAdminDashboard() {
      loginScreen.style.display = "none";
      adminShell.style.display = "block";
    }

    async function restoreAdminSession() {
      try {
        const response =
          await fetch(
            "/api/admin/session",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({})
            }
          );

        if (!response.ok) {
          return false;
        }

        const data =
          await response.json();

        if (
          data.success !== true ||
          data.authenticated !== true
        ) {
          return false;
        }

        ADMIN_SECRET = "__SECURE_SESSION__";

        const loaded =
          await loadKeys(true);

        if (!loaded) {
          ADMIN_SECRET = "";
          return false;
        }

        showAdminDashboard();
        showPage("statistics");

        return true;
      } catch (error) {
        console.error(
          "ADMIN SESSION RESTORE ERROR:",
          error
        );
        return false;
      }
    }

    async function login() {
      const secretInput =
        document.getElementById("adminSecret");

      const suppliedSecret =
        secretInput.value;

      if (!suppliedSecret) {
        loginError.textContent =
          "Enter the admin secret.";
        return;
      }

      const button =
        document.getElementById("loginButton");

      button.disabled = true;
      button.textContent = "Signing In...";
      loginError.textContent = "";

      try {
        const response =
          await fetch(
            "/api/admin/login",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                admin_secret: suppliedSecret
              })
            }
          );

        const rawText =
          await response.text();

        let data = {};

        try {
          data = rawText
            ? JSON.parse(rawText)
            : {};
        } catch (error) {
          data = {};
        }

        if (
          !response.ok ||
          data.success !== true
        ) {
          if (
            response.status === 429 &&
            data.retry_after_seconds
          ) {
            loginError.textContent =
              (data.error || "Too many login attempts.") +
              " Retry in about " +
              String(data.retry_after_seconds) +
              " seconds.";
          } else {
            loginError.textContent =
              data.error ||
              "Unable to sign in.";
          }

          return;
        }

        // The real secret is no longer retained in JavaScript.
        secretInput.value = "";
        ADMIN_SECRET = "__SECURE_SESSION__";

        const success =
          await loadKeys(true);

        if (!success) {
          ADMIN_SECRET = "";
          return;
        }

        showAdminDashboard();
        showPage("statistics");
      } catch (error) {
        console.error(
          "ADMIN LOGIN ERROR:",
          error
        );
        loginError.textContent =
          "Unable to contact the admin API.";
      } finally {
        button.disabled = false;
        button.textContent = "Open Dashboard";
      }
    }

    async function loadKeys(isLogin) {
      loginError.textContent = "";

      try {
        const response =
          await fetch(
            "/api/admin/keys",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({})
            }
          );

        const rawText =
          await response.text();

        let data;

        try {
          data = JSON.parse(rawText);
        } catch {
          throw new Error(
            "Server returned an invalid admin response."
          );
        }

        if (
          !response.ok ||
          data.success !== true
        ) {
          loginError.textContent =
            data.error ||
            "Failed to load admin data.";

          return false;
        }

        KEYS = data.keys || [];
        populateTagFilter();
        populateBulkDeleteTagOptions();

        const existingSessionIds =
          new Set(
            KEYS.map(function(item) {
              return item.session_id;
            })
          );

        SELECTED_KEY_IDS =
          new Set(
            Array.from(SELECTED_KEY_IDS)
              .filter(function(sessionId) {
                return existingSessionIds.has(
                  sessionId
                );
              })
          );

        updateSelectedKeyControls();
        updateStatistics();

        if (
          ACTIVE_PAGE === "explorer" ||
          ACTIVE_PAGE === "gifts"
        ) {
          renderKeys();
        }

        return true;

      } catch (error) {
        console.error(
          "ALTER HUB ADMIN LOAD ERROR:",
          error
        );

        loginError.textContent =
          "Request failed: " +
          (error && error.message
            ? error.message
            : String(error));

        return false;
      }
    }

    async function refreshKeys(button) {
      if (button) {
        button.disabled = true;
        button.textContent = "Refreshing...";
      }

      await loadKeys(false);

      if (button) {
        button.textContent = "Refreshed";

        setTimeout(function() {
          button.textContent = "Refresh";
          button.disabled = false;
        }, 900);
      }
    }

    function openCreateKey() {
      const planSelect =
        document.getElementById("createKeyPlan");

      if (ACTIVE_TAB === "premium") {
        planSelect.value = "premium";
      } else {
        planSelect.value = "free";
      }

      document
        .getElementById("createKeyMessage")
        .textContent = "";

      document
        .getElementById("createKeyTags")
        .value = "";

      document
        .getElementById("createKeyModal")
        .style.display = "flex";
    }

    function closeCreateKey() {
      document
        .getElementById("createKeyModal")
        .style.display = "none";

      document
        .getElementById("createKeyValue")
        .value = "";

      document
        .getElementById("createKeyTags")
        .value = "";

      document
        .getElementById("createKeyMessage")
        .textContent = "";
    }

    async function createKey() {
      const key =
        document
          .getElementById("createKeyValue")
          .value
          .trim();

      const accessPlan =
        document
          .getElementById("createKeyPlan")
          .value;

      const durationMs =
        Number(
          document
            .getElementById("createKeyDuration")
            .value
        );

      const tags =
        document
          .getElementById("createKeyTags")
          .value;

      const message =
        document.getElementById(
          "createKeyMessage"
        );

      message.textContent = "Creating key...";

      try {
        const response =
          await fetch(
            "/api/admin/create-key",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                key: key,
                access_plan: accessPlan,
                duration_ms: durationMs,
                tags: tags
              })
            }
          );

        const data =
          await response.json();

        if (
          !response.ok ||
          data.success !== true
        ) {
          message.textContent =
            data.error ||
            "Failed to create key.";
          return;
        }

        ACTIVE_TAB =
          accessPlan === "premium" ||
          accessPlan === "premium_plus"
            ? "premium"
            : "free";

        message.textContent =
          "Created: " + data.key;

        await loadKeys(false);

        setTimeout(function() {
          closeCreateKey();
          showPage(
            ACTIVE_TAB === "premium"
              ? "gifts"
              : "explorer"
          );
        }, 450);

      } catch (error) {
        message.textContent =
          "Failed to create key.";
      }
    }

    function toggleBulkKeySource() {
      const source =
        document
          .getElementById("bulkKeySource")
          .value;

      document
        .getElementById("bulkKeyGeneratedFields")
        .style.display =
          source === "generated"
            ? "block"
            : "none";

      document
        .getElementById("bulkKeyManualFields")
        .style.display =
          source === "manual"
            ? "block"
            : "none";
    }

    function bulkDeleteStatusKey(item) {
      if (item.revoked) {
        return "revoked";
      }

      if (!item.license_id) {
        return "nr";
      }

      if (Number(item.expires_at) <= Date.now()) {
        return "expired";
      }

      return "active";
    }

    function keyMatchesCurrentManagementView(item) {
      const plan =
        String(item.access_plan || "free");

      const matchesTab =
        ACTIVE_TAB === "free"
          ? (
              plan === "free" ||
              plan === "keyless"
            )
          : (
              plan === "premium" ||
              plan === "premium_plus"
            );

      if (!matchesTab) {
        return false;
      }

      const planFilter =
        document.getElementById("filterPlan").value;
      const statusFilter =
        document.getElementById("filterStatus").value;
      const durationFilter =
        document.getElementById("filterDuration").value;
      const tagFilter =
        document.getElementById("filterTag").value;
      const createdFilter =
        document.getElementById("filterCreated").value;
      const noteFilter =
        document.getElementById("filterNote").value;
      const search =
        document.getElementById("search")
          .value
          .toLowerCase()
          .trim();

      if (
        planFilter !== "all" &&
        plan !== planFilter
      ) {
        return false;
      }

      const statusKey =
        bulkDeleteStatusKey(item);

      if (
        statusFilter !== "all" &&
        statusKey !== statusFilter
      ) {
        return false;
      }

      if (
        durationFilter !== "all" &&
        Number(item.license_duration_ms) !==
          Number(durationFilter)
      ) {
        return false;
      }

      const tags = getItemTags(item);

      if (
        tagFilter !== "all" &&
        !tags.some(function(tag) {
          return tag.toLowerCase() === tagFilter;
        })
      ) {
        return false;
      }

      const createdStart =
        createdFilterStart(createdFilter);

      if (
        createdStart > 0 &&
        Number(item.created_at || 0) < createdStart
      ) {
        return false;
      }

      if (
        noteFilter === "with" &&
        !String(item.note || "").trim()
      ) {
        return false;
      }

      if (
        noteFilter === "without" &&
        String(item.note || "").trim()
      ) {
        return false;
      }

      if (!search) {
        return true;
      }

      const redeemerText =
        (item.redeemers || [])
          .map(function(user) {
            return [
              user.username,
              user.roblox_user_id,
              user.device_hash
            ].join(" ");
          })
          .join(" ");

      return [
        item.key,
        item.note,
        tags.join(" "),
        item.license_id,
        item.device_hash,
        item.session_id,
        item.access_plan,
        redeemerText
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    }

    function populateBulkDeleteTagOptions() {
      const select =
        document.getElementById("bulkDeleteTag");

      if (!select) {
        return;
      }

      const previous = select.value;
      const seen = new Map();

      PRESET_TAGS.forEach(function(tag) {
        seen.set(tag.toLowerCase(), tag);
      });

      KEYS.forEach(function(item) {
        getItemTags(item).forEach(function(tag) {
          const key = tag.toLowerCase();
          if (!seen.has(key)) {
            seen.set(key, tag);
          }
        });
      });

      select.innerHTML = "";

      Array.from(seen.values())
        .sort(function(a, b) {
          return a.localeCompare(b);
        })
        .forEach(function(tag) {
          const option =
            document.createElement("option");
          option.value = tag.toLowerCase();
          option.textContent = tag;
          select.appendChild(option);
        });

      if (
        previous &&
        Array.from(select.options).some(
          function(option) {
            return option.value === previous;
          }
        )
      ) {
        select.value = previous;
      }
    }

    function getBulkDeleteCandidates(source) {
      let items = [];

      if (source === "selected") {
        items = KEYS.filter(function(item) {
          return SELECTED_KEY_IDS.has(
            item.session_id
          );
        });
      } else if (source === "current_view") {
        items = KEYS.filter(
          keyMatchesCurrentManagementView
        );
      } else if (source === "current_tab") {
        items = KEYS.filter(function(item) {
          const plan =
            String(item.access_plan || "free");

          return ACTIVE_TAB === "free"
            ? (
                plan === "free" ||
                plan === "keyless"
              )
            : (
                plan === "premium" ||
                plan === "premium_plus"
              );
        });
      } else if (source === "tag") {
        const value =
          document.getElementById("bulkDeleteTag").value;

        items = KEYS.filter(function(item) {
          return getItemTags(item)
            .some(function(tag) {
              return tag.toLowerCase() === value;
            });
        });
      } else if (source === "plan") {
        const value =
          document.getElementById("bulkDeletePlan").value;

        items = KEYS.filter(function(item) {
          return String(item.access_plan || "free") === value;
        });
      } else if (source === "status") {
        const value =
          document.getElementById("bulkDeleteStatus").value;

        items = KEYS.filter(function(item) {
          return bulkDeleteStatusKey(item) === value;
        });
      } else if (source === "duration") {
        const value =
          Number(
            document.getElementById("bulkDeleteDuration").value
          );

        items = KEYS.filter(function(item) {
          return Number(item.license_duration_ms) === value;
        });
      } else if (source === "created_period") {
        const start =
          createdFilterStart(
            document.getElementById("bulkDeleteCreated").value
          );

        items = KEYS.filter(function(item) {
          return Number(item.created_at || 0) >= start;
        });
      }

      return items.filter(isSelectableKey);
    }

    function updateBulkDeleteDynamicSummary() {
      const source =
        document.getElementById("bulkDeleteSource").value;

      const summary =
        document.getElementById("bulkDeleteDynamicSummary");

      if (!summary) {
        return;
      }

      if (
        source === "selected" ||
        source === "manual"
      ) {
        summary.style.display = "none";
        return;
      }

      const count =
        getBulkDeleteCandidates(source).length;

      summary.style.display = "block";
      summary.textContent =
        String(count) +
        (count === 1
          ? " key currently matches this deletion rule."
          : " keys currently match this deletion rule.") +
        (count > 250
          ? " Only the first 250 will be processed in this batch."
          : "");
    }

    function toggleBulkDeleteSource() {
      const source =
        document
          .getElementById("bulkDeleteSource")
          .value;

      const fieldMap = {
        bulkDeleteSelectedFields: "selected",
        bulkDeleteManualFields: "manual",
        bulkDeleteTagFields: "tag",
        bulkDeletePlanFields: "plan",
        bulkDeleteStatusFields: "status",
        bulkDeleteDurationFields: "duration",
        bulkDeleteCreatedFields: "created_period"
      };

      Object.keys(fieldMap).forEach(function(id) {
        document
          .getElementById(id)
          .style.display =
            source === fieldMap[id]
              ? "block"
              : "none";
      });

      updateBulkDeleteDynamicSummary();
    }

    function updateBulkDeleteSelectionSummary() {
      const summary =
        document.getElementById(
          "bulkDeleteSelectedSummary"
        );

      if (!summary) {
        return;
      }

      const count = SELECTED_KEY_IDS.size;

      summary.textContent =
        count > 0
          ? (
              String(count) +
              (count === 1
                ? " selected key will be deleted."
                : " selected keys will be deleted.")
            )
          : "No keys are selected in the current management view.";
    }

    function showBulkManagementChoice() {
      document
        .getElementById("bulkManagementChoiceView")
        .style.display = "block";

      document
        .getElementById("bulkKeyCreateView")
        .style.display = "none";

      document
        .getElementById("bulkDeleteView")
        .style.display = "none";

      document
        .getElementById("bulkKeyResultsWrap")
        .style.display = "none";

      document
        .getElementById("bulkDeleteResultsWrap")
        .style.display = "none";
    }

    function showBulkCreateView() {
      document
        .getElementById("bulkManagementChoiceView")
        .style.display = "none";

      document
        .getElementById("bulkDeleteView")
        .style.display = "none";

      document
        .getElementById("bulkKeyResultsWrap")
        .style.display = "none";

      document
        .getElementById("bulkDeleteResultsWrap")
        .style.display = "none";

      document
        .getElementById("bulkKeyCreateView")
        .style.display = "block";

      toggleBulkKeySource();
    }

    function showBulkDeleteView() {
      document
        .getElementById("bulkManagementChoiceView")
        .style.display = "none";

      document
        .getElementById("bulkKeyCreateView")
        .style.display = "none";

      document
        .getElementById("bulkKeyResultsWrap")
        .style.display = "none";

      document
        .getElementById("bulkDeleteResultsWrap")
        .style.display = "none";

      document
        .getElementById("bulkDeleteView")
        .style.display = "block";

      updateBulkDeleteSelectionSummary();
      toggleBulkDeleteSource();
    }

    function openBulkKeys() {
      const planSelect =
        document.getElementById("bulkKeyPlan");

      planSelect.value =
        ACTIVE_TAB === "premium"
          ? "premium"
          : "free";

      LAST_BULK_KEYS = [];

      document
        .getElementById("bulkKeyMessage")
        .textContent = "";

      document
        .getElementById("bulkDeleteMessage")
        .textContent = "";

      document
        .getElementById("bulkKeyResultMessage")
        .textContent = "";

      document
        .getElementById("bulkDeleteResultMessage")
        .textContent = "";

      document
        .getElementById("bulkKeyResults")
        .value = "";

      document
        .getElementById("bulkDeleteResults")
        .value = "";

      document
        .getElementById("bulkKeyTags")
        .value = "";

      document
        .getElementById("bulkDeleteManualValues")
        .value = "";

      populateBulkDeleteTagOptions();
      updateBulkDeleteSelectionSummary();
      updateBulkDeleteDynamicSummary();
      showBulkManagementChoice();

      document
        .getElementById("bulkKeyModal")
        .style.display = "flex";
    }

    function closeBulkKeys() {
      document
        .getElementById("bulkKeyModal")
        .style.display = "none";

      document
        .getElementById("bulkKeyMessage")
        .textContent = "";

      document
        .getElementById("bulkDeleteMessage")
        .textContent = "";

      document
        .getElementById("bulkKeyManualValues")
        .value = "";

      document
        .getElementById("bulkDeleteManualValues")
        .value = "";

      document
        .getElementById("bulkKeyTags")
        .value = "";

      document
        .getElementById("bulkKeyResultMessage")
        .textContent = "";

      document
        .getElementById("bulkDeleteResultMessage")
        .textContent = "";

      LAST_BULK_KEYS = [];
      showBulkManagementChoice();
    }

    function downloadBulkKeys() {
      if (LAST_BULK_KEYS.length === 0) {
        return;
      }

      const content =
        LAST_BULK_KEYS.join("\\n");

      const blob =
        new Blob(
          [content],
          { type: "text/plain;charset=utf-8" }
        );

      const objectUrl =
        URL.createObjectURL(blob);

      const anchor =
        document.createElement("a");

      const stamp =
        new Date()
          .toISOString()
          .slice(0, 10);

      anchor.href = objectUrl;
      anchor.download =
        "AlterHub_Bulk_Keys_" +
        stamp +
        ".txt";

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      setTimeout(function() {
        URL.revokeObjectURL(objectUrl);
      }, 1000);
    }

    async function copyBulkKeys() {
      if (LAST_BULK_KEYS.length === 0) {
        return;
      }

      const button =
        document.getElementById("copyBulkKeysButton");

      const originalText =
        button.textContent || "Copy List";

      try {
        await navigator.clipboard.writeText(
          LAST_BULK_KEYS.join("\\n")
        );

        button.textContent = "Copied!";
        button.classList.add("copy-flash");

        setTimeout(function() {
          button.textContent = originalText;
          button.classList.remove("copy-flash");
        }, 950);
      } catch (error) {
        button.textContent = "Copy Failed";

        setTimeout(function() {
          button.textContent = originalText;
        }, 1100);
      }
    }

    async function createBulkKeys() {
      const source =
        document
          .getElementById("bulkKeySource")
          .value;

      const count =
        Number(
          document
            .getElementById("bulkKeyCount")
            .value
        );

      const manualKeys =
        document
          .getElementById("bulkKeyManualValues")
          .value;

      const accessPlan =
        document
          .getElementById("bulkKeyPlan")
          .value;

      const durationMs =
        Number(
          document
            .getElementById("bulkKeyDuration")
            .value
        );

      const tags =
        document
          .getElementById("bulkKeyTags")
          .value;

      const message =
        document.getElementById("bulkKeyMessage");

      const button =
        document.getElementById("confirmBulkKeyButton");

      message.textContent =
        "Creating bulk keys...";

      button.disabled = true;

      try {
        const response =
          await fetch(
            "/api/admin/create-keys-bulk",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                source: source,
                count: count,
                keys: manualKeys,
                access_plan: accessPlan,
                duration_ms: durationMs,
                tags: tags
              })
            }
          );

        const data =
          await response.json();

        if (
          !response.ok ||
          data.success !== true
        ) {
          message.textContent =
            data.error ||
            "Failed to create bulk keys.";
          return;
        }

        LAST_BULK_KEYS =
          Array.isArray(data.keys)
            ? data.keys
            : [];

        document
          .getElementById("bulkKeyResults")
          .value =
            LAST_BULK_KEYS.join("\\n");

        document
          .getElementById("bulkManagementChoiceView")
          .style.display = "none";

        document
          .getElementById("bulkKeyCreateView")
          .style.display = "none";

        document
          .getElementById("bulkDeleteView")
          .style.display = "none";

        document
          .getElementById("bulkDeleteResultsWrap")
          .style.display = "none";

        document
          .getElementById("bulkKeyResultsWrap")
          .style.display =
            LAST_BULK_KEYS.length > 0
              ? "block"
              : "none";

        let resultMessage =
          "Created " +
          String(data.created_count || 0) +
          " keys.";

        if (
          Number(data.skipped_count || 0) > 0
        ) {
          resultMessage +=
            " Skipped " +
            String(data.skipped_count) +
            " duplicate/existing keys.";
        }

        document
          .getElementById("bulkKeyResultMessage")
          .textContent = resultMessage;

        message.textContent = "";

        ACTIVE_TAB =
          accessPlan === "premium" ||
          accessPlan === "premium_plus"
            ? "premium"
            : "free";

        await loadKeys(false);

      } catch (error) {
        console.error(
          "BULK KEY CREATE ERROR:",
          error
        );

        message.textContent =
          "Failed to create bulk keys.";
      } finally {
        button.disabled = false;
      }
    }

    async function deleteBulkKeys() {
      const source =
        document
          .getElementById("bulkDeleteSource")
          .value;

      const manualKeys =
        document
          .getElementById("bulkDeleteManualValues")
          .value;

      let candidates = [];
      let sessionIds = [];
      let requestedCount = 0;
      let matchedCount = 0;

      if (source === "manual") {
        if (!manualKeys.trim()) {
          document
            .getElementById("bulkDeleteMessage")
            .textContent =
              "Paste at least one key to delete.";
          return;
        }

        requestedCount =
          manualKeys
            .split(/[,\\n\\r]+/)
            .filter(function(value) {
              return value.trim();
            })
            .length;

        matchedCount = requestedCount;
      } else {
        candidates =
          getBulkDeleteCandidates(source);

        matchedCount = candidates.length;

        sessionIds =
          candidates
            .slice(0, 250)
            .map(function(item) {
              return item.session_id;
            });

        requestedCount = sessionIds.length;

        if (requestedCount === 0) {
          document
            .getElementById("bulkDeleteMessage")
            .textContent =
              source === "selected"
                ? "Select at least one key first."
                : "No keys currently match this deletion method.";
          return;
        }
      }

      const cappedMessage =
        matchedCount > 250
          ? (
              " The rule matched " +
              String(matchedCount) +
              " keys; this batch will process the first 250."
            )
          : "";

      const confirmed = window.confirm(
        "Permanently delete " +
        String(requestedCount) +
        (requestedCount === 1
          ? " key?"
          : " keys?") +
        cappedMessage +
        " This cannot be undone."
      );

      if (!confirmed) {
        return;
      }

      const message =
        document.getElementById("bulkDeleteMessage");

      const button =
        document.getElementById("confirmBulkDeleteButton");

      message.textContent = "Deleting keys...";
      button.disabled = true;

      try {
        const response =
          await fetch(
            "/api/admin/delete-keys-bulk",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                session_ids: sessionIds,
                keys: source === "manual"
                  ? manualKeys
                  : ""
              })
            }
          );

        const data = await response.json();

        if (
          !response.ok ||
          data.success !== true
        ) {
          throw new Error(
            data.error || "Bulk deletion failed."
          );
        }

        const deleted =
          Array.isArray(data.deleted_keys)
            ? data.deleted_keys
            : [];

        document
          .getElementById("bulkDeleteResults")
          .value = deleted.join("\\n");

        document
          .getElementById("bulkDeleteResultMessage")
          .textContent =
            "Deleted " +
            String(data.deleted_count || 0) +
            " keys. Skipped " +
            String(data.skipped_count || 0) +
            ".";

        document
          .getElementById("bulkManagementChoiceView")
          .style.display = "none";

        document
          .getElementById("bulkKeyCreateView")
          .style.display = "none";

        document
          .getElementById("bulkDeleteView")
          .style.display = "none";

        document
          .getElementById("bulkKeyResultsWrap")
          .style.display = "none";

        document
          .getElementById("bulkDeleteResultsWrap")
          .style.display = "block";

        message.textContent = "";
        clearSelectedKeys();
        await loadKeys(false);
      } catch (error) {
        message.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    }

    async function requestSetRevoked(
      licenseId,
      revoked
    ) {
      const response =
        await fetch(
          "/api/admin/set-revoked",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              license_id: licenseId,
              revoked: revoked
            })
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        data.success !== true
      ) {
        throw new Error(
          data.error ||
          "Failed to update license."
        );
      }

      return data;
    }

    async function setRevoked(
      licenseId,
      revoked
    ) {
      try {
        await requestSetRevoked(
          licenseId,
          revoked
        );

        await loadKeys(false);
        return true;
      } catch (error) {
        alert(error.message);
        return false;
      }
    }

    async function requestRevokeAndDelete(
      licenseId
    ) {
      const response =
        await fetch(
          "/api/admin/revoke-delete",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              license_id: licenseId
            })
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        data.success !== true
      ) {
        throw new Error(
          data.error ||
          "Failed to delete key."
        );
      }

      return data;
    }

    async function revokeAndDelete(licenseId) {
      try {
        await requestRevokeAndDelete(
          licenseId
        );

        await loadKeys(false);
        return true;
      } catch (error) {
        alert(error.message);
        return false;
      }
    }

    async function requestDeleteUnused(
      sessionId
    ) {
      const response =
        await fetch(
          "/api/admin/delete-unused-key",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              session_id: sessionId
            })
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        data.success !== true
      ) {
        throw new Error(
          data.error ||
          "Failed to delete key."
        );
      }

      return data;
    }

    function configureRevokeModal(items) {
      PendingRevokeItems =
        Array.isArray(items)
          ? items.filter(Boolean)
          : [];

      const count =
        PendingRevokeItems.length;

      if (count === 0) {
        return;
      }

      const licenseCount =
        PendingRevokeItems.filter(
          function(item) {
            return Boolean(
              item.license_id
            );
          }
        ).length;

      const deleteCount =
        PendingRevokeItems.filter(
          function(item) {
            return Boolean(
              item.license_id ||
              item.admin_created
            );
          }
        ).length;

      const isSingle =
        count === 1;

      document
        .getElementById("revokeModalTitle")
        .textContent =
          isSingle
            ? "Revoke License"
            : "Manage Selected Keys";

      document
        .getElementById(
          "revokeModalDescription"
        )
        .textContent =
          isSingle
            ? "Choose what Alter Hub should do with this license."
            : (
                String(count) +
                " keys selected · " +
                String(licenseCount) +
                " licenses"
              );

      document
        .getElementById("revokeModalKey")
        .textContent =
          isSingle
            ? PendingRevokeItems[0].key
            : String(count) +
              " selected keys";

      const revokeOnlyButton =
        document.getElementById(
          "revokeOnlyButton"
        );

      const deleteButton =
        document.getElementById(
          "revokeDeleteButton"
        );

      revokeOnlyButton.disabled =
        licenseCount === 0;

      deleteButton.disabled =
        deleteCount === 0;

      revokeOnlyButton.textContent =
        isSingle
          ? "Revoke Only"
          : "Revoke Selected";

      deleteButton.textContent =
        isSingle
          ? "Revoke + Delete Key"
          : "Revoke + Delete Selected";

      document
        .getElementById("revokeModal")
        .style.display = "flex";
    }

    function openRevokeModal(
      licenseId,
      key
    ) {
      PendingRevokeLicenseId = licenseId;
      PendingRevokeKey = key;

      const item =
        KEYS.find(function(entry) {
          return entry.license_id === licenseId;
        }) || {
          license_id: licenseId,
          key: key,
          admin_created: false
        };

      configureRevokeModal([item]);
    }

    function openSelectedKeyMenu() {
      const items =
        KEYS.filter(function(item) {
          return SELECTED_KEY_IDS.has(
            item.session_id
          );
        });

      if (items.length === 0) {
        return;
      }

      PendingRevokeLicenseId = null;
      PendingRevokeKey = null;
      configureRevokeModal(items);
    }

    function closeRevokeModal() {
      document
        .getElementById("revokeModal")
        .style.display = "none";

      PendingRevokeLicenseId = null;
      PendingRevokeKey = null;
      PendingRevokeItems = [];
    }

    async function deleteUnusedKey(item) {
      const confirmed =
        confirm(
          "Are you sure you want to delete this unredeemed key? " +
          item.key
        );

      if (!confirmed) {
        return;
      }

      try {
        await requestDeleteUnused(
          item.session_id
        );

        await loadKeys(false);
      } catch (error) {
        alert(error.message);
      }
    }

    function isSelectableKey(item) {
      return Boolean(
        item &&
        (
          item.license_id ||
          item.admin_created
        )
      );
    }

    function updateSelectedKeyControls() {
      const count =
        SELECTED_KEY_IDS.size;

      const button =
        document.getElementById(
          "manageSelectedButton"
        );

      button.style.display =
        count > 0
          ? "inline-flex"
          : "none";

      button.textContent =
        "Manage Selected (" +
        String(count) +
        ")";

      if (
        typeof updateBulkDeleteSelectionSummary ===
        "function"
      ) {
        updateBulkDeleteSelectionSummary();
      }
    }

    function clearSelectedKeys() {
      SELECTED_KEY_IDS.clear();
      updateSelectedKeyControls();
    }

    async function performSelectedAction(action) {
      const items =
        PendingRevokeItems.slice();

      if (items.length === 0) {
        return;
      }

      const revokeButton =
        document.getElementById(
          "revokeOnlyButton"
        );

      const deleteButton =
        document.getElementById(
          "revokeDeleteButton"
        );

      revokeButton.disabled = true;
      deleteButton.disabled = true;

      let successCount = 0;
      const errors = [];

      for (const item of items) {
        try {
          if (action === "revoke") {
            if (!item.license_id) {
              continue;
            }

            await requestSetRevoked(
              item.license_id,
              true
            );

            successCount += 1;
            continue;
          }

          if (item.license_id) {
            await requestRevokeAndDelete(
              item.license_id
            );
            successCount += 1;
          } else if (item.admin_created) {
            await requestDeleteUnused(
              item.session_id
            );
            successCount += 1;
          }
        } catch (error) {
          errors.push(
            item.key + ": " +
            error.message
          );
        }
      }

      clearSelectedKeys();
      closeRevokeModal();
      await loadKeys(false);

      if (errors.length > 0) {
        alert(
          "Completed " +
          String(successCount) +
          " actions. " +
          String(errors.length) +
          " failed.\\n\\n" +
          errors.slice(0, 8).join("\\n")
        );
      }
    }

    async function setKeyNote(
      sessionId,
      note
    ) {
      const response =
        await fetch(
          "/api/admin/set-key-note",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              session_id: sessionId,
              note: note
            })
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        data.success !== true
      ) {
        throw new Error(
          data.error ||
          "Failed to save note."
        );
      }

      return data;
    }

    async function setKeyTags(
      sessionId,
      tags
    ) {
      const response =
        await fetch(
          "/api/admin/set-key-tags",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              session_id: sessionId,
              tags: tags
            })
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        data.success !== true
      ) {
        throw new Error(
          data.error ||
          "Failed to save tags."
        );
      }

      return data;
    }

    async function setKeyPlan(
      sessionId,
      accessPlan
    ) {
      const response =
        await fetch(
          "/api/admin/set-key-plan",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              session_id: sessionId,
              access_plan: accessPlan
            })
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        data.success !== true
      ) {
        throw new Error(
          data.error ||
          "Failed to update access plan."
        );
      }

      return data;
    }

    function planDisplayName(plan) {
      const names = {
        free: "Free",
        keyless: "Keyless",
        premium: "Premium",
        premium_plus: "Premium Plus"
      };

      return names[plan] || plan;
    }

    function showKeyCopiedToast(
      message
    ) {
      const toast =
        document.getElementById(
          "keyCopiedToast"
        );

      toast.textContent =
        message || "Key Copied!";

      toast.classList.add("show");

      if (KEY_COPY_TOAST_TIMER) {
        clearTimeout(
          KEY_COPY_TOAST_TIMER
        );
      }

      KEY_COPY_TOAST_TIMER =
        setTimeout(function() {
          toast.classList.remove("show");
        }, 1200);
    }

    async function copyKeyValue(key) {
      try {
        await navigator.clipboard.writeText(
          key
        );
      } catch (error) {
        const helper =
          document.createElement("textarea");

        helper.value = key;
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.appendChild(helper);
        helper.select();
        document.execCommand("copy");
        helper.remove();
      }

      showKeyCopiedToast(
        "Key Copied!"
      );
    }

    function createTextCell(
      row,
      value,
      className
    ) {
      const cell =
        document.createElement("td");

      if (className) {
        cell.className = className;
      }

      cell.textContent =
        value == null
          ? ""
          : String(value);

      row.appendChild(cell);
      return cell;
    }

    function renderKeys() {
      const table =
        document.getElementById("keyTable");

      const search =
        document
          .getElementById("search")
          .value
          .toLowerCase()
          .trim();

      table.innerHTML = "";

      const planFilter =
        document.getElementById("filterPlan").value;

      const statusFilter =
        document.getElementById("filterStatus").value;

      const durationFilter =
        document.getElementById("filterDuration").value;

      const tagFilter =
        document.getElementById("filterTag").value;

      const createdFilter =
        document.getElementById("filterCreated").value;

      const noteFilter =
        document.getElementById("filterNote").value;

      const createdStart =
        createdFilterStart(createdFilter);

      const now = Date.now();

      const filtered =
        KEYS.filter(function(item) {
          const plan =
            String(item.access_plan || "free");

          const matchesTab =
            ACTIVE_TAB === "free"
              ? (
                  plan === "free" ||
                  plan === "keyless"
                )
              : (
                  plan === "premium" ||
                  plan === "premium_plus"
                );

          if (!matchesTab) {
            return false;
          }

          if (
            planFilter !== "all" &&
            plan !== planFilter
          ) {
            return false;
          }

          const statusKey =
            item.revoked
              ? "revoked"
              : !item.license_id
                ? "nr"
                : Number(item.expires_at) <= now
                  ? "expired"
                  : "active";

          if (
            statusFilter !== "all" &&
            statusKey !== statusFilter
          ) {
            return false;
          }

          if (
            durationFilter !== "all" &&
            Number(item.license_duration_ms) !==
              Number(durationFilter)
          ) {
            return false;
          }

          const tags = getItemTags(item);

          if (
            tagFilter !== "all" &&
            !tags.some(function(tag) {
              return tag.toLowerCase() === tagFilter;
            })
          ) {
            return false;
          }

          if (
            createdStart > 0 &&
            Number(item.created_at || 0) < createdStart
          ) {
            return false;
          }

          if (
            noteFilter === "with" &&
            !String(item.note || "").trim()
          ) {
            return false;
          }

          if (
            noteFilter === "without" &&
            String(item.note || "").trim()
          ) {
            return false;
          }

          if (!search) {
            return true;
          }

          const redeemerText =
            (item.redeemers || [])
              .map(function(user) {
                return [
                  user.username,
                  user.roblox_user_id,
                  user.device_hash
                ].join(" ");
              })
              .join(" ");

          const searchableText =
            [
              item.key,
              item.note,
              tags.join(" "),
              item.license_id,
              item.device_hash,
              item.session_id,
              item.access_plan,
              redeemerText
            ]
              .join(" ")
              .toLowerCase();

          return searchableText.includes(search);
        });

      const visibleActionable =
        filtered.filter(isSelectableKey);

      const selectAll =
        document.getElementById(
          "selectAllKeys"
        );

      if (selectAll) {
        const selectedVisibleCount =
          visibleActionable.filter(
            function(item) {
              return SELECTED_KEY_IDS.has(
                item.session_id
              );
            }
          ).length;

        selectAll.checked =
          visibleActionable.length > 0 &&
          selectedVisibleCount ===
            visibleActionable.length;

        selectAll.indeterminate =
          selectedVisibleCount > 0 &&
          selectedVisibleCount <
            visibleActionable.length;

        selectAll.disabled =
          visibleActionable.length === 0;

        selectAll.onchange =
          function(event) {
            const checked =
              event.target.checked;

            visibleActionable.forEach(
              function(item) {
                if (checked) {
                  SELECTED_KEY_IDS.add(
                    item.session_id
                  );
                } else {
                  SELECTED_KEY_IDS.delete(
                    item.session_id
                  );
                }
              }
            );

            updateSelectedKeyControls();
            renderKeys();
          };
      }

      updateSelectedKeyControls();

      document
        .getElementById("summary")
        .textContent =
          filtered.length +
          (filtered.length === 1
            ? " key shown"
            : " keys shown");

      if (filtered.length === 0) {
        const emptyRow =
          document.createElement("tr");

        const emptyCell =
          document.createElement("td");

        emptyCell.colSpan = 12;
        emptyCell.className = "empty-state";
        emptyCell.textContent =
          "No Alter Hub keys match this view.";

        emptyRow.appendChild(emptyCell);
        table.appendChild(emptyRow);
        return;
      }

      filtered.forEach(function(item) {
        const firstUser =
          item.redeemers && item.redeemers[0]
            ? item.redeemers[0]
            : {};

        const status = statusFor(item);

        const row =
          document.createElement("tr");

        row.className = "key-row";

        const selectCell =
          document.createElement("td");

        selectCell.className =
          "selection-cell";

        const selectBox =
          document.createElement("input");

        selectBox.type = "checkbox";
        selectBox.disabled =
          !isSelectableKey(item);
        selectBox.checked =
          SELECTED_KEY_IDS.has(
            item.session_id
          );

        selectBox.setAttribute(
          "aria-label",
          "Select " + item.key
        );

        selectBox.onclick =
          function(event) {
            event.stopPropagation();
          };

        selectBox.onchange =
          function(event) {
            if (event.target.checked) {
              SELECTED_KEY_IDS.add(
                item.session_id
              );
            } else {
              SELECTED_KEY_IDS.delete(
                item.session_id
              );
            }

            updateSelectedKeyControls();
            renderKeys();
          };

        selectCell.appendChild(selectBox);
        row.appendChild(selectCell);

        createTextCell(
          row,
          firstUser.username || "No redeemer"
        );

        createTextCell(
          row,
          firstUser.roblox_user_id || "-",
          "mono"
        );

        const keyCell =
          createTextCell(
            row,
            item.key,
            "mono key-copy-cell"
          );

        keyCell.title =
          "Click to copy key";

        keyCell.onclick =
          function(event) {
            event.stopPropagation();
            copyKeyValue(item.key);
          };

        const planCell =
          document.createElement("td");

        const planSelect =
          document.createElement("select");

        planSelect.className =
          "key-plan-select";

        [
          ["free", "Free"],
          ["keyless", "Keyless"],
          ["premium", "Premium"],
          ["premium_plus", "Premium Plus"]
        ].forEach(function(planOption) {
          const option =
            document.createElement("option");

          option.value = planOption[0];
          option.textContent = planOption[1];
          planSelect.appendChild(option);
        });

        planSelect.value =
          String(item.access_plan || "free");

        planSelect.onclick =
          function(event) {
            event.stopPropagation();
          };

        planSelect.onchange =
          async function(event) {
            event.stopPropagation();

            const previousPlan =
              String(item.access_plan || "free");

            const nextPlan =
              String(planSelect.value || "free");

            if (nextPlan === previousPlan) {
              return;
            }

            planSelect.disabled = true;

            try {
              const result =
                await setKeyPlan(
                  item.session_id,
                  nextPlan
                );

              item.access_plan =
                result.access_plan || nextPlan;

              const destinationPage =
                item.access_plan === "premium" ||
                item.access_plan === "premium_plus"
                  ? "gifts"
                  : "explorer";

              showKeyCopiedToast(
                "Plan changed to " +
                  planDisplayName(item.access_plan)
              );

              await loadKeys(false);

              if (
                (destinationPage === "gifts" && ACTIVE_TAB !== "premium") ||
                (destinationPage === "explorer" && ACTIVE_TAB !== "free")
              ) {
                showPage(destinationPage);
              } else {
                renderKeys();
              }
            } catch (error) {
              planSelect.value = previousPlan;
              showKeyCopiedToast(
                error && error.message
                  ? error.message
                  : "Failed to update plan."
              );
            } finally {
              planSelect.disabled = false;
            }
          };

        planCell.appendChild(planSelect);
        row.appendChild(planCell);

        const noteCell =
          createTextCell(
            row,
            item.note || "—",
            "note-cell" +
            (item.note
              ? " has-note"
              : "")
          );

        noteCell.title =
          item.note || "No note";

        const tagCell =
          document.createElement("td");

        const tagList =
          document.createElement("div");

        tagList.className = "tag-list";
        renderTagChips(
          tagList,
          getItemTags(item)
        );

        tagCell.appendChild(tagList);
        row.appendChild(tagCell);

        createTextCell(
          row,
          !item.license_id
            ? formatKeyDuration(
                item.license_duration_ms
              )
            : formatTime(
                item.time_left_ms
              )
        );

        createTextCell(
          row,
          status.text,
          status.className
        );

        createTextCell(
          row,
          item.total_redeems
        );

        createTextCell(
          row,
          formatDate(item.last_seen_at)
        );

        const actionCell =
          document.createElement("td");

        if (item.license_id) {
          const revokeButton =
            document.createElement("button");

          revokeButton.className =
            "table-action" +
            (item.revoked ? "" : " danger");

          revokeButton.textContent =
            item.revoked
              ? "Unrevoke"
              : "Revoke";

          revokeButton.onclick =
            function(event) {
              event.stopPropagation();

              if (item.revoked) {
                setRevoked(
                  item.license_id,
                  false
                );
              } else {
                openRevokeModal(
                  item.license_id,
                  item.key
                );
              }
            };

          actionCell.appendChild(
            revokeButton
          );

        } else if (item.admin_created) {
          const deleteButton =
            document.createElement("button");

          deleteButton.className =
            "table-action danger";

          deleteButton.textContent =
            "Delete";

          deleteButton.onclick =
            function(event) {
              event.stopPropagation();
              deleteUnusedKey(item);
            };

          actionCell.appendChild(
            deleteButton
          );

        } else {
          actionCell.textContent = "-";
        }

        row.appendChild(actionCell);

        const details =
          document.createElement("tr");

        details.className = "details";

        const detailCell =
          document.createElement("td");

        detailCell.colSpan = 12;

        const detailsContent =
          document.createElement("div");

        detailsContent.className =
          "details-content";

        const detailGrid =
          document.createElement("div");

        detailGrid.className =
          "detail-grid";

        function addDetail(
          label,
          value,
          mono
        ) {
          const box =
            document.createElement("div");

          box.className = "detail-box";

          const labelEl =
            document.createElement("span");

          labelEl.textContent = label;

          const valueEl =
            document.createElement("div");

          if (mono) {
            valueEl.className = "mono";
          }

          valueEl.textContent = value;

          box.appendChild(labelEl);
          box.appendChild(valueEl);
          detailGrid.appendChild(box);
        }

        addDetail(
          "License ID",
          item.license_id || "Not redeemed",
          true
        );

        addDetail(
          "Session ID",
          item.session_id,
          true
        );

        addDetail(
          "Created",
          formatDate(item.created_at),
          false
        );

        addDetail(
          "Device Hash",
          item.device_hash || "-",
          true
        );

        addDetail(
          "Expires",
          item.license_id
            ? formatDate(item.expires_at)
            : formatKeyDuration(
                item.license_duration_ms
              ) + " after redemption",
          false
        );

        detailsContent.appendChild(
          detailGrid
        );

        const noteEditor =
          document.createElement("div");

        noteEditor.className =
          "note-editor";

        const noteLabel =
          document.createElement("div");

        noteLabel.className =
          "field-label";

        noteLabel.textContent =
          "Admin Note";

        const noteInput =
          document.createElement("textarea");

        noteInput.maxLength = 500;
        noteInput.placeholder =
          "Add a note for this key...";
        noteInput.value =
          item.note || "";

        const noteActions =
          document.createElement("div");

        noteActions.className =
          "modal-actions";

        const saveNoteButton =
          document.createElement("button");

        saveNoteButton.className =
          "secondary-button";
        saveNoteButton.textContent =
          "Save Note";

        const noteStatus =
          document.createElement("span");

        noteStatus.className =
          "modal-message";
        noteStatus.style.margin = "8px 0 0";

        saveNoteButton.onclick =
          async function(event) {
            event.stopPropagation();

            saveNoteButton.disabled = true;
            saveNoteButton.textContent =
              "Saving...";
            noteStatus.textContent = "";

            try {
              const result =
                await setKeyNote(
                  item.session_id,
                  noteInput.value
                );

              item.note =
                result.note || "";

              noteCell.textContent =
                item.note || "—";

              noteCell.className =
                "note-cell" +
                (item.note
                  ? " has-note"
                  : "");

              noteCell.title =
                item.note || "No note";

              noteStatus.textContent =
                "Note saved.";
            } catch (error) {
              noteStatus.textContent =
                error.message;
            } finally {
              saveNoteButton.disabled = false;
              saveNoteButton.textContent =
                "Save Note";
            }
          };

        noteActions.appendChild(
          saveNoteButton
        );

        noteEditor.appendChild(noteLabel);
        noteEditor.appendChild(noteInput);
        noteEditor.appendChild(noteActions);
        noteEditor.appendChild(noteStatus);
        detailsContent.appendChild(noteEditor);

        const tagEditor =
          document.createElement("div");

        tagEditor.className = "tag-editor";

        const tagLabel =
          document.createElement("div");

        tagLabel.className = "field-label";
        tagLabel.textContent = "Key Tags";

        const selectedTags =
          new Set(getItemTags(item));

        const tagOptions =
          document.createElement("div");

        tagOptions.className = "tag-options";

        PRESET_TAGS.forEach(function(tag) {
          const button =
            document.createElement("button");

          button.type = "button";
          button.className =
            "tag-option" +
            (selectedTags.has(tag)
              ? " selected"
              : "");

          button.textContent = tag;

          button.onclick =
            function(event) {
              event.stopPropagation();

              if (selectedTags.has(tag)) {
                selectedTags.delete(tag);
                button.classList.remove("selected");
              } else {
                selectedTags.add(tag);
                button.classList.add("selected");
              }
            };

          tagOptions.appendChild(button);
        });

        const presetLower =
          new Set(
            PRESET_TAGS.map(function(tag) {
              return tag.toLowerCase();
            })
          );

        const customTags =
          getItemTags(item)
            .filter(function(tag) {
              return !presetLower.has(
                tag.toLowerCase()
              );
            });

        const customTagInput =
          document.createElement("input");

        customTagInput.type = "text";
        customTagInput.placeholder =
          "Custom tags, separated by commas";
        customTagInput.value =
          customTags.join(", ");

        customTagInput.onclick =
          function(event) {
            event.stopPropagation();
          };

        const tagActions =
          document.createElement("div");

        tagActions.className = "modal-actions";

        const saveTagsButton =
          document.createElement("button");

        saveTagsButton.className =
          "secondary-button";
        saveTagsButton.textContent =
          "Save Tags";

        const tagStatus =
          document.createElement("span");

        tagStatus.className = "modal-message";
        tagStatus.style.margin = "8px 0 0";

        saveTagsButton.onclick =
          async function(event) {
            event.stopPropagation();

            const values =
              Array.from(selectedTags);

            customTagInput.value
              .split(",")
              .map(function(tag) {
                return tag.trim();
              })
              .filter(Boolean)
              .forEach(function(tag) {
                if (
                  !values.some(function(existing) {
                    return existing.toLowerCase() ===
                      tag.toLowerCase();
                  })
                ) {
                  values.push(tag);
                }
              });

            saveTagsButton.disabled = true;
            saveTagsButton.textContent = "Saving...";
            tagStatus.textContent = "";

            try {
              const result =
                await setKeyTags(
                  item.session_id,
                  values
                );

              item.tags =
                Array.isArray(result.tags)
                  ? result.tags
                  : values;

              renderTagChips(
                tagList,
                item.tags
              );

              populateTagFilter();
              tagStatus.textContent = "Tags saved.";
            } catch (error) {
              tagStatus.textContent = error.message;
            } finally {
              saveTagsButton.disabled = false;
              saveTagsButton.textContent = "Save Tags";
            }
          };

        tagActions.appendChild(saveTagsButton);
        tagEditor.appendChild(tagLabel);
        tagEditor.appendChild(tagOptions);
        tagEditor.appendChild(customTagInput);
        tagEditor.appendChild(tagActions);
        tagEditor.appendChild(tagStatus);
        detailsContent.appendChild(tagEditor);

        const accountsTitle =
          document.createElement("div");

        accountsTitle.className =
          "field-label";

        accountsTitle.style.marginTop =
          "16px";

        accountsTitle.textContent =
          "Accounts using this key";

        detailsContent.appendChild(
          accountsTitle
        );

        const redeemers =
          item.redeemers || [];

        if (redeemers.length === 0) {
          const empty =
            document.createElement("div");

          empty.className = "account-card";
          empty.textContent =
            "No accounts recorded.";

          detailsContent.appendChild(empty);

        } else {
          const accountsGrid =
            document.createElement("div");

          accountsGrid.className =
            "accounts-grid";

          redeemers.forEach(function(user) {
            const card =
              document.createElement("div");

            card.className = "account-card";

            const name =
              document.createElement("b");

            name.textContent =
              user.username || "Unknown";

            const info =
              document.createElement("div");

            info.textContent =
              "User ID: " +
              user.roblox_user_id +
              " | Redeems: " +
              user.redeem_count +
              " | Last seen: " +
              formatDate(user.last_seen_at);

            card.appendChild(name);
            card.appendChild(info);
            accountsGrid.appendChild(card);
          });

          detailsContent.appendChild(
            accountsGrid
          );
        }

        detailCell.appendChild(
          detailsContent
        );

        details.appendChild(detailCell);

        row.onclick = function() {
          details.style.display =
            details.style.display === "table-row"
              ? "none"
              : "table-row";
        };

        table.appendChild(row);
        table.appendChild(details);
      });
    }

    document
      .getElementById("loginButton")
      .onclick = login;

    document
      .getElementById("adminSecret")
      .addEventListener(
        "keydown",
        function(event) {
          if (event.key === "Enter") {
            login();
          }
        }
      );

    document
      .getElementById("statisticsNavButton")
      .onclick = function() {
        showPage("statistics");
      };

    document
      .getElementById("explorerNavButton")
      .onclick = function() {
        showPage("explorer");
      };

    document
      .getElementById("giftsNavButton")
      .onclick = function() {
        showPage("gifts");
      };

    document
      .getElementById("activityNavButton")
      .onclick = function() {
        showPage("activity");
      };

    document
      .getElementById("settingsNavButton")
      .onclick = function() {
        showPage("settings");
      };

    document
      .getElementById("search")
      .addEventListener(
        "input",
        renderKeys
      );

    [
      "filterPlan",
      "filterStatus",
      "filterDuration",
      "filterTag",
      "filterCreated",
      "filterNote"
    ].forEach(function(id) {
      document
        .getElementById(id)
        .addEventListener(
          "change",
          renderKeys
        );
    });

    document
      .getElementById("clearSearchButton")
      .onclick = function() {
        document
          .getElementById("search")
          .value = "";

        [
          "filterPlan",
          "filterStatus",
          "filterDuration",
          "filterTag",
          "filterCreated",
          "filterNote"
        ].forEach(function(id) {
          document.getElementById(id).value = "all";
        });

        renderKeys();
      };

    document
      .getElementById("refreshButton")
      .onclick = function() {
        refreshKeys(this);
      };

    document
      .getElementById("statsRefreshButton")
      .onclick = async function() {
        const button = this;

        button.disabled = true;
        button.textContent = "Refreshing...";

        await Promise.all([
          loadKeys(false),
          loadCheckpointStats(),
          loadCheckpointFunnelStats(),
          loadCountryStats(),
          loadSystemHealth()
        ]);

        button.textContent = "Refreshed";

        setTimeout(function() {
          button.textContent = "Refresh";
          button.disabled = false;
        }, 900);
      };

    document
      .getElementById("statsPeriodSelect")
      .addEventListener(
        "change",
        function() {
          loadCheckpointStats();
          loadCheckpointFunnelStats();
        }
      );

    document
      .getElementById("checkpointChart")
      .addEventListener(
        "mousemove",
        handleCheckpointChartMove
      );

    document
      .getElementById("checkpointChart")
      .addEventListener(
        "mouseleave",
        handleCheckpointChartLeave
      );

    window.addEventListener(
      "resize",
      function() {
        if (ACTIVE_PAGE === "statistics") {
          drawCheckpointChart(
            CHECKPOINT_STATS.points || []
          );

          if (
            COUNTRY_MAP &&
            typeof COUNTRY_MAP.updateSize ===
              "function"
          ) {
            try {
              COUNTRY_MAP.updateSize();
            } catch (error) {
              // Ignore resize failures.
            }
          }
        }
      }
    );

    document
      .getElementById("settingsRefreshButton")
      .onclick = async function() {
        const button = this;
        button.disabled = true;
        button.textContent = "Refreshing...";

        await Promise.all([
          loadKeys(false),
          loadSystemHealth()
        ]);

        button.textContent = "Refreshed";
        setTimeout(function() {
          button.textContent = "Refresh";
          button.disabled = false;
        }, 900);
      };

    document
      .getElementById("healthRefreshButton")
      .onclick = async function() {
        const button = this;

        if (button.classList.contains("is-refreshing")) {
          return;
        }

        button.classList.add("is-refreshing");
        button.disabled = true;

        await loadSystemHealth();

        button.classList.remove("is-refreshing");
        button.disabled = false;
      };

    document
      .getElementById("activityRefreshButton")
      .onclick = function() {
        loadActivityLog();
      };

    document
      .getElementById("activityActionFilter")
      .addEventListener("change", loadActivityLog);

    document
      .getElementById("activityPeriodFilter")
      .addEventListener("change", loadActivityLog);

    document
      .getElementById("activitySearch")
      .addEventListener(
        "input",
        function() {
          if (ACTIVITY_SEARCH_TIMER) {
            clearTimeout(ACTIVITY_SEARCH_TIMER);
          }

          ACTIVITY_SEARCH_TIMER =
            setTimeout(
              loadActivityLog,
              250
            );
        }
      );

    document
      .getElementById("activityClearButton")
      .onclick = function() {
        document.getElementById("activitySearch").value = "";
        document.getElementById("activityActionFilter").value = "all";
        document.getElementById("activityPeriodFilter").value = "30d";
        loadActivityLog();
      };

    document
      .getElementById("exportCsvButton")
      .onclick = openExportCsv;

    document
      .getElementById("closeExportCsvX")
      .onclick = closeExportCsv;

    document
      .getElementById("cancelExportCsvButton")
      .onclick = closeExportCsv;

    document
      .getElementById("confirmExportCsvButton")
      .onclick = exportCsv;

    document
      .getElementById("exportCsvType")
      .addEventListener("change", updateExportCsvNote);

    document
      .getElementById("createKeyButton")
      .onclick = openCreateKey;

    document
      .getElementById("bulkKeyButton")
      .onclick = openBulkKeys;

    document
      .getElementById("openBulkCreateButton")
      .onclick = showBulkCreateView;

    document
      .getElementById("openBulkDeleteButton")
      .onclick = showBulkDeleteView;

    document
      .getElementById("bulkCreateBackButton")
      .onclick = showBulkManagementChoice;

    document
      .getElementById("bulkDeleteBackButton")
      .onclick = showBulkManagementChoice;

    document
      .getElementById("bulkKeySource")
      .addEventListener(
        "change",
        toggleBulkKeySource
      );

    document
      .getElementById("bulkDeleteSource")
      .addEventListener(
        "change",
        toggleBulkDeleteSource
      );

    [
      "bulkDeleteTag",
      "bulkDeletePlan",
      "bulkDeleteStatus",
      "bulkDeleteDuration",
      "bulkDeleteCreated"
    ].forEach(function(id) {
      document
        .getElementById(id)
        .addEventListener(
          "change",
          updateBulkDeleteDynamicSummary
        );
    });

    document
      .getElementById("closeBulkKeyX")
      .onclick = closeBulkKeys;

    document
      .getElementById("closeBulkKeyResultButton")
      .onclick = closeBulkKeys;

    document
      .getElementById("closeBulkDeleteResultButton")
      .onclick = closeBulkKeys;

    document
      .getElementById("confirmBulkKeyButton")
      .onclick = createBulkKeys;

    document
      .getElementById("confirmBulkDeleteButton")
      .onclick = deleteBulkKeys;

    document
      .getElementById("downloadBulkKeysButton")
      .onclick = downloadBulkKeys;

    document
      .getElementById("copyBulkKeysButton")
      .onclick = copyBulkKeys;

    document
      .getElementById("cancelCreateKeyButton")
      .onclick = closeCreateKey;

    document
      .getElementById("confirmCreateKeyButton")
      .onclick = createKey;

    document
      .getElementById("manageSelectedButton")
      .onclick = openSelectedKeyMenu;

    document
      .getElementById("revokeCancelButton")
      .onclick = closeRevokeModal;

    document
      .getElementById("revokeOnlyButton")
      .onclick = async function() {
        if (PendingRevokeItems.length === 0) {
          return;
        }

        if (PendingRevokeItems.length === 1) {
          const item = PendingRevokeItems[0];

          if (!item.license_id) {
            return;
          }

          await setRevoked(
            item.license_id,
            true
          );

          closeRevokeModal();
          return;
        }

        await performSelectedAction(
          "revoke"
        );
      };

    document
      .getElementById("revokeDeleteButton")
      .onclick = async function() {
        if (PendingRevokeItems.length === 0) {
          return;
        }

        if (PendingRevokeItems.length === 1) {
          const item = PendingRevokeItems[0];

          if (item.license_id) {
            await revokeAndDelete(
              item.license_id
            );
          } else if (item.admin_created) {
            try {
              await requestDeleteUnused(
                item.session_id
              );
              await loadKeys(false);
            } catch (error) {
              alert(error.message);
            }
          }

          closeRevokeModal();
          return;
        }

        await performSelectedAction(
          "delete"
        );
      };

    document
      .getElementById("logoutButton")
      .onclick = async function() {
        try {
          await fetch(
            "/api/admin/logout",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({})
            }
          );
        } catch (error) {
          console.error(
            "ADMIN LOGOUT ERROR:",
            error
          );
        } finally {
          document
            .getElementById("adminSecret")
            .value = "";

          showAdminLogin("");
        }
      };

    restoreAdminSession();
  </script>
</body>
</html>
      `, {
        status: 200,
        headers: {
          "Content-Type":
            "text/html; charset=utf-8",
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
          "Pragma":
            "no-cache",
          "X-Content-Type-Options":
            "nosniff",
          "X-Frame-Options":
            "DENY",
          "Referrer-Policy":
            "no-referrer",
          "Permissions-Policy":
            "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          "Content-Security-Policy":
            "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; connect-src 'self'; img-src 'self' data:; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests"
        }
      });
    }

    
    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/delete-unused-key"
    ) {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          success: false,
          error: "Invalid request body."
        }, 400);
      }

      const adminSecret =
        String(body.admin_secret || "").trim();

      const sessionId =
        String(body.session_id || "").trim();

      if (
        !env.ADMIN_SECRET ||
        adminSecret !== env.ADMIN_SECRET
      ) {
        return json({
          success: false,
          error: "Access denied."
        }, 403);
      }

      if (!sessionId) {
        return json({
          success: false,
          error: "session_id is required."
        }, 400);
      }

      const session =
        await env.DB.prepare(`
          SELECT
            id,
            redeemed_at,
            roblox_user_id
          FROM sessions
          WHERE id = ?
          LIMIT 1
        `)
          .bind(sessionId)
          .first();

      if (!session) {
        return json({
          success: false,
          error: "Key not found."
        }, 404);
      }

      if (session.redeemed_at) {
        return json({
          success: false,
          error: "This key has already been redeemed."
        }, 409);
      }

      if (session.roblox_user_id !== "ADMIN_CREATED") {
        return json({
          success: false,
          error: "Only manually created admin keys can be deleted here."
        }, 403);
      }

      await env.DB.prepare(`
        DELETE FROM sessions
        WHERE id = ?
      `)
        .bind(sessionId)
        .run();

      await recordAnalytics(
        env,
        {
          keys_deleted: 1
        }
      );

      await recordAdminActivity(
        env,
        "delete_key",
        "key",
        sessionId,
        "Deleted unused admin-created key"
      );

      return json({
        success: true,
        deleted: true,
        session_id: sessionId
      });
    }


    // =====================================================
    // ADMIN - REVOKE / UNREVOKE LICENSE
    // POST /api/admin/set-revoked
    // =====================================================

    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/set-revoked"
    ) {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          success: false,
          error: "Invalid request body."
        }, 400);
      }

      const adminSecret =
        String(body.admin_secret || "").trim();

      const licenseId =
        String(body.license_id || "").trim();

      const revoked =
        body.revoked === true;


      if (
        !env.ADMIN_SECRET ||
        adminSecret !== env.ADMIN_SECRET
      ) {
        return json({
          success: false,
          error: "Access denied."
        }, 403);
      }


      if (!licenseId) {
        return json({
          success: false,
          error: "license_id is required."
        }, 400);
      }


      const license =
        await env.DB.prepare(`
          SELECT
            license_id,
            revoked,
            expires_at
          FROM licenses
          WHERE license_id = ?
          LIMIT 1
        `)
        .bind(licenseId)
        .first();


      if (!license) {
        return json({
          success: false,
          error: "License not found."
        }, 404);
      }


      const now = Date.now();

      const wasRevoked =
        Number(license.revoked) === 1;

      const isExpired =
        Number(license.expires_at) <= now;

      if (
        !revoked &&
        wasRevoked &&
        isExpired
      ) {
        return json({
          success: false,
          error:
            "Expired licenses cannot be unrevoked."
        }, 409);
      }


      await env.DB.prepare(`
        UPDATE licenses
        SET revoked = ?
        WHERE license_id = ?
      `)
        .bind(
          revoked ? 1 : 0,
          licenseId
        )
        .run();


      if (wasRevoked !== revoked) {
        if (revoked) {
          if (isExpired) {
            // If cleanup has not run yet, place the active-license
            // drop at the real expiry hour instead of today.
            await recordAnalytics(
              env,
              {
                license_delta: -1,
                licenses_expired: 1
              },
              Number(license.expires_at)
            );

            await recordAnalytics(
              env,
              {
                licenses_revoked: 1
              },
              now
            );
          } else {
            await recordAnalytics(
              env,
              {
                license_delta: -1,
                licenses_revoked: 1
              },
              now
            );
          }
        } else {
          await recordAnalytics(
            env,
            {
              license_delta: 1,
              licenses_unrevoked: 1
            },
            now
          );
        }
      }


      // Clean temporary credentials when revoking
      if (revoked) {

        await env.DB.prepare(`
          DELETE FROM access_tokens
          WHERE license_id = ?
        `)
          .bind(licenseId)
          .run();


        await env.DB.prepare(`
          DELETE FROM script_tickets
          WHERE license_id = ?
        `)
          .bind(licenseId)
          .run();
      }


      await recordAdminActivity(
        env,
        revoked ? "revoke" : "unrevoke",
        "license",
        licenseId,
        revoked
          ? "Revoked license"
          : "Unrevoked license"
      );

      return json({
        success: true,
        license_id: licenseId,
        revoked: revoked
      });
    }


    // =====================================================
    // ADMIN - REVOKE + DELETE KEY/LICENSE/SESSION
    // POST /api/admin/revoke-delete
    // =====================================================

    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/revoke-delete"
    ) {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          success: false,
          error: "Invalid request body."
        }, 400);
      }

      const adminSecret =
        String(body.admin_secret || "").trim();

      const licenseId =
        String(body.license_id || "").trim();

      if (
        !env.ADMIN_SECRET ||
        adminSecret !== env.ADMIN_SECRET
      ) {
        return json({
          success: false,
          error: "Access denied."
        }, 403);
      }

      if (!licenseId) {
        return json({
          success: false,
          error: "license_id is required."
        }, 400);
      }


      // Find the session connected to this license
      const license =
        await env.DB.prepare(`
          SELECT
            license_id,
            session_id,
            revoked,
            expires_at
          FROM licenses
          WHERE license_id = ?
          LIMIT 1
        `)
        .bind(licenseId)
        .first();


      if (!license) {
        return json({
          success: false,
          error: "License not found."
        }, 404);
      }


      const sessionId =
        license.session_id;


      // Remove temporary access tokens
      await env.DB.prepare(`
        DELETE FROM access_tokens
        WHERE license_id = ?
      `)
        .bind(licenseId)
        .run();


      // Remove unused script tickets
      await env.DB.prepare(`
        DELETE FROM script_tickets
        WHERE license_id = ?
      `)
        .bind(licenseId)
        .run();


      // Remove redeemer/account history
      await env.DB.prepare(`
        DELETE FROM key_redeemers
        WHERE session_id = ?
          OR license_id = ?
      `)
        .bind(
          sessionId,
          licenseId
        )
        .run();


      // Delete license
      await env.DB.prepare(`
        DELETE FROM licenses
        WHERE license_id = ?
      `)
        .bind(licenseId)
        .run();


      // Delete session + raw ALTER_ key
      await env.DB.prepare(`
        DELETE FROM sessions
        WHERE id = ?
      `)
        .bind(sessionId)
        .run();


      const deleteNow = Date.now();

      const deletedWasRevoked =
        Number(license.revoked) === 1;

      const deletedWasExpired =
        Number(license.expires_at) <= deleteNow;

      if (
        !deletedWasRevoked &&
        deletedWasExpired
      ) {
        // Preserve the historical drop at the actual expiry time.
        await recordAnalytics(
          env,
          {
            license_delta: -1,
            licenses_expired: 1
          },
          Number(license.expires_at)
        );
      }

      await recordAnalytics(
        env,
        {
          keys_deleted: 1,
          licenses_deleted: 1,
          license_delta:
            !deletedWasRevoked &&
            !deletedWasExpired
              ? -1
              : 0
        },
        deleteNow
      );


      await recordAdminActivity(
        env,
        "revoke_delete",
        "license",
        licenseId,
        "Revoked and deleted license and key"
      );

      return json({
        success: true,
        deleted: true,
        license_id: licenseId,
        session_id: sessionId
      });
    }


    // =====================================================
    // DEFAULT ROUTE
    // =====================================================

    return json({
      success: false,
      error: "Endpoint not found"
    }, 404);

  },

  async scheduled(event, env, ctx) {

    console.log(
      "ALTER HUB CRON START:",
      new Date().toISOString()
    );

    ctx.waitUntil(
      cleanupExpiredData(env)
        .then(() => {
          console.log(
            "ALTER HUB CRON FINISHED"
          );
        })
        .catch((error) => {
          console.error(
            "ALTER HUB CRON ERROR:",
            error
          );
        })
    );
  }

};



// =====================================================
// JSON RESPONSE
// =====================================================

function json(data, status = 200) {

  return new Response(
    JSON.stringify(
      data,
      null,
      2
    ),
    {
      status,

      headers: {

        "Content-Type":
          "application/json; charset=UTF-8",

        ...corsHeaders()

      }
    }
  );
}



// =====================================================
// HTML RESPONSE
// =====================================================

function html(content, status = 200) {

  return new Response(
    content,
    {
      status,

      headers: {

        "Content-Type":
          "text/html; charset=UTF-8",

        "Cache-Control":
          "no-store",

        "X-Robots-Tag":
          "noindex, nofollow"

      }
    }
  );
}



// =====================================================
// ALTER HUB TELEMETRY HELPERS
// =====================================================

let __alterHubTelemetrySchemaReady = false;

const ALTER_HUB_TELEMETRY_EVENTS = new Set([
  "script_started",
  "script_closed",
  "feature_used",
  "script_error",
  "heartbeat"
]);


function alterHubTelemetryDb(env) {
  return env.TELEMETRY_DB || null;
}


async function ensureAlterHubTelemetrySchema(env) {
  const db = alterHubTelemetryDb(env);

  if (!db) {
    throw new Error(
      "TELEMETRY_DB D1 binding is not configured."
    );
  }

  if (__alterHubTelemetrySchemaReady) {
    return db;
  }

  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS telemetry_events (
        id TEXT PRIMARY KEY,
        event TEXT NOT NULL,

        roblox_user_id TEXT,
        roblox_username TEXT,
        roblox_display_name TEXT,
        account_age_days INTEGER,
        membership_type TEXT,

        place_id TEXT,
        game_id TEXT,
        job_id TEXT,

        executor TEXT,
        executor_version TEXT,
        platform TEXT,
        locale TEXT,
        script_version TEXT,

        feature TEXT,
        error_message TEXT,

        license_id TEXT NOT NULL,
        session_id TEXT,
        device_hash TEXT,
        access_plan TEXT,

        ip_address TEXT,

        country TEXT,
        continent TEXT,
        region TEXT,
        region_code TEXT,
        city TEXT,
        postal_code TEXT,
        timezone TEXT,
        latitude REAL,
        longitude REAL,

        asn INTEGER,
        as_organization TEXT,

        cloudflare_colo TEXT,
        cf_ray TEXT,

        user_agent TEXT,
        accept_language TEXT,

        http_protocol TEXT,
        tls_version TEXT,
        tls_cipher TEXT,
        client_tcp_rtt INTEGER,

        client_timestamp INTEGER,
        server_timestamp INTEGER NOT NULL
      )
    `),

    db.prepare(`
      CREATE INDEX IF NOT EXISTS
        idx_telemetry_server_timestamp
      ON telemetry_events(server_timestamp DESC)
    `),

    db.prepare(`
      CREATE INDEX IF NOT EXISTS
        idx_telemetry_roblox_user
      ON telemetry_events(
        roblox_user_id,
        server_timestamp DESC
      )
    `),

    db.prepare(`
      CREATE INDEX IF NOT EXISTS
        idx_telemetry_ip
      ON telemetry_events(
        ip_address,
        server_timestamp DESC
      )
    `),

    db.prepare(`
      CREATE INDEX IF NOT EXISTS
        idx_telemetry_license
      ON telemetry_events(
        license_id,
        server_timestamp DESC
      )
    `),

    db.prepare(`
      CREATE INDEX IF NOT EXISTS
        idx_telemetry_event
      ON telemetry_events(
        event,
        server_timestamp DESC
      )
    `)
  ]);

  __alterHubTelemetrySchemaReady = true;

  return db;
}


async function handleAlterHubTelemetry(
  request,
  env
) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json({
      success: false,
      error: "Invalid telemetry JSON."
    }, 400);
  }

  const event =
    telemetryText(
      body.event || "script_started",
      50
    ) || "script_started";

  if (
    !ALTER_HUB_TELEMETRY_EVENTS.has(event)
  ) {
    return json({
      success: false,
      error: "Invalid telemetry event."
    }, 400);
  }

  // Public telemetry ingestion.
  // No license/access token is required. Executing the Lua client
  // is enough to submit a telemetry event.
  //
  // IMPORTANT: because this endpoint is public, client-supplied
  // identity fields can be spoofed. Network metadata such as the
  // direct connecting IP is still taken server-side from Cloudflare.

  const now =
    Date.now();

  const db =
    await ensureAlterHubTelemetrySchema(
      env
    );

  // The direct connecting IP is read only from
  // Cloudflare's edge header. Any client-supplied IP
  // value is ignored.
  const ipAddress =
    telemetryText(
      request.headers.get(
        "CF-Connecting-IP"
      ),
      64
    );

  // Basic ingestion flood limit: 120 accepted events
  // from the same IP in the last 60 seconds.
  if (ipAddress) {
    const recent =
      await db.prepare(`
        SELECT COUNT(*) AS count
        FROM telemetry_events
        WHERE ip_address = ?
          AND server_timestamp >= ?
      `)
        .bind(
          ipAddress,
          now - 60_000
        )
        .first();

    if (
      Number(recent?.count || 0) >=
      120
    ) {
      return json({
        success: false,
        error:
          "Telemetry rate limit exceeded."
      }, 429);
    }
  }

  const cf =
    request.cf || {};

  const id =
    crypto.randomUUID()
      .replaceAll("-", "");

  const robloxUserId =
    telemetryDigits(
      body.roblox_user_id,
      30
    );

  const robloxUsername =
    telemetryText(
      body.roblox_username ||
      body.username,
      100
    );

  const robloxDisplayName =
    telemetryText(
      body.roblox_display_name,
      100
    );

  const accountAgeDays =
    telemetryInteger(
      body.account_age_days
    );

  const membershipType =
    telemetryText(
      body.membership_type,
      50
    );

  const placeId =
    telemetryDigits(
      body.place_id,
      30
    );

  const gameId =
    telemetryDigits(
      body.game_id,
      30
    );

  const jobId =
    telemetryText(
      body.job_id,
      120
    );

  const executor =
    telemetryText(
      body.executor,
      120
    );

  const executorVersion =
    telemetryText(
      body.executor_version,
      120
    );

  const platform =
    telemetryText(
      body.platform,
      80
    );

  const locale =
    telemetryText(
      body.locale,
      80
    );

  const scriptVersion =
    telemetryText(
      body.script_version,
      80
    );

  const feature =
    telemetryText(
      body.feature,
      160
    );

  const errorMessage =
    telemetryText(
      body.error_message,
      2000
    );

  const country =
    telemetryText(
      cf.country,
      16
    );

  const continent =
    telemetryText(
      cf.continent,
      16
    );

  const region =
    telemetryText(
      cf.region,
      120
    );

  const regionCode =
    telemetryText(
      cf.regionCode,
      32
    );

  const city =
    telemetryText(
      cf.city,
      120
    );

  const postalCode =
    telemetryText(
      cf.postalCode,
      32
    );

  const timezone =
    telemetryText(
      cf.timezone,
      100
    );

  const latitude =
    telemetryNumber(
      cf.latitude
    );

  const longitude =
    telemetryNumber(
      cf.longitude
    );

  const asn =
    telemetryInteger(
      cf.asn
    );

  const asOrganization =
    telemetryText(
      cf.asOrganization,
      255
    );

  const cloudflareColo =
    telemetryText(
      cf.colo,
      32
    );

  const cfRay =
    telemetryText(
      request.headers.get("CF-Ray"),
      128
    );

  const userAgent =
    telemetryText(
      request.headers.get(
        "User-Agent"
      ),
      1000
    );

  const acceptLanguage =
    telemetryText(
      request.headers.get(
        "Accept-Language"
      ),
      500
    );

  const httpProtocol =
    telemetryText(
      cf.httpProtocol,
      64
    );

  const tlsVersion =
    telemetryText(
      cf.tlsVersion,
      64
    );

  const tlsCipher =
    telemetryText(
      cf.tlsCipher,
      128
    );

  const clientTcpRtt =
    telemetryInteger(
      cf.clientTcpRtt
    );

  const clientTimestamp =
    telemetryInteger(
      body.timestamp ||
      body.client_timestamp
    );

  await db.prepare(`
    INSERT INTO telemetry_events (
      id,
      event,

      roblox_user_id,
      roblox_username,
      roblox_display_name,
      account_age_days,
      membership_type,

      place_id,
      game_id,
      job_id,

      executor,
      executor_version,
      platform,
      locale,
      script_version,

      feature,
      error_message,

      license_id,
      session_id,
      device_hash,
      access_plan,

      ip_address,

      country,
      continent,
      region,
      region_code,
      city,
      postal_code,
      timezone,
      latitude,
      longitude,

      asn,
      as_organization,

      cloudflare_colo,
      cf_ray,

      user_agent,
      accept_language,

      http_protocol,
      tls_version,
      tls_cipher,
      client_tcp_rtt,

      client_timestamp,
      server_timestamp
    )
    VALUES (
      ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?,
      ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?,
      ?, ?,
      ?, ?, ?, ?,
      ?, ?
    )
  `)
    .bind(
      id,
      event,

      robloxUserId,
      robloxUsername,
      robloxDisplayName,
      accountAgeDays,
      membershipType,

      placeId,
      gameId,
      jobId,

      executor,
      executorVersion,
      platform,
      locale,
      scriptVersion,

      feature,
      errorMessage,

      telemetryText(
        body.license_id,
        120
      ) || "unlinked",
      telemetryText(
        body.session_id,
        120
      ),
      telemetryText(
        body.device_hash,
        256
      ),
      telemetryText(
        body.access_plan ||
        "unknown",
        32
      ),

      ipAddress,

      country,
      continent,
      region,
      regionCode,
      city,
      postalCode,
      timezone,
      latitude,
      longitude,

      asn,
      asOrganization,

      cloudflareColo,
      cfRay,

      userAgent,
      acceptLanguage,

      httpProtocol,
      tlsVersion,
      tlsCipher,
      clientTcpRtt,

      clientTimestamp,
      now
    )
    .run();

  return json({
    success: true,
    accepted: true,
    event_id: id
  }, 201);
}


async function handleAlterHubTelemetryAdminList(
  request,
  env,
  url
) {
  let db;

  try {
    db =
      await ensureAlterHubTelemetrySchema(
        env
      );
  } catch (error) {
    return adminJson({
      success: false,
      error:
        "TELEMETRY_DB is not configured."
    }, 503);
  }

  const limit =
    telemetryClampInt(
      url.searchParams.get("limit"),
      1,
      500,
      100
    );

  const offset =
    telemetryClampInt(
      url.searchParams.get("offset"),
      0,
      10_000_000,
      0
    );

  const clauses = [];
  const values = [];

  const event =
    telemetryText(
      url.searchParams.get("event"),
      50
    );

  const userId =
    telemetryDigits(
      url.searchParams.get(
        "roblox_user_id"
      ),
      30
    );

  const ip =
    telemetryText(
      url.searchParams.get("ip"),
      64
    );

  const licenseId =
    telemetryText(
      url.searchParams.get(
        "license_id"
      ),
      120
    );

  if (event) {
    clauses.push("event = ?");
    values.push(event);
  }

  if (userId) {
    clauses.push(
      "roblox_user_id = ?"
    );
    values.push(userId);
  }

  if (ip) {
    clauses.push(
      "ip_address = ?"
    );
    values.push(ip);
  }

  if (licenseId) {
    clauses.push(
      "license_id = ?"
    );
    values.push(licenseId);
  }

  const where =
    clauses.length
      ? "WHERE " +
        clauses.join(" AND ")
      : "";

  const result =
    await db.prepare(`
      SELECT *
      FROM telemetry_events
      ${where}
      ORDER BY server_timestamp DESC
      LIMIT ?
      OFFSET ?
    `)
      .bind(
        ...values,
        limit,
        offset
      )
      .all();

  return adminJson({
    success: true,
    count:
      result.results?.length || 0,
    results:
      result.results || []
  });
}


async function handleAlterHubTelemetryAdminUser(
  request,
  env,
  url
) {
  const db =
    await ensureAlterHubTelemetrySchema(
      env
    );

  const userId =
    telemetryDigits(
      url.searchParams.get(
        "roblox_user_id"
      ),
      30
    );

  if (!userId) {
    return adminJson({
      success: false,
      error:
        "roblox_user_id is required."
    }, 400);
  }

  const summary =
    await db.prepare(`
      SELECT
        roblox_user_id,

        MAX(roblox_username)
          AS roblox_username,

        MAX(roblox_display_name)
          AS roblox_display_name,

        MIN(server_timestamp)
          AS first_seen,

        MAX(server_timestamp)
          AS last_seen,

        COUNT(*)
          AS event_count,

        COUNT(
          DISTINCT ip_address
        ) AS unique_ips,

        COUNT(
          DISTINCT place_id
        ) AS unique_places,

        COUNT(
          DISTINCT executor
        ) AS unique_executors

      FROM telemetry_events

      WHERE roblox_user_id = ?

      GROUP BY roblox_user_id
    `)
      .bind(userId)
      .first();

  const recent =
    await db.prepare(`
      SELECT *
      FROM telemetry_events
      WHERE roblox_user_id = ?
      ORDER BY server_timestamp DESC
      LIMIT 100
    `)
      .bind(userId)
      .all();

  return adminJson({
    success: true,
    summary:
      summary || null,
    recent:
      recent.results || []
  });
}


async function handleAlterHubTelemetryAdminPurge(
  request,
  env
) {
  const db =
    await ensureAlterHubTelemetrySchema(
      env
    );

  let body = {};

  try {
    body =
      await request.json();
  } catch {
    body = {};
  }

  const retentionDays =
    telemetryClampInt(
      body.retention_days,
      1,
      3650,
      90
    );

  const cutoff =
    Date.now() -
    retentionDays *
    24 *
    60 *
    60 *
    1000;

  const result =
    await db.prepare(`
      DELETE FROM telemetry_events
      WHERE server_timestamp < ?
    `)
      .bind(cutoff)
      .run();

  await recordAdminActivity(
    env,
    "telemetry_purge",
    "telemetry",
    "",
    "Deleted telemetry older than " +
      retentionDays +
      " days"
  );

  return adminJson({
    success: true,
    retention_days:
      retentionDays,
    deleted:
      Number(
        result.meta?.changes || 0
      )
  });
}


function telemetryText(
  value,
  maxLength = 255
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text =
    String(value).trim();

  if (!text) {
    return null;
  }

  return text.slice(
    0,
    maxLength
  );
}


function telemetryDigits(
  value,
  maxLength = 30
) {
  const text =
    telemetryText(
      value,
      maxLength
    );

  if (
    !text ||
    !/^\d+$/.test(text)
  ) {
    return null;
  }

  return text;
}


function telemetryNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}


function telemetryInteger(value) {
  const number =
    telemetryNumber(value);

  if (number === null) {
    return null;
  }

  return Math.trunc(number);
}


function telemetryClampInt(
  value,
  minimum,
  maximum,
  fallback
) {
  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(
    maximum,
    Math.max(
      minimum,
      Math.trunc(number)
    )
  );
}


// =====================================================
// CORS
// =====================================================

function corsHeaders() {

  return {

    "Access-Control-Allow-Origin":
      "*",

    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",

    "Access-Control-Allow-Headers":
      "Content-Type"

  };
}



// =====================================================
// CLOUDFLARE TURNSTILE VERIFICATION
// =====================================================

async function verifyTurnstileToken(
  request,
  env,
  token,
  expectedHostname,
  expectedAction
) {
  const secret =
    String(env.TURNSTILE_SECRET_KEY || "").trim();

  if (!secret) {
    return {
      ok: false,
      reason: "not_configured"
    };
  }

  const responseToken =
    String(token || "").trim();

  if (
    !responseToken ||
    responseToken.length > 4096
  ) {
    return {
      ok: false,
      reason: "missing_or_invalid_token"
    };
  }

  const formData =
    new FormData();

  formData.append(
    "secret",
    secret
  );

  formData.append(
    "response",
    responseToken
  );

  const remoteIp =
    String(
      request.headers.get("CF-Connecting-IP") ||
      ""
    ).trim();

  if (remoteIp) {
    formData.append(
      "remoteip",
      remoteIp
    );
  }

  try {
    const verificationResponse =
      await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          body: formData
        }
      );

    if (!verificationResponse.ok) {
      return {
        ok: false,
        reason: "siteverify_http_error"
      };
    }

    const result =
      await verificationResponse.json();

    if (result.success !== true) {
      return {
        ok: false,
        reason: "siteverify_rejected",
        errorCodes: Array.isArray(result["error-codes"])
          ? result["error-codes"]
          : []
      };
    }

    const hostname =
      String(result.hostname || "")
        .trim()
        .toLowerCase();

    const requiredHostname =
      String(expectedHostname || "")
        .trim()
        .toLowerCase();

    if (
      requiredHostname &&
      hostname !== requiredHostname
    ) {
      return {
        ok: false,
        reason: "hostname_mismatch"
      };
    }

    const action =
      String(result.action || "").trim();

    if (
      expectedAction &&
      action !== expectedAction
    ) {
      return {
        ok: false,
        reason: "action_mismatch"
      };
    }

    return {
      ok: true,
      reason: "verified"
    };
  } catch (error) {
    console.error(
      "Turnstile verification error:",
      error
    );

    return {
      ok: false,
      reason: "siteverify_request_error"
    };
  }
}


// =====================================================
// GENERATE FINAL KEY
// =====================================================

function generateKey() {

  const bytes =
    new Uint8Array(24);


  crypto.getRandomValues(bytes);


  const randomPart =
    Array
      .from(bytes)

      .map(
        byte =>
          byte
            .toString(16)
            .padStart(2, "0")
      )

      .join("")

      .toUpperCase();


  return "ALTER_" + randomPart;
}



// =====================================================
// BASIC HTML ESCAPING
// =====================================================

function escapeHtml(value) {

  return String(value)

    .replaceAll("&", "&amp;")

    .replaceAll("<", "&lt;")

    .replaceAll(">", "&gt;")

    .replaceAll('"', "&quot;")

    .replaceAll("'", "&#039;");
}

function getCookie(cookieHeader, name) {

  const cookies =
    cookieHeader.split(";");


  for (const cookie of cookies) {

    const parts =
      cookie.trim().split("=");

    const key =
      parts.shift();

    const value =
      parts.join("=");


    if (key === name) {
      return value;
    }
  }


  return null;
}


// =====================================================
// SECURE ADMIN SESSION HELPERS
// =====================================================

const ADMIN_SESSION_COOKIE =
  "ah_admin_session";

const ADMIN_SESSION_MAX_AGE_MS =
  2 * 60 * 60 * 1000;

const ADMIN_SESSION_IDLE_MS =
  30 * 60 * 1000;

const ADMIN_LOGIN_WINDOW_MS =
  15 * 60 * 1000;

const ADMIN_LOGIN_MAX_FAILURES = 5;


function adminJson(
  data,
  status = 200,
  extraHeaders = {}
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type":
          "application/json; charset=UTF-8",
        "Cache-Control":
          "no-store, no-cache, must-revalidate",
        "Pragma":
          "no-cache",
        "X-Content-Type-Options":
          "nosniff",
        ...extraHeaders
      }
    }
  );
}


function adminRequestSourceAllowed(
  request,
  url
) {
  if (
    request.headers.get("X-AlterHub-Admin") !==
      "1"
  ) {
    return false;
  }

  const origin =
    request.headers.get("Origin");

  if (
    origin &&
    origin !== url.origin
  ) {
    return false;
  }

  const fetchSite =
    request.headers.get("Sec-Fetch-Site");

  if (
    fetchSite &&
    fetchSite !== "same-origin" &&
    fetchSite !== "none"
  ) {
    return false;
  }

  return true;
}


async function sha256Hex(value) {
  const bytes =
    new TextEncoder().encode(
      String(value || "")
    );

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      bytes
    );

  return Array
    .from(new Uint8Array(digest))
    .map(function(byte) {
      return byte
        .toString(16)
        .padStart(2, "0");
    })
    .join("");
}


async function constantTimeSecretMatch(
  supplied,
  expected
) {
  if (!expected) {
    return false;
  }

  const suppliedDigest =
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        String(supplied || "")
      )
    );

  const expectedDigest =
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        String(expected || "")
      )
    );

  const left =
    new Uint8Array(suppliedDigest);

  const right =
    new Uint8Array(expectedDigest);

  let difference = 0;

  for (
    let index = 0;
    index < left.length;
    index++
  ) {
    difference |=
      left[index] ^ right[index];
  }

  return difference === 0;
}


function randomAdminSessionToken() {
  const bytes =
    new Uint8Array(32);

  crypto.getRandomValues(bytes);

  return Array
    .from(bytes)
    .map(function(byte) {
      return byte
        .toString(16)
        .padStart(2, "0");
    })
    .join("");
}


function buildAdminSessionCookie(token) {
  return (
    ADMIN_SESSION_COOKIE +
    "=" + token +
    "; Path=/" +
    "; HttpOnly" +
    "; Secure" +
    "; SameSite=Strict" +
    "; Max-Age=7200"
  );
}


function clearAdminSessionCookie() {
  return (
    ADMIN_SESSION_COOKIE +
    "=; Path=/" +
    "; HttpOnly" +
    "; Secure" +
    "; SameSite=Strict" +
    "; Max-Age=0"
  );
}


async function createAdminSession(
  env,
  now = Date.now()
) {
  // Remove expired or long-idle sessions opportunistically.
  await env.DB.prepare(`
    DELETE FROM admin_sessions
    WHERE expires_at <= ?
       OR last_seen_at <= ?
  `)
    .bind(
      now,
      now - ADMIN_SESSION_IDLE_MS
    )
    .run();

  const token =
    randomAdminSessionToken();

  const sessionHash =
    await sha256Hex(token);

  const expiresAt =
    now + ADMIN_SESSION_MAX_AGE_MS;

  await env.DB.prepare(`
    INSERT INTO admin_sessions (
      session_hash,
      created_at,
      expires_at,
      last_seen_at
    )
    VALUES (?, ?, ?, ?)
  `)
    .bind(
      sessionHash,
      now,
      expiresAt,
      now
    )
    .run();

  return {
    token,
    expiresAt
  };
}


async function requireAdminSession(
  request,
  env
) {
  const cookieHeader =
    request.headers.get("Cookie") || "";

  const token =
    getCookie(
      cookieHeader,
      ADMIN_SESSION_COOKIE
    );

  if (
    !token ||
    !/^[a-fA-F0-9]{64}$/.test(token)
  ) {
    return null;
  }

  const sessionHash =
    await sha256Hex(token);

  const row =
    await env.DB.prepare(`
      SELECT
        session_hash,
        created_at,
        expires_at,
        last_seen_at
      FROM admin_sessions
      WHERE session_hash = ?
      LIMIT 1
    `)
      .bind(sessionHash)
      .first();

  if (!row) {
    return null;
  }

  const now = Date.now();

  if (
    Number(row.expires_at) <= now ||
    Number(row.last_seen_at) <=
      now - ADMIN_SESSION_IDLE_MS
  ) {
    await env.DB.prepare(`
      DELETE FROM admin_sessions
      WHERE session_hash = ?
    `)
      .bind(sessionHash)
      .run();

    return null;
  }

  // Avoid a D1 write for every single dashboard request.
  if (
    now - Number(row.last_seen_at) >=
      60 * 1000
  ) {
    await env.DB.prepare(`
      UPDATE admin_sessions
      SET last_seen_at = ?
      WHERE session_hash = ?
    `)
      .bind(
        now,
        sessionHash
      )
      .run();

    row.last_seen_at = now;
  }

  return row;
}


async function deleteAdminSessionForRequest(
  request,
  env
) {
  const cookieHeader =
    request.headers.get("Cookie") || "";

  const token =
    getCookie(
      cookieHeader,
      ADMIN_SESSION_COOKIE
    );

  if (
    !token ||
    !/^[a-fA-F0-9]{64}$/.test(token)
  ) {
    return false;
  }

  const sessionHash =
    await sha256Hex(token);

  await env.DB.prepare(`
    DELETE FROM admin_sessions
    WHERE session_hash = ?
  `)
    .bind(sessionHash)
    .run();

  return true;
}


async function adminLoginFingerprint(
  request,
  secret
) {
  const ip =
    String(
      request.headers.get("CF-Connecting-IP") ||
      "unknown"
    );

  const userAgent =
    String(
      request.headers.get("User-Agent") ||
      "unknown"
    )
      .slice(0, 300);

  // The secret acts as a private salt, so raw IPs are never stored.
  return sha256Hex(
    String(secret || "") +
    "|" + ip +
    "|" + userAgent
  );
}


async function getAdminLoginRateStatus(
  env,
  fingerprint,
  now = Date.now()
) {
  // Keep only a short amount of pseudonymous rate-limit history.
  await env.DB.prepare(`
    DELETE FROM admin_login_attempts
    WHERE created_at < ?
  `)
    .bind(
      now - (24 * 60 * 60 * 1000)
    )
    .run();

  const windowStart =
    now - ADMIN_LOGIN_WINDOW_MS;

  const row =
    await env.DB.prepare(`
      SELECT
        COUNT(*) AS failures,
        MAX(created_at) AS latest_failure
      FROM admin_login_attempts
      WHERE attempt_hash = ?
        AND success = 0
        AND created_at >= ?
    `)
      .bind(
        fingerprint,
        windowStart
      )
      .first();

  const failures =
    Number(row?.failures || 0);

  if (
    failures < ADMIN_LOGIN_MAX_FAILURES
  ) {
    return {
      allowed: true,
      retryAfterSeconds: 0
    };
  }

  const latestFailure =
    Number(row?.latest_failure || now);

  const retryAfterSeconds =
    Math.max(
      1,
      Math.ceil(
        (
          latestFailure +
          ADMIN_LOGIN_WINDOW_MS -
          now
        ) / 1000
      )
    );

  return {
    allowed: false,
    retryAfterSeconds
  };
}


async function recordAdminLoginAttempt(
  env,
  fingerprint,
  success,
  now = Date.now()
) {
  await env.DB.prepare(`
    INSERT INTO admin_login_attempts (
      id,
      attempt_hash,
      created_at,
      success
    )
    VALUES (?, ?, ?, ?)
  `)
    .bind(
      crypto.randomUUID()
        .replaceAll("-", ""),
      fingerprint,
      now,
      success ? 1 : 0
    )
    .run();
}


async function injectAdminSecretForLegacyRoutes(
  request,
  adminSecret
) {
  if (
    request.method !== "POST" ||
    !adminSecret
  ) {
    return request;
  }

  let body;

  try {
    body =
      await request.clone().json();
  } catch (error) {
    return request;
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return request;
  }

  body.admin_secret =
    String(adminSecret);

  const headers =
    new Headers(request.headers);

  headers.set(
    "Content-Type",
    "application/json"
  );

  return new Request(
    request,
    {
      headers,
      body: JSON.stringify(body)
    }
  );
}
// =====================================================
// PAYPAL HELPERS
// =====================================================

const PAYPAL_KEYLESS_MONTHLY_DURATION_MS =
  30 * 24 * 60 * 60 * 1000;

const PAYPAL_UNUSED_KEY_EXPIRY =
  253402300799000;

let PAYPAL_SCHEMA_READY = false;
let PAYPAL_SCHEMA_PROMISE = null;


class PayPalFlowError extends Error {
  constructor(
    message,
    status = 500,
    code = "paypal_error"
  ) {
    super(message);
    this.name = "PayPalFlowError";
    this.status = status;
    this.code = code;
  }
}


function paypalErrorStatus(error) {
  const status =
    Number(error?.status || 0);

  if (
    Number.isFinite(status) &&
    status >= 400 &&
    status <= 599
  ) {
    return status;
  }

  return 500;
}


function paypalPublicError(error) {
  if (
    error instanceof PayPalFlowError
  ) {
    return error.message;
  }

  return "PayPal checkout is temporarily unavailable. Please try again.";
}


function getPayPalApiBase(env) {
  const mode =
    String(
      env.PAYPAL_MODE ||
      "sandbox"
    )
      .trim()
      .toLowerCase();

  return mode === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}


function normalizePayPalAmount(value) {
  const raw =
    String(value || "")
      .trim();

  if (
    !/^\d{1,7}(?:\.\d{1,2})?$/.test(
      raw
    )
  ) {
    return null;
  }

  const amount =
    Number(raw);

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return null;
  }

  return amount.toFixed(2);
}


function getPayPalCurrency(env) {
  const currency =
    String(
      env.PAYPAL_CURRENCY ||
      "USD"
    )
      .trim()
      .toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(currency)
  ) {
    throw new PayPalFlowError(
      "PAYPAL_CURRENCY is invalid.",
      503,
      "paypal_currency_invalid"
    );
  }

  return currency;
}


function getPayPalProduct(
  env,
  productId
) {
  const id =
    String(productId || "")
      .trim()
      .toLowerCase();

  const products = {
    // Legacy one-time test/order route kept for compatibility.
    keyless_monthly: {
      name:
        "Alter Hub Keyless - Monthly",
      description:
        "Alter Hub Keyless 30-day access",
      access_plan:
        "keyless",
      duration_ms:
        PAYPAL_KEYLESS_MONTHLY_DURATION_MS,
      price_env:
        "PAYPAL_KEYLESS_MONTHLY_PRICE"
    },

    keyless_lifetime: {
      name:
        "Alter Hub Keyless - Lifetime",
      description:
        "Alter Hub Keyless lifetime access",
      access_plan:
        "keyless",
      duration_ms:
        0,
      price_env:
        "PAYPAL_KEYLESS_LIFETIME_PRICE"
    },

    premium_lifetime: {
      name:
        "Alter Hub Premium - Lifetime",
      description:
        "Alter Hub Premium lifetime access",
      access_plan:
        "premium",
      duration_ms:
        0,
      price_env:
        "PAYPAL_PREMIUM_LIFETIME_PRICE"
    },

    premium_plus_lifetime: {
      name:
        "Alter Hub Premium Plus - Lifetime",
      description:
        "Alter Hub Premium Plus lifetime access",
      access_plan:
        "premium_plus",
      duration_ms:
        0,
      price_env:
        "PAYPAL_PREMIUM_PLUS_LIFETIME_PRICE"
    }
  };

  const config =
    products[id];

  if (!config) {
    throw new PayPalFlowError(
      "Unknown PayPal product.",
      400,
      "paypal_product_invalid"
    );
  }

  const normalAmount =
    normalizePayPalAmount(
      env[config.price_env]
    );

  if (!normalAmount) {
    throw new PayPalFlowError(
      "PayPal pricing is not configured yet. Add " +
        config.price_env +
        " to the Worker.",
      503,
      "paypal_price_not_configured"
    );
  }

  const amount = normalAmount;

  return {
    id: id,
    name:
      config.name,
    description:
      config.description,
    access_plan:
      config.access_plan,
    duration_ms:
      config.duration_ms,
    amount: amount,
    currency:
      getPayPalCurrency(env),
    admin_tags:
      "PayPal"
  };
}


function getPayPalSimpleLifetimeProductFromPath(
  pathname
) {
  const path =
    String(pathname || "")
      .trim()
      .toLowerCase();

  const routes = {
    "/paypal/buy/keyless-lifetime":
      "keyless_lifetime",
    "/paypal/buy/premium-lifetime":
      "premium_lifetime",
    "/paypal/buy/premium-plus-lifetime":
      "premium_plus_lifetime"
  };

  return routes[path] || "";
}


function getPayPalStoreReturnUrlForProduct(
  productId,
  status = "cancelled"
) {
  const id =
    String(productId || "")
      .trim()
      .toLowerCase();

  const tierPath =
    id.startsWith("premium_plus")
      ? "premium-plus"
      : id.startsWith("premium")
        ? "premium"
        : "keyless";

  const duration =
    id.endsWith("_lifetime")
      ? "lifetime"
      : "monthly";

  return (
    "https://alterhub.online/" +
    tierPath +
    "/?paypal=" +
    encodeURIComponent(
      String(status || "cancelled")
    ) +
    "#" +
    duration
  );
}

function generatePayPalPurchaseToken() {
  const bytes =
    new Uint8Array(24);

  crypto.getRandomValues(bytes);

  return Array
    .from(bytes)
    .map(
      byte =>
        byte
          .toString(16)
          .padStart(2, "0")
    )
    .join("");
}


function isValidPayPalPurchaseToken(
  token
) {
  return /^[a-fA-F0-9]{48}$/.test(
    String(token || "")
  );
}


function isValidPayPalOrderId(
  orderId
) {
  const value =
    String(orderId || "")
      .trim();

  return (
    value.length >= 8 &&
    value.length <= 80 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}


async function ensurePayPalSchema(env) {
  if (PAYPAL_SCHEMA_READY) {
    return true;
  }

  if (!PAYPAL_SCHEMA_PROMISE) {
    PAYPAL_SCHEMA_PROMISE =
      (async function() {
        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS paypal_purchases (
            purchase_token TEXT PRIMARY KEY,
            paypal_order_id TEXT NOT NULL UNIQUE,
            paypal_capture_id TEXT UNIQUE,
            paypal_event_id TEXT,
            product_id TEXT NOT NULL,
            access_plan TEXT NOT NULL,
            duration_ms INTEGER NOT NULL,
            amount TEXT NOT NULL,
            currency TEXT NOT NULL,
            payer_email TEXT,
            status TEXT NOT NULL DEFAULT 'created',
            session_id TEXT,
            final_key TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            completed_at INTEGER,
            receipt_sent_at INTEGER,
            receipt_email TEXT,
            receipt_send_count INTEGER NOT NULL DEFAULT 0,
            receipt_last_sent_at INTEGER
          )
        `).run();

        const paypalColumns =
          await env.DB.prepare(
            "PRAGMA table_info(paypal_purchases)"
          ).all();

        const paypalColumnNames =
          new Set(
            (paypalColumns.results || [])
              .map(function(row) {
                return String(row.name || "");
              })
          );

        const paypalReceiptMigrations = [
          {
            name: "receipt_sent_at",
            sql:
              "ALTER TABLE paypal_purchases " +
              "ADD COLUMN receipt_sent_at INTEGER"
          },
          {
            name: "receipt_email",
            sql:
              "ALTER TABLE paypal_purchases " +
              "ADD COLUMN receipt_email TEXT"
          },
          {
            name: "receipt_send_count",
            sql:
              "ALTER TABLE paypal_purchases " +
              "ADD COLUMN receipt_send_count INTEGER NOT NULL DEFAULT 0"
          },
          {
            name: "receipt_last_sent_at",
            sql:
              "ALTER TABLE paypal_purchases " +
              "ADD COLUMN receipt_last_sent_at INTEGER"
          }
        ];

        for (const migration of paypalReceiptMigrations) {
          if (!paypalColumnNames.has(migration.name)) {
            await env.DB.prepare(
              migration.sql
            ).run();
          }
        }

        await env.DB.prepare(`
          CREATE INDEX IF NOT EXISTS idx_paypal_purchases_status
          ON paypal_purchases(status, updated_at DESC)
        `).run();

        await env.DB.prepare(`
          CREATE INDEX IF NOT EXISTS idx_paypal_purchases_capture
          ON paypal_purchases(paypal_capture_id)
        `).run();

        PAYPAL_SCHEMA_READY = true;
        return true;
      })();
  }

  try {
    return await PAYPAL_SCHEMA_PROMISE;

  } catch (error) {
    PAYPAL_SCHEMA_PROMISE = null;
    throw error;
  }
}


async function getPayPalAccessToken(env) {
  const clientId =
    String(
      env.PAYPAL_CLIENT_ID ||
      ""
    ).trim();

  const clientSecret =
    String(
      env.PAYPAL_CLIENT_SECRET ||
      ""
    ).trim();

  if (
    !clientId ||
    !clientSecret
  ) {
    throw new PayPalFlowError(
      "PayPal credentials are not configured on this Worker.",
      503,
      "paypal_credentials_missing"
    );
  }

  const credentials =
    btoa(
      clientId +
      ":" +
      clientSecret
    );

  const response =
    await fetch(
      getPayPalApiBase(env) +
      "/v1/oauth2/token",
      {
        method: "POST",

        headers: {
          "Authorization":
            "Basic " + credentials,
          "Content-Type":
            "application/x-www-form-urlencoded",
          "Accept":
            "application/json"
        },

        body:
          "grant_type=client_credentials"
      }
    );

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (
    !response.ok ||
    !data.access_token
  ) {
    console.error(
      "PAYPAL AUTH FAILED:",
      response.status,
      data
    );

    throw new PayPalFlowError(
      "Could not authenticate with PayPal.",
      502,
      "paypal_auth_failed"
    );
  }

  return String(
    data.access_token
  );
}


async function paypalApiRequest(
  env,
  path,
  options = {}
) {
  const accessToken =
    await getPayPalAccessToken(env);

  const headers =
    new Headers(
      options.headers || {}
    );

  headers.set(
    "Authorization",
    "Bearer " + accessToken
  );

  headers.set(
    "Accept",
    "application/json"
  );

  if (
    options.body != null &&
    !headers.has("Content-Type")
  ) {
    headers.set(
      "Content-Type",
      "application/json"
    );
  }

  return fetch(
    getPayPalApiBase(env) +
    path,
    {
      ...options,
      headers
    }
  );
}


async function createPayPalOrder(
  env,
  origin,
  productId
) {
  await ensurePayPalSchema(env);

  const product =
    getPayPalProduct(
      env,
      productId
    );

  const purchaseToken =
    generatePayPalPurchaseToken();

  const returnUrl =
    origin +
    "/paypal/return?purchase=" +
    encodeURIComponent(
      purchaseToken
    );

  const cancelUrl =
    origin +
    "/paypal/cancel?purchase=" +
    encodeURIComponent(
      purchaseToken
    );

  const createResponse =
    await paypalApiRequest(
      env,
      "/v2/checkout/orders",
      {
        method: "POST",

        headers: {
          "PayPal-Request-Id":
            "alterhub-order-" +
            purchaseToken,
          "Prefer":
            "return=representation"
        },

        body: JSON.stringify({
          intent: "CAPTURE",

          purchase_units: [
            {
              reference_id:
                product.id,

              custom_id:
                product.id,

              description:
                product.description,

              amount: {
                currency_code:
                  product.currency,
                value:
                  product.amount
              }
            }
          ],

          application_context: {
            brand_name:
              "Alter Hub",
            landing_page:
              "NO_PREFERENCE",
            shipping_preference:
              "NO_SHIPPING",
            user_action:
              "PAY_NOW",
            return_url:
              returnUrl,
            cancel_url:
              cancelUrl
          }
        })
      }
    );

  let orderData = {};

  try {
    orderData =
      await createResponse.json();
  } catch {
    orderData = {};
  }

  if (
    !createResponse.ok ||
    !isValidPayPalOrderId(
      orderData.id
    )
  ) {
    console.error(
      "PAYPAL ORDER CREATE FAILED:",
      createResponse.status,
      orderData
    );

    throw new PayPalFlowError(
      "PayPal could not create the checkout.",
      502,
      "paypal_order_create_failed"
    );
  }

  const links =
    Array.isArray(orderData.links)
      ? orderData.links
      : [];

  const approvalLink =
    links.find(
      item =>
        item &&
        (
          item.rel === "approve" ||
          item.rel === "payer-action"
        ) &&
        item.href
    );

  if (!approvalLink) {
    console.error(
      "PAYPAL ORDER HAS NO APPROVAL LINK:",
      orderData
    );

    throw new PayPalFlowError(
      "PayPal did not return a checkout URL.",
      502,
      "paypal_approval_url_missing"
    );
  }

  const now =
    Date.now();

  try {
    await env.DB.prepare(`
      INSERT INTO paypal_purchases (
        purchase_token,
        paypal_order_id,
        paypal_capture_id,
        paypal_event_id,
        product_id,
        access_plan,
        duration_ms,
        amount,
        currency,
        payer_email,
        status,
        session_id,
        final_key,
        created_at,
        updated_at,
        completed_at
      )
      VALUES (
        ?, ?, NULL, NULL,
        ?, ?, ?, ?, ?,
        NULL, 'created',
        NULL, NULL,
        ?, ?, NULL
      )
    `)
      .bind(
        purchaseToken,
        String(orderData.id),
        product.id,
        product.access_plan,
        product.duration_ms,
        product.amount,
        product.currency,
        now,
        now
      )
      .run();

  } catch (error) {
    console.error(
      "PAYPAL PURCHASE DB CREATE ERROR:",
      error
    );

    throw new PayPalFlowError(
      "The Alter Hub checkout record could not be created.",
      500,
      "paypal_purchase_db_failed"
    );
  }

  return {
    order_id:
      String(orderData.id),
    purchase_token:
      purchaseToken,
    product_id:
      product.id,
    access_plan:
      product.access_plan,
    duration_ms:
      product.duration_ms,
    amount:
      product.amount,
    currency:
      product.currency,
    approval_url:
      String(approvalLink.href)
  };
}


async function getPayPalPurchaseByToken(
  env,
  purchaseToken
) {
  return env.DB.prepare(`
    SELECT
      purchase_token,
      paypal_order_id,
      paypal_capture_id,
      paypal_event_id,
      product_id,
      access_plan,
      duration_ms,
      amount,
      currency,
      payer_email,
      status,
      session_id,
      final_key,
      created_at,
      updated_at,
      completed_at,
      receipt_sent_at,
      receipt_email,
      receipt_send_count,
      receipt_last_sent_at
    FROM paypal_purchases
    WHERE purchase_token = ?
    LIMIT 1
  `)
    .bind(purchaseToken)
    .first();
}


async function getPayPalPurchaseByOrder(
  env,
  orderId
) {
  return env.DB.prepare(`
    SELECT
      purchase_token,
      paypal_order_id,
      paypal_capture_id,
      paypal_event_id,
      product_id,
      access_plan,
      duration_ms,
      amount,
      currency,
      payer_email,
      status,
      session_id,
      final_key,
      created_at,
      updated_at,
      completed_at,
      receipt_sent_at,
      receipt_email,
      receipt_send_count,
      receipt_last_sent_at
    FROM paypal_purchases
    WHERE paypal_order_id = ?
    LIMIT 1
  `)
    .bind(orderId)
    .first();
}


function extractCompletedCaptureFromOrder(
  orderData
) {
  const purchaseUnits =
    Array.isArray(
      orderData?.purchase_units
    )
      ? orderData.purchase_units
      : [];

  for (const unit of purchaseUnits) {
    const captures =
      Array.isArray(
        unit?.payments?.captures
      )
        ? unit.payments.captures
        : [];

    for (const capture of captures) {
      if (
        String(
          capture?.status || ""
        ).toUpperCase() ===
        "COMPLETED"
      ) {
        return capture;
      }
    }
  }

  return null;
}


function extractPayPalOrderIdFromCapture(
  capture
) {
  const relatedIds =
    capture?.supplementary_data
      ?.related_ids ||
    {};

  const orderId =
    String(
      relatedIds.order_id ||
      capture?.order_id ||
      ""
    ).trim();

  return isValidPayPalOrderId(
    orderId
  )
    ? orderId
    : "";
}


function extractPayPalWebhookPayerEmail(
  event
) {
  const candidates = [
    event?.resource?.payer
      ?.email_address,
    event?.resource
      ?.payment_source
      ?.paypal
      ?.email_address,
    event?.summary_payer_email
  ];

  for (const value of candidates) {
    const email =
      String(value || "")
        .trim()
        .toLowerCase();

    if (
      email &&
      email.length <= 254
    ) {
      return email;
    }
  }

  return "";
}


function extractPayPalOrderPayerEmail(
  orderData
) {
  const candidates = [
    orderData?.payer?.email_address,
    orderData?.payment_source
      ?.paypal
      ?.email_address
  ];

  for (const value of candidates) {
    const email =
      String(value || "")
        .trim()
        .toLowerCase();

    if (
      email &&
      email.length <= 254
    ) {
      return email;
    }
  }

  return "";
}


async function capturePayPalOrderAndFulfill(
  env,
  orderId,
  purchaseToken
) {
  await ensurePayPalSchema(env);

  const purchase =
    await getPayPalPurchaseByToken(
      env,
      purchaseToken
    );

  if (!purchase) {
    throw new PayPalFlowError(
      "Alter Hub purchase not found.",
      404,
      "paypal_purchase_not_found"
    );
  }

  if (
    String(
      purchase.paypal_order_id
    ) !==
    String(orderId)
  ) {
    throw new PayPalFlowError(
      "PayPal purchase does not match this checkout.",
      403,
      "paypal_purchase_mismatch"
    );
  }

  if (purchase.final_key) {
    return {
      final_key:
        purchase.final_key,
      access_plan:
        purchase.access_plan,
      duration_ms:
        Number(
          purchase.duration_ms || 0
        ),
      duplicate: true,
      pending: false
    };
  }

  const captureResponse =
    await paypalApiRequest(
      env,
      "/v2/checkout/orders/" +
      encodeURIComponent(orderId) +
      "/capture",
      {
        method: "POST",

        headers: {
          "PayPal-Request-Id":
            "alterhub-capture-" +
            purchaseToken,
          "Prefer":
            "return=representation",
          "Content-Type":
            "application/json"
        },

        body: "{}"
      }
    );

  let orderData = {};

  try {
    orderData =
      await captureResponse.json();
  } catch {
    orderData = {};
  }

  let completedCapture =
    captureResponse.ok
      ? extractCompletedCaptureFromOrder(
          orderData
        )
      : null;

  // A repeated browser return or simultaneous webhook can cause
  // PayPal to report that the order was already captured.
  // Retrieve the order representation and reuse its completed capture.
  if (!completedCapture) {
    const orderResponse =
      await paypalApiRequest(
        env,
        "/v2/checkout/orders/" +
        encodeURIComponent(orderId),
        {
          method: "GET"
        }
      );

    let existingOrder = {};

    try {
      existingOrder =
        await orderResponse.json();
    } catch {
      existingOrder = {};
    }

    if (orderResponse.ok) {
      completedCapture =
        extractCompletedCaptureFromOrder(
          existingOrder
        );

      if (
        !extractPayPalOrderPayerEmail(
          orderData
        )
      ) {
        orderData =
          existingOrder;
      }
    }
  }

  if (!completedCapture) {
    console.error(
      "PAYPAL CAPTURE DID NOT COMPLETE:",
      captureResponse.status,
      orderData
    );

    throw new PayPalFlowError(
      "PayPal has not confirmed a completed payment.",
      409,
      "paypal_capture_not_completed"
    );
  }

  return fulfillPayPalCapture(
    env,
    orderId,
    completedCapture,
    {
      payerEmail:
        extractPayPalOrderPayerEmail(
          orderData
        )
    }
  );
}


function payPalCaptureMoney(
  capture
) {
  const amount =
    capture?.amount || {};

  return {
    currency:
      String(
        amount.currency_code ||
        ""
      )
        .trim()
        .toUpperCase(),

    value:
      normalizePayPalAmount(
        amount.value
      )
  };
}


async function generateUniquePayPalKey(
  env
) {
  for (
    let attempt = 0;
    attempt < 10;
    attempt++
  ) {
    const key =
      generateAdminKey();

    const existing =
      await env.DB.prepare(`
        SELECT id
        FROM sessions
        WHERE final_key = ?
        LIMIT 1
      `)
        .bind(key)
        .first();

    if (!existing) {
      return key;
    }
  }

  throw new PayPalFlowError(
    "Could not generate a unique Alter Hub key.",
    500,
    "paypal_key_collision"
  );
}


async function fulfillPayPalCapture(
  env,
  orderId,
  capture,
  metadata = {}
) {
  await ensurePayPalSchema(env);

  const captureId =
    String(
      capture?.id || ""
    ).trim();

  const captureStatus =
    String(
      capture?.status || ""
    )
      .trim()
      .toUpperCase();

  if (
    !captureId ||
    captureId.length > 120 ||
    captureStatus !== "COMPLETED"
  ) {
    throw new PayPalFlowError(
      "PayPal has not confirmed a completed capture.",
      409,
      "paypal_capture_invalid"
    );
  }

  let purchase =
    await getPayPalPurchaseByOrder(
      env,
      orderId
    );

  if (!purchase) {
    throw new PayPalFlowError(
      "The PayPal order is not registered with Alter Hub.",
      404,
      "paypal_order_not_registered"
    );
  }

  // If the order was already fulfilled, return the existing key.
  if (purchase.final_key) {
    return {
      final_key:
        purchase.final_key,
      access_plan:
        purchase.access_plan,
      duration_ms:
        Number(
          purchase.duration_ms || 0
        ),
      duplicate: true,
      pending: false
    };
  }

  // Resolve the product for fulfillment. Validate payment against the
  // server-stored order quote below, so an already-created checkout
  // remains valid if configured prices change before capture.
  const product =
    getPayPalProduct(
      env,
      purchase.product_id
    );

  const captureMoney =
    payPalCaptureMoney(
      capture
    );

  // Verify price/currency from PayPal itself.
  // The expected amount was written by createPayPalOrder to D1.
  // Browser-supplied prices are never trusted.
  if (
    captureMoney.value !==
      String(purchase.amount) ||
    captureMoney.currency !==
      String(purchase.currency) ||
    captureMoney.currency !==
      product.currency
  ) {
    console.error(
      "PAYPAL PAYMENT AMOUNT MISMATCH:",
      {
        orderId,
        captureId,
        paid:
          captureMoney,
        expected: {
          value:
            purchase.amount,
          currency:
            purchase.currency
        }
      }
    );

    throw new PayPalFlowError(
      "PayPal payment amount did not match the Alter Hub product.",
      409,
      "paypal_amount_mismatch"
    );
  }

  const now =
    Date.now();

  // Claim fulfillment. Only one request (browser return or webhook)
  // is allowed to create the key. A stale claim can be recovered after
  // two minutes if a Worker invocation was interrupted.
  const staleBefore =
    now - (2 * 60 * 1000);

  const claim =
    await env.DB.prepare(`
      UPDATE paypal_purchases
      SET
        paypal_capture_id = ?,
        paypal_event_id =
          COALESCE(?, paypal_event_id),
        payer_email =
          CASE
            WHEN ? <> ''
            THEN ?
            ELSE payer_email
          END,
        status = 'fulfilling',
        updated_at = ?
      WHERE paypal_order_id = ?
        AND final_key IS NULL
        AND (
          status <> 'fulfilling'
          OR updated_at < ?
        )
        AND (
          paypal_capture_id IS NULL
          OR paypal_capture_id = ?
        )
    `)
      .bind(
        captureId,
        metadata.eventId
          ? String(metadata.eventId)
          : null,
        String(
          metadata.payerEmail ||
          ""
        ),
        String(
          metadata.payerEmail ||
          ""
        ),
        now,
        orderId,
        staleBefore,
        captureId
      )
      .run();

  if (!claim.meta?.changes) {
    purchase =
      await getPayPalPurchaseByOrder(
        env,
        orderId
      );

    if (
      purchase &&
      purchase.final_key
    ) {
      return {
        final_key:
          purchase.final_key,
        access_plan:
          purchase.access_plan,
        duration_ms:
          Number(
            purchase.duration_ms || 0
          ),
        duplicate: true,
        pending: false
      };
    }

    return {
      pending: true,
      duplicate: true,
      access_plan:
        purchase?.access_plan ||
        product.access_plan,
      duration_ms:
        Number(
          purchase?.duration_ms ||
          product.duration_ms
        )
    };
  }

  const finalKey =
    await generateUniquePayPalKey(
      env
    );

  const sessionId =
    crypto.randomUUID()
      .replaceAll("-", "");

  try {
    // D1 batch executes these writes atomically.
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO sessions (
          id,
          roblox_user_id,
          created_at,
          expires_at,
          status,
          step,
          final_key,
          key_expires_at,
          access_plan,
          license_duration_ms,
          admin_tags
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          sessionId,
          "PAYPAL_PURCHASE",
          now,
          PAYPAL_UNUSED_KEY_EXPIRY,
          "completed",
          3,
          finalKey,
          PAYPAL_UNUSED_KEY_EXPIRY,
          product.access_plan,
          product.duration_ms,
          product.admin_tags
        ),

      env.DB.prepare(`
        UPDATE paypal_purchases
        SET
          paypal_capture_id = ?,
          paypal_event_id =
            COALESCE(?, paypal_event_id),
          payer_email =
            CASE
              WHEN ? <> ''
              THEN ?
              ELSE payer_email
            END,
          status = 'completed',
          session_id = ?,
          final_key = ?,
          updated_at = ?,
          completed_at = ?
        WHERE paypal_order_id = ?
          AND status = 'fulfilling'
          AND final_key IS NULL
          AND paypal_capture_id = ?
      `)
        .bind(
          captureId,
          metadata.eventId
            ? String(metadata.eventId)
            : null,
          String(
            metadata.payerEmail ||
            ""
          ),
          String(
            metadata.payerEmail ||
            ""
          ),
          sessionId,
          finalKey,
          now,
          now,
          orderId,
          captureId
        )
    ]);

  } catch (error) {
    console.error(
      "PAYPAL KEY FULFILLMENT DB ERROR:",
      error
    );

    // Release the claim so a later webhook/return can retry.
    try {
      await env.DB.prepare(`
        UPDATE paypal_purchases
        SET
          status = 'capture_completed',
          updated_at = ?
        WHERE paypal_order_id = ?
          AND status = 'fulfilling'
          AND final_key IS NULL
      `)
        .bind(
          Date.now(),
          orderId
        )
        .run();
    } catch {
      // Best-effort recovery only.
    }

    throw new PayPalFlowError(
      "Payment completed, but the key could not be created yet. Refresh the purchase page in a moment.",
      500,
      "paypal_fulfillment_failed"
    );
  }

  await recordAnalytics(
    env,
    {
      keys_generated: 1
    },
    now
  );

  try {
    await recordAdminActivity(
      env,
      "paypal_purchase",
      "key",
      sessionId,
      "PayPal purchase created 1 " +
        product.access_plan +
        " key (" +
        product.id +
        ")"
    );
  } catch (error) {
    console.error(
      "PAYPAL ACTIVITY LOG ERROR:",
      error
    );
  }

  try {
    const completedPurchase =
      await getPayPalPurchaseByOrder(
        env,
        orderId
      );

    if (completedPurchase) {
      await maybeSendAutomaticPayPalReceipt(
        env,
        completedPurchase
      );
    }

  } catch (receiptError) {
    console.error(
      "PAYPAL POST-FULFILLMENT RECEIPT ERROR:",
      receiptError
    );
  }

  return {
    final_key:
      finalKey,
    access_plan:
      product.access_plan,
    duration_ms:
      product.duration_ms,
    duplicate: false,
    pending: false
  };
}


// =====================================================
// PAYPAL SUBSCRIPTION HELPERS
// =====================================================

const PAYPAL_SUBSCRIPTION_PERIOD_MS =
  30 * 24 * 60 * 60 * 1000;

let PAYPAL_SUBSCRIPTION_SCHEMA_READY =
  false;

let PAYPAL_SUBSCRIPTION_SCHEMA_PROMISE =
  null;


async function ensurePayPalSubscriptionSchema(
  env
) {
  if (
    PAYPAL_SUBSCRIPTION_SCHEMA_READY
  ) {
    return true;
  }

  if (
    !PAYPAL_SUBSCRIPTION_SCHEMA_PROMISE
  ) {
    PAYPAL_SUBSCRIPTION_SCHEMA_PROMISE =
      (async function() {
        await ensurePayPalSchema(env);

        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS paypal_subscription_payments (
            paypal_sale_id TEXT PRIMARY KEY,
            paypal_subscription_id TEXT NOT NULL,
            paypal_event_id TEXT,
            amount TEXT,
            currency TEXT,
            paid_at INTEGER NOT NULL,
            is_initial INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
          )
        `).run();

        await env.DB.prepare(`
          CREATE INDEX IF NOT EXISTS idx_paypal_subscription_payments_subscription
          ON paypal_subscription_payments(
            paypal_subscription_id,
            paid_at DESC
          )
        `).run();

        PAYPAL_SUBSCRIPTION_SCHEMA_READY =
          true;

        return true;
      })();
  }

  try {
    return await
      PAYPAL_SUBSCRIPTION_SCHEMA_PROMISE;

  } catch (error) {
    PAYPAL_SUBSCRIPTION_SCHEMA_PROMISE =
      null;

    throw error;
  }
}


function isValidPayPalSubscriptionId(
  value
) {
  const id =
    String(value || "")
      .trim();

  return (
    id.length >= 6 &&
    id.length <= 100 &&
    /^[A-Za-z0-9_-]+$/.test(id)
  );
}


function paypalSubscriptionOrderKey(
  subscriptionId
) {
  return (
    "SUB-" +
    String(subscriptionId || "")
      .trim()
  );
}


function getPayPalSubscriptionProducts(
  env
) {
  return [
    {
      tier:
        "keyless",
      product_id:
        "keyless_monthly",
      plan_id:
        String(
          env.PAYPAL_PLAN_KEYLESS_MONTHLY ||
          "P-35C963541U1914902NKBVFZY"
        ).trim(),
      access_plan:
        "keyless",
      duration_ms:
        PAYPAL_SUBSCRIPTION_PERIOD_MS
    },

    {
      tier:
        "premium",
      product_id:
        "premium_monthly",
      plan_id:
        String(
          env.PAYPAL_PLAN_PREMIUM_MONTHLY ||
          "P-6M06813917127705RNKBVO2I"
        ).trim(),
      access_plan:
        "premium",
      duration_ms:
        PAYPAL_SUBSCRIPTION_PERIOD_MS
    },

    {
      tier:
        "premium-plus",
      product_id:
        "premium_plus_monthly",
      plan_id:
        String(
          env.PAYPAL_PLAN_PREMIUM_PLUS_MONTHLY ||
          "P-72H85729L5583625MNKBVQKY"
        ).trim(),
      access_plan:
        "premium_plus",
      duration_ms:
        PAYPAL_SUBSCRIPTION_PERIOD_MS
    }
  ];
}


function getPayPalSubscriptionProductByPlan(
  env,
  planId
) {
  const id =
    String(planId || "")
      .trim();

  const previousPlanIds = {
    keyless: env.PAYPAL_PREVIOUS_PLAN_KEYLESS_MONTHLY,
    premium: env.PAYPAL_PREVIOUS_PLAN_PREMIUM_MONTHLY,
    "premium-plus": env.PAYPAL_PREVIOUS_PLAN_PREMIUM_PLUS_MONTHLY
  };

  if (!id) return null;

  return getPayPalSubscriptionProducts(env).find(product => {
    const previous = String(previousPlanIds[product.tier] || "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean);
    return product.plan_id === id || previous.includes(id);
  }) || null;
}


function normalizePayPalSubscriptionTier(
  value
) {
  const tier =
    String(value || "")
      .trim()
      .toLowerCase();

  if (
    tier === "keyless" ||
    tier === "premium" ||
    tier === "premium-plus"
  ) {
    return tier;
  }

  return "";
}


function getPayPalSimpleSubscriptionTierFromPath(
  pathname
) {
  const path =
    String(pathname || "")
      .trim()
      .toLowerCase();

  const routes = {
    "/paypal/subscribe/keyless-monthly":
      "keyless",
    "/paypal/subscribe/premium-monthly":
      "premium",
    "/paypal/subscribe/premium-plus-monthly":
      "premium-plus"
  };

  return routes[path] || "";
}


async function createPayPalMonthlySubscription(
  env,
  origin,
  requestedTier
) {
  const tier =
    normalizePayPalSubscriptionTier(
      requestedTier
    );

  if (!tier) {
    throw new PayPalFlowError(
      "The selected monthly PayPal tier is invalid.",
      400,
      "paypal_subscription_tier_invalid"
    );
  }

  const product =
    getPayPalSubscriptionProducts(
      env
    ).find(
      item =>
        item.tier === tier
    );

  if (
    !product ||
    !product.plan_id
  ) {
    throw new PayPalFlowError(
      "The selected monthly PayPal plan is not configured.",
      503,
      "paypal_subscription_plan_missing"
    );
  }

  const returnUrl =
    origin +
    "/paypal/subscription-return?tier=" +
    encodeURIComponent(
      product.tier
    );

  const cancelUrl =
    String(
      env.PAYPAL_CANCEL_URL ||
      (
        "https://alterhub.online/" +
        product.tier +
        "/?paypal=cancelled#monthly"
      )
    ).trim();

  const response =
    await paypalApiRequest(
      env,
      "/v1/billing/subscriptions",
      {
        method: "POST",
        headers: {
          "PayPal-Request-Id":
            "ah-sub-" +
            product.tier +
            "-" +
            crypto.randomUUID(),
          "Prefer":
            "return=representation"
        },
        body: JSON.stringify({
          plan_id:
            product.plan_id,
          application_context: {
            brand_name:
              "Alter Hub",
            locale:
              "en-US",
            shipping_preference:
              "NO_SHIPPING",
            user_action:
              "SUBSCRIBE_NOW",
            payment_method: {
              payer_selected:
                "PAYPAL",
              payee_preferred:
                "IMMEDIATE_PAYMENT_REQUIRED"
            },
            return_url:
              returnUrl,
            cancel_url:
              cancelUrl
          }
        })
      }
    );

  let data = {};

  try {
    data =
      await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    console.error(
      "PAYPAL CREATE SUBSCRIPTION ERROR:",
      product.tier,
      response.status,
      data
    );

    throw new PayPalFlowError(
      "PayPal could not start the monthly subscription.",
      502,
      "paypal_subscription_create_failed"
    );
  }

  const subscriptionId =
    String(
      data.id ||
      ""
    ).trim();

  const approvalUrl =
    Array.isArray(data.links)
      ? String(
          data.links.find(
            link =>
              String(link?.rel || "")
                .toLowerCase() ===
              "approve"
          )?.href ||
          ""
        ).trim()
      : "";

  if (
    !isValidPayPalSubscriptionId(
      subscriptionId
    ) ||
    !approvalUrl
  ) {
    throw new PayPalFlowError(
      "PayPal did not return a valid subscription checkout link.",
      502,
      "paypal_subscription_approval_missing"
    );
  }

  return {
    subscription_id:
      subscriptionId,
    approval_url:
      approvalUrl,
    tier:
      product.tier
  };
}


async function fetchPayPalSubscription(
  env,
  subscriptionId
) {
  const response =
    await paypalApiRequest(
      env,
      "/v1/billing/subscriptions/" +
      encodeURIComponent(
        subscriptionId
      ),
      {
        method: "GET"
      }
    );

  let data = {};

  try {
    data =
      await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    console.error(
      "PAYPAL SUBSCRIPTION LOOKUP FAILED:",
      response.status,
      data
    );

    throw new PayPalFlowError(
      "PayPal could not verify this subscription.",
      502,
      "paypal_subscription_lookup_failed"
    );
  }

  return data;
}


function extractSubscriptionBuyerEmail(
  subscription
) {
  return String(
    subscription?.subscriber
      ?.email_address ||
    ""
  )
    .trim()
    .toLowerCase();
}


function extractSubscriptionLastPayment(
  subscription
) {
  const payment =
    subscription?.billing_info
      ?.last_payment;

  if (!payment) {
    return null;
  }

  const value =
    normalizePayPalAmount(
      payment?.amount?.value
    );

  const currency =
    String(
      payment?.amount
        ?.currency_code ||
      ""
    )
      .trim()
      .toUpperCase();

  const time =
    Date.parse(
      String(
        payment?.time ||
        ""
      )
    );

  if (
    !value ||
    !/^[A-Z]{3}$/.test(currency) ||
    !Number.isFinite(time)
  ) {
    return null;
  }

  return {
    value,
    currency,
    time
  };
}


async function fulfillPayPalSubscription(
  env,
  subscriptionId,
  requestedTier = ""
) {
  await ensurePayPalSubscriptionSchema(
    env
  );

  const orderKey =
    paypalSubscriptionOrderKey(
      subscriptionId
    );

  const existing =
    await getPayPalPurchaseByOrder(
      env,
      orderKey
    );

  if (
    existing &&
    existing.final_key
  ) {
    return {
      pending: false,
      duplicate: true,
      purchase_token:
        existing.purchase_token,
      final_key:
        existing.final_key,
      access_plan:
        existing.access_plan,
      duration_ms:
        Number(
          existing.duration_ms || 0
        )
    };
  }

  const subscription =
    await fetchPayPalSubscription(
      env,
      subscriptionId
    );

  const status =
    String(
      subscription?.status ||
      ""
    )
      .trim()
      .toUpperCase();

  if (
    status !== "ACTIVE"
  ) {
    if (
      status === "APPROVAL_PENDING" ||
      status === "APPROVED"
    ) {
      return {
        pending: true
      };
    }

    throw new PayPalFlowError(
      "This PayPal subscription is not active.",
      409,
      "paypal_subscription_not_active"
    );
  }

  const product =
    getPayPalSubscriptionProductByPlan(
      env,
      subscription?.plan_id
    );

  if (!product) {
    throw new PayPalFlowError(
      "This PayPal subscription plan is not recognized by Alter Hub.",
      403,
      "paypal_subscription_plan_invalid"
    );
  }

  if (
    requestedTier &&
    requestedTier !==
      product.tier
  ) {
    throw new PayPalFlowError(
      "The selected Alter Hub tier does not match the PayPal subscription.",
      403,
      "paypal_subscription_tier_mismatch"
    );
  }

  const lastPayment =
    extractSubscriptionLastPayment(
      subscription
    );

  if (!lastPayment) {
    return {
      pending: true
    };
  }

  const payerEmail =
    extractSubscriptionBuyerEmail(
      subscription
    );

  const purchaseToken =
    existing?.purchase_token ||
    generatePayPalPurchaseToken();

  const finalKey =
    existing?.final_key ||
    await generateUniquePayPalKey(
      env
    );

  const sessionId =
    existing?.session_id ||
    crypto.randomUUID()
      .replaceAll("-", "");

  const now =
    Date.now();

  if (!existing) {
    // One atomic D1 batch creates both the paid subscription purchase
    // record and the Alter Hub key session.
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO paypal_purchases (
          purchase_token,
          paypal_order_id,
          paypal_capture_id,
          paypal_event_id,
          product_id,
          access_plan,
          duration_ms,
          amount,
          currency,
          payer_email,
          status,
          session_id,
          final_key,
          created_at,
          updated_at,
          completed_at
        )
        VALUES (
          ?, ?, NULL, NULL,
          ?, ?, ?, ?, ?,
          ?, 'subscription_active',
          ?, ?, ?, ?, ?
        )
      `)
        .bind(
          purchaseToken,
          orderKey,
          product.product_id,
          product.access_plan,
          product.duration_ms,
          lastPayment.value,
          lastPayment.currency,
          payerEmail || null,
          sessionId,
          finalKey,
          now,
          now,
          now
        ),

      env.DB.prepare(`
        INSERT INTO sessions (
          id,
          roblox_user_id,
          created_at,
          expires_at,
          status,
          step,
          final_key,
          key_expires_at,
          access_plan,
          license_duration_ms,
          admin_tags
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          sessionId,
          "PAYPAL_SUBSCRIPTION",
          now,
          PAYPAL_UNUSED_KEY_EXPIRY,
          "completed",
          3,
          finalKey,
          PAYPAL_UNUSED_KEY_EXPIRY,
          product.access_plan,
          product.duration_ms,
          "PayPal"
        )
    ]);

    await recordAnalytics(
      env,
      {
        keys_generated: 1
      },
      now
    );

    try {
      await recordAdminActivity(
        env,
        "paypal_subscription",
        "key",
        sessionId,
        "PayPal subscription created 1 " +
          product.access_plan +
          " key (" +
          product.product_id +
          ")"
      );
    } catch (error) {
      console.error(
        "PAYPAL SUBSCRIPTION ACTIVITY ERROR:",
        error
      );
    }
  }

  let purchase =
    await getPayPalPurchaseByOrder(
      env,
      orderKey
    );

  if (purchase) {
    try {
      await maybeSendAutomaticPayPalReceipt(
        env,
        purchase
      );

      purchase =
        await getPayPalPurchaseByOrder(
          env,
          orderKey
        ) || purchase;

    } catch (error) {
      console.error(
        "PAYPAL SUBSCRIPTION RECEIPT ERROR:",
        error
      );
    }
  }

  return {
    pending: false,
    duplicate:
      Boolean(existing),
    purchase_token:
      purchase?.purchase_token ||
      purchaseToken,
    final_key:
      purchase?.final_key ||
      finalKey,
    access_plan:
      product.access_plan,
    duration_ms:
      product.duration_ms
  };
}


function extractSubscriptionIdFromSale(
  resource
) {
  const candidates = [
    resource?.billing_agreement_id,

    resource?.supplementary_data
      ?.related_ids
      ?.billing_agreement_id,

    resource?.supplementary_data
      ?.related_ids
      ?.subscription_id,

    resource?.subscription_id
  ];

  for (const value of candidates) {
    const id =
      String(value || "")
        .trim();

    if (
      isValidPayPalSubscriptionId(
        id
      )
    ) {
      return id;
    }
  }

  return "";
}


async function handlePayPalSubscriptionPayment(
  env,
  event
) {
  await ensurePayPalSubscriptionSchema(
    env
  );

  const resource =
    event?.resource || {};

  const saleId =
    String(
      resource?.id ||
      event?.id ||
      ""
    ).trim();

  const subscriptionId =
    extractSubscriptionIdFromSale(
      resource
    );

  if (
    !saleId ||
    !subscriptionId
  ) {
    return {
      processed: false
    };
  }

  let purchase =
    await getPayPalPurchaseByOrder(
      env,
      paypalSubscriptionOrderKey(
        subscriptionId
      )
    );

  if (!purchase) {
    const activation =
      await fulfillPayPalSubscription(
        env,
        subscriptionId,
        ""
      );

    if (activation.pending) {
      return {
        processed: false,
        pending: true
      };
    }

    purchase =
      await getPayPalPurchaseByOrder(
        env,
        paypalSubscriptionOrderKey(
          subscriptionId
        )
      );
  }

  if (
    !purchase ||
    !purchase.session_id
  ) {
    return {
      processed: false
    };
  }

  const amount =
    normalizePayPalAmount(
      resource?.amount?.total ||
      resource?.amount?.value
    ) || "";

  const currency =
    String(
      resource?.amount?.currency ||
      resource?.amount?.currency_code ||
      ""
    )
      .trim()
      .toUpperCase();

  const paidAt =
    Date.parse(
      String(
        resource?.create_time ||
        resource?.update_time ||
        ""
      )
    );

  const paidAtMs =
    Number.isFinite(paidAt)
      ? paidAt
      : Date.now();

  // The first PAYMENT.SALE.COMPLETED webhook often arrives right next
  // to BILLING.SUBSCRIPTION.ACTIVATED/onApprove. That first payment
  // created the initial 30-day entitlement, so it must not extend it
  // a second time.
  const initialWindowMs =
    24 * 60 * 60 * 1000;

  const isInitial =
    Boolean(
      purchase.completed_at &&
      Math.abs(
        paidAtMs -
        Number(
          purchase.completed_at
        )
      ) <= initialWindowMs
    );

  const marker =
    await env.DB.prepare(`
      INSERT OR IGNORE INTO paypal_subscription_payments (
        paypal_sale_id,
        paypal_subscription_id,
        paypal_event_id,
        amount,
        currency,
        paid_at,
        is_initial,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        saleId,
        subscriptionId,
        String(event?.id || "") || null,
        amount || null,
        currency || null,
        paidAtMs,
        isInitial ? 1 : 0,
        Date.now()
      )
      .run();

  if (!marker.meta?.changes) {
    return {
      processed: true,
      duplicate: true,
      initialPayment:
        isInitial,
      renewed: false
    };
  }

  if (isInitial) {
    return {
      processed: true,
      duplicate: false,
      initialPayment: true,
      renewed: false
    };
  }

  // Every completed renewal adds exactly one monthly billing period.
  // Do not reuse purchase.duration_ms here because unredeemed keys may
  // accumulate multiple paid periods in that field.
  const durationMs =
    PAYPAL_SUBSCRIPTION_PERIOD_MS;

  const license =
    await env.DB.prepare(`
      SELECT
        license_id,
        expires_at
      FROM licenses
      WHERE session_id = ?
      LIMIT 1
    `)
      .bind(
        purchase.session_id
      )
      .first();

  const now =
    Date.now();

  if (license) {
    const currentExpiry =
      Number(
        license.expires_at || 0
      );

    const newExpiry =
      Math.max(
        currentExpiry,
        now
      ) +
      durationMs;

    await env.DB.batch([
      env.DB.prepare(`
        UPDATE licenses
        SET expires_at = ?
        WHERE license_id = ?
      `)
        .bind(
          newExpiry,
          license.license_id
        ),

      env.DB.prepare(`
        UPDATE sessions
        SET key_expires_at = ?
        WHERE id = ?
      `)
        .bind(
          newExpiry,
          purchase.session_id
        ),

      env.DB.prepare(`
        UPDATE paypal_purchases
        SET
          status = 'subscription_active',
          updated_at = ?
        WHERE purchase_token = ?
      `)
        .bind(
          now,
          purchase.purchase_token
        )
    ]);

  } else {
    // If the customer has not redeemed the key yet, accumulate the
    // additional paid month so their entitlement is not lost.
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE sessions
        SET
          license_duration_ms =
            COALESCE(
              license_duration_ms,
              0
            ) + ?
        WHERE id = ?
      `)
        .bind(
          durationMs,
          purchase.session_id
        ),

      env.DB.prepare(`
        UPDATE paypal_purchases
        SET
          duration_ms =
            COALESCE(
              duration_ms,
              0
            ) + ?,
          status =
            'subscription_active',
          updated_at = ?
        WHERE purchase_token = ?
      `)
        .bind(
          durationMs,
          now,
          purchase.purchase_token
        )
    ]);
  }

  return {
    processed: true,
    duplicate: false,
    initialPayment: false,
    renewed: true
  };
}


async function markPayPalSubscriptionStatus(
  env,
  subscriptionId,
  eventType
) {
  await ensurePayPalSubscriptionSchema(
    env
  );

  const statusMap = {
    "BILLING.SUBSCRIPTION.CANCELLED":
      "subscription_cancelled",

    "BILLING.SUBSCRIPTION.SUSPENDED":
      "subscription_suspended",

    "BILLING.SUBSCRIPTION.EXPIRED":
      "subscription_expired"
  };

  const status =
    statusMap[eventType] ||
    "subscription_inactive";

  await env.DB.prepare(`
    UPDATE paypal_purchases
    SET
      status = ?,
      updated_at = ?
    WHERE paypal_order_id = ?
  `)
    .bind(
      status,
      Date.now(),
      paypalSubscriptionOrderKey(
        subscriptionId
      )
    )
    .run();
}


class ReceiptEmailError extends Error {
  constructor(
    message,
    status = 500,
    code = "receipt_email_error"
  ) {
    super(message);
    this.name = "ReceiptEmailError";
    this.status = status;
    this.code = code;
  }
}


function receiptEmailErrorStatus(
  error
) {
  const status =
    Number(error?.status || 0);

  if (
    Number.isFinite(status) &&
    status >= 400 &&
    status <= 599
  ) {
    return status;
  }

  return 500;
}


function receiptEmailPublicError(
  error
) {
  if (
    error instanceof ReceiptEmailError
  ) {
    return error.message;
  }

  return "The receipt email could not be sent right now.";
}


function isValidReceiptEmail(
  email
) {
  const value =
    String(email || "")
      .trim()
      .toLowerCase();

  if (
    !value ||
    value.length > 254
  ) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value
  );
}


function paypalReceiptDurationLabel(
  durationMs
) {
  const value =
    Number(durationMs || 0);

  if (value === 0) {
    return "Lifetime";
  }

  const day =
    24 * 60 * 60 * 1000;

  if (
    value > 0 &&
    value % day === 0
  ) {
    const days =
      Math.round(value / day);

    if (days === 30) {
      return "30 days from first redemption";
    }

    if (days === 1) {
      return "1 day from first redemption";
    }

    return (
      String(days) +
      " days from first redemption"
    );
  }

  return (
    String(value) +
    " ms from first redemption"
  );
}


function paypalReceiptDate(
  value
) {
  const time =
    Number(value || 0);

  if (!time) {
    return "N/A";
  }

  try {
    return new Date(time)
      .toISOString()
      .replace("T", " ")
      .replace(".000Z", " UTC");
  } catch {
    return "N/A";
  }
}


function buildPayPalReceiptHtml(
  purchase
) {
  const orderId =
    String(
      purchase?.paypal_order_id ||
      ""
    );

  const captureId =
    String(
      purchase?.paypal_capture_id ||
      ""
    );

  const key =
    String(
      purchase?.final_key ||
      ""
    );

  const payerEmail =
    String(
      purchase?.payer_email ||
      ""
    );

  const plan =
    String(
      purchase?.access_plan ||
      "keyless"
    );

  const product =
    String(
      purchase?.product_id ||
      "keyless_monthly"
    );

  const amount =
    String(
      purchase?.amount ||
      ""
    );

  const currency =
    String(
      purchase?.currency ||
      "USD"
    );

  const completedAt =
    paypalReceiptDate(
      purchase?.completed_at
    );

  const duration =
    paypalReceiptDurationLabel(
      purchase?.duration_ms
    );

  return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >
  <title>Alter Hub Purchase Receipt</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 36px 18px;
      color: #15151a;
      font-family:
        Inter,
        Arial,
        sans-serif;
      background: #f4f4f6;
    }

    .receipt {
      width: min(720px, 100%);
      margin: 0 auto;
      overflow: hidden;
      border: 1px solid #dedee4;
      border-radius: 20px;
      background: #ffffff;
      box-shadow:
        0 18px 50px rgba(0,0,0,.08);
    }

    .head {
      padding: 28px 30px;
      color: #ffffff;
      background:
        linear-gradient(
          135deg,
          #151519,
          #3a0b12
        );
    }

    .brand {
      color: #ff5368;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: .14em;
      text-transform: uppercase;
    }

    h1 {
      margin: 10px 0 0;
      font-size: 34px;
      letter-spacing: -.035em;
    }

    .body {
      padding: 28px 30px 32px;
    }

    .paid {
      display: inline-block;
      padding: 7px 10px;
      border-radius: 999px;
      color: #08783b;
      background: #e9f9f0;
      font-size: 12px;
      font-weight: 800;
    }

    .grid {
      margin-top: 22px;
      display: grid;
      grid-template-columns:
        repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .item {
      padding: 14px;
      border: 1px solid #e8e8ed;
      border-radius: 12px;
      background: #fafafd;
    }

    .item span {
      display: block;
      color: #777780;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .item strong {
      display: block;
      margin-top: 6px;
      overflow-wrap: anywhere;
      font-size: 13px;
    }

    .key {
      margin-top: 18px;
      padding: 16px;
      border: 1px solid #f3c6cc;
      border-radius: 12px;
      background: #fff6f7;
    }

    .key span {
      display: block;
      color: #9c3a48;
      font-size: 10px;
      font-weight: 850;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .key code {
      display: block;
      margin-top: 8px;
      overflow-wrap: anywhere;
      color: #111115;
      font-size: 14px;
      font-weight: 850;
    }

    .note {
      margin: 20px 0 0;
      color: #6f6f78;
      font-size: 12px;
      line-height: 1.65;
    }

    .footer {
      margin-top: 24px;
      padding-top: 18px;
      border-top: 1px solid #ededf1;
      color: #8c8c94;
      font-size: 11px;
      line-height: 1.6;
    }

    @media (max-width: 620px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>

<body>
  <main class="receipt">
    <header class="head">
      <div class="brand">
        Alter Hub
      </div>

      <h1>Purchase Receipt</h1>
    </header>

    <section class="body">
      <div class="paid">
        Payment confirmed
      </div>

      <div class="grid">
        <div class="item">
          <span>${
            orderId.startsWith("SUB-")
              ? "PayPal subscription"
              : "PayPal order"
          }</span>
          <strong>${
            escapeHtml(
              orderId.startsWith("SUB-")
                ? orderId.slice(4)
                : orderId
            )
          }</strong>
        </div>

        <div class="item">
          <span>Capture ID</span>
          <strong>${escapeHtml(captureId || "N/A")}</strong>
        </div>

        <div class="item">
          <span>Product</span>
          <strong>${escapeHtml(product)}</strong>
        </div>

        <div class="item">
          <span>Access plan</span>
          <strong>${escapeHtml(plan)}</strong>
        </div>

        <div class="item">
          <span>Payment</span>
          <strong>${escapeHtml(currency)} ${escapeHtml(amount)}</strong>
        </div>

        <div class="item">
          <span>Completed</span>
          <strong>${escapeHtml(completedAt)}</strong>
        </div>

        <div class="item">
          <span>License duration</span>
          <strong>${escapeHtml(duration)}</strong>
        </div>

        <div class="item">
          <span>Buyer email</span>
          <strong>${escapeHtml(payerEmail || "Not provided by PayPal")}</strong>
        </div>
      </div>

      <div class="key">
        <span>Alter Hub key</span>
        <code>${escapeHtml(key)}</code>
      </div>

      <p class="note">
        Keep this key private. The license duration begins when
        the key is redeemed for the first time.
      </p>

      <div class="footer">
        This receipt was generated by Alter Hub after PayPal
        confirmed the payment. For support, contact
        support@alterhub.online.
      </div>
    </section>
  </main>
</body>
</html>
  `.trim();
}


async function hydratePayPalBuyerEmail(
  env,
  purchase
) {
  if (
    !purchase ||
    purchase.payer_email ||
    !purchase.paypal_order_id
  ) {
    return purchase;
  }

  try {
    const response =
      await paypalApiRequest(
        env,
        "/v2/checkout/orders/" +
        encodeURIComponent(
          purchase.paypal_order_id
        ),
        {
          method: "GET"
        }
      );

    let orderData = {};

    try {
      orderData =
        await response.json();
    } catch {
      orderData = {};
    }

    if (!response.ok) {
      return purchase;
    }

    const payerEmail =
      extractPayPalOrderPayerEmail(
        orderData
      );

    if (!payerEmail) {
      return purchase;
    }

    await env.DB.prepare(`
      UPDATE paypal_purchases
      SET
        payer_email = ?,
        updated_at = ?
      WHERE purchase_token = ?
        AND (
          payer_email IS NULL
          OR payer_email = ''
        )
    `)
      .bind(
        payerEmail,
        Date.now(),
        purchase.purchase_token
      )
      .run();

    return {
      ...purchase,
      payer_email:
        payerEmail
    };

  } catch (error) {
    console.error(
      "PAYPAL BUYER EMAIL HYDRATION ERROR:",
      error
    );

    return purchase;
  }
}


async function reservePayPalReceiptSend(
  env,
  purchase,
  automatic
) {
  const now =
    Date.now();

  const cooldownMs =
    automatic
      ? 60 * 1000
      : 8 * 1000;

  const maxSends =
    10;

  const cutoff =
    now - cooldownMs;

  const sql =
    automatic
      ? `
        UPDATE paypal_purchases
        SET
          receipt_send_count =
            COALESCE(receipt_send_count, 0) + 1,
          receipt_last_sent_at = ?
        WHERE purchase_token = ?
          AND final_key IS NOT NULL
          AND receipt_sent_at IS NULL
          AND COALESCE(receipt_send_count, 0) < ?
          AND (
            receipt_last_sent_at IS NULL
            OR receipt_last_sent_at < ?
          )
      `
      : `
        UPDATE paypal_purchases
        SET
          receipt_send_count =
            COALESCE(receipt_send_count, 0) + 1,
          receipt_last_sent_at = ?
        WHERE purchase_token = ?
          AND final_key IS NOT NULL
          AND COALESCE(receipt_send_count, 0) < ?
          AND (
            receipt_last_sent_at IS NULL
            OR receipt_last_sent_at < ?
          )
      `;

  const result =
    await env.DB.prepare(sql)
      .bind(
        now,
        purchase.purchase_token,
        maxSends,
        cutoff
      )
      .run();

  if (result.meta?.changes) {
    return {
      allowed: true,
      retryAfter: 0
    };
  }

  const latest =
    await getPayPalPurchaseByToken(
      env,
      purchase.purchase_token
    );

  if (
    automatic &&
    latest?.receipt_sent_at
  ) {
    return {
      allowed: false,
      alreadySent: true,
      retryAfter: 0
    };
  }

  if (
    Number(
      latest?.receipt_send_count || 0
    ) >= maxSends
  ) {
    return {
      allowed: false,
      retryAfter: 0,
      error:
        "This purchase has reached the receipt email limit."
    };
  }

  const lastSent =
    Number(
      latest?.receipt_last_sent_at || 0
    );

  const retryAfter =
    lastSent
      ? Math.max(
          1,
          Math.ceil(
            (
              lastSent +
              cooldownMs -
              now
            ) / 1000
          )
        )
      : 1;

  return {
    allowed: false,
    retryAfter:
      retryAfter,
    error:
      "Please wait a few seconds before sending another receipt."
  };
}


async function recordSuccessfulReceiptSend(
  env,
  purchaseToken,
  email
) {
  const now =
    Date.now();

  await env.DB.prepare(`
    UPDATE paypal_purchases
    SET
      receipt_sent_at =
        COALESCE(
          receipt_sent_at,
          ?
        ),
      receipt_email = ?,
      receipt_last_sent_at = ?,
      updated_at = ?
    WHERE purchase_token = ?
  `)
    .bind(
      now,
      email,
      now,
      now,
      purchaseToken
    )
    .run();
}


async function deliverPayPalReceiptEmail(
  env,
  purchase,
  destinationEmail
) {
  const apiKey =
    String(
      env.RESEND_API_KEY ||
      ""
    ).trim();

  const fromEmail =
    String(
      env.RECEIPT_FROM_EMAIL ||
      ""
    ).trim();

  const replyTo =
    String(
      env.RECEIPT_REPLY_TO ||
      "support@alterhub.online"
    ).trim();

  if (!apiKey) {
    throw new ReceiptEmailError(
      "Receipt email is not configured yet. Add RESEND_API_KEY to the Worker.",
      503,
      "receipt_api_key_missing"
    );
  }

  if (!fromEmail) {
    throw new ReceiptEmailError(
      "Receipt email sender is not configured yet. Add RECEIPT_FROM_EMAIL to the Worker.",
      503,
      "receipt_from_missing"
    );
  }

  if (
    !isValidReceiptEmail(
      destinationEmail
    )
  ) {
    throw new ReceiptEmailError(
      "The receipt email address is invalid.",
      400,
      "receipt_email_invalid"
    );
  }

  const response =
    await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",

        headers: {
          "Authorization":
            "Bearer " + apiKey,

          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          from:
            fromEmail,

          to: [
            destinationEmail
          ],

          reply_to:
            replyTo,

          subject:
            "Alter Hub purchase receipt & key",

          html:
            buildPayPalReceiptHtml(
              purchase
            )
        })
      }
    );

  let data = {};

  try {
    data =
      await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    console.error(
      "RESEND RECEIPT EMAIL ERROR:",
      response.status,
      data
    );

    throw new ReceiptEmailError(
      "The receipt email provider rejected the message.",
      502,
      "receipt_provider_rejected"
    );
  }

  return data;
}


async function maybeSendAutomaticPayPalReceipt(
  env,
  purchase
) {
  if (
    !purchase ||
    !purchase.final_key ||
    purchase.receipt_sent_at
  ) {
    return {
      sent: false,
      reason:
        "not_needed"
    };
  }

  const payerEmail =
    String(
      purchase.payer_email ||
      ""
    )
      .trim()
      .toLowerCase();

  if (
    !isValidReceiptEmail(
      payerEmail
    )
  ) {
    return {
      sent: false,
      reason:
        "no_buyer_email"
    };
  }

  if (
    !env.RESEND_API_KEY ||
    !env.RECEIPT_FROM_EMAIL
  ) {
    return {
      sent: false,
      reason:
        "email_not_configured"
    };
  }

  const reservation =
    await reservePayPalReceiptSend(
      env,
      purchase,
      true
    );

  if (!reservation.allowed) {
    return {
      sent: false,
      reason:
        reservation.alreadySent
          ? "already_sent"
          : "reserved_or_limited"
    };
  }

  try {
    await deliverPayPalReceiptEmail(
      env,
      purchase,
      payerEmail
    );

    await recordSuccessfulReceiptSend(
      env,
      purchase.purchase_token,
      payerEmail
    );

    return {
      sent: true,
      email:
        payerEmail
    };

  } catch (error) {
    console.error(
      "AUTOMATIC RECEIPT EMAIL FAILED:",
      error
    );

    return {
      sent: false,
      reason:
        "send_failed"
    };
  }
}


async function verifyPayPalWebhook(
  request,
  env,
  event
) {
  const webhookId =
    String(
      env.PAYPAL_WEBHOOK_ID ||
      ""
    ).trim();

  if (!webhookId) {
    throw new PayPalFlowError(
      "PAYPAL_WEBHOOK_ID is not configured on this Worker.",
      503,
      "paypal_webhook_id_missing"
    );
  }

  const transmissionId =
    String(
      request.headers.get(
        "paypal-transmission-id"
      ) ||
      ""
    ).trim();

  const transmissionTime =
    String(
      request.headers.get(
        "paypal-transmission-time"
      ) ||
      ""
    ).trim();

  const transmissionSig =
    String(
      request.headers.get(
        "paypal-transmission-sig"
      ) ||
      ""
    ).trim();

  const certUrl =
    String(
      request.headers.get(
        "paypal-cert-url"
      ) ||
      ""
    ).trim();

  const authAlgo =
    String(
      request.headers.get(
        "paypal-auth-algo"
      ) ||
      ""
    ).trim();

  if (
    !transmissionId ||
    !transmissionTime ||
    !transmissionSig ||
    !certUrl ||
    !authAlgo
  ) {
    return false;
  }

  const verifyResponse =
    await paypalApiRequest(
      env,
      "/v1/notifications/verify-webhook-signature",
      {
        method: "POST",

        body: JSON.stringify({
          auth_algo:
            authAlgo,
          cert_url:
            certUrl,
          transmission_id:
            transmissionId,
          transmission_sig:
            transmissionSig,
          transmission_time:
            transmissionTime,
          webhook_id:
            webhookId,
          webhook_event:
            event
        })
      }
    );

  let verifyData = {};

  try {
    verifyData =
      await verifyResponse.json();
  } catch {
    verifyData = {};
  }

  if (!verifyResponse.ok) {
    console.error(
      "PAYPAL WEBHOOK VERIFY API ERROR:",
      verifyResponse.status,
      verifyData
    );

    return false;
  }

  return (
    String(
      verifyData.verification_status ||
      ""
    ).toUpperCase() ===
    "SUCCESS"
  );
}


async function checkPayPalCreateRateLimit(
  request,
  env
) {
  // Sandbox testing should never be blocked by the checkout limiter.
  // Live PayPal mode keeps the normal anti-spam protection.
  const paypalMode =
    String(
      env.PAYPAL_MODE ||
      "sandbox"
    )
      .trim()
      .toLowerCase();

  if (paypalMode !== "live") {
    return {
      allowed: true,
      retryAfter: 0
    };
  }

  const ip =
    request.headers.get(
      "CF-Connecting-IP"
    ) ||
    "unknown";

  const now =
    Date.now();

  const windowMs =
    10 * 60 * 1000;

  const maxRequests =
    12;

  const currentWindow =
    Math.floor(
      now / windowMs
    ) * windowMs;

  if (!env.DEVICE_HASH_SECRET) {
    // Existing Worker setup is expected to have this.
    // Do not store the raw IP if it is missing.
    return {
      allowed: true,
      retryAfter: 0
    };
  }

  const identifier =
    await hashDevice(
      "paypal-order-ip:" + ip,
      env.DEVICE_HASH_SECRET
    );

  const existing =
    await env.DB.prepare(`
      SELECT
        window_start,
        request_count
      FROM rate_limits
      WHERE identifier = ?
      LIMIT 1
    `)
      .bind(identifier)
      .first();

  if (!existing) {
    await env.DB.prepare(`
      INSERT INTO rate_limits (
        identifier,
        window_start,
        request_count
      )
      VALUES (?, ?, 1)
    `)
      .bind(
        identifier,
        currentWindow
      )
      .run();

    return {
      allowed: true,
      retryAfter: 0
    };
  }

  if (
    Number(existing.window_start) !==
    currentWindow
  ) {
    await env.DB.prepare(`
      UPDATE rate_limits
      SET
        window_start = ?,
        request_count = 1
      WHERE identifier = ?
    `)
      .bind(
        currentWindow,
        identifier
      )
      .run();

    return {
      allowed: true,
      retryAfter: 0
    };
  }

  if (
    Number(existing.request_count) >=
    maxRequests
  ) {
    return {
      allowed: false,
      retryAfter:
        Math.ceil(
          (
            currentWindow +
            windowMs -
            now
          ) / 1000
        )
    };
  }

  await env.DB.prepare(`
    UPDATE rate_limits
    SET
      request_count =
        request_count + 1
    WHERE identifier = ?
  `)
    .bind(identifier)
    .run();

  return {
    allowed: true,
    retryAfter: 0
  };
}


function renderPayPalMessagePage(
  title,
  message,
  status = 200,
  actionUrl = "",
  actionLabel = ""
) {
  const action =
    actionUrl
      ? `
        <a class="button" href="${escapeHtml(actionUrl)}">
          ${escapeHtml(actionLabel || "Continue")}
        </a>
      `
      : "";

  return html(`
    <!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1"
      >
      <meta
        name="robots"
        content="noindex, nofollow"
      >
      <title>${escapeHtml(title)} • Alter Hub</title>

      <style>
        :root {
          color-scheme: dark;
          --red: #ff3049;
          --line: rgba(255,255,255,.09);
          --muted: #9898a1;
        }

        * {
          box-sizing: border-box;
        }

        body {
          min-height: 100vh;
          margin: 0;
          display: grid;
          place-items: center;
          padding: 24px;
          color: #f7f7f8;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
          background:
            radial-gradient(
              circle at 50% 0%,
              rgba(226,29,54,.22),
              transparent 36%
            ),
            #070708;
        }

        .card {
          width: min(560px, 100%);
          padding: 30px;
          border: 1px solid var(--line);
          border-radius: 24px;
          background:
            linear-gradient(
              145deg,
              rgba(24,24,28,.96),
              rgba(13,13,15,.96)
            );
          box-shadow:
            0 24px 80px rgba(0,0,0,.48);
        }

        .brand {
          color: var(--red);
          font-weight: 900;
          letter-spacing: .12em;
          text-transform: uppercase;
          font-size: 11px;
        }

        h1 {
          margin: 14px 0 10px;
          font-size: clamp(30px, 7vw, 46px);
          letter-spacing: -.045em;
        }

        p {
          margin: 0;
          color: var(--muted);
          line-height: 1.65;
        }

        .button {
          min-height: 44px;
          margin-top: 22px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 18px;
          border-radius: 12px;
          border:
            1px solid rgba(255,48,73,.35);
          color: white;
          background:
            rgba(226,29,54,.12);
          text-decoration: none;
          font-weight: 800;
        }
      </style>
    </head>

    <body>
      <main class="card">
        <div class="brand">Alter Hub • PayPal</div>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(message)}</p>
        ${action}
      </main>
    </body>
    </html>
  `, status);
}


function renderPayPalPurchasePage(
  purchase
) {
  const completed =
    Boolean(
      purchase?.final_key
    );

  if (!completed) {
    return html(`
      <!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        >
        <meta
          name="robots"
          content="noindex, nofollow"
        >
        <meta
          http-equiv="refresh"
          content="3"
        >
        <title>Processing Payment • Alter Hub</title>

        <style>
          :root { color-scheme: dark; }
          * { box-sizing: border-box; }

          body {
            min-height: 100vh;
            margin: 0;
            display: grid;
            place-items: center;
            padding: 24px;
            color: #f7f7f8;
            font-family:
              Inter,
              ui-sans-serif,
              system-ui,
              sans-serif;
            background:
              radial-gradient(
                circle at 50% 0%,
                rgba(226,29,54,.22),
                transparent 36%
              ),
              #070708;
          }

          .card {
            width: min(600px, 100%);
            padding: 32px;
            border:
              1px solid rgba(255,255,255,.09);
            border-radius: 24px;
            background:
              linear-gradient(
                145deg,
                rgba(24,24,28,.96),
                rgba(13,13,15,.96)
              );
            box-shadow:
              0 24px 80px rgba(0,0,0,.48);
          }

          .brand {
            color: #ff3049;
            font-size: 11px;
            font-weight: 900;
            letter-spacing: .12em;
            text-transform: uppercase;
          }

          h1 {
            margin: 14px 0 10px;
            font-size: clamp(30px, 7vw, 46px);
            letter-spacing: -.045em;
          }

          p {
            color: #9898a1;
            line-height: 1.65;
          }

          .spinner {
            width: 28px;
            height: 28px;
            margin-top: 22px;
            border-radius: 50%;
            border:
              3px solid rgba(255,255,255,.10);
            border-top-color: #ff3049;
            animation:
              spin .8s linear infinite;
          }

          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        </style>
      </head>

      <body>
        <main class="card">
          <div class="brand">
            Alter Hub • PayPal
          </div>

          <h1>Creating your key</h1>

          <p>
            PayPal is being confirmed and your Alter Hub key
            will appear here automatically. This page refreshes
            every few seconds.
          </p>

          <div class="spinner"></div>
        </main>
      </body>
      </html>
    `, 202);
  }

  const key =
    String(
      purchase.final_key ||
      ""
    );

  const plan =
    String(
      purchase.access_plan ||
      "keyless"
    );

  const amount =
    String(
      purchase.amount ||
      ""
    );

  const currency =
    String(
      purchase.currency ||
      "USD"
    );

  const purchaseToken =
    String(
      purchase.purchase_token ||
      ""
    );

  const payerEmail =
    String(
      purchase.payer_email ||
      ""
    );

  const receiptSent =
    Boolean(
      purchase.receipt_sent_at
    );

  return html(`
    <!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8">

      <meta
        name="viewport"
        content="width=device-width, initial-scale=1"
      >

      <meta
        name="robots"
        content="noindex, nofollow"
      >

      <title>Purchase Complete • Alter Hub</title>

      <style>
        :root {
          color-scheme: dark;
          --red: #ff3049;
          --green: #2fd47a;
          --line: rgba(255,255,255,.09);
          --muted: #9898a1;
        }

        * {
          box-sizing: border-box;
        }

        body {
          min-height: 100vh;
          margin: 0;
          display: grid;
          place-items: center;
          padding: 24px;
          color: #f7f7f8;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
          background:
            radial-gradient(
              circle at 50% 0%,
              rgba(226,29,54,.22),
              transparent 36%
            ),
            #070708;
        }

        .card {
          width: min(700px, 100%);
          padding: clamp(24px, 5vw, 40px);
          border: 1px solid var(--line);
          border-radius: 26px;
          background:
            linear-gradient(
              145deg,
              rgba(24,24,28,.97),
              rgba(13,13,15,.97)
            );
          box-shadow:
            0 24px 80px rgba(0,0,0,.48);
        }

        .brand {
          color: var(--red);
          font-size: 11px;
          font-weight: 900;
          letter-spacing: .12em;
          text-transform: uppercase;
        }

        .success {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 18px;
          color: #7ff0ae;
          font-size: 12px;
          font-weight: 800;
        }

        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--green);
          box-shadow:
            0 0 14px rgba(47,212,122,.65);
        }

        h1 {
          margin: 12px 0 10px;
          font-size: clamp(34px, 8vw, 58px);
          line-height: 1;
          letter-spacing: -.055em;
        }

        .subtitle {
          color: var(--muted);
          line-height: 1.65;
        }

        .key-box {
          margin-top: 24px;
          padding: 18px;
          display: flex;
          align-items: center;
          gap: 12px;
          border:
            1px solid rgba(255,48,73,.22);
          border-radius: 16px;
          background:
            rgba(226,29,54,.065);
        }

        code {
          min-width: 0;
          flex: 1;
          overflow-wrap: anywhere;
          color: white;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: .025em;
        }

        button {
          min-height: 42px;
          padding: 0 16px;
          border:
            1px solid rgba(255,48,73,.34);
          border-radius: 11px;
          color: white;
          background:
            rgba(226,29,54,.14);
          font: inherit;
          font-size: 12px;
          font-weight: 850;
          cursor: pointer;
        }

        .meta {
          margin-top: 16px;
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .meta-card {
          padding: 14px;
          border: 1px solid var(--line);
          border-radius: 13px;
          background:
            rgba(255,255,255,.025);
        }

        .meta-card span {
          display: block;
          color: #696972;
          font-size: 9px;
          font-weight: 850;
          letter-spacing: .10em;
          text-transform: uppercase;
        }

        .meta-card strong {
          display: block;
          margin-top: 6px;
          font-size: 13px;
        }

        .receipt-actions {
          margin-top: 16px;
          padding: 16px;
          border: 1px solid var(--line);
          border-radius: 15px;
          background:
            rgba(255,255,255,.022);
        }

        .receipt-actions h2 {
          margin: 0;
          font-size: 14px;
          letter-spacing: -.01em;
        }

        .receipt-actions p {
          margin: 6px 0 0;
          color: var(--muted);
          font-size: 11px;
          line-height: 1.55;
        }

        .receipt-row {
          margin-top: 12px;
          display: grid;
          grid-template-columns:
            minmax(0, 1fr) auto;
          gap: 10px;
        }

        .receipt-row input {
          min-width: 0;
          min-height: 42px;
          padding: 0 12px;
          border:
            1px solid rgba(255,255,255,.10);
          border-radius: 11px;
          outline: none;
          color: white;
          background:
            rgba(0,0,0,.20);
          font: inherit;
          font-size: 12px;
        }

        .receipt-row input:focus {
          border-color:
            rgba(255,48,73,.45);
          box-shadow:
            0 0 0 3px rgba(255,48,73,.07);
        }

        .receipt-buttons {
          margin-top: 10px;
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .receipt-download {
          min-height: 42px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 16px;
          border:
            1px solid rgba(255,255,255,.11);
          border-radius: 11px;
          color: #ececf0;
          background:
            rgba(255,255,255,.035);
          text-decoration: none;
          font-size: 12px;
          font-weight: 850;
        }

        .receipt-message {
          min-height: 18px;
          margin-top: 10px;
          color: #a8a8b0;
          font-size: 11px;
        }

        .receipt-message.success {
          color: #7ff0ae;
        }

        .receipt-message.error {
          color: #ff8f9d;
        }

        .note {
          margin: 18px 0 0;
          color: var(--muted);
          font-size: 12px;
          line-height: 1.65;
        }

        @media (max-width: 600px) {
          .key-box {
            align-items: stretch;
            flex-direction: column;
          }

          button {
            width: 100%;
          }

          .meta {
            grid-template-columns: 1fr;
          }

          .receipt-row,
          .receipt-buttons {
            grid-template-columns: 1fr;
          }

          .receipt-download {
            width: 100%;
          }
        }
      </style>
    </head>

    <body>
      <main class="card">
        <div class="brand">
          Alter Hub • PayPal
        </div>

        <div class="success">
          <span class="dot"></span>
          Payment confirmed
        </div>

        <h1>Your key is ready.</h1>

        <div class="subtitle">
          Your PayPal payment was verified by the Alter Hub
          server before this key was generated.
        </div>

        <div class="key-box">
          <code id="alterKey">${escapeHtml(key)}</code>

          <button
            type="button"
            id="copyKeyButton"
          >
            Copy Key
          </button>
        </div>

        <div class="meta">
          <div class="meta-card">
            <span>Access plan</span>
            <strong>${escapeHtml(plan)}</strong>
          </div>

          <div class="meta-card">
            <span>Payment</span>
            <strong>
              ${escapeHtml(currency)}
              ${escapeHtml(amount)}
            </strong>
          </div>
        </div>

        <section class="receipt-actions">
          <h2>Purchase receipt</h2>

          <p>
            ${
              receiptSent
                ? "A receipt has already been emailed. You can download it or send another copy below."
                : "Your receipt is sent automatically to the PayPal buyer email when available. You can also download it or send a copy to another email."
            }
          </p>

          <div class="receipt-row">
            <input
              id="receiptEmail"
              type="email"
              value="${escapeHtml(payerEmail)}"
              placeholder="Email address"
              autocomplete="email"
              aria-label="Receipt email"
            >

            <button
              type="button"
              id="sendReceiptButton"
            >
              Email Receipt
            </button>
          </div>

          <div class="receipt-buttons">
            <a
              class="receipt-download"
              href="/paypal/receipt/${escapeHtml(purchaseToken)}/download"
            >
              Download Receipt
            </a>

            <button
              type="button"
              id="fillBuyerEmailButton"
            >
              Use PayPal Email
            </button>
          </div>

          <div
            class="receipt-message"
            id="receiptMessage"
          ></div>
        </section>

        <p class="note">
          The monthly license duration starts when this key is
          redeemed for the first time, matching Alter Hub's
          admin-created key behavior.
        </p>
      </main>

      <script>
        document
          .getElementById("copyKeyButton")
          .addEventListener(
            "click",
            async function() {
              const button = this;
              const key =
                document
                  .getElementById("alterKey")
                  .textContent;

              try {
                await navigator
                  .clipboard
                  .writeText(key);

                button.textContent =
                  "Copied!";

                setTimeout(
                  function() {
                    button.textContent =
                      "Copy Key";
                  },
                  1200
                );

              } catch {
                button.textContent =
                  "Copy Failed";
              }
            }
          );

        const receiptEmailInput =
          document.getElementById(
            "receiptEmail"
          );

        const receiptMessage =
          document.getElementById(
            "receiptMessage"
          );

        const sendReceiptButton =
          document.getElementById(
            "sendReceiptButton"
          );

        const buyerEmail =
          ${JSON.stringify(payerEmail)};

        document
          .getElementById(
            "fillBuyerEmailButton"
          )
          .addEventListener(
            "click",
            function() {
              receiptEmailInput.value =
                buyerEmail;

              receiptEmailInput.focus();
            }
          );

        sendReceiptButton
          .addEventListener(
            "click",
            async function() {
              const email =
                receiptEmailInput
                  .value
                  .trim();

              receiptMessage.className =
                "receipt-message";

              receiptMessage.textContent =
                "Sending receipt...";

              sendReceiptButton.disabled =
                true;

              try {
                const response =
                  await fetch(
                    "/api/paypal/email-receipt",
                    {
                      method: "POST",

                      headers: {
                        "Content-Type":
                          "application/json"
                      },

                      body: JSON.stringify({
                        purchase_token:
                          ${JSON.stringify(purchaseToken)},
                        email:
                          email
                      })
                    }
                  );

                const data =
                  await response.json();

                if (
                  !response.ok ||
                  data.success !== true
                ) {
                  receiptMessage.className =
                    "receipt-message error";

                  receiptMessage.textContent =
                    data.error ||
                    "Receipt could not be sent.";

                  return;
                }

                receiptMessage.className =
                  "receipt-message success";

                receiptMessage.textContent =
                  "Receipt sent to " +
                  data.email +
                  ".";

              } catch (error) {
                receiptMessage.className =
                  "receipt-message error";

                receiptMessage.textContent =
                  "Receipt could not be sent.";

              } finally {
                sendReceiptButton.disabled =
                  false;
              }
            }
          );
      </script>
    </body>
    </html>
  `);
}


async function hashDevice(
  clientId,
  secret
) {

  const encoder =
    new TextEncoder();


  const key =
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      {
        name: "HMAC",
        hash: "SHA-256"
      },
      false,
      ["sign"]
    );


  const signature =
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(clientId)
    );


  return Array
    .from(new Uint8Array(signature))
    .map(
      byte =>
        byte
          .toString(16)
          .padStart(2, "0")
    )
    .join("");
}

function generateScriptTicket() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  const randomPart = Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  return "ST_" + randomPart;
}

function generateAdminKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  const randomPart = Array.from(bytes)
    .map(byte =>
      byte
        .toString(16)
        .padStart(2, "0")
    )
    .join("")
    .toUpperCase();

  return "ALTER_" + randomPart;
}


function generateAccessToken() {

  const bytes =
    new Uint8Array(32);

  crypto.getRandomValues(bytes);

  const randomPart =
    Array
      .from(bytes)
      .map(
        byte =>
          byte
            .toString(16)
            .padStart(2, "0")
      )
      .join("")
      .toUpperCase();

  return "AT_" + randomPart;
}
async function hashAccessToken(token) {

  const encoder =
    new TextEncoder();

  const data =
    encoder.encode(token);

  const hashBuffer =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return Array
    .from(new Uint8Array(hashBuffer))
    .map(
      byte =>
        byte
          .toString(16)
          .padStart(2, "0")
    )
    .join("");
}
async function checkCreateSessionRateLimit(
  request,
  env
) {

  const ip =
    request.headers.get("CF-Connecting-IP") ||
    "unknown";

  const now =
    Date.now();

  const windowMs =
    10 * 60 * 1000; // 10 minutes

  const maxRequests =
    20;

  const currentWindow =
    Math.floor(now / windowMs) * windowMs;


  // Never store the raw IP.
  const identifier =
    await hashDevice(
      "rate-limit-ip:" + ip,
      env.DEVICE_HASH_SECRET
    );


  const existing =
    await env.DB.prepare(`
      SELECT
        window_start,
        request_count
      FROM rate_limits
      WHERE identifier = ?
      LIMIT 1
    `)
    .bind(identifier)
    .first();


  // First request from this IP
  if (!existing) {

    await env.DB.prepare(`
      INSERT INTO rate_limits
      (
        identifier,
        window_start,
        request_count
      )
      VALUES (?, ?, 1)
    `)
    .bind(
      identifier,
      currentWindow
    )
    .run();

    return {
      allowed: true,
      retryAfter: 0
    };
  }


  // Previous window expired, start over
  if (
    Number(existing.window_start) !==
    currentWindow
  ) {

    await env.DB.prepare(`
      UPDATE rate_limits
      SET
        window_start = ?,
        request_count = 1
      WHERE identifier = ?
    `)
    .bind(
      currentWindow,
      identifier
    )
    .run();

    return {
      allowed: true,
      retryAfter: 0
    };
  }


  const currentCount =
    Number(existing.request_count);


  // Limit reached
  if (currentCount >= maxRequests) {

    const retryAfter =
      Math.ceil(
        (
          currentWindow +
          windowMs -
          now
        ) / 1000
      );

    return {
      allowed: false,
      retryAfter: retryAfter
    };
  }


  // Increment current window
  await env.DB.prepare(`
    UPDATE rate_limits
    SET request_count = request_count + 1
    WHERE identifier = ?
  `)
  .bind(identifier)
  .run();


  return {
    allowed: true,
    retryAfter: 0
  };
}
async function checkRedeemRateLimit(
  request,
  env
) {

  const ip =
    request.headers.get("CF-Connecting-IP") ||
    "unknown";

  const now =
    Date.now();

  const windowMs =
    10 * 60 * 1000;

  // Maximum 10 redemption attempts per 10 minutes
  const maxRequests =
    10;

  const currentWindow =
    Math.floor(now / windowMs) * windowMs;


  const identifier =
    await hashDevice(
      "redeem-ip:" + ip,
      env.DEVICE_HASH_SECRET
    );


  const existing =
    await env.DB.prepare(`
      SELECT
        window_start,
        request_count
      FROM rate_limits
      WHERE identifier = ?
      LIMIT 1
    `)
    .bind(identifier)
    .first();


  if (!existing) {

    await env.DB.prepare(`
      INSERT INTO rate_limits
      (
        identifier,
        window_start,
        request_count
      )
      VALUES (?, ?, 1)
    `)
    .bind(
      identifier,
      currentWindow
    )
    .run();

    return {
      allowed: true,
      retryAfter: 0
    };
  }


  if (
    Number(existing.window_start) !==
    currentWindow
  ) {

    await env.DB.prepare(`
      UPDATE rate_limits
      SET
        window_start = ?,
        request_count = 1
      WHERE identifier = ?
    `)
    .bind(
      currentWindow,
      identifier
    )
    .run();

    return {
      allowed: true,
      retryAfter: 0
    };
  }


  if (
    Number(existing.request_count) >=
    maxRequests
  ) {

    return {
      allowed: false,

      retryAfter:
        Math.ceil(
          (
            currentWindow +
            windowMs -
            now
          ) / 1000
        )
    };
  }


  await env.DB.prepare(`
    UPDATE rate_limits
    SET request_count = request_count + 1
    WHERE identifier = ?
  `)
  .bind(identifier)
  .run();


  return {
    allowed: true,
    retryAfter: 0
  };
}

const CREATION_TAG_PRESETS = [
  "Owner",
  "Developer",
  "Staff",
  "Tester",
  "Partner",
  "Giveaway",
  "YouTube",
  "Moderator",
  "Sponsor"
];


function normalizeCreationTags(value) {
  const normalized =
    normalizeAdminTags(value);

  const tags =
    parseAdminTags(normalized);

  if (tags.length === 0) {
    return "";
  }

  const allowed =
    new Map(
      CREATION_TAG_PRESETS.map(function(tag) {
        return [
          tag.toLowerCase(),
          tag
        ];
      })
    );

  const output = [];

  for (const tag of tags) {
    const canonical =
      allowed.get(
        String(tag).toLowerCase()
      );

    if (!canonical) {
      return null;
    }

    if (!output.includes(canonical)) {
      output.push(canonical);
    }
  }

  return output.join(", ");
}


function normalizeAdminTags(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(",");

  const seen = new Set();
  const tags = [];

  for (const item of raw) {
    const tag =
      String(item || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 32);

    if (!tag) {
      continue;
    }

    const key = tag.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    tags.push(tag);

    if (tags.length >= 12) {
      break;
    }
  }

  return tags.join(", ");
}


function parseAdminTags(value) {
  return String(value || "")
    .split(",")
    .map(function(tag) {
      return tag.trim();
    })
    .filter(Boolean);
}


function adminPeriodStart(period, now) {
  const DAY = 24 * 60 * 60 * 1000;

  if (period === "1d") {
    return now - DAY;
  }

  if (period === "7d") {
    return now - 7 * DAY;
  }

  if (period === "30d") {
    return now - 30 * DAY;
  }

  if (period === "1y") {
    return now - 366 * DAY;
  }

  return 0;
}


function csvCell(value) {
  const text = String(
    value == null ? "" : value
  );

  return '"' +
    text.replaceAll('"', '""') +
    '"';
}


function csvRow(values) {
  return values
    .map(csvCell)
    .join(",");
}


async function recordAdminActivity(
  env,
  action,
  targetType = "",
  targetRef = "",
  description = ""
) {
  try {
    await env.DB.prepare(`
      INSERT INTO admin_activity_log (
        id,
        created_at,
        action,
        target_type,
        target_ref,
        description
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `)
      .bind(
        crypto.randomUUID()
          .replaceAll("-", ""),
        Date.now(),
        String(action || "unknown")
          .slice(0, 64),
        String(targetType || "")
          .slice(0, 64),
        String(targetRef || "")
          .slice(-64),
        String(description || "")
          .slice(0, 500)
      )
      .run();

    return true;
  } catch (error) {
    console.error(
      "ADMIN ACTIVITY LOG ERROR:",
      error
    );
    return false;
  }
}


async function deleteKeySessionForAdmin(
  env,
  sessionId,
  now = Date.now()
) {
  const session =
    await env.DB.prepare(`
      SELECT
        id,
        final_key,
        roblox_user_id,
        redeemed_at
      FROM sessions
      WHERE id = ?
      LIMIT 1
    `)
      .bind(sessionId)
      .first();

  if (!session) {
    return {
      deleted: false,
      reason: "Key not found"
    };
  }

  const license =
    await env.DB.prepare(`
      SELECT
        license_id,
        revoked,
        expires_at
      FROM licenses
      WHERE session_id = ?
      LIMIT 1
    `)
      .bind(sessionId)
      .first();

  if (
    !license &&
    session.roblox_user_id !== "ADMIN_CREATED"
  ) {
    return {
      deleted: false,
      reason:
        "Unredeemed generated keys are protected"
    };
  }

  if (license) {
    await env.DB.prepare(`
      DELETE FROM access_tokens
      WHERE license_id = ?
    `)
      .bind(license.license_id)
      .run();

    await env.DB.prepare(`
      DELETE FROM script_tickets
      WHERE license_id = ?
    `)
      .bind(license.license_id)
      .run();

    await env.DB.prepare(`
      DELETE FROM key_redeemers
      WHERE session_id = ?
        OR license_id = ?
    `)
      .bind(
        sessionId,
        license.license_id
      )
      .run();

    await env.DB.prepare(`
      DELETE FROM licenses
      WHERE license_id = ?
    `)
      .bind(license.license_id)
      .run();
  }

  await env.DB.prepare(`
    DELETE FROM sessions
    WHERE id = ?
  `)
    .bind(sessionId)
    .run();

  let licenseDelta = 0;
  let expiredCount = 0;
  let deletedLicenseCount = 0;

  if (license) {
    deletedLicenseCount = 1;

    const wasRevoked =
      Number(license.revoked) === 1;

    const wasExpired =
      Number(license.expires_at) <= now;

    if (!wasRevoked && wasExpired) {
      await recordAnalytics(
        env,
        {
          license_delta: -1,
          licenses_expired: 1
        },
        Number(license.expires_at)
      );

      expiredCount = 1;
    } else if (!wasRevoked) {
      licenseDelta = -1;
    }
  }

  await recordAnalytics(
    env,
    {
      keys_deleted: 1,
      licenses_deleted:
        deletedLicenseCount,
      license_delta:
        licenseDelta
    },
    now
  );

  return {
    deleted: true,
    key: String(session.final_key || ""),
    license_deleted:
      deletedLicenseCount,
    expired_recorded:
      expiredCount
  };
}


async function buildAnalyticsExportRows(
  env,
  period,
  now
) {
  let lifetimeStart = null;

  if (period === "lifetime") {
    const earliest =
      await env.DB.prepare(`
        SELECT MIN(bucket_start) AS earliest
        FROM analytics_hourly
      `)
        .first();

    lifetimeStart =
      Number(earliest?.earliest || now);
  }

  const bucketData =
    buildCheckpointBuckets(
      period,
      now,
      lifetimeStart
    );

  const baseline =
    await env.DB.prepare(`
      SELECT
        COALESCE(SUM(license_delta), 0)
          AS active_before_range
      FROM analytics_hourly
      WHERE bucket_start < ?
    `)
      .bind(bucketData.start)
      .first();

  const raw =
    await env.DB.prepare(`
      SELECT
        bucket_start,
        checkpoints_passed,
        keys_generated,
        keys_deleted,
        redeems,
        license_delta,
        licenses_activated,
        licenses_revoked,
        licenses_unrevoked,
        licenses_expired,
        licenses_deleted
      FROM analytics_hourly
      WHERE bucket_start >= ?
        AND bucket_start <= ?
      ORDER BY bucket_start ASC
    `)
      .bind(
        bucketData.start,
        now
      )
      .all();

  const rows =
    (raw.results || []).map(
      function(row) {
        return {
          bucket_start:
            Number(row.bucket_start || 0),
          checkpoints_passed:
            Number(row.checkpoints_passed || 0),
          keys_generated:
            Number(row.keys_generated || 0),
          keys_deleted:
            Number(row.keys_deleted || 0),
          redeems:
            Number(row.redeems || 0),
          license_delta:
            Number(row.license_delta || 0),
          licenses_activated:
            Number(row.licenses_activated || 0),
          licenses_revoked:
            Number(row.licenses_revoked || 0),
          licenses_unrevoked:
            Number(row.licenses_unrevoked || 0),
          licenses_expired:
            Number(row.licenses_expired || 0),
          licenses_deleted:
            Number(row.licenses_deleted || 0)
        };
      }
    );

  let active =
    Number(
      baseline?.active_before_range || 0
    );

  let rowIndex = 0;
  const output = [];

  for (
    let index = 0;
    index < bucketData.buckets.length;
    index++
  ) {
    const bucket =
      bucketData.buckets[index];

    const summary = {
      start: bucket.start,
      end:
        Math.min(bucket.end, now),
      checkpoints_passed: 0,
      valid_licenses: 0,
      keys_generated: 0,
      keys_deleted: 0,
      redeems: 0,
      licenses_activated: 0,
      licenses_revoked: 0,
      licenses_unrevoked: 0,
      licenses_expired: 0,
      licenses_deleted: 0
    };

    while (rowIndex < rows.length) {
      const row = rows[rowIndex];

      if (row.bucket_start < bucket.start) {
        active += row.license_delta;
        rowIndex += 1;
        continue;
      }

      if (row.bucket_start >= bucket.end) {
        break;
      }

      summary.checkpoints_passed +=
        row.checkpoints_passed;
      summary.keys_generated +=
        row.keys_generated;
      summary.keys_deleted +=
        row.keys_deleted;
      summary.redeems +=
        row.redeems;
      summary.licenses_activated +=
        row.licenses_activated;
      summary.licenses_revoked +=
        row.licenses_revoked;
      summary.licenses_unrevoked +=
        row.licenses_unrevoked;
      summary.licenses_expired +=
        row.licenses_expired;
      summary.licenses_deleted +=
        row.licenses_deleted;

      active += row.license_delta;
      rowIndex += 1;
    }

    summary.valid_licenses =
      Math.max(0, active);

    output.push(summary);
  }

  return output;
}

function analyticsHourStart(timestamp) {
  const HOUR =
    60 * 60 * 1000;

  return Math.floor(
    Number(timestamp || Date.now()) /
    HOUR
  ) * HOUR;
}


async function recordAnalytics(
  env,
  changes = {},
  timestamp = Date.now()
) {
  const values = {
    checkpoints_passed:
      Number(changes.checkpoints_passed || 0),

    keys_generated:
      Number(changes.keys_generated || 0),

    keys_deleted:
      Number(changes.keys_deleted || 0),

    redeems:
      Number(changes.redeems || 0),

    license_delta:
      Number(changes.license_delta || 0),

    licenses_activated:
      Number(changes.licenses_activated || 0),

    licenses_revoked:
      Number(changes.licenses_revoked || 0),

    licenses_unrevoked:
      Number(changes.licenses_unrevoked || 0),

    licenses_expired:
      Number(changes.licenses_expired || 0),

    licenses_deleted:
      Number(changes.licenses_deleted || 0)
  };

  const hasChanges =
    Object.values(values)
      .some(function(value) {
        return value !== 0;
      });

  if (!hasChanges) {
    return true;
  }

  try {
    await env.DB.prepare(`
      INSERT INTO analytics_hourly (
        bucket_start,
        checkpoints_passed,
        keys_generated,
        keys_deleted,
        redeems,
        license_delta,
        licenses_activated,
        licenses_revoked,
        licenses_unrevoked,
        licenses_expired,
        licenses_deleted
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

      ON CONFLICT(bucket_start)
      DO UPDATE SET
        checkpoints_passed =
          analytics_hourly.checkpoints_passed +
          excluded.checkpoints_passed,

        keys_generated =
          analytics_hourly.keys_generated +
          excluded.keys_generated,

        keys_deleted =
          analytics_hourly.keys_deleted +
          excluded.keys_deleted,

        redeems =
          analytics_hourly.redeems +
          excluded.redeems,

        license_delta =
          analytics_hourly.license_delta +
          excluded.license_delta,

        licenses_activated =
          analytics_hourly.licenses_activated +
          excluded.licenses_activated,

        licenses_revoked =
          analytics_hourly.licenses_revoked +
          excluded.licenses_revoked,

        licenses_unrevoked =
          analytics_hourly.licenses_unrevoked +
          excluded.licenses_unrevoked,

        licenses_expired =
          analytics_hourly.licenses_expired +
          excluded.licenses_expired,

        licenses_deleted =
          analytics_hourly.licenses_deleted +
          excluded.licenses_deleted
    `)
      .bind(
        analyticsHourStart(timestamp),
        values.checkpoints_passed,
        values.keys_generated,
        values.keys_deleted,
        values.redeems,
        values.license_delta,
        values.licenses_activated,
        values.licenses_revoked,
        values.licenses_unrevoked,
        values.licenses_expired,
        values.licenses_deleted
      )
      .run();

    return true;

  } catch (error) {
    console.error(
      "PERSISTENT ANALYTICS WRITE ERROR:",
      error
    );

    // Analytics must never break the live key system.
    return false;
  }
}


async function recordFinalKeyCountry(
  env,
  robloxUserId,
  countryCode
) {
  const userId =
    String(robloxUserId || "").trim();

  const country =
    String(countryCode || "")
      .trim()
      .toUpperCase();

  if (
    !userId ||
    userId === "ADMIN_CREATED" ||
    !/^[A-Z]{2}$/.test(country) ||
    country === "XX" ||
    !env.DEVICE_HASH_SECRET
  ) {
    return false;
  }

  try {
    // Store only a keyed one-way hash of the Roblox ID.
    // The raw Roblox ID, key, IP, and device ID never enter
    // the country analytics tables.
    const userHash =
      await hashDevice(
        "ALTER_COUNTRY_USER:" + userId,
        env.DEVICE_HASH_SECRET
      );

    const now = Date.now();

    const existing =
      await env.DB.prepare(`
        SELECT country_code
        FROM analytics_country_users
        WHERE user_hash = ?
        LIMIT 1
      `)
        .bind(userHash)
        .first();

    if (!existing) {
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO analytics_country_users (
            user_hash,
            country_code,
            first_seen_at,
            last_seen_at
          )
          VALUES (?, ?, ?, ?)
        `)
          .bind(
            userHash,
            country,
            now,
            now
          ),

        env.DB.prepare(`
          INSERT INTO analytics_country_totals (
            country_code,
            users_count,
            updated_at
          )
          VALUES (?, 1, ?)

          ON CONFLICT(country_code)
          DO UPDATE SET
            users_count =
              analytics_country_totals.users_count + 1,
            updated_at = excluded.updated_at
        `)
          .bind(
            country,
            now
          )
      ]);

      return true;
    }

    const previousCountry =
      String(existing.country_code || "")
        .toUpperCase();

    if (previousCountry === country) {
      await env.DB.prepare(`
        UPDATE analytics_country_users
        SET last_seen_at = ?
        WHERE user_hash = ?
      `)
        .bind(
          now,
          userHash
        )
        .run();

      return true;
    }

    const statements = [
      env.DB.prepare(`
        UPDATE analytics_country_users
        SET
          country_code = ?,
          last_seen_at = ?
        WHERE user_hash = ?
      `)
        .bind(
          country,
          now,
          userHash
        ),

      env.DB.prepare(`
        INSERT INTO analytics_country_totals (
          country_code,
          users_count,
          updated_at
        )
        VALUES (?, 1, ?)

        ON CONFLICT(country_code)
        DO UPDATE SET
          users_count =
            analytics_country_totals.users_count + 1,
          updated_at = excluded.updated_at
      `)
        .bind(
          country,
          now
        )
    ];

    if (/^[A-Z]{2}$/.test(previousCountry)) {
      statements.push(
        env.DB.prepare(`
          UPDATE analytics_country_totals
          SET
            users_count =
              MAX(users_count - 1, 0),
            updated_at = ?
          WHERE country_code = ?
        `)
          .bind(
            now,
            previousCountry
          )
      );
    }

    await env.DB.batch(statements);

    return true;

  } catch (error) {
    console.error(
      "COUNTRY ANALYTICS WRITE ERROR:",
      error
    );

    // Country analytics must never block final-key delivery.
    return false;
  }
}


let CHECKPOINT_FUNNEL_SCHEMA_READY = false;
let CHECKPOINT_FUNNEL_SCHEMA_PROMISE = null;

async function ensureCheckpointFunnelSchema(env) {
  if (CHECKPOINT_FUNNEL_SCHEMA_READY) {
    return true;
  }

  if (!CHECKPOINT_FUNNEL_SCHEMA_PROMISE) {
    CHECKPOINT_FUNNEL_SCHEMA_PROMISE =
      (async function() {
        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS analytics_checkpoint_attempts (
            checkpoint_token TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            provider TEXT NOT NULL,
            checkpoint INTEGER NOT NULL,
            started_at INTEGER NOT NULL,
            session_expires_at INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'started',
            finished_at INTEGER,
            failure_reason TEXT NOT NULL DEFAULT ''
          )
        `).run();

        await env.DB.prepare(`
          CREATE INDEX IF NOT EXISTS idx_checkpoint_attempts_started
          ON analytics_checkpoint_attempts(started_at DESC)
        `).run();

        await env.DB.prepare(`
          CREATE INDEX IF NOT EXISTS idx_checkpoint_attempts_provider_started
          ON analytics_checkpoint_attempts(provider, started_at DESC)
        `).run();

        await env.DB.prepare(`
          CREATE INDEX IF NOT EXISTS idx_checkpoint_attempts_session
          ON analytics_checkpoint_attempts(session_id, started_at DESC)
        `).run();

        CHECKPOINT_FUNNEL_SCHEMA_READY = true;
        return true;
      })();
  }

  try {
    return await CHECKPOINT_FUNNEL_SCHEMA_PROMISE;
  } catch (error) {
    CHECKPOINT_FUNNEL_SCHEMA_PROMISE = null;
    throw error;
  }
}

async function recordCheckpointFunnelStart(
  env,
  checkpointToken,
  sessionId,
  provider,
  checkpointNumber,
  startedAt,
  sessionExpiresAt
) {
  try {
    await ensureCheckpointFunnelSchema(env);

    await env.DB.prepare(`
      INSERT INTO analytics_checkpoint_attempts (
        checkpoint_token,
        session_id,
        provider,
        checkpoint,
        started_at,
        session_expires_at,
        status,
        finished_at,
        failure_reason
      )
      VALUES (?, ?, ?, ?, ?, ?, 'started', NULL, '')
      ON CONFLICT(checkpoint_token) DO NOTHING
    `)
      .bind(
        String(checkpointToken || ""),
        String(sessionId || ""),
        String(provider || "").toLowerCase(),
        Math.min(3, Math.max(1, Number(checkpointNumber || 1))),
        Number(startedAt || Date.now()),
        Number(sessionExpiresAt || 0)
      )
      .run();

    return true;
  } catch (error) {
    console.error(
      "CHECKPOINT FUNNEL START WRITE ERROR:",
      error
    );

    // Analytics must never block checkpoint delivery.
    return false;
  }
}

async function recordCheckpointFunnelStatus(
  env,
  checkpointToken,
  status,
  reason = ""
) {
  const token =
    String(checkpointToken || "").trim();

  if (!token) {
    return false;
  }

  const allowedStatuses = [
    "completed",
    "failed",
    "cancelled",
    "abandoned"
  ];

  const nextStatus =
    allowedStatuses.includes(status)
      ? status
      : "failed";

  try {
    await ensureCheckpointFunnelSchema(env);

    await env.DB.prepare(`
      UPDATE analytics_checkpoint_attempts
      SET
        status = ?,
        finished_at = ?,
        failure_reason = ?
      WHERE checkpoint_token = ?
        AND status = 'started'
    `)
      .bind(
        nextStatus,
        Date.now(),
        String(reason || "").slice(0, 180),
        token
      )
      .run();

    return true;
  } catch (error) {
    console.error(
      "CHECKPOINT FUNNEL STATUS WRITE ERROR:",
      error
    );

    // Analytics must never block checkpoint completion.
    return false;
  }
}

async function recordCheckpointCompletion(
  env,
  sessionId,
  provider,
  checkpointNumber,
  checkpointToken = ""
) {
  const number =
    Number(checkpointNumber || 0);

  if (checkpointToken) {
    await recordCheckpointFunnelStatus(
      env,
      checkpointToken,
      "completed",
      ""
    );
  }

  return recordAnalytics(
    env,
    {
      checkpoints_passed: 1,
      keys_generated:
        number >= 3
          ? 1
          : 0
    }
  );
}


function buildCheckpointBuckets(
  period,
  now,
  lifetimeStart = null
) {
  const HOUR =
    60 * 60 * 1000;

  const DAY =
    24 * HOUR;

  if (
    period === "1y" ||
    period === "lifetime"
  ) {
    const current =
      new Date(now);

    const buckets = [];

    let start;

    if (period === "lifetime") {
      const first =
        new Date(
          Number(
            lifetimeStart || now
          )
        );

      start =
        Date.UTC(
          first.getUTCFullYear(),
          first.getUTCMonth(),
          1,
          0,
          0,
          0,
          0
        );
    } else {
      start =
        Date.UTC(
          current.getUTCFullYear(),
          current.getUTCMonth() - 11,
          1,
          0,
          0,
          0,
          0
        );
    }

    const startDate =
      new Date(start);

    const monthCount =
      (
        (
          current.getUTCFullYear() -
          startDate.getUTCFullYear()
        ) *
        12
      ) +
      (
        current.getUTCMonth() -
        startDate.getUTCMonth()
      ) +
      1;

    for (
      let index = 0;
      index < monthCount;
      index++
    ) {
      const bucketStart =
        Date.UTC(
          startDate.getUTCFullYear(),
          startDate.getUTCMonth() +
            index,
          1,
          0,
          0,
          0,
          0
        );

      const bucketEnd =
        Date.UTC(
          startDate.getUTCFullYear(),
          startDate.getUTCMonth() +
            index +
            1,
          1,
          0,
          0,
          0,
          0
        );

      buckets.push({
        start: bucketStart,
        end: bucketEnd
      });
    }

    return {
      start: start,
      buckets: buckets
    };
  }

  if (
    period === "7d" ||
    period === "30d"
  ) {
    const bucketCount =
      period === "7d"
        ? 7
        : 30;

    const current =
      new Date(now);

    const todayStart =
      Date.UTC(
        current.getUTCFullYear(),
        current.getUTCMonth(),
        current.getUTCDate(),
        0,
        0,
        0,
        0
      );

    const start =
      todayStart -
      (
        (bucketCount - 1) *
        DAY
      );

    const buckets = [];

    for (
      let index = 0;
      index < bucketCount;
      index++
    ) {
      const bucketStart =
        start +
        (
          index *
          DAY
        );

      buckets.push({
        start: bucketStart,
        end:
          bucketStart +
          DAY
      });
    }

    return {
      start: start,
      buckets: buckets
    };
  }

  const bucketCount = 24;

  const currentHourStart =
    analyticsHourStart(now);

  const start =
    currentHourStart -
    (
      (bucketCount - 1) *
      HOUR
    );

  const buckets = [];

  for (
    let index = 0;
    index < bucketCount;
    index++
  ) {
    const bucketStart =
      start +
      (
        index *
        HOUR
      );

    buckets.push({
      start: bucketStart,
      end:
        bucketStart +
        HOUR
    });
  }

  return {
    start: start,
    buckets: buckets
  };
}

async function cleanupExpiredData(env) {

  const now =
    Date.now();


  // Delete expired temporary access tokens
  await env.DB.prepare(`
    DELETE FROM access_tokens
    WHERE expires_at <= ?
  `)
  .bind(now)
  .run();


  // Record active-license expirations before deleting rows.
  // The analytics entry is written at the real expiry hour,
  // so deleting the operational license later cannot rewrite history.
  try {
    const expiredGroups =
      await env.DB.prepare(`
        SELECT
          CAST(expires_at / 3600000 AS INTEGER) * 3600000
            AS expiry_bucket,
          COUNT(*) AS expired_count
        FROM licenses
        WHERE expires_at <= ?
          AND revoked = 0
        GROUP BY expiry_bucket
        ORDER BY expiry_bucket ASC
      `)
        .bind(now)
        .all();

    for (
      const group of expiredGroups.results || []
    ) {
      const count =
        Number(group.expired_count || 0);

      if (count <= 0) {
        continue;
      }

      await recordAnalytics(
        env,
        {
          license_delta: -count,
          licenses_expired: count
        },
        Number(group.expiry_bucket)
      );
    }
  } catch (error) {
    console.error(
      "LICENSE EXPIRY ANALYTICS ERROR:",
      error
    );
  }


  // Delete expired device licenses
  await env.DB.prepare(`
    DELETE FROM licenses
    WHERE expires_at <= ?
  `)
  .bind(now)
  .run();


  // Delete finished key sessions whose 12-hour
  // keys have expired
  await env.DB.prepare(`
    DELETE FROM sessions
    WHERE
      status = 'completed'
      AND key_expires_at IS NOT NULL
      AND key_expires_at <= ?
  `)
  .bind(now)
  .run();


  // Delete abandoned/expired key-system sessions
  await env.DB.prepare(`
    DELETE FROM sessions
    WHERE
      status != 'completed'
      AND expires_at <= ?
  `)
  .bind(now)
  .run();


  // Remove very old rate-limit records
  await env.DB.prepare(`
    DELETE FROM rate_limits
    WHERE window_start < ?
  `)
  .bind(
    now - (24 * 60 * 60 * 1000)
  )
  .run();

  // Remove expired secure admin sessions and old login-attempt records.
  // Wrapped so a public cleanup run cannot break the rest of Alter Hub
  // if the admin migration has not been applied yet.
  try {
    await env.DB.prepare(`
      DELETE FROM admin_sessions
      WHERE expires_at <= ?
         OR last_seen_at <= ?
    `)
      .bind(
        now,
        now - ADMIN_SESSION_IDLE_MS
      )
      .run();

    await env.DB.prepare(`
      DELETE FROM admin_login_attempts
      WHERE created_at < ?
    `)
      .bind(
        now - (24 * 60 * 60 * 1000)
      )
      .run();
  } catch (error) {
    console.error(
      "ADMIN AUTH CLEANUP ERROR:",
      error
    );
  }

  await env.DB.prepare(`
    DELETE FROM script_tickets
    WHERE expires_at <= ?
  `)
  .bind(Date.now())
  .run();

}
