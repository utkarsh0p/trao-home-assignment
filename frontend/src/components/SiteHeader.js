"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Button from "@/components/Button";
import Wordmark from "@/components/Wordmark";
import { useSession } from "@/lib/session";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/mykits", label: "My kits" },
];

// [ logo ] — [ Home · My kits ] — [ New kit · profile ]
//
// Only the home page pins the bar. There, past the first scroll it narrows, rounds and
// picks up a blurred white fill: the full-width header becomes a floating dock, one
// transition driving all of it. Everywhere else the bar sits in the flow and scrolls
// away with the page — the content views need the height back.

export default function SiteHeader() {
  const scrolled = useScrolled(24);
  const pathname = usePathname();
  const pinned = pathname === "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPath, setMenuPath] = useState(pathname);
  const menuButtonRef = useRef(null);

  // Route changes close the menu; nobody expects it to survive a navigation. Adjusted
  // during render rather than in an effect, so the panel never paints on the new page.
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <header
      className={`pointer-events-none z-50 h-20 w-full px-5 sm:px-8 lg:px-12 ${
        pinned ? "sticky top-0" : "relative"
      }`}
    >
      <div
        className={`pointer-events-auto mx-auto grid h-12 w-full translate-y-4
                    grid-cols-[1fr_auto_1fr] items-center gap-4 border border-transparent
                    transition-[max-width,padding,border-radius,border-color,background-color,box-shadow]
                    duration-500 ease-in-out ${
                      pinned && scrolled
                        ? "max-w-[940px] rounded-full border-ink/10 bg-white/75 px-4 shadow-soft backdrop-blur"
                        : "max-w-[1320px] rounded-xl"
                    }`}
      >
        <div className="flex items-center">
          <Link
            href="/"
            aria-label="cember., home"
            className="rounded-lg transition-opacity duration-200 hover:opacity-80
                       focus-visible:outline-none focus-visible:ring-2
                       focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            <Wordmark size="sm" />
          </Link>
        </div>

        <nav aria-label="Main" className="hidden md:flex md:gap-7">
          {NAV.map((item) => (
            <NavLink key={item.href} {...item} pathname={pathname} />
          ))}
        </nav>

        {/* col-start-3 is load-bearing: below md the nav is display:none, and without it
            auto-placement would drop this into the middle column. */}
        <div className="col-start-3 flex items-center justify-end gap-2">
          {/* Below md the row collapses to [ logo ] — [ hamburger ]; the account chip and
              the New kit button move inside the panel rather than crowding the bar. */}
          <div className="hidden items-center gap-2 md:flex">
            <AccountSlot />
            <Button href="/new" variant="dark" size="sm">
              New kit
            </Button>
          </div>

          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="inline-flex size-10 cursor-pointer items-center justify-center rounded-lg
                       text-ink/60 transition-colors duration-200 hover:bg-ink/5 hover:text-ink
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
                       focus-visible:ring-offset-2 md:hidden"
          >
            <MenuGlyph open={menuOpen} />
          </button>
        </div>
      </div>

      {menuOpen && <MobilePanel pathname={pathname} />}
    </header>
  );
}

function NavLink({ href, label, pathname }) {
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-lg text-sm font-medium transition-colors duration-200 hover:text-ink
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
                  focus-visible:ring-offset-2 ${active ? "text-ink" : "text-ink/60"}`}
    >
      {label}
    </Link>
  );
}

/* Signed out this is "Sign in"; signed in it is the profile chip. While we are still
   asking the API it renders nothing — the New kit button holds the row's width either
   way, so there is no jump when the answer arrives. */
function AccountSlot() {
  const { status, user } = useSession();

  if (status === "loading") return null;

  if (status === "authenticated") {
    return (
      <Link
        href="/profile"
        title={user?.email}
        aria-label={`Profile — ${user?.email ?? "account"}`}
        className="inline-flex size-9 items-center justify-center rounded-full bg-ink text-sm
                   font-semibold uppercase text-white transition-transform duration-200
                   hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2
                   focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        {user?.email?.[0] ?? "?"}
      </Link>
    );
  }

  return (
    <Button href="/login" variant="ghost" size="sm">
      Sign in
    </Button>
  );
}

function MobilePanel({ pathname }) {
  const { status } = useSession();

  return (
    <div
      id="mobile-nav"
      className="pointer-events-auto mx-auto mt-6 w-full max-w-[1320px] rounded-2xl border
                 border-ink/10 bg-white/95 p-2 shadow-float backdrop-blur md:hidden"
    >
      <nav aria-label="Main" className="flex flex-col">
        {NAV.map((item) => (
          <MobileLink key={item.href} {...item} pathname={pathname} />
        ))}
        <MobileLink href="/new" label="New kit" pathname={pathname} />
        {status === "authenticated" ? (
          <MobileLink href="/profile" label="Profile" pathname={pathname} />
        ) : (
          status === "unauthenticated" && (
            <>
              <MobileLink href="/login" label="Sign in" pathname={pathname} />
              <MobileLink href="/register" label="Create an account" pathname={pathname} />
            </>
          )
        )}
      </nav>
    </div>
  );
}

function MobileLink({ href, label, pathname }) {
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`truncate rounded-lg px-3 py-3 text-[15px] font-medium transition-colors
                  duration-200 hover:bg-ink/5 hover:text-ink focus-visible:outline-none
                  focus-visible:ring-2 focus-visible:ring-accent ${
                    active ? "text-ink" : "text-ink/60"
                  }`}
    >
      {label}
    </Link>
  );
}

function MenuGlyph({ open }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none"
         stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      {open ? (
        <>
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </>
      ) : (
        <>
          <path d="M4 8h16" />
          <path d="M4 16h16" />
        </>
      )}
    </svg>
  );
}

/* rAF-throttled so the listener costs one class swap per frame at most. */
function useScrolled(threshold) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let frame = 0;

    const read = () => {
      frame = 0;
      setScrolled(window.scrollY > threshold);
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(read);
    };

    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [threshold]);

  return scrolled;
}
