import type { Metadata, Viewport } from "next";
import "@fontsource-variable/archivo";
import "./globals.css";
import { BrandingProvider } from "@/components/providers/BrandingProvider";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "GSS",
  description: "HRIS & Workforce Management",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>
        <BrandingProvider>{children}</BrandingProvider>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
