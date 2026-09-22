import Link from "next/link";

// style.md §6: one shared base, exactly one variant tail, exactly one size tail.
// Everything clickable in the app goes through here so the focus ring and the
// hover lift are never re-typed (or forgotten).

const BASE =
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl " +
  "font-semibold transition-[background-color,border-color,color,box-shadow,transform] " +
  "duration-200 hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 " +
  "disabled:pointer-events-none disabled:opacity-50";

const VARIANTS = {
  primary: "bg-accent text-white shadow-accent hover:bg-accent-dark",
  dark: "bg-ink text-white shadow-soft hover:bg-black",
  secondary:
    "border border-ink/20 bg-white/60 text-ink hover:border-ink/40 hover:bg-surface",
  ghost: "text-ink/60 hover:bg-ink/5 hover:text-ink",
  onDark: "bg-surface text-ink shadow-soft hover:bg-paper",
};

const SIZES = {
  sm: "h-10 px-4 text-sm",
  md: "h-11 px-5 text-[15px] sm:h-12 sm:px-6",
  icon: "size-10 rounded-xl p-0",
};

export default function Button({
  href,
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}) {
  const classes = `${BASE} ${VARIANTS[variant] ?? VARIANTS.primary} ${
    SIZES[size] ?? SIZES.md
  } ${className}`;

  if (href) {
    return (
      <Link href={href} className={classes} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} {...props}>
      {children}
    </button>
  );
}
