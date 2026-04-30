'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface Props {
  onClose: () => void;
}

type MainTab = 'SKETCH' | 'IMAGE' | 'DOCUMENT' | 'VIDEO';
type DocSubTab = 'REPORT' | 'PANEL L' | 'PANEL P' | 'DRAWING';

interface LibraryItem {
  id: string;
  node_id: string;
  type: string;
  created_at: string;
  storage_path: string;
}

const MAIN_TABS: MainTab[] = ['SKETCH', 'IMAGE', 'DOCUMENT', 'VIDEO'];
const DOC_SUB_TABS: DocSubTab[] = ['REPORT', 'PANEL L', 'PANEL P', 'DRAWING'];

const DOC_TYPE_MAP: Record<DocSubTab, string> = {
  'REPORT':  'print-report',
  'PANEL L': 'print-panel-l',
  'PANEL P': 'print-panel-p',
  'DRAWING': 'print-drawing',
};

function getTypes(tab: MainTab, docSubTab: DocSubTab): string[] {
  switch (tab) {
    case 'SKETCH':   return ['sketch'];
    case 'IMAGE':    return ['sketch-to-image', 'elevation', 'viewpoint', 'plan'];
    case 'DOCUMENT': return [DOC_TYPE_MAP[docSubTab]];
    case 'VIDEO':    return ['video'];
  }
}

export default function LibraryModal({ onClose }: Props) {
  const [mainTab,   setMainTab]   = useState<MainTab>('SKETCH');
  const [docSubTab, setDocSubTab] = useState<DocSubTab>('REPORT');
  const [items,     setItems]     = useState<LibraryItem[]>([]);
  const [loading,   setLoading]   = useState(false);

  useEffect(() => {
    setLoading(true);
    setItems([]);
    const types = getTypes(mainTab, docSubTab);
    supabase
      .from('generated_images')
      .select('id, node_id, type, created_at, storage_path')
      .in('type', types)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setItems(data ?? []);
        setLoading(false);
      });
  }, [mainTab, docSubTab]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'var(--color-white)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '80vw', height: '80vh',
          minWidth: 800, minHeight: 600,
          background: 'var(--color-white)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* 헤더 */}
        <div style={{
          height: 56,
          borderBottom: '1px solid var(--color-gray-100)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 var(--space-3)',
          flexShrink: 0,
        }}>
          <span style={{
            fontFamily: 'var(--font-bebas), sans-serif',
            fontSize: '1.25rem', letterSpacing: '0.08em',
            color: 'var(--color-black)',
          }}>
            LIBRARY
          </span>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32,
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--color-gray-400)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="14" y1="2" x2="2" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* 메인 탭 */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--color-gray-100)',
          flexShrink: 0,
        }}>
          {MAIN_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setMainTab(tab)}
              style={{
                height: 44,
                padding: '0 var(--space-3)',
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-bebas), sans-serif',
                fontSize: '0.875rem', letterSpacing: '0.08em',
                color: mainTab === tab ? 'var(--color-black)' : 'var(--color-gray-300)',
                borderBottom: mainTab === tab ? '2px solid var(--color-black)' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* DOCUMENT 서브탭 */}
        {mainTab === 'DOCUMENT' && (
          <div style={{
            display: 'flex',
            borderBottom: '1px solid var(--color-gray-100)',
            padding: '0 var(--space-3)',
            flexShrink: 0,
          }}>
            {DOC_SUB_TABS.map((sub) => (
              <button
                key={sub}
                onClick={() => setDocSubTab(sub)}
                style={{
                  height: 36,
                  padding: '0 var(--space-2)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-bebas), sans-serif',
                  fontSize: '0.8125rem', letterSpacing: '0.06em',
                  color: docSubTab === sub ? 'var(--color-black)' : 'var(--color-gray-300)',
                  borderBottom: docSubTab === sub ? '2px solid var(--color-black)' : '2px solid transparent',
                  marginBottom: -1,
                }}
              >
                {sub}
              </button>
            ))}
          </div>
        )}

        {/* 컨텐츠 영역 */}
        <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-3)' }}>
          {loading ? (
            <LoadingState />
          ) : items.length === 0 ? (
            <EmptyState tab={mainTab} subTab={mainTab === 'DOCUMENT' ? docSubTab : undefined} />
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, 160px)',
              gap: 16,
              alignContent: 'start',
            }}>
              {items.map((item) => (
                <ThumbnailCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ThumbnailCard({ item }: { item: LibraryItem }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    supabase.storage
      .from('generated-images')
      .createSignedUrl(item.storage_path, 3600)
      .then(({ data }) => { if (data) setUrl(data.signedUrl); });
  }, [item.storage_path]);

  const date = new Date(item.created_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });

  return (
    <div style={{ width: 160, cursor: 'default' }}>
      <div style={{
        width: 160, height: 120,
        background: 'var(--color-gray-100)',
        overflow: 'hidden',
      }}>
        <img
          src={url ?? undefined}
          alt={item.type}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
      <div style={{
        paddingTop: 4,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{
          fontFamily: 'var(--font-bebas), sans-serif',
          fontSize: '0.6875rem', letterSpacing: '0.06em',
          color: 'var(--color-gray-400)',
          textTransform: 'uppercase',
        }}>
          {item.type}
        </span>
        <span style={{
          fontFamily: 'var(--font-pretendard, sans-serif)',
          fontSize: '0.6875rem',
          color: 'var(--color-gray-300)',
        }}>
          {date}
        </span>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{
        fontFamily: 'var(--font-bebas), sans-serif',
        fontSize: '0.875rem', letterSpacing: '0.08em',
        color: 'var(--color-gray-300)',
      }}>
        LOADING...
      </span>
    </div>
  );
}

function EmptyState({ tab, subTab }: { tab: MainTab; subTab?: DocSubTab }) {
  const label = tab === 'DOCUMENT' && subTab ? subTab : tab;
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 'var(--space-1)',
    }}>
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect x="8" y="10" width="24" height="20" rx="2" stroke="var(--color-gray-200)" strokeWidth="1.5" />
        <line x1="8" y1="17" x2="32" y2="17" stroke="var(--color-gray-200)" strokeWidth="1.5" />
        <line x1="14" y1="10" x2="14" y2="30" stroke="var(--color-gray-200)" strokeWidth="1.5" />
      </svg>
      <p style={{
        fontFamily: 'var(--font-bebas), sans-serif',
        fontSize: '0.875rem', letterSpacing: '0.08em',
        color: 'var(--color-gray-300)', margin: 0,
      }}>
        NO {label} ITEMS
      </p>
      <p style={{
        fontFamily: 'var(--font-pretendard, sans-serif)',
        fontSize: '0.75rem',
        color: 'var(--color-gray-200)', margin: 0,
      }}>
        생성된 항목이 없습니다
      </p>
    </div>
  );
}
