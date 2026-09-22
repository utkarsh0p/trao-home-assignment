"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/Button";
import ErrorCallout from "@/components/ErrorCallout";
import Field from "@/components/Field";
import { createJob } from "@/lib/api";
import { checkDays, normalizeCompanyUrl, parseFieldErrors } from "@/lib/validation";

// Below this a job description has almost nothing to extract. The brief tests exactly
// this case and says reporting it honestly beats inventing filler — so say it up front,
// before the run, rather than only in the finished kit.
const THIN_JD_CHARS = 200;

const DAY_PRESETS = [3, 5, 7, 14];
export const DRAFT_KEY = "cember:new-kit-draft";

export default function SingleRoleForm() {
  const router = useRouter();
  const [values, setValues] = useState(BLANK);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [pending, setPending] = useState(false);

  // Restoring from sessionStorage has to happen after mount, not in the initial state:
  // the server renders this too, and seeding from storage there would hydrate-mismatch.
  // Reading browser storage is the external-system case effects exist for; the lint rule
  // cannot distinguish it from derived state.
  useEffect(() => {
    const draft = readDraft();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (draft) setValues(draft);
  }, []);

  const jdChars = values.jd.trim().length;
  const thin = jdChars > 0 && jdChars < THIN_JD_CHARS;
  const normalized = values.companyUrl.trim() ? normalizeCompanyUrl(values.companyUrl) : null;

  const set = (field) => (event) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    if (fieldErrors[field]) setFieldErrors((current) => ({ ...current, [field]: null }));
  };

  async function onSubmit(event) {
    event.preventDefault();

    const url = normalizeCompanyUrl(values.companyUrl);
    const next = {
      jd: values.jd.trim() ? null : "Paste the job description.",
      companyUrl: url.ok ? null : url.error,
      days: checkDays(values.days),
    };
    if (next.jd || next.companyUrl || next.days) {
      setFieldErrors(next);
      setFormError(null);
      return;
    }

    setPending(true);
    setFieldErrors({});
    setFormError(null);

    // Kept so a failed run can offer "try again" with the inputs still filled in.
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(values));

    try {
      const { job } = await createJob({
        jd: values.jd,
        companyUrl: values.companyUrl.trim(),
        days: values.days,
      });

      // The run started, so the draft has done its job. Without this it outlives the
      // submit and the next New kit opens pre-filled with the last posting.
      sessionStorage.removeItem(DRAFT_KEY);

      // Dedupe can hand back a run that already finished — going to a progress screen
      // would poll a terminal job forever. Go straight to the kit.
      if (job.kitId) {
        router.replace(`/kits/${job.kitId}`);
        return;
      }
      router.push(`/jobs/${job.id}`);
    } catch (error) {
      if (error.code === "VALIDATION_FAILED") {
        const parsed = parseFieldErrors(error.message);
        if (Object.keys(parsed).length) {
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
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded-2xl border border-ink/10 bg-surface p-6 shadow-lifted sm:p-8"
    >
      {formError && (
        <div className="mb-6">
          <ErrorCallout title="Couldn't start the run." error={{ ...formError, message: messageFor(formError) }} />
        </div>
      )}

      <Field
        id="jd"
        label="Job description"
        textarea
        placeholder="Paste the whole posting — responsibilities, requirements, the lot."
        value={values.jd}
        onChange={set("jd")}
        error={fieldErrors.jd}
        disabled={pending}
      >
        <span className="text-sm font-medium tabular-nums text-ink/50">
          {jdChars.toLocaleString()} characters
        </span>
      </Field>

      {thin && !fieldErrors.jd && (
        <div className="mt-3 rounded-2xl bg-sand p-4">
          <p className="text-[15px] leading-[1.6] text-ink/70">
            <b className="font-semibold text-ink">That&rsquo;s very short.</b> We will build
            the kit from what is genuinely there and say plainly what was missing &mdash;
            we will not invent requirements to pad it out.
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field
          id="companyUrl"
          label="Company website"
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="acme.com"
          value={values.companyUrl}
          onChange={set("companyUrl")}
          onBlur={() => {
            if (!values.companyUrl.trim()) return;
            const result = normalizeCompanyUrl(values.companyUrl);
            setFieldErrors((c) => ({ ...c, companyUrl: result.ok ? null : result.error }));
          }}
          error={fieldErrors.companyUrl}
          hint={normalized?.ok ? `We'll start at ${normalized.url}` : "A bare domain is fine."}
          disabled={pending}
        />

        <Field
          id="days"
          label="Days until the interview"
          type="number"
          min={1}
          max={60}
          value={values.days}
          onChange={set("days")}
          error={fieldErrors.days}
          hint="Anywhere from 1 to 60."
          disabled={pending}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {DAY_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={pending}
            onClick={() => setValues((current) => ({ ...current, days: String(preset) }))}
            aria-pressed={String(preset) === String(values.days)}
            className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors
                        duration-200 focus-visible:outline-none focus-visible:ring-2
                        focus-visible:ring-accent focus-visible:ring-offset-2
                        disabled:pointer-events-none disabled:opacity-50 ${
                          String(preset) === String(values.days)
                            ? "bg-sky text-ink/70"
                            : "bg-ink/[0.04] text-ink/60 hover:bg-ink/[0.08]"
                        }`}
          >
            {preset} days
          </button>
        ))}
      </div>

      <Button type="submit" variant="primary" disabled={pending} className="mt-8 w-full sm:w-auto">
        {pending ? "Starting…" : "Build my prep kit"}
      </Button>

      <p className="mt-4 text-sm font-medium leading-relaxed text-ink/50">
        Takes about forty seconds. You can close the tab &mdash; it keeps running, and the
        kit lands in My kits either way.
      </p>
    </form>
  );
}

const BLANK = { jd: "", companyUrl: "", days: "5" };

/** The inputs from the last attempt, or null when there was no last attempt. */
function readDraft() {
  try {
    const stored = sessionStorage.getItem(DRAFT_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return parsed?.jd ? { ...BLANK, ...parsed } : null;
  } catch {
    return null;
  }
}

function messageFor(error) {
  if (error.code === "TOO_MANY_GENERATIONS") {
    return "You have used this hour's 20 generations. Regenerating a section draws on the same budget — try again shortly.";
  }
  if (error.code === "NETWORK_UNREACHABLE") {
    return "Could not reach the server. It sleeps when idle, so give it a few seconds and try again.";
  }
  return error.message;
}
