import { Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchHomepage } from '../api/homepage';
import { AssuranceStrip } from './home/AssuranceStrip';
import { HomepageSection } from './home/HomepageSection';
import { useHead, defaultHead } from '../seo/head';
import { breadcrumbJsonLd, organizationJsonLd } from '../seo/jsonLd';
import styles from './HomePage.module.css';

export function HomePage() {
  useHead({
    ...defaultHead,
    jsonLd: [organizationJsonLd(), breadcrumbJsonLd([{ name: 'Home', path: '/' }])],
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['homepage'],
    queryFn: fetchHomepage,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className={styles.skeleton} aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={styles.skeletonBlock} />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return <p className={styles.error}>Couldn't load the homepage right now.</p>;
  }

  return (
    <div>
      {data.sections.map((section, i) => (
        <Fragment key={section.id}>
          <HomepageSection section={section} alternate={i % 2 === 1} />
          {/* Static, homepage-only strip — not a homepage_sections row, so
              it's placed here positionally right after HERO rather than in
              HomepageSection.tsx's data-driven switch (plan: "Add only the
              assurance strip" / "Do not add an admin configuration screen"). */}
          {section.type === 'HERO' && <AssuranceStrip />}
        </Fragment>
      ))}
    </div>
  );
}
