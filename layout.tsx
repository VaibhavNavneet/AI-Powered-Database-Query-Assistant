import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NL2SQL Chatbot",
  description: "Ask questions about your MySQL data in plain English.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
