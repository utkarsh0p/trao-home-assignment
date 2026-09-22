import Button from "@/components/Button";
import { CursorMark } from "@/components/Wordmark";

export default function Outro() {
  return (
    <section className="bg-paper px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
      <div className="mx-auto w-full max-w-[1320px]">
        <div className="relative overflow-hidden rounded-[30px] bg-accent px-6 py-20 text-center sm:px-10 lg:rounded-[36px] lg:py-28">
          <CursorMark
            className="pointer-events-none absolute -right-10 -top-6 size-[260px] rotate-12
                       text-white/10 sm:size-[340px] lg:size-[420px]"
          />

          <div className="relative mx-auto flex max-w-[840px] flex-col items-center">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/60 sm:text-xs">
              Your next interview
            </span>

            <h2 className="mt-4 text-[30px] font-semibold leading-[1.08] tracking-[-0.04em] text-white sm:text-[38px] lg:text-5xl">
              Stop guessing what they&rsquo;ll ask.
            </h2>

            <p className="mt-4 max-w-[560px] text-[15px] leading-[1.55] tracking-[-0.015em] text-white/70 sm:mt-5 sm:text-xl">
              One posting, one company, however many days you have left.
            </p>

            <div className="mt-8 flex w-full flex-col gap-3 sm:mt-10 sm:w-auto sm:flex-row">
              <Button href="/new" variant="onDark" className="w-full sm:w-auto">
                Create a prep kit
              </Button>
              <Button href="/login" variant="dark" className="w-full sm:w-auto">
                Sign in
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
