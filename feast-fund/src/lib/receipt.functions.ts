import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ScannedReceipt = {
  restaurant: string | null;
  items: { name: string; price: number }[];
  tax: number;
  tip: number;
};

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
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Receipt scanning is not available right now.");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [
          {
            role: "system",
            content:
              "You read restaurant receipts. Reply with JSON only, no markdown fences, shaped exactly as " +
              '{"restaurant": string|null, "items": [{"name": string, "price": number}], "tax": number, "tip": number}. ' +
              "Prices are decimal numbers in the receipt currency. Exclude subtotal/total/tax/tip rows from items. " +
              "If a value is missing use 0 or null.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the line items, tax and tip from this receipt." },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI gateway error", response.status, await response.text());
      if (response.status === 429) throw new Error("Too many scans right now — try again in a minute.");
      throw new Error("Could not read that receipt. Try a clearer photo or add items by hand.");
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = payload.choices?.[0]?.message?.content ?? "";
    const jsonText = raw.replace(/```json|```/g, "").trim();

    try {
      const parsed = JSON.parse(jsonText) as ScannedReceipt;
      return {
        restaurant: typeof parsed.restaurant === "string" ? parsed.restaurant : null,
        items: Array.isArray(parsed.items)
          ? parsed.items
              .filter((item) => item && typeof item.name === "string")
              .map((item) => ({ name: item.name, price: Number(item.price) || 0 }))
          : [],
        tax: Number(parsed.tax) || 0,
        tip: Number(parsed.tip) || 0,
      };
    } catch {
      throw new Error("Could not read that receipt. Try a clearer photo or add items by hand.");
    }
  });
