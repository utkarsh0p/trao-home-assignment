"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/Button";
import ErrorCallout from "@/components/ErrorCallout";
import Field from "@/components/Field";
import { login, register } from "@/lib/api";
import { checkEmail, checkPassword, parseFieldErrors } from "@/lib/validation";
import { useSession } from "@/lib/session";

// One form, two modes. The only real differences are the endpoint, the copy, and the
// minimum password length — the server enforces 8 on register and merely "present" on
// login, and mirroring that exactly keeps an old short password still usable.

const COPY = {
  login: {
    title: "Welcome back.",
    lead: "Sign in to pick up the kits you have already built.",
    submit: "Sign in",
    pending: "Signing in…",
    footer: "New here?",
    footerLink: { href: "/register", label: "Create an account" },
    passwordMin: 1,
  },
  register: {
    title: "Create an account.",
    lead: "You will need one to keep the kits you build. Nothing else is required.",
    submit: "Create account",
    pending: "Creating account…",
    footer: "Already have an account?",
    footerLink: { href: "/login", label: "Sign in" },
    passwordMin: 8,
  },
};

export default function AuthForm({ mode }) {
  const copy = COPY[mode];
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useSession();

  const [values, setValues] = useState({ email: "", password: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [pending, setPending] = useState(false);

  const set = (field) => (event) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    if (fieldErrors[field]) {
      setFieldErrors((current) => ({ ...current, [field]: null }));
    }
  };

  const validate = () => ({
    email: checkEmail(values.email),
    password: checkPassword(values.password, { min: copy.passwordMin }),
  });

  async function onSubmit(event) {
    event.preventDefault();

    const next = validate();
    if (next.email || next.password) {
      setFieldErrors(next);
      setFormError(null);
      return;
    }

    setPending(true);
    setFieldErrors({});
    setFormError(null);

    try {
      const credentials = {
        email: values.email.trim().toLowerCase(),
        password: values.password,
      };
      const user = mode === "register" ? await register(credentials) : await login(credentials);

      // Seed the session from the response rather than round-tripping /me again.
      setUser(user);
      router.replace(searchParams.get("next") || "/");
    } catch (error) {
      // The server flattens field errors into one "field: reason; field: reason" string.
      // Put them back on the fields when we can; otherwise show it at form level.
      if (error.code === "VALIDATION_FAILED") {
        const parsed = parseFieldErrors(error.message);
        if (parsed.email || parsed.password) {
          setFieldErrors(parsed);
          setPending(false);
          return;
        }
      }
      setFormError(error);
      setPending(false);
    }
  }

  return (
    <section className="bg-paper px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
      <div className="mx-auto w-full max-w-[440px]">
        <div className="flex flex-col items-center text-center">
          <h1 className="text-[38px] font-semibold leading-[1.05] tracking-[-0.045em] text-ink sm:text-5xl">
            {copy.title}
          </h1>
          <p className="mt-4 text-[15px] leading-[1.55] text-ink/60 sm:text-base">
            {copy.lead}
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          noValidate
          className="mt-8 rounded-2xl border border-ink/10 bg-surface p-6 shadow-lifted sm:p-8"
        >
          {formError && (
            <div className="mb-6">
              <ErrorCallout error={{ ...formError, message: messageFor(formError) }}>
                {formError.code === "INVALID_CREDENTIALS" && mode === "login" && (
                  <InlineLink href="/register">Create an account instead</InlineLink>
                )}
                {formError.code === "EMAIL_TAKEN" && (
                  <InlineLink href="/login">Sign in instead</InlineLink>
                )}
              </ErrorCallout>
            </div>
          )}

          <Field
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={values.email}
            onChange={set("email")}
            onBlur={() => setFieldErrors((c) => ({ ...c, email: checkEmail(values.email) }))}
            error={fieldErrors.email}
            disabled={pending}
          />

          <Field
            id="password"
            label="Password"
            type="password"
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
            value={values.password}
            onChange={set("password")}
            onBlur={() =>
              setFieldErrors((c) => ({
                ...c,
                password: checkPassword(values.password, { min: copy.passwordMin }),
              }))
            }
            error={fieldErrors.password}
            disabled={pending}
            className="mt-5"
          />

          <Button
            type="submit"
            variant="primary"
            disabled={pending}
            className="mt-7 w-full"
          >
            {pending ? copy.pending : copy.submit}
          </Button>
        </form>

        <p className="mt-6 text-center text-[15px] font-medium text-ink/60">
          {copy.footer}{" "}
          <Link
            href={copy.footerLink.href}
            className="rounded-lg font-semibold text-accent transition-colors duration-200
                       hover:text-accent-dark focus-visible:outline-none focus-visible:ring-2
                       focus-visible:ring-accent focus-visible:ring-offset-4"
          >
            {copy.footerLink.label}
          </Link>
        </p>
      </div>
    </section>
  );
}

/* Say what to do next, not just what went wrong. */
function messageFor(error) {
  switch (error.code) {
    case "TOO_MANY_ATTEMPTS":
      return "Too many sign-in attempts from this network. Try again in about 15 minutes.";
    case "NETWORK_UNREACHABLE":
      return "Could not reach the server. It sleeps when idle, so give it a few seconds and try again.";
    default:
      return error.message;
  }
}

function InlineLink({ href, children }) {
  return (
    <Link
      href={href}
      className="rounded-lg text-[15px] font-semibold text-ink underline underline-offset-4
                 transition-colors duration-200 hover:text-accent focus-visible:outline-none
                 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
    >
      {children}
    </Link>
  );
}

/** Stands in while the ?next=-reading client tree hydrates. */
export function AuthFormFallback() {
  return (
    <section className="bg-paper px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
      <div className="mx-auto h-[420px] w-full max-w-[440px] animate-pulse rounded-2xl bg-ink/[0.04]" />
    </section>
  );
}
