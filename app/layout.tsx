import type React from "react";
import "@/app/globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Video Compressor",
  description: "Compress your videos while maintaining quality",
  generator: "v0.dev",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="min-h-screen bg-background">
            <header className="container mx-auto p-4 flex justify-end">
              <ThemeToggle />
            </header>
            {children}
          </div>
          <Toaster position="top-center" richColors closeButton />
        </ThemeProvider>
        <VersionLabel />
        <script
          data-name="BMC-Widget"
          data-cfasync="false"
          src="https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js"
          data-id="wilsman77"
          data-description="Support me on Buy me a coffee!"
          data-message=""
          data-color="#5F7FFF"
          data-position="Right"
          data-x_margin="50"
          data-y_margin="50"
        ></script>
      </body>
    </html>
  );
}

export function VersionLabel() {
  return (
    <footer className="fixed bottom-0 left-0 w-full bg-gray-800/30 py-2 backdrop-blur-sm">
      <div className="w-full px-4">
        <div className="flex justify-end">
          <span className="text-xs text-gray-500">
            <a
              href="https://buymeacoffee.com/wilsman77"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300 transition-colors duration-200"
            >
              Wilsman77
            </a>{" "}
            updated on 11/08/2025
          </span>
        </div>
      </div>
    </footer>
  );
}

import "./globals.css";
