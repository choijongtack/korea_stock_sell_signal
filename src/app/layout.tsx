import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Korea Stock Sell Signal",
  description: "Korean stock sell signal dashboard"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
