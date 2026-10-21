import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { PwaRegister } from "@/components/pwa-register";

export const viewport = {
  themeColor: "#13232b",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "DrivePrep — China Driving Theory",
  description: "Bilingual practice for China's driving theory exams.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <PwaRegister />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
