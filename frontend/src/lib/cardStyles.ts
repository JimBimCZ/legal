/**
 * Shared styling for the clickable card grids used by DocumentMenu (catalog
 * types) and Dashboard (saved documents).
 *
 * Cards are deliberately uniform. An earlier pass gave each document type its
 * own accent colour, which made the grid read as a paint chart; the mono
 * docket code (NDA, CSA, DPA...) identifies a type on its own, so the colour
 * was carrying no information the label wasn't already carrying.
 */
export const cardGridClassName = "grid grid-cols-1 gap-4 sm:grid-cols-2";

export const cardButtonClassName = "groove-card group";

export const cardTitleClassName = "type-display text-lg text-heading";
