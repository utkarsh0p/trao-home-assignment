import { DM_Sans } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/lib/session";
import Splash from "@/components/Splash";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata = {
  title: "primer. — interview prep built from the actual job",
  description:
    "Paste a job description, point us at the company, say how many days you have. primer. researches the company, writes a question against every requirement it found, and lays the work out day by day.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${dmSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SessionProvider>
          <Splash />
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </SessionProvider>
      </body>
    </html>
  );
}
