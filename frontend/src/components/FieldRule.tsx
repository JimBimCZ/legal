/** Segments in the wordmark's measure. Fixed, since the wordmark isn't
 * measuring anything - it's the same mark with every tick struck. */
const MARK_SEGMENTS = 8;

interface FieldRuleProps {
  filled: number;
  total: number;
  /** "mark" is the wordmark: every tick struck, decorative, no label. */
  variant?: "meter" | "mark";
  className?: string;
}

/**
 * The signature: the mark is the meter.
 *
 * A ruled measure with one tick per field, struck solid left to right as the
 * chat answers them. The same mark with every tick struck is the wordmark, so
 * the thing in the masthead and the thing tracking your progress are one
 * object seen at two states.
 *
 * Rendered as segments rather than an SVG because the tick count is the
 * document's field count - anywhere from 4 to 25 - and flex divides a rule
 * into N parts at any width without arithmetic.
 */
export function FieldRule({ filled, total, variant = "meter", className = "" }: FieldRuleProps) {
  const isMark = variant === "mark";
  // A template with no fields still needs one segment to draw, or the rule
  // collapses to nothing.
  const segments = isMark ? MARK_SEGMENTS : Math.max(total, 1);
  const struck = isMark ? MARK_SEGMENTS : Math.min(Math.max(filled, 0), segments);

  const meterProps = isMark
    ? ({ "aria-hidden": true } as const)
    : ({
        role: "progressbar",
        "aria-valuenow": filled,
        "aria-valuemin": 0,
        "aria-valuemax": total,
        "aria-label": `${filled} of ${total} fields filled`,
      } as const);

  // The wordmark is set finer than the meter: at wordmark size a 6px rule
  // reads as a row of blocks rather than as a measure.
  return (
    <div className={`flex gap-px ${isMark ? "h-[3px]" : "h-1.5"} ${className}`} {...meterProps}>
      {Array.from({ length: segments }, (_, index) => (
        <span
          key={index}
          className={`flex-1 transition-colors duration-300 ${
            index < struck ? "bg-ink" : "bg-line"
          }`}
        />
      ))}
    </div>
  );
}
