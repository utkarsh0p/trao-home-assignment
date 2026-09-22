import Hero from "@/components/home/Hero";
import HowItWorks from "@/components/home/HowItWorks";

// One home page for both states rather than a marketing page and a dashboard. It is
// entirely static and server-rendered; the signed-in kit list lives at /mykits.

export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
    </>
  );
}
