import { useQuery } from '@tanstack/react-query';
import { fetchHomepage } from '../api/homepage';
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
        <HomepageSection key={section.id} section={section} alternate={i % 2 === 1} />
      ))}
    </div>
  );
}
