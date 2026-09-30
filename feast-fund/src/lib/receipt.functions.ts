import { createServerFn } from "@tanstack/react-start";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ScannedReceipt = {
  restaurant: string | null;
  items: { name: string; price: number }[];
  tax: number;
  tip: number;
};

const ReceiptSchema = z.object({
  restaurant: z.string().nullable(),
  items: z.array(z.object({ name: z.string(), price: z.number() })),
  tax: z.number(),
  tip: z.number(),
});

const SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type SupportedType = (typeof SUPPORTED_TYPES)[number];

/**
 * Reads a photo of a receipt and returns the line items it can find.
 * The image arrives as a data URL from the browser.
 */
export const scanReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { imageDataUrl: string }) => {
    if (!input?.imageDataUrl?.startsWith("data:image/")) {
      throw new Error("Please upload an image of the receipt.");
    }
    return input;
  })
  .handler(async ({ data }): Promise<ScannedReceipt> => {
    if (!process.env["ANTHROPIC_API_KEY"]) {
      throw new Error("Receipt scanning is not available right now.");
    }

    const match = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(data.imageDataUrl);
    const mediaType = match?.[1] as SupportedType | undefined;
    const imageData = match?.[2];
    if (!mediaType || !imageData || !SUPPORTED_TYPES.includes(mediaType)) {
      throw new Error("Use a JPEG, PNG, GIF or WebP photo of the receipt.");
    }

    const client = new Anthropic();

    const response = await client.beta.messages
      .parse({
        model: "claude-opus-5-5",
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: betaZodOutputFormat(ReceiptSchema) },
        system:
          "You read restaurant receipts. Prices are decimal numbers in the receipt currency. " +
          "Exclude subtotal, total, tax and tip rows from items. If a value is missing use 0 or null.",
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: imageData } },
              { type: "text", text: "Extract the line items, tax and tip from this receipt." },
            ],
          },
        ],
      })
      .catch((error: unknown) => {
        console.error("Claude API error", error);
        if (error instanceof Anthropic.RateLimitError) {
          throw new Error("Too many scans right now — try again in a minute.");
        }
        throw new Error("Could not read that receipt. Try a clearer photo or add items by hand.");
      });

    const parsed = response.stop_reason === "refusal" ? null : response.parsed_output;
    if (!parsed) {
      throw new Error("Could not read that receipt. Try a clearer photo or add items by hand.");
    }

    return {
      restaurant: parsed.restaurant,
      items: parsed.items.map((item) => ({ name: item.name, price: Number(item.price) || 0 })),
      tax: Number(parsed.tax) || 0,
      tip: Number(parsed.tip) || 0,
    };
  });
