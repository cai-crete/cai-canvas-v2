import type { Metadata } from 'next';
import { Bebas_Neue } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import RenderWakeup from '@/components/RenderWakeup';
import { AuthProvider } from '@/contexts/AuthContext';

const bebas = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-bebas',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CAI CANVAS',
  description: 'CAI Project-10 — 7-노드 AI 건축 설계 파이프라인 통합 캔버스. CRE-TE CO.,LTD.',
};

const VWORLD_API_KEY = process.env.NEXT_PUBLIC_VWORLD_API_KEY || '76CAFBEE-1F05-366D-8D48-480027E9EF42';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={bebas.variable}>
      <body>
        {/* VWorld 3D SDK — afterInteractive: 하이드레이션 이후 로드하여 document.write() 충돌 방지 */}
        <Script
          src={`https://map.vworld.kr/js/webglMapInit.js.do?version=3.0&apiKey=${VWORLD_API_KEY}`}
          strategy="afterInteractive"
        />
        <RenderWakeup />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
