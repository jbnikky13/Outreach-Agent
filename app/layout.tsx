import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Outreach Agent",
  description: "AI-assisted email outreach with human approval before sending."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js?65" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
