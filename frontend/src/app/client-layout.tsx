'use client';

import "./globals.css";
import { Inter } from "next/font/google";
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from '@/theme';
import { AuthProvider } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import RouteGuard from '@/components/RouteGuard';

const inter = Inter({ subsets: ["latin"] });

function ClientLayoutContent({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <Header />
          <RouteGuard>{children}</RouteGuard>
        </ThemeProvider>
      </body>
    </html>
  );
}

export default function ClientLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthProvider>
      <ClientLayoutContent>{children}</ClientLayoutContent>
    </AuthProvider>
  );
} 