'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface Props {
  onClose: () => void;
}

type Tab = 'login' | 'signup';

export default function AuthModal({ onClose }: Props) {
  const [tab, setTab]       = useState<Tab>('login');
  const [email, setEmail]   = useState('');
  const [pw, setPw]         = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (tab === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password: pw });
        if (error) throw error;
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) setError(error.message);
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-white)',
          width: 400,
          padding: 'var(--space-4)',
          display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
        }}
      >
        {/* 탭 */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-gray-100)' }}>
          {(['login', 'signup'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(''); }}
              style={{
                flex: 1,
                height: 'var(--h-cta-lg)',
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-bebas), sans-serif',
                fontSize: '1rem', letterSpacing: '0.08em',
                color: tab === t ? 'var(--color-black)' : 'var(--color-gray-300)',
                borderBottom: tab === t ? '2px solid var(--color-black)' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {t === 'login' ? 'LOGIN' : 'SIGN UP'}
            </button>
          ))}
        </div>

        {/* Google 로그인 */}
        <button
          onClick={handleGoogle}
          style={{
            height: 'var(--h-cta-xl)',
            border: '1px solid var(--color-gray-200)',
            background: 'var(--color-white)',
            cursor: 'pointer', borderRadius: 'var(--radius-box)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontFamily: 'var(--font-pretendard, sans-serif)',
            fontSize: '0.875rem', color: 'var(--color-gray-500)',
          }}
        >
          <GoogleIcon />
          Google로 계속하기
        </button>

        {/* 구분선 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--color-gray-100)' }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--color-gray-300)', fontFamily: 'var(--font-pretendard, sans-serif)' }}>또는</span>
          <div style={{ flex: 1, height: 1, background: 'var(--color-gray-100)' }} />
        </div>

        {/* 이메일 폼 */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일" required
            style={inputStyle}
          />
          <input
            type="password" value={pw} onChange={(e) => setPw(e.target.value)}
            placeholder="비밀번호" required minLength={6}
            style={inputStyle}
          />
          {error && (
            <p style={{ fontSize: '0.75rem', color: '#cc0000', fontFamily: 'var(--font-pretendard, sans-serif)', margin: 0 }}>
              {error}
            </p>
          )}
          <button
            type="submit" disabled={loading}
            style={{
              height: 'var(--h-cta-xl)',
              background: loading ? 'var(--color-gray-300)' : 'var(--color-black)',
              color: 'var(--color-white)',
              border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              borderRadius: 'var(--radius-box)',
              fontFamily: 'var(--font-bebas), sans-serif',
              fontSize: '1rem', letterSpacing: '0.08em',
              marginTop: 'var(--space-1)',
            }}
          >
            {loading ? '처리 중...' : tab === 'login' ? 'LOGIN' : 'SIGN UP'}
          </button>
        </form>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  height: 'var(--h-cta-lg)',
  padding: '0 var(--space-2)',
  border: '1px solid var(--color-gray-200)',
  borderRadius: 'var(--radius-box)',
  fontFamily: 'var(--font-pretendard, sans-serif)',
  fontSize: '0.875rem',
  color: 'var(--color-black)',
  outline: 'none',
  background: 'var(--color-white)',
};

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}
