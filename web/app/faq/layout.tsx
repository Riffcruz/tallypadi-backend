import type { ReactNode } from 'react';

// Page metadata lives in page.tsx so titles and sharing descriptions stay together.
export default function FaqLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
