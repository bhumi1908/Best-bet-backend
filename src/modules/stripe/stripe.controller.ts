import { Request, Response } from "express";
import stripe from "../../config/stripe";
import { sendError, sendSuccess } from "../../utils/helpers";
import { HttpStatus } from "../../utils/constants/enums";


export const getStripeIntegrationStatus = async (
  req: Request,
  res: Response
) => {
  try {
    /**
    API CONNECTION STATUS
     */
    let apiStatus: "connected" | "not_connected" = "not_connected";

    try {
      await stripe.balance.retrieve();
      apiStatus = "connected";
    } catch (err) {
      apiStatus = "not_connected";
    }

    /**
    MODE (TEST / LIVE)
     */
    const mode = process.env.STRIPE_SECRET_KEY?.startsWith("sk_live")
      ? "live"
      : "test";

    /**
     * 3. WEBHOOK STATUS
     */
    const webhooks = await stripe.webhookEndpoints.list({
      limit: 10,
    });

    const webhookStatus =
      webhooks.data.length > 0 ? "active" : "inactive";

    /**
     * 4. PAYMENT METHODS
     */
    const paymentMethods = {
      creditCards: true, // Stripe cards are always enabled
      bankTransfer: false,
      digitalWallets: false,
    };

    // Bank Transfer (best-effort detection)
    paymentMethods.bankTransfer = webhooks.data.length > 0;

    // Digital wallets (Apple Pay / Google Pay)
    paymentMethods.digitalWallets = paymentMethods.creditCards;

    sendSuccess(
      res,
      {
        apiStatus,
        webhookStatus,
        mode,
        paymentMethods,
      },
      "Stripe integration status fetched successfully",
      HttpStatus.OK
    );
  } catch (error: any) {
    console.error("Admin stripe integration status error:", error);
    sendError(
      res,
      error?.message || "Failed to fetch Stripe integration status",
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
};
