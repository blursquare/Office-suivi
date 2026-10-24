import { useId, type SVGProps } from "react";

// Lucide "sparkle", the same ✦ as the CLAIRE button next to the inbox.
const STAR =
  "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z";
// Star centred on the bottom-right corner, ~5.3 px wide on the 16 px grid.
const STAR_TRANSFORM = "translate(13.1 13.1) scale(0.25) translate(-12 -12)";
const BODY =
  "M1.5 8C1.5 4.7 3.9 2.25 7.5 2.25C11.1 2.25 13.5 4.7 13.5 8V10.25C13.5 12.3 12.2 13.75 10 13.75H5C2.8 13.75 1.5 12.3 1.5 10.25Z";

// useId() can contain ":" or "«»", which some browsers reject inside url(#…).
const useMaskId = (prefix: string) => `${prefix}-${useId().replace(/[^\w-]/g, "")}`;

/** The mochi-robot on a 16 px grid, drawn in `color`. */
function Symbol({ color, maskId }: { color: string; maskId: string }) {
  return (
    <>
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16">
          <rect width="16" height="16" fill="#fff" />
          {/* Wide stroke = the gap the star bites out of the outline (~0.8 px). */}
          <path d={STAR} transform={STAR_TRANSFORM} fill="#000" stroke="#000" strokeWidth={8.6} strokeLinejoin="round" />
        </mask>
      </defs>
      <g mask={`url(#${maskId})`}>
        <path d={BODY} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
        <rect x="5" y="6.2" width="1.5" height="2.6" rx="0.75" fill={color} />
        <rect x="8.5" y="6.2" width="1.5" height="2.6" rx="0.75" fill={color} />
        <path d="M6.1 10.3Q7.5 11.2 8.9 10.3" fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      </g>
      <path d={STAR} transform={STAR_TRANSFORM} fill={color} stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </>
  );
}

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  /** Rendered size in px. 20–24 in the sidebar, 32 as an avatar. */
  size?: number;
  /** Accessible name; omit when the icon sits next to a visible label. */
  title?: string;
};

/** « Discussions » sidebar icon. Takes the text colour (currentColor). */
export function DiscussionsIcon({ size = 20, title, ...rest }: IconProps) {
  const maskId = useMaskId("claire-discussions");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      {...rest}
    >
      {title && <title>{title}</title>}
      <Symbol color="currentColor" maskId={maskId} />
    </svg>
  );
}

/** App tile: white rounded square, symbol in sidebar anthracite. */
export function DiscussionsAppIcon({ size = 64, title, ...rest }: IconProps) {
  const maskId = useMaskId("claire-discussions-app");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      {...rest}
    >
      {title && <title>{title}</title>}
      <rect width="64" height="64" rx="16" fill="#FFFFFF" />
      <g transform="translate(14 14) scale(2.25)">
        <Symbol color="#1B1E23" maskId={maskId} />
      </g>
    </svg>
  );
}
