// A made-up, obviously-not-real name for a call's caller ("Brave Otter"), so
// calls are easy to tell apart and talk about. Deterministic: the same call id
// always gets the same name, like its avatar. Deliberately not a person's name,
// so it's never mistaken for the real caller (whose name may be in what the
// agent collected).

const ADJECTIVES = [
  "Brave",
  "Calm",
  "Clever",
  "Cosy",
  "Curious",
  "Daring",
  "Eager",
  "Fancy",
  "Gentle",
  "Happy",
  "Jolly",
  "Kind",
  "Lively",
  "Lucky",
  "Merry",
  "Mighty",
  "Nimble",
  "Patient",
  "Plucky",
  "Polite",
  "Quick",
  "Quiet",
  "Sunny",
  "Swift",
  "Tidy",
  "Bold",
  "Witty",
  "Zesty",
  "Bright",
  "Cheerful",
  "Breezy",
  "Snappy",
] as const;

const ANIMALS = [
  "Otter",
  "Fox",
  "Panda",
  "Koala",
  "Badger",
  "Heron",
  "Lynx",
  "Moose",
  "Owl",
  "Puffin",
  "Rabbit",
  "Seal",
  "Sparrow",
  "Tiger",
  "Walrus",
  "Whale",
  "Beaver",
  "Bison",
  "Crane",
  "Dolphin",
  "Falcon",
  "Gecko",
  "Hedgehog",
  "Ibex",
  "Jaguar",
  "Lemur",
  "Llama",
  "Marmot",
  "Narwhal",
  "Penguin",
  "Raccoon",
  "Yak",
] as const;

/** FNV-1a: a small, well-spread 32-bit hash of a string. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/** The caller's generated name for a call, e.g. "Brave Otter" (1,024 combinations). */
export function callerName(callId: string): string {
  const value = hash(callId);
  const adjective = ADJECTIVES[value % ADJECTIVES.length] ?? ADJECTIVES[0];
  const animal = ANIMALS[Math.floor(value / ADJECTIVES.length) % ANIMALS.length] ?? ANIMALS[0];
  return `${adjective} ${animal}`;
}
