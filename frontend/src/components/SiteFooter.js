import Link from "next/link";
import Wordmark from "@/components/Wordmark";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/new", label: "Create a kit" },
      { href: "/mykits", label: "My kits" },
    ],
  },
  {
    title: "About",
    links: [{ href: "/#how-it-works", label: "How it works" }],
  },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-ink/10 bg-surface px-5 py-16 sm:px-8 lg:px-12">
      <div className="mx-auto w-full max-w-[1320px]">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr]">
          <div>
            <Wordmark size="sm" />
            <p className="mt-4 max-w-[320px] text-[15px] leading-[1.6] text-ink/60">
              Interview prep built from the job description you were actually sent, and
              the company that actually sent it.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/60 sm:text-xs">
                {column.title}
              </h2>
              <ul className="mt-4 flex flex-col gap-3">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="rounded-lg text-[15px] font-medium text-ink/60 transition-colors
                                 duration-200 hover:text-ink focus-visible:outline-none
                                 focus-visible:ring-2 focus-visible:ring-accent
                                 focus-visible:ring-offset-2"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-ink/10 pt-6 text-sm font-medium text-ink/50 sm:flex-row sm:items-center sm:justify-between">
          <p>Built for the Trao full-stack assessment.</p>
          <p>&copy; {new Date().getFullYear()} cember.</p>
        </div>
      </div>
    </footer>
  );
}
