// Breadlet Breaks Bad, the upcoming event. Its Breadlets exist (migration 0087) so admins can
// give them out, but nothing drops them yet.
export const BREAKING_BAD_BREADLETS = [
  { name: "Heisenberg Sketch", art: "/assets/breaking-bad/heisenberg-sketch.png" },
  { name: "Methylamine", art: "/assets/breaking-bad/methylamine.png" },
  { name: "Gus Fring", art: "/assets/breaking-bad/gus-fring.svg" },
  { name: "Flask", art: "/assets/breaking-bad/flask.svg" },
];

export const BREAKING_BAD_NAMES = BREAKING_BAD_BREADLETS.map((breadlet) => breadlet.name);
