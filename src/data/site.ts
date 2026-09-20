/** Verified identity and contact values. Nothing here is guessed. */
export const SITE = {
  name: 'Shengyi Wei',
  role: 'Digital Design / Computer Architecture',
  github: 'https://github.com/hard-won',
  email: 'hardtowon@gmail.com',
  /**
   * Additional profile links drop in here as { label, href } and render
   * automatically on the homepage and /about. Nothing is listed until the URL
   * is confirmed.
   */
  links: [] as Array<{ label: string; href: string }>,
} as const;

export const FRAMING =
  'Understanding how real AI workloads become memory traffic and network traffic, and letting that understanding drive architecture, simulation, and RTL.';
