import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Marketplace Analytic Dashboard - Shopee, Tokopedia & Blibli',
  description:
    'Aplikasi riset produk, analisa harga, diskon penjual, kota penjual, dan performa penjualan di Shopee, Tokopedia, dan Blibli.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
