const RINGS = 4;

/**
 * Inside out. One warm ramp rather than four separate hues - the mark reads as
 * a sunrise, not a colour wheel. `SunRule` below is this same ramp unrolled.
 */
const RING_COLORS = [
  "var(--color-sun-1)",
  "var(--color-sun-2)",
  "var(--color-sun-3)",
  "var(--color-sun-4)",
];

const RING_RADII = [16, 25, 34, 43];

const HORIZON = 52;
const CENTER_X = 60;

/** How many rings a given progress lights: none until the first field is
 * answered, and the outermost only once every field is. Everything in between
 * lands on 1-3, so the sun is never quite up while work remains. */
function litRings(filled: number, total: number): number {
  if (total <= 0 || filled <= 0) return 0;
  if (filled >= total) return RINGS;
  return Math.min(RINGS - 1, Math.max(1, Math.round((filled / total) * RINGS)));
}

function arc(radius: number): string {
  return `M ${CENTER_X - radius} ${HORIZON} A ${radius} ${radius} 0 0 1 ${CENTER_X + radius} ${HORIZON}`;
}

interface SunMeterProps {
  filled: number;
  total: number;
  /** "mark" is the wordmark's sun: always full, decorative, no label. */
  variant?: "meter" | "mark";
  className?: string;
}

/**
 * The signature: the logo is the progress bar. As the chat answers fields the
 * sun rises ring by ring, and once it is full the Download button turns the
 * sun's own marigold.
 */
export function SunMeter({ filled, total, variant = "meter", className }: SunMeterProps) {
  const isMark = variant === "mark";
  const lit = isMark ? RINGS : litRings(filled, total);
  const labelProps = isMark
    ? ({ "aria-hidden": true } as const)
    : ({
        role: "img",
        "aria-label": `${filled} of ${total} fields filled`,
      } as const);

  return (
    <svg viewBox="0 0 120 58" className={className} {...labelProps}>
      {RING_RADII.map((radius, index) => (
        <path
          key={radius}
          d={arc(radius)}
          fill="none"
          strokeWidth={6}
          stroke={index < lit ? RING_COLORS[index] : "var(--color-line)"}
          className="groove-ring"
        />
      ))}
      <path
        d={`M ${CENTER_X - 9} ${HORIZON} a 9 9 0 0 1 18 0 Z`}
        fill={isMark || filled > 0 ? "var(--color-marigold)" : "var(--color-line)"}
        className="groove-ring"
      />
      <line
        x1={CENTER_X - 52}
        y1={HORIZON + 1}
        x2={CENTER_X + 52}
        y2={HORIZON + 1}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The sun unrolled: the same four ring colours, in the same order, as a
 * hairline rule. Used under the masthead, the page heading, and the sign-in
 * card - one definition so the mark and the rule can never drift apart.
 */
export function SunRule({ className = "" }: { className?: string }) {
  return (
    <div className={`flex h-[3px] ${className}`} aria-hidden="true">
      {RING_COLORS.map((color) => (
        <span key={color} className="flex-1" style={{ background: color }} />
      ))}
    </div>
  );
}
