import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { AnnouncementStrip } from '../components/AnnouncementStrip';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { RouteFallback } from '../components/RouteFallback';

export function StorefrontLayout() {
  return (
    <div>
      <AnnouncementStrip />
      <Header />
      <main>
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
