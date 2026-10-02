import { useState, type ReactNode } from 'react';
import { useDocumentTitle } from '../utils/useDocumentTitle';
import { POLICY_ICONS, type PolicyIconName } from './policies/PolicyIcons';
import styles from './OurStoryPage.module.css';

// Photo slots — drop real photos at these paths under web/public and they
// appear automatically; until then (or if one fails to load) the slot shows
// a branded cream/gold placeholder instead of a broken image.
const IMAGES = {
  hero: '/images/our-story/hero.jpg',
  beginning: '/images/our-story/beginning.jpg',
  continues: '/images/our-story/continues.jpg',
  banner: '/images/our-story/banner.jpg',
};

// "Experiences That Shape Us" card photos, in LEARNINGS order.
const LEARNING_IMAGES = [
  { src: '/images/our-story/learn-1.jpg', alt: 'Patient hands setting a diamond' },
  { src: '/images/our-story/learn-2.jpg', alt: 'A diamond ring under careful repair' },
  { src: '/images/our-story/learn-3.jpg', alt: 'Partners refining a diamond ring together' },
  { src: '/images/our-story/learn-4.jpg', alt: 'A diamond ring presented in a Box Diamonds box' },
];

export function StoryImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={`${styles.imagePlaceholder} ${className ?? ''}`} role="img" aria-label={alt}>
        {POLICY_ICONS.diamond}
      </div>
    );
  }
  return <img src={src} alt={alt} className={`${styles.image} ${className ?? ''}`} onError={() => setFailed(true)} />;
}

export function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return <p className={light ? styles.eyebrowLight : styles.eyebrow}>{children}</p>;
}

interface Milestone {
  year: string;
  title: string;
  icon: PolicyIconName;
  summary: ReactNode;
  more?: ReactNode;
}

const MILESTONES: Milestone[] = [
  {
    year: '2013',
    title: 'Where Our Journey Began',
    icon: 'users',
    summary: (
      <p>
        We started in 2013 with a team of just 10 employees, basic equipment, and a strong desire to establish
        ourselves in the jewellery industry.
      </p>
    ),
    more: (
      <>
        <p>
          During our early years, we focused on understanding every part of the business—from sourcing and
          manufacturing to diamond setting, polishing, quality inspection, pricing, and customer expectations.
        </p>
        <p>
          Resources were limited, but our commitment was not. Every piece we created helped us strengthen our skills,
          improve our processes, and build valuable relationships within the industry.
        </p>
      </>
    ),
  },
  {
    year: '2016',
    title: 'Expansion into the Wholesale Market',
    icon: 'chart',
    summary: (
      <p>
        By 2016, we were ready to move beyond our initial operations and expand into the wholesale jewellery segment.
      </p>
    ),
    more: (
      <>
        <p>
          This expansion allowed us to serve a broader network of jewellery retailers and business partners. Our focus
          shifted toward developing collections that combined commercial appeal, dependable quality, efficient
          production, and competitive pricing.
        </p>
        <p>
          As demand increased, we continued improving our manufacturing systems, strengthening our workforce, and
          expanding our design capabilities.
        </p>
        <p>
          The wholesale market became an important part of our identity and helped us earn the confidence of jewellery
          businesses looking for reliable manufacturing support.
        </p>
      </>
    ),
  },
  {
    year: '2018',
    title: 'Supplying Established Jewellery Brands',
    icon: 'partners',
    summary: (
      <p>
        In 2018, our journey reached another important milestone when we began manufacturing and supplying jewellery
        for established brands.
      </p>
    ),
    more: (
      <>
        <p>
          Working with larger businesses required greater discipline, stronger quality-control systems, accurate
          production planning, and consistent finishing across every order.
        </p>
        <p>This experience encouraged us to:</p>
        <ul>
          <li>Improve manufacturing precision</li>
          <li>Strengthen quality-control procedures</li>
          <li>Introduce better production planning</li>
          <li>Develop commercially successful designs</li>
          <li>Maintain consistent delivery standards</li>
          <li>Invest in skilled craftspeople and modern equipment</li>
        </ul>
        <p>
          Supplying established brands gave us valuable insight into changing consumer preferences and the standards
          expected in the organised jewellery market.
        </p>
      </>
    ),
  },
  {
    year: '2020',
    title: 'An Unexpected Shutdown',
    icon: 'gear',
    summary: (
      <p>
        The COVID-19 pandemic brought the jewellery industry—and much of the world—to a sudden halt.
      </p>
    ),
    more: (
      <>
        <p>
          In 2020, our operations were severely affected, and the entire system had to shut down. Manufacturing
          stopped, supply chains were disrupted, business activity declined, and the future became uncertain.
        </p>
        <p>It was one of the most difficult periods in our journey.</p>
        <p>
          However, the shutdown also gave us time to reflect on our business, examine our systems, and rethink how we
          could build a stronger and more adaptable organisation.
        </p>
        <p>
          We did not consider it the end of our story. We saw it as a difficult pause before a new beginning.
        </p>
      </>
    ),
  },
  {
    year: '2022',
    title: 'Restructuring and Starting Again',
    icon: 'refresh',
    summary: (
      <p>In 2022, we restructured our organisation and returned to the market with renewed focus.</p>
    ),
    more: (
      <>
        <p>
          We reviewed our manufacturing processes, strengthened our operations, rebuilt important business
          relationships, and once again concentrated on wholesale jewellery.
        </p>
        <p>
          This phase was about rebuilding with greater discipline and clarity. The lessons learned during the pandemic
          encouraged us to create a more efficient, flexible, and future-ready business.
        </p>
        <p>
          Our experience helped us return with a stronger understanding of what the jewellery market needed: reliable
          quality, innovative design, competitive value, and responsive service.
        </p>
      </>
    ),
  },
  {
    year: '2024',
    title: 'Entering the Retail Market',
    icon: 'store',
    summary: (
      <p>
        After years of manufacturing and wholesale experience, we entered the retail jewellery market in 2024 through
        strategic retail partnerships.
      </p>
    ),
    more: (
      <>
        <p>This step brought us closer to the people who actually wear our jewellery.</p>
        <p>
          Until then, much of our experience had been behind the scenes—manufacturing products for wholesalers,
          retailers, and established brands. Retail partnerships allowed us to understand customers more directly:
          their tastes, budgets, concerns, lifestyles, and expectations.
        </p>
        <p>We learned that modern customers wanted more than traditional jewellery. They were looking for:</p>
        <ul>
          <li>Comfortable everyday designs</li>
          <li>Transparent product information</li>
          <li>Genuine diamonds at accessible prices</li>
          <li>Lightweight jewellery</li>
          <li>Contemporary international styling</li>
          <li>Reliable exchange and buyback options</li>
          <li>Convenient and trustworthy service</li>
        </ul>
        <p>These insights became the foundation for the next stage of our journey.</p>
      </>
    ),
  },
  {
    year: '2025',
    title: 'Beginning Our Online Journey',
    icon: 'laptop',
    summary: (
      <p>
        In 2025, we entered the online jewellery segment with a clear purpose: to make buying genuine diamond jewellery
        easier, more transparent, and more convenient.
      </p>
    ),
    more: (
      <>
        <p>
          Our digital journey allowed us to connect directly with customers across India without depending entirely on
          traditional physical showrooms.
        </p>
        <p>
          Through BoxDiamonds.com, customers could explore contemporary jewellery, review important product
          information, compare designs, and purchase from the comfort of their homes.
        </p>
        <p>
          The online model also helped us reduce unnecessary layers between the manufacturer and the customer,
          allowing us to provide better value and a broader variety of designs.
        </p>
      </>
    ),
  },
  {
    year: '2026',
    title: 'Making Diamond Jewellery More Accessible',
    icon: 'diamond',
    summary: (
      <>
        <p>In 2026, Box Diamonds entered a defining new chapter.</p>
        <p>
          Selected ultra-lightweight diamond jewellery begins from <strong>₹3,999</strong>, bringing genuine diamonds
          within reach of a much wider audience.
        </p>
      </>
    ),
    more: (
      <>
        <p>
          We positioned the brand around ultra-lightweight, affordable diamond jewellery created for everyday life. By
          combining direct manufacturing, intelligent design, modern technology, and digital convenience, we
          introduced genuine diamond jewellery at remarkably accessible prices.
        </p>
        <p>
          Our purpose was clear: diamonds should not be limited to weddings, major celebrations, or luxury purchases.
          They should be available for birthdays, anniversaries, professional achievements, personal milestones,
          everyday styling, and meaningful gifts.
        </p>
        <p>
          Box Diamonds aims to lead a new online jewellery category—one where natural diamond jewellery is
          lightweight, contemporary, transparent, and affordably priced.
        </p>
      </>
    ),
  },
];

const LEARNINGS: { icon: PolicyIconName; text: string }[] = [
  { icon: 'users', text: 'We learned how to begin with limited resources.' },
  { icon: 'chart', text: 'We learned how to compete in Mumbai’s demanding diamond market.' },
  { icon: 'partners', text: 'We learned how to serve wholesale customers and established jewellery brands.' },
  {
    icon: 'refresh',
    text: 'We learned how to survive disruption, rebuild our organisation, enter retail, and embrace the digital future.',
  },
];

const STRENGTHS: { icon: PolicyIconName; label: string }[] = [
  { icon: 'goldBar', label: 'Efficient use of gold' },
  { icon: 'diamond', label: 'Secure diamond settings' },
  { icon: 'feather', label: 'Comfortable proportions' },
  { icon: 'penTool', label: 'Contemporary designs' },
  { icon: 'gear', label: 'Consistent finishing' },
  { icon: 'list', label: 'Transparent specifications' },
  { icon: 'search', label: 'Careful quality inspection' },
  { icon: 'rupee', label: 'Accessible pricing' },
];

function MilestoneItem({ milestone, side }: { milestone: Milestone; side: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`${styles.milestone} ${side === 'left' ? styles.milestoneLeft : styles.milestoneRight}`}>
      <span className={styles.milestoneDot} aria-hidden="true" />
      <div className={styles.milestoneCard}>
        <div className={styles.milestoneHead}>
          <span className={styles.milestoneYear}>{milestone.year}</span>
          <span className={styles.milestoneIcon}>{POLICY_ICONS[milestone.icon]}</span>
        </div>
        <div className={styles.milestoneBody}>
          <h3 className={styles.milestoneTitle}>{milestone.title}</h3>
          {milestone.summary}
          {milestone.more && open && <div className={styles.milestoneMore}>{milestone.more}</div>}
          {milestone.more && (
            <button
              type="button"
              className={styles.readMore}
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
            >
              {open ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export function OurStoryPage() {
  useDocumentTitle('Our Story');

  return (
    <div className={styles.page}>
      {/* ---------- Hero ---------- */}
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <Eyebrow>Our Story</Eyebrow>
          <h1 className={styles.heroTitle}>From a Small Workshop to a New Generation of Diamond Jewellery</h1>
          <p className={styles.heroLead}>
            The Box Diamonds journey began in 2013 with a simple ambition: to create beautiful diamond jewellery
            through dedication, craftsmanship, and honest value.
          </p>
        </div>
        <div className={styles.heroMedia}>
          <StoryImage src={IMAGES.hero} alt="A Box Diamonds craftsperson setting a diamond" className={styles.heroImage} />
        </div>
      </section>

      {/* ---------- Our beginning ---------- */}
      <section className={`${styles.container} ${styles.beginning}`}>
        <StoryImage src={IMAGES.beginning} alt="Jewellery design sketches on a workshop bench" className={styles.beginningImage} />
        <div>
          <Eyebrow>Our Beginning</Eyebrow>
          <h2 className={styles.sectionTitle}>Building Our Foundation in Mumbai</h2>
          <div className={styles.prose}>
            <p>
              What started as a small operation with only 10 employees and limited equipment gradually evolved into a
              modern jewellery-manufacturing and retail business. Every stage of our journey—from Mumbai’s
              competitive diamond market to the launch of our online platform—has shaped who we are today.
            </p>
            <p>
              Our growth was not achieved overnight. It was built through experience, resilience, continuous
              improvement, and a determination to make genuine diamond jewellery more accessible.
            </p>
            <p>
              Mumbai’s diamond and jewellery market became our first business ground. Operating in one of India’s
              most competitive jewellery markets taught us the importance of precision, reliability, consistent
              quality, and timely delivery. We worked closely with local businesses and gained practical experience by
              responding to changing market demands.
            </p>
            <p>
              This period created the foundation for our future growth. It gave us a deeper understanding of diamonds,
              gold, manufacturing efficiency, and the importance of long-term business relationships.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Milestones ---------- */}
      <section className={`${styles.container} ${styles.milestones}`}>
        <Eyebrow>Our Milestones</Eyebrow>
        <h2 className={styles.sectionTitle}>Eight Milestones. A Stronger Tomorrow.</h2>
        <p className={styles.sectionLead}>
          Each chapter has shaped who we are today — a more experienced, resilient and customer-focused brand.
        </p>
        <ol className={styles.timeline}>
          {MILESTONES.map((m, i) => (
            <MilestoneItem key={m.year} milestone={m} side={i % 2 === 0 ? 'left' : 'right'} />
          ))}
        </ol>
      </section>

      {/* ---------- More than a decade of learning ---------- */}
      <section className={styles.band}>
        <div className={styles.container}>
          <Eyebrow>More Than a Decade of Learning</Eyebrow>
          <h2 className={styles.sectionTitle}>Experiences That Shape Us</h2>
          <p className={styles.sectionLead}>
            Our story is not only about business growth. It is about everything we learned along the way.
          </p>
          <div className={styles.learningGrid}>
            {LEARNINGS.map((l, i) => (
              <div key={l.text} className={styles.learningCard}>
                <StoryImage src={LEARNING_IMAGES[i].src} alt={LEARNING_IMAGES[i].alt} className={styles.learningImage} />
                <div className={styles.learningBody}>
                  <span className={styles.learningIcon}>{POLICY_ICONS[l.icon]}</span>
                  <p>{l.text}</p>
                </div>
              </div>
            ))}
          </div>
          <p className={styles.sectionClosing}>
            Every challenge strengthened our determination to create a jewellery brand that customers can understand,
            trust, and enjoy.
          </p>
        </div>
      </section>

      {/* ---------- From manufacturer to customer ---------- */}
      <section className={`${styles.container} ${styles.strengths}`}>
        <Eyebrow>From Manufacturer to Customer</Eyebrow>
        <h2 className={styles.sectionTitle}>Our Strengths Shape a Better Jewellery Experience</h2>
        <p className={styles.sectionLead}>
          Our manufacturing experience remains at the heart of Box Diamonds. Because we understand how jewellery is
          designed and produced, we can focus on the details that matter:
        </p>
        <div className={styles.strengthGrid}>
          {STRENGTHS.map((s) => (
            <div key={s.label} className={styles.strengthTile}>
              <span className={styles.strengthIcon}>{POLICY_ICONS[s.icon]}</span>
              <p>{s.label}</p>
            </div>
          ))}
        </div>
        <p className={styles.sectionClosing}>
          Our direct-to-customer model allows us to bring this expertise directly to the people who wear our jewellery.
        </p>
      </section>

      {/* ---------- Mission & vision ---------- */}
      <section className={`${styles.container} ${styles.missionVision}`}>
        <div className={styles.mvCard}>
          <span className={styles.mvIcon}>{POLICY_ICONS.target}</span>
          <div>
            <Eyebrow>Our Mission</Eyebrow>
            <p className={styles.mvLead}>
              To make genuine diamond jewellery accessible, wearable, and understandable for everyone.
            </p>
            <div className={styles.prose}>
              <p>
                We want to remove the perception that diamonds must always be heavy, excessively expensive, or reserved
                only for special occasions.
              </p>
              <p>
                Through ultra-lightweight manufacturing, direct pricing, transparent product information, and modern
                online shopping, we are bringing real diamonds into everyday life.
              </p>
            </div>
          </div>
        </div>
        <div className={styles.mvCard}>
          <span className={styles.mvIcon}>{POLICY_ICONS.eye}</span>
          <div>
            <Eyebrow>Our Vision</Eyebrow>
            <p className={styles.mvLead}>
              To build Box Diamonds into one of India’s most trusted online diamond-jewellery destinations.
            </p>
            <div className={styles.prose}>
              <p>We aim to be recognised for:</p>
              <ul>
                <li>Genuine natural diamonds</li>
                <li>BIS-hallmarked gold</li>
                <li>Ultra-lightweight manufacturing</li>
                <li>Contemporary international designs</li>
                <li>Transparent product information</li>
                <li>Irresistible prices</li>
                <li>Dependable customer service</li>
                <li>Long-term exchange and buyback value</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Our journey continues ---------- */}
      <section className={styles.continues}>
        <div className={styles.continuesMedia}>
          <StoryImage src={IMAGES.continues} alt="An artisan crafting an ultra-lightweight diamond ring" className={styles.continuesImage} />
        </div>
        <div className={styles.continuesText}>
          <Eyebrow>Our Journey Continues</Eyebrow>
          <h2 className={styles.sectionTitle}>Creating a Brighter Tomorrow</h2>
          <div className={styles.prose}>
            <p>
              From 10 employees and basic equipment to manufacturing for recognised brands, rebuilding after the
              pandemic, entering retail, and launching an online diamond-jewellery platform—our journey has been
              shaped by resilience.
            </p>
            <p>We are proud of how far we have come, but we believe this is only the beginning.</p>
            <p>
              Box Diamonds will continue developing new designs, improving its manufacturing capabilities,
              strengthening customer service, and making genuine diamond jewellery accessible to more people.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Our story, your diamond ---------- */}
      <section className={styles.closing}>
        {/* Full-bleed backdrop — the ring sits on the left of the photo and
            the dark teal silk on the right carries the text. */}
        <StoryImage src={IMAGES.banner} alt="A diamond ring resting on teal silk" className={styles.closingImage} />
        <div className={styles.closingText}>
          <h2 className={styles.closingTitle}>Our Story, Your Diamond</h2>
          <p>
            Every Box Diamonds creation carries a part of our journey—the skill of our craftspeople, the lessons of our
            experience, the precision of our manufacturing, and our belief that everyone should be able to experience
            the beauty of real diamonds.
          </p>
          <p>What began as a small team in 2013 has grown into a vision for the future of diamond jewellery.</p>
          <p className={styles.closingTagline}>Box Diamonds — Timeless by Nature.</p>
          <p className={styles.closingSub}>Born from experience. Strengthened by resilience. Created for everyone.</p>
        </div>
      </section>
    </div>
  );
}
