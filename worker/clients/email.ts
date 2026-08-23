import { logError } from "../lib/logging.ts";
import type { Bindings } from "../types.ts";

export function emailConfigured(env: Bindings) {
  return Boolean(env.EMAIL && env.MAIL_FROM);
}

export async function sendSignInEmail(env: Bindings, to: string, link: string, expiresAt: Date) {
  if (!env.EMAIL || !env.MAIL_FROM) {
    console.log(JSON.stringify({ event: "magic_link_unsent", reason: "not_configured" }));

    throw new Error("Email delivery is not configured");
  }

  const minutes = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60_000));

  try {
    await env.EMAIL.send({
      to,
      from: { email: env.MAIL_FROM, name: "The Usher" },
      subject: "Your ticket to Marquee",
      text: [
        "Evening.",
        "",
        `Your seat is through here: ${link}`,
        "",
        `The link works once, and only for the next ${minutes} minutes.`,
        "If you did not ask for this, someone has the wrong door. Ignore it.",
        "",
        "The Usher",
      ].join("\n"),
    });
  } catch (error) {
    logError("magic_link_send_failed", error);

    throw new Error("Could not send that email", { cause: error });
  }
}
