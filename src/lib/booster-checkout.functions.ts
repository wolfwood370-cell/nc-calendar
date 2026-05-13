import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import Stripe from "stripe";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BOOSTER_PACKAGES, type BoosterPackageId } from "./booster-packages";

const InputSchema = z.object({
  packageId: z.enum(["single", "pack3", "triage"]),
});

export const createBoosterCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      throw new Error("STRIPE_SECRET_KEY non configurata");
    }

    const pkg = BOOSTER_PACKAGES[data.packageId as BoosterPackageId];
    const userId = context.userId;

    // Origin per success/cancel URLs
    const origin =
      getRequestHeader("origin") ||
      getRequestHeader("referer")?.replace(/\/[^/]*$/, "") ||
      "https://nc-calendar.lovable.app";

    const stripe = new Stripe(stripeKey, { apiVersion: "2026-04-22.dahlia" });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: pkg.name,
              description: pkg.description,
            },
            unit_amount: pkg.amount,
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/client?booster=success`,
      cancel_url: `${origin}/client/store?booster=cancel`,
      metadata: {
        client_id: userId,
        package_id: pkg.id,
        quantity: String(pkg.quantity),
      },
    });

    return { url: session.url };
  });
