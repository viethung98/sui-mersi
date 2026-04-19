export interface ShoppingPreferenceProfile {
  country?: string | null
  topsSize?: string | null
  bottomsSize?: string | null
  footwearSize?: string | null
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function buildShoppingPreferenceFacts(
  profile: ShoppingPreferenceProfile,
): string[] {
  const facts: string[] = []

  const country = clean(profile.country)
  const topsSize = clean(profile.topsSize)
  const bottomsSize = clean(profile.bottomsSize)
  const footwearSize = clean(profile.footwearSize)

  if (country) {
    facts.push(`Shopper is based in country code ${country}.`)
  }
  if (topsSize) {
    facts.push(`Preferred tops size is ${topsSize}.`)
  }
  if (bottomsSize) {
    facts.push(`Preferred bottoms size is ${bottomsSize}.`)
  }
  if (footwearSize) {
    facts.push(`Preferred footwear size is ${footwearSize}.`)
  }

  return facts
}

export function formatShoppingPreferenceContext(memories: string[]): string | null {
  const unique = Array.from(
    new Set(
      memories
        .map((memory) => clean(memory))
        .filter((memory): memory is string => !!memory),
    ),
  )

  if (!unique.length) return null

  return [
    "Remembered shopper preferences:",
    ...unique.map((memory) => `- ${memory}`),
  ].join("\n")
}
