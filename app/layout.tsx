import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap", // Faster text rendering on slow connections
});

export const metadata: Metadata = {
  title: {
    default: "Edvora",
    template: "%s | Edvora",
  },
  description:
    "Edvora — Engineering Technology tuition learning platform. Access your batch lessons and announcements.",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
  },
  robots: {
    index: false, // Private platform — keep out of search engines
    follow: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5, // Allow zoom for accessibility
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full`}>
      <body className="min-h-full bg-background text-foreground antialiased">
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
