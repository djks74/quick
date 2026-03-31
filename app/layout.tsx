import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import FloatingAssistant from "@/components/ai/FloatingAssistant";

export const metadata: Metadata = {
  title: "Gercep",
  description: "Gercep - Digital Menu & Store",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" }
    ],
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const theme = localStorage.getItem('theme');
                  const ua = navigator.userAgent || '';
                  const isWhatsApp = /WhatsApp/i.test(ua);
                  const isDark = isWhatsApp || theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
                  if (isDark) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="font-sans antialiased min-h-screen bg-white dark:bg-[#0b1220]">
        <Providers>
          {children}
          <FloatingAssistant />
        </Providers>
      </body>
    </html>
  );
}
