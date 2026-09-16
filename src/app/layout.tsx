import './styles.css';

export const metadata = {
  title: '요기보 B2B CRM',
  description: '국내 B2B 발굴 · 검증 · 메일 발송 · 답장 관리',
};

// 다크모드 초기화 스크립트 — <head> 안에서 실행되어 FOUC 방지
//
// 기본은 **라이트 모드**다. 예전에는 시스템 설정(prefers-color-scheme)을 따라갔는데,
// 그러면 OS 를 다크로 쓰는 사람은 처음 열자마자 검은 화면을 보게 된다.
// 업무용 화면이라 밝은 쪽이 기본이어야 하고, 다크를 원하면 🌙 버튼으로 바꾸면
// localStorage 에 남아 다음부터 그대로 열린다.
const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('theme');
    var theme = stored || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    // 사이드바 접힘 상태도 FOUC 방지 위해 미리 반영
    var collapsed = localStorage.getItem('sidebar-collapsed') === 'true';
    if (collapsed) document.documentElement.setAttribute('data-sidebar-collapsed', 'true');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // suppressHydrationWarning: 인라인 themeInitScript 가 React hydrate 전에
  // <html> 에 data-theme 을 심음 → 서버 HTML 과 클라이언트 tree 미스매치가 의도된 것.
  // <body> 에도 붙임 — 브라우저 확장 (Grammarly 등) 이 body 속성 추가하는 케이스 방어.
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
