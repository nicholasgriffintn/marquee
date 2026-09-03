export type ViewerAccess = {
  signedIn: boolean;
  adult: boolean;
  offensive: boolean;
};

export type ContentGate = "adult" | "offensive";

export type AccessRequirement = "sign-in" | "adult" | "offensive";

export type AccessPreferences = {
  adultConfirmed: boolean;
  offensiveContentApproved: boolean;
};

export const NO_ACCESS: ViewerAccess = { signedIn: false, adult: false, offensive: false };

export const FULL_ACCESS: ViewerAccess = { signedIn: true, adult: true, offensive: true };

export function accessFor(signedIn: boolean, preferences: AccessPreferences | null): ViewerAccess {
  const adult = signedIn && Boolean(preferences?.adultConfirmed);

  return { signedIn, adult, offensive: adult && Boolean(preferences?.offensiveContentApproved) };
}

export function admits(access: ViewerAccess, gate: ContentGate | null) {
  if (gate === null) {
    return true;
  }

  return gate === "adult" ? access.adult : access.offensive;
}

export function requirementFor(
  access: ViewerAccess,
  gate: ContentGate | null,
): AccessRequirement | null {
  if (admits(access, gate)) {
    return null;
  }

  if (!access.signedIn) {
    return "sign-in";
  }

  return access.adult ? "offensive" : "adult";
}

export function admitted<Item extends { gate: ContentGate | null }>(
  items: Item[],
  access: ViewerAccess,
) {
  return items.filter((item) => admits(access, item.gate));
}

export function accessTier(access: ViewerAccess) {
  if (access.offensive) {
    return "adult-offensive";
  }

  return access.adult ? "adult" : "";
}

export const REQUIREMENT_MESSAGES: Record<AccessRequirement, string> = {
  "sign-in": "This one is for adults. Sign in first and tell me so in your notebook.",
  adult: "This one is for adults. Say in your notebook that you are 18 or over.",
  offensive:
    "This print carries a content notice. Say in your notebook that you want such things shown.",
};
