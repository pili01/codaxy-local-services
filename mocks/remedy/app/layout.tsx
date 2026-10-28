import type { ReactNode } from 'react';
import Critters from './Critters';

export const metadata = {
  title: 'Remedy mock',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        {children}
        <Critters />
      </body>
    </html>
  );
}
