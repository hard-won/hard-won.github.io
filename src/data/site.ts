/** Verified identity and contact values. Nothing here is guessed. */
export const SITE = {
  name: 'Shengyi Wei',
  role: 'Digital Design / Computer Architecture',
  github: 'https://github.com/hard-won',
  email: 'sean02050801@gmail.com',
  /**
   * Additional profile links drop in here as { label, href } and render
   * automatically on the homepage and /about. Nothing is listed until the URL
   * is confirmed.
   */
  links: [
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/shengyi-wei' },
    { label: 'X', href: 'https://x.com/TraderTheSean' },
  ] as Array<{ label: string; href: string }>,
} as const;

export const FRAMING =
  "From the hardware's side, an inference run is a traffic pattern. I work on reading that pattern off real workloads, and on what follows from it: memory systems, on-chip and chip-to-chip networks, and the RTL underneath.";
