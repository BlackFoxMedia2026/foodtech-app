/**
 * Custom nav icons for concepts lucide-react doesn't cover, drawn to match
 * lucide's own convention exactly: 24x24 viewBox, stroke-only, currentColor,
 * round caps/joins — so they sit visually identical to the library icons
 * they sit next to in the sidebar.
 */

type IconProps = {
  size?: number;
  className?: string;
  strokeWidth?: number;
};

/** Dining table with four chairs, top-down view — used for "Sala". */
export function DiningTableIcon({ size = 24, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <rect x="9.25" y="1.5" width="5.5" height="3" rx="1" />
      <rect x="9.25" y="19.5" width="5.5" height="3" rx="1" />
      <rect x="1.5" y="9.25" width="3" height="5.5" rx="1" />
      <rect x="19.5" y="9.25" width="3" height="5.5" rx="1" />
    </svg>
  );
}

/**
 * Head-and-shoulders bust with a small centered bow tie — used for "Ospiti".
 * The silhouette matches lucide's own `UserRound` icon exactly (same circle
 * and shoulder arc), so it reads as the elegant variant of the plain person
 * icon used for "Camerieri", not an unrelated glyph — the bow tie is the
 * only difference between the two.
 */
export function TuxedoGuestIcon({ size = 24, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 0 0-16 0" />
      <path d="M8.7 13 12 14.5 8.7 16Z" fill="currentColor" stroke="none" />
      <path d="M15.3 13 12 14.5 15.3 16Z" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
