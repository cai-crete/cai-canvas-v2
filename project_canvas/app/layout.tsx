import type { Metadata } from 'next';
import { Bebas_Neue } from 'next/font/google';
import './globals.css';

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
      <head>
        {/* VWorld 3D SDK — document.write()를 사용하므로 반드시 동기 <script>로 페이지 파싱 중 로드해야 함 */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script
          src={`https://map.vworld.kr/js/webglMapInit.js.do?version=3.0&apiKey=${VWORLD_API_KEY}`}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
