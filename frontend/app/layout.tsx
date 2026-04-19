import type { Metadata } from "next";
import { Inter, Space_Grotesk } from 'next/font/google';
import { Providers } from './providers';
import logoImage from './logo.jpg';
import "./globals.css";

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', weight: ['400', '500', '600', '700'] });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-display', weight: ['400', '500', '700'] });

export const metadata: Metadata = {
  title: "Mersi",
  description: "AI-powered shopping assistant",
  icons: { icon: logoImage.src, apple: logoImage.src },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${spaceGrotesk.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
