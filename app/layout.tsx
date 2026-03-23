import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { UiShell } from "@/components/ui-shell";

export const metadata: Metadata = {
  title: "Tenure Facility Annual Report 2024 Platform",
  description:
    "Immersive map-led editorial dashboard built from the Tenure Facility Annual Report 2024.",
  metadataBase: new URL("https://tenure-facility-report.local")
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="atmosphere" aria-hidden="true" />
        <SiteHeader />
        <UiShell />
        <main className="site-main">{children}</main>
      </body>
    </html>
  );
}
