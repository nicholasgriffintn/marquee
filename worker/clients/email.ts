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

export async function sendAlertEmail(
  env: Bindings,
  to: string,
  items: { headline: string; detail: string; url: string }[],
) {
  if (!env.EMAIL || !env.MAIL_FROM || items.length === 0) {
    return;
  }

  const lines = items.flatMap((item) => [item.headline, item.detail, item.url, ""]);

  try {
    await env.EMAIL.send({
      to,
      from: { email: env.MAIL_FROM, name: "The Usher" },
      subject:
        items.length === 1 ? items[0].headline : `${items.length} things worth knowing about`,
      text: [
        "Evening.",
        "",
        items.length === 1 ? "One thing you were waiting on." : "A few things you were waiting on.",
        "",
        ...lines,
        "I will not mention any of them again.",
        "",
        "The Usher",
      ].join("\n"),
    });
  } catch (error) {
    logError("alert_email_failed", error);
  }
}

export async function sendAddressConfirmation(env: Bindings, to: string, link: string) {
  if (!env.EMAIL || !env.MAIL_FROM) {
    throw new Error("Email delivery is not configured");
  }

  try {
    await env.EMAIL.send({
      to,
      from: { email: env.MAIL_FROM, name: "The Usher" },
      subject: "Is this you?",
      text: [
        "Evening.",
        "",
        "Somebody asked me to send word here when something they were waiting on turns up.",
        "If that was you, say so:",
        link,
        "",
        "If it was not, do nothing. I will not write again.",
        "",
        "The Usher",
      ].join("\n"),
    });
  } catch (error) {
    logError("address_confirmation_failed", error);

    throw new Error("Could not send that email", { cause: error });
  }
}
