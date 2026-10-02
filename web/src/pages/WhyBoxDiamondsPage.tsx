import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../utils/useDocumentTitle';
import { POLICY_ICONS, type PolicyIconName } from './policies/PolicyIcons';
import { StoryImage, Eyebrow } from './OurStoryPage';
import story from './OurStoryPage.module.css';
import styles from './WhyBoxDiamondsPage.module.css';

// Brand page — shares Our Story's editorial building blocks (hero, eyebrow,
// serif headings, prose, mission/vision cards) and adds its own tile/chip/
// card/table patterns for this page's denser, list-heavy content.

const IMG = {
  hero: '/images/why/hero.jpg',
  manufacturing: '/images/why/manufacturing.jpg',
  pricing: '/images/why/pricing.jpg',
  lightweight: '/images/why/lightweight.jpg',
  craftsmanship: '/images/why/craftsmanship.jpg',
  closing: '/images/why/closing.jpg',
};

function Chips({ items }: { items: string[] }) {
  return (
    <ul className={styles.chips}>
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}

function Tiles({ items, columns }: { items: { icon: PolicyIconName; label: string }[]; columns?: 2 | 3 }) {
  const columnClass = columns === 2 ? styles.tiles2 : columns === 3 ? styles.tiles3 : '';
  return (
    <div className={`${styles.tiles} ${columnClass}`}>
      {items.map((t) => (
        <div key={t.label} className={styles.tile}>
          <span className={styles.tileIcon}>{POLICY_ICONS[t.icon]}</span>
          <p>{t.label}</p>
        </div>
      ))}
    </div>
  );
}

function InfoCard({ icon, title, children }: { icon: PolicyIconName; title: string; children: ReactNode }) {
  return (
    <div className={styles.infoCard}>
      <span className={styles.infoIcon}>{POLICY_ICONS[icon]}</span>
      <h3 className={styles.infoTitle}>{title}</h3>
      <div className={story.prose}>{children}</div>
    </div>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}

const ADVANTAGES: [string, string][] = [
  ['More than 13 years of industry experience', 'Knowledgeable product development and service'],
  ['Own manufacturing facility', 'Greater control over quality and production'],
  ['Direct-to-customer model', 'Better value with fewer intermediary costs'],
  ['Ultra-lightweight specialisation', 'Comfortable jewellery at accessible prices'],
  ['Certified natural diamonds', 'Greater confidence in authenticity'],
  ['BIS-hallmarked gold', 'Verified gold purity'],
  ['9K and 18K options', 'More flexibility across different budgets'],
  ['Internationally inspired designs', 'Modern jewellery suited to contemporary lifestyles'],
  ['Detailed online information', 'Easier and more confident decision-making'],
  ['Seven-day return policy', 'Additional reassurance on eligible purchases'],
  ['Exchange and buyback options', 'Potential long-term value'],
  ['After-sales assistance', 'Support beyond the initial purchase'],
];

const EXPERIENCE_STEPS: { title: string; text: string; icon: PolicyIconName }[] = [
  { title: 'Discover easily', text: 'Explore modern jewellery suited to different styles, budgets, and occasions.', icon: 'search' },
  { title: 'Understand clearly', text: 'Review important details before making a decision.', icon: 'list' },
  { title: 'Purchase confidently', text: 'Choose genuine materials through a secure online platform.', icon: 'lock' },
  { title: 'Receive beautifully', text: 'Experience careful delivery and premium presentation.', icon: 'gift' },
  {
    title: 'Enjoy continuously',
    text: 'Access applicable support, exchange, buyback, and after-sales assistance.',
    icon: 'heart',
  },
];

const QUALITY_CHECKS = [
  'Verification of the approved design',
  'Gold purity confirmation',
  'Product weight verification',
  'Diamond count and placement',
  'Diamond-setting security',
  'Surface finishing',
  'Polishing quality',
  'Product measurements',
  'Lock and clasp functionality',
  'Ring-size confirmation',
  'Sharp-edge inspection',
  'Final visual inspection',
];

export function WhyBoxDiamondsPage() {
  useDocumentTitle('Why Box Diamonds');

  return (
    <div className={story.page}>
      {/* ---------- Hero ---------- */}
      <section className={story.hero}>
        <div className={story.heroText}>
          <Eyebrow>Why Choose Box Diamonds?</Eyebrow>
          <h1 className={story.heroTitle}>A New Way to Experience Diamond Jewellery</h1>
          <p className={story.heroLead}>
            Box Diamonds was created with one clear belief: real diamond jewellery should be accessible to
            everyone—not limited to weddings, major celebrations, or luxury purchases.
          </p>
        </div>
        <div className={story.heroMedia}>
          <StoryImage src={IMG.hero} alt="A delicate floral diamond necklace on ivory silk" className={story.heroImage} />
        </div>
      </section>

      {/* ---------- Intro + 13 years ---------- */}
      <section className={`${story.container} ${styles.section}`}>
        <div className={styles.introGrid}>
          <div className={story.prose}>
            <p className={styles.leadParagraph}>
              We are building a modern online jewellery experience where customers can discover genuine diamond
              jewellery with contemporary designs, transparent product information, reliable quality, and
              irresistible prices.
            </p>
            <p>
              Whether you are purchasing your first diamond, choosing an everyday accessory, celebrating an important
              relationship, or selecting a meaningful gift, Box Diamonds makes the experience simple, comfortable, and
              trustworthy.
            </p>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statNumber}>13+</span>
            <span className={styles.statLabel}>Years of jewellery experience</span>
          </div>
        </div>

        <div className={styles.split}>
          <div>
            <Eyebrow>Our Experience</Eyebrow>
            <h2 className={story.sectionTitle}>Over 13 Years of Jewellery Experience</h2>
            <div className={story.prose}>
              <p>
                Behind Box Diamonds is more than 13 years of experience in diamonds, gold jewellery, product
                development, manufacturing, and quality control.
              </p>
              <p>
                Our understanding of jewellery goes beyond selling finished products. We understand every stage of its
                creation—from selecting materials and developing designs to manufacturing, diamond setting, polishing,
                inspection, packaging, and delivery.
              </p>
              <p>This experience helps us create jewellery that balances four important qualities:</p>
            </div>
          </div>
          <Tiles
            columns={2}
            items={[
              { icon: 'penTool', label: 'Attractive design' },
              { icon: 'tools', label: 'Reliable craftsmanship' },
              { icon: 'feather', label: 'Comfortable wearability' },
              { icon: 'rupee', label: 'Accessible pricing' },
            ]}
          />
        </div>
      </section>

      {/* ---------- Manufacturing strength ---------- */}
      <section className={styles.band}>
        <div className={`${story.container} ${styles.mediaSplit}`}>
          <StoryImage src={IMG.manufacturing} alt="A Mumbai artisan setting a natural diamond" className={styles.mediaImage} />
          <div>
            <Eyebrow>Made in Mumbai</Eyebrow>
            <h2 className={story.sectionTitle}>Our Own Manufacturing Strength</h2>
            <div className={story.prose}>
              <p>
                Box Diamonds is supported by its own jewellery manufacturing facility in Mumbai, equipped with modern
                machinery, experienced craftspeople, design capabilities, and dedicated research and development.
              </p>
              <p>Producing jewellery in-house allows us to maintain greater control over:</p>
              <ul className={styles.twoColList}>
                <li>Design development</li>
                <li>Gold usage and product weight</li>
                <li>Diamond selection and setting</li>
                <li>Manufacturing quality</li>
                <li>Finishing and polishing</li>
                <li>Product durability</li>
                <li>Production timelines</li>
                <li>Final inspection</li>
              </ul>
              <p>
                It also helps us respond more effectively to new fashion trends, customer preferences, and customisation
                requirements.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Direct from the manufacturer ---------- */}
      <section className={`${story.container} ${styles.section}`}>
        <div className={styles.split}>
          <div>
            <Eyebrow>Direct to You</Eyebrow>
            <h2 className={story.sectionTitle}>Direct from the Manufacturer</h2>
            <div className={story.prose}>
              <p>
                Traditional jewellery often passes through several stages before reaching the customer. Each additional
                layer may increase the final price.
              </p>
              <p>
                At Box Diamonds, jewellery is manufactured and offered directly through our online platform. This
                direct-to-customer approach reduces unnecessary intermediaries and traditional retail expenses.
              </p>
              <p>
                <strong>Our objective is to deliver genuine value—not simply a lower price.</strong>
              </p>
            </div>
          </div>
          <div className={styles.calloutCard}>
            <p className={styles.calloutHeading}>The customer receives the benefit through:</p>
            <ul className={styles.checkList}>
              <li>More accessible prices</li>
              <li>Modern designs</li>
              <li>Better product information</li>
              <li>Wider online selection</li>
              <li>Direct manufacturing expertise</li>
              <li>Consistent quality control</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ---------- Real diamonds at irresistible prices ---------- */}
      <section className={styles.priceSection}>
        <StoryImage src={IMG.pricing} alt="Natural diamond jewellery arranged on ivory stone" className={styles.priceImage} />
        <div className={styles.priceText}>
          <Eyebrow>Accessible Luxury</Eyebrow>
          <h2 className={story.sectionTitle}>Real Diamonds at Irresistible Prices</h2>
          <p className={styles.priceFrom}>
            <span>Starting from</span>
            <strong>₹3,999</strong>
          </p>
          <div className={story.prose}>
            <p>
              Box Diamonds is working to make real diamond jewellery available at prices that more customers can
              comfortably consider.
            </p>
            <p>
              Selected ultra-lightweight diamond jewellery starts from ₹3,999. This makes it possible to own genuine
              diamond jewellery at price points that may traditionally be associated with imitation or fashion
              jewellery.
            </p>
            <p>Final prices depend on factors such as:</p>
          </div>
          <Chips
            items={[
              'Current gold rate',
              'Gold purity',
              'Gold weight',
              'Diamond quality',
              'Diamond weight',
              'Product size',
              'Design complexity',
              'Customisation requirements',
            ]}
          />
        </div>
      </section>

      {/* ---------- Diamonds + gold ---------- */}
      <section className={`${story.container} ${styles.section}`}>
        <Eyebrow>Authenticity</Eyebrow>
        <h2 className={story.sectionTitle}>Genuine Materials You Can Trust</h2>
        <div className={styles.cards2}>
          <InfoCard icon="diamond" title="Certified Natural Diamonds">
            <p>
              We believe confidence begins with authenticity. Box Diamonds uses carefully selected natural diamonds,
              with appropriate certification provided according to the product and its specifications.
            </p>
            <p>
              Customers receive clear product information so they can understand what they are purchasing. This may
              include:
            </p>
            <List
              items={[
                'Diamond type',
                'Diamond weight',
                'Number of diamonds',
                'Colour and clarity details',
                'Gold purity',
                'Gold weight',
                'Gross product weight',
                'Certification information',
              ]}
            />
            <p>
              Our goal is to make diamond jewellery easier to understand, even for customers purchasing diamonds for
              the first time.
            </p>
          </InfoCard>
          <InfoCard icon="hallmark" title="BIS-Hallmarked Gold">
            <p>
              Our jewellery is made using BIS-hallmarked gold, verifying the purity of the metal used in the product.
            </p>
            <p>Depending on the design and availability, customers may choose jewellery in:</p>
            <Chips items={['9K gold', '18K gold', 'Yellow gold', 'Rose gold', 'White gold']} />
            <p>
              Every purity option serves a different customer requirement. While 18K gold offers a traditional
              fine-jewellery experience, 9K gold can make modern diamond jewellery more accessible, durable, and
              suitable for everyday use.
            </p>
          </InfoCard>
        </div>
      </section>

      {/* ---------- Ultra-lightweight banner ---------- */}
      <section className={styles.wideBanner}>
        <StoryImage src={IMG.lightweight} alt="Lightweight diamond jewellery on ivory travertine" className={styles.wideBannerImage} />
        <div className={styles.wideBannerText}>
          <Eyebrow>Our Speciality</Eyebrow>
          <h2 className={story.sectionTitle}>Specialists in Ultra-Lightweight Jewellery</h2>
          <p>
            Ultra-lightweight jewellery is at the heart of Box Diamonds. Our designers and manufacturing specialists
            carefully engineer each product to reduce unnecessary gold weight while preserving its beauty, balance,
            strength, and premium appearance.
          </p>
        </div>
      </section>
      <section className={`${story.container} ${styles.sectionTight}`}>
        <p className={story.sectionLead}>Ultra-lightweight construction offers several advantages:</p>
        <Tiles
          items={[
            { icon: 'rupee', label: 'More accessible pricing' },
            { icon: 'heart', label: 'Comfortable daily wear' },
            { icon: 'sparkle', label: 'A delicate and modern appearance' },
            { icon: 'penTool', label: 'Easier styling with different outfits' },
            { icon: 'feather', label: 'Less heaviness during extended wear' },
            { icon: 'gift', label: 'Greater variety within a practical budget' },
          ]}
        />
        <p className={styles.pullQuote}>
          Lightweight does not mean ordinary. Our objective is to create jewellery that looks luxurious while feeling
          effortless.
        </p>
      </section>

      {/* ---------- Everyday wear + international styling ---------- */}
      <section className={styles.band}>
        <div className={`${story.container} ${styles.cards2}`}>
          <InfoCard icon="clock" title="Designed for Everyday Wear">
            <p>
              Diamonds should not remain locked away for special occasions. Box Diamonds creates jewellery that can
              become part of your everyday style.
            </p>
            <p>Our collections are suitable for:</p>
            <Chips
              items={[
                'Office and professional wear',
                'Casual outings',
                'Dinner and evening wear',
                'Family celebrations',
                'Birthdays and anniversaries',
                'Engagements and weddings',
                'Festive occasions',
                'Travel and social events',
                'Everyday personal styling',
              ]}
            />
            <p>Each design aims to provide an elegant balance between visibility and comfort.</p>
          </InfoCard>
          <InfoCard icon="compass" title="Contemporary International Styling">
            <p>
              Our collections take inspiration from modern Italian and European jewellery aesthetics while remaining
              suitable for Indian preferences and lifestyles.
            </p>
            <p>You will find designs featuring:</p>
            <Chips
              items={[
                'Minimal silhouettes',
                'Clean geometric forms',
                'Romantic motifs',
                'Nature-inspired elements',
                'Contemporary diamond arrangements',
                'Delicate gold structures',
                'Elegant statement forms',
                'Timeless everyday patterns',
              ]}
            />
            <p>
              Our jewellery is designed to remain fashionable today while retaining its beauty for years to come.
            </p>
          </InfoCard>
        </div>
      </section>

      {/* ---------- Every generation ---------- */}
      <section className={`${story.container} ${styles.section}`}>
        <Eyebrow>For Everyone</Eyebrow>
        <h2 className={story.sectionTitle}>Jewellery for Every Generation</h2>
        <p className={story.sectionLead}>Box Diamonds offers designs for women, men, couples, and children.</p>
        <div className={styles.cards4}>
          <InfoCard icon="sparkle" title="Women’s Jewellery">
            <p>
              Our women’s collections include rings, engagement rings, earrings, pendants, necklaces, bracelets, and
              everyday diamond jewellery. Designs range from delicate and minimal to romantic and statement-making.
            </p>
          </InfoCard>
          <InfoCard icon="user" title="Men’s Jewellery">
            <p>
              Our men’s collections include rings, pendants, chains, bracelets, and contemporary statement designs. They
              combine masculine styling with modern diamond detailing.
            </p>
          </InfoCard>
          <InfoCard icon="ring" title="Couple Jewellery">
            <p>
              Our couple rings and meaningful matching designs celebrate relationships, engagements, anniversaries,
              and important milestones.
            </p>
          </InfoCard>
          <InfoCard icon="child" title="Children’s Jewellery">
            <p>
              Our children’s collections are created to celebrate birthdays, first jewellery moments, family
              traditions, and memories that can be treasured for years.
            </p>
          </InfoCard>
        </div>
      </section>

      {/* ---------- Every meaningful moment ---------- */}
      <section className={styles.band}>
        <div className={story.container}>
          <Eyebrow>Every Occasion</Eyebrow>
          <h2 className={story.sectionTitle}>Jewellery for Every Meaningful Moment</h2>
          <p className={story.sectionLead}>
            Jewellery is more than an accessory. It can hold a memory, express a relationship, celebrate progress, or
            become a personal symbol. Box Diamonds jewellery can be chosen for:
          </p>
          <Chips
            items={[
              'A first diamond purchase',
              'A marriage proposal',
              'An engagement',
              'A wedding anniversary',
              'A birthday',
              'A child’s special milestone',
              'A graduation',
              'A professional achievement',
              'A festive gift',
              'A romantic surprise',
              'A self-love purchase',
              'A family keepsake',
            ]}
          />
          <p className={styles.pullQuote}>Every piece has the potential to become part of someone’s story.</p>
        </div>
      </section>

      {/* ---------- Customisation + transparent info ---------- */}
      <section className={`${story.container} ${styles.section}`}>
        <div className={styles.cards2}>
          <InfoCard icon="penTool" title="Customisation Options">
            <p>
              Jewellery is personal, and one design may not suit every customer. Selected Box Diamonds products can be
              customised according to individual requirements.
            </p>
            <p>Available options may include:</p>
            <List
              items={[
                'Gold purity',
                'Gold colour',
                'Ring size',
                'Chain length',
                'Product dimensions',
                'Diamond specifications',
                'Design adjustments',
                'Personalised names or initials',
                'Engraving',
                'Gifting preferences',
              ]}
            />
            <p>
              Customised products require additional confirmation and may have different production, cancellation,
              return, exchange, and delivery conditions.
            </p>
          </InfoCard>
          <InfoCard icon="list" title="Transparent Product Information">
            <p>
              Buying jewellery online should not feel confusing. We aim to present relevant product information in a
              clear and understandable format.
            </p>
            <p>Product pages may include:</p>
            <List
              items={[
                'Multiple product images',
                'Close-up design views',
                'Product dimensions',
                'Gold purity and weight',
                'Diamond count and weight',
                'Diamond specifications',
                'Chain or lock information',
                'Certification details',
                'Estimated delivery timeline',
                'Care instructions',
                'Return and exchange eligibility',
              ]}
            />
            <p>Clear information helps customers compare products and make informed decisions.</p>
          </InfoCard>
        </div>
      </section>

      {/* ---------- No retail markups ---------- */}
      <section className={story.container}>
        <div className={styles.highlight}>
          <span className={styles.highlightIcon}>{POLICY_ICONS.store}</span>
          <div>
            <h2 className={styles.highlightTitle}>No Unnecessary Retail Markups</h2>
            <div className={story.prose}>
              <p>
                A large physical retail network can involve significant expenditure on showrooms, interiors, inventory
                display, staffing, and multiple distribution levels.
              </p>
              <p>
                Box Diamonds operates through a digital-first model supported by direct manufacturing. This structure
                allows us to focus more of the product’s value on the jewellery itself.
              </p>
              <p>
                <strong>
                  Our customers pay for the design, materials, craftsmanship, and service—not unnecessary layers of
                  traditional retail cost.
                </strong>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Quality control ---------- */}
      <section className={`${story.container} ${styles.section}`}>
        <Eyebrow>Inspected With Care</Eyebrow>
        <h2 className={story.sectionTitle}>Quality Control at Every Stage</h2>
        <p className={story.sectionLead}>
          Every piece passes through multiple checks during manufacturing and before dispatch. Our quality review may
          include:
        </p>
        <ol className={styles.checkGrid}>
          {QUALITY_CHECKS.map((c, i) => (
            <li key={c}>
              <span>{String(i + 1).padStart(2, '0')}</span>
              {c}
            </li>
          ))}
        </ol>
        <p className={story.sectionClosing}>
          The purpose of these checks is to ensure that the jewellery is beautiful, wearable, and ready for delivery.
        </p>
      </section>

      {/* ---------- Craftsmanship + technology ---------- */}
      <section className={story.continues}>
        <div className={story.continuesMedia}>
          <StoryImage
            src={IMG.craftsmanship}
            alt="An artisan setting a diamond beside a precision microscope"
            className={story.continuesImage}
          />
        </div>
        <div className={story.continuesText}>
          <Eyebrow>Craft Meets Precision</Eyebrow>
          <h2 className={story.sectionTitle}>Skilled Craftsmanship and Modern Technology</h2>
          <div className={story.prose}>
            <p>Beautiful jewellery requires both human skill and manufacturing precision.</p>
            <p>
              Our production combines experienced craftsmanship with modern jewellery-making technology. This helps us
              achieve detailed forms, refined diamond settings, accurate dimensions, and consistent finishing.
            </p>
            <p>
              Technology improves precision, while skilled craftspeople bring the judgement and attention that fine
              jewellery requires.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Shopping, delivery, packaging ---------- */}
      <section className={`${story.container} ${styles.section}`}>
        <Eyebrow>Shop With Confidence</Eyebrow>
        <h2 className={story.sectionTitle}>From Our Workshop to Your Door</h2>
        <div className={styles.cards3}>
          <InfoCard icon="laptop" title="Secure Online Jewellery Shopping">
            <p>BoxDiamonds.com allows customers to explore and purchase jewellery from the comfort of their homes.</p>
            <p>Customers can:</p>
            <List
              items={[
                'Browse collections at any time',
                'Compare different styles',
                'Review detailed specifications',
                'Select available customisation options',
                'Place orders securely',
                'Receive assistance before purchasing',
                'Track their order',
                'Access after-sales support',
              ]}
            />
            <p>
              Our goal is to make online diamond-jewellery shopping convenient without removing the confidence and
              personal care expected from a jewellery brand.
            </p>
          </InfoCard>
          <InfoCard icon="truck" title="Safe and Insured Delivery">
            <p>Jewellery requires careful handling throughout the delivery process.</p>
            <p>
              Orders are securely packed and dispatched through suitable logistics partners. Delivery procedures may
              include verification, tracking, secure packaging, and insurance according to the order type and
              destination.
            </p>
            <p>Customers should inspect the package at delivery and follow the applicable verification instructions.</p>
          </InfoCard>
          <InfoCard icon="gift" title="Premium and Protective Packaging">
            <p>
              Every Box Diamonds product is packed to protect its finish, shape, diamond setting, and overall
              presentation.
            </p>
            <p>Our packaging is designed to be:</p>
            <List
              items={[
                'Secure during transit',
                'Suitable for premium jewellery',
                'Convenient for storage',
                'Presentable for gifting',
                'Memorable during unboxing',
              ]}
            />
            <p>
              Whether the purchase is for yourself or someone special, the presentation should feel meaningful.
            </p>
          </InfoCard>
        </div>
      </section>

      {/* ---------- Returns + exchange ---------- */}
      <section className={styles.band}>
        <div className={story.container}>
          <Eyebrow>Peace of Mind</Eyebrow>
          <h2 className={story.sectionTitle}>Reassurance Beyond the Purchase</h2>
          <div className={styles.cards2}>
            <InfoCard icon="calendar" title="Seven-Day Money-Back Policy">
              <p>
                We understand that customers may occasionally need to return an online purchase. Eligible products are
                covered under our seven-day money-back policy.
              </p>
              <p>Free return shipping is available across India for products that meet the return conditions.</p>
              <p>Returned products must generally be:</p>
              <List
                items={[
                  'Unused and unworn',
                  'Unaltered',
                  'Free from damage or scratches',
                  'Returned with certificates',
                  'Returned with original packaging',
                  'Accompanied by the invoice and accessories',
                  'Submitted within the eligible return period',
                ]}
              />
              <p>
                Solitaires, customised products, engraved items, resized jewellery, and other specified categories may
                not qualify. The final approval of a return is subject to inspection and the applicable policy. See our{' '}
                <Link to="/refund-policy">Return and Refund Policy</Link>.
              </p>
            </InfoCard>
            <InfoCard icon="refresh" title="Exchange and Buyback Options">
              <p>Fine jewellery should provide value beyond the initial purchase.</p>
              <p>
                Eligible Box Diamonds products may be covered by exchange and buyback benefits, subject to the
                prevailing policy. The applicable value may depend on:
              </p>
              <List
                items={[
                  'Gold purity and net weight',
                  'Prevailing gold rate',
                  'Diamond specifications',
                  'Product condition',
                  'Original invoice',
                  'Certificates',
                  'Applicable deductions',
                  'Current policy terms',
                ]}
              />
              <p>
                We encourage customers to retain all invoices and certificates for future service, exchange, or buyback
                requirements.
              </p>
            </InfoCard>
          </div>
        </div>
      </section>

      {/* ---------- Support ---------- */}
      <section className={`${story.container} ${styles.section}`}>
        <Eyebrow>Here to Help</Eyebrow>
        <h2 className={story.sectionTitle}>Support at Every Step</h2>
        <div className={styles.cards3}>
          <InfoCard icon="tools" title="After-Sales Support">
            <p>Our relationship with customers continues after the product has been delivered.</p>
            <p>Depending on the product and service eligibility, our support team can assist with:</p>
            <List
              items={[
                'Product-care guidance',
                'Ring-size enquiries',
                'Repair requirements',
                'Cleaning and polishing',
                'Certificate-related questions',
                'Exchange requests',
                'Buyback enquiries',
                'Return assistance',
                'Order and delivery support',
              ]}
            />
            <p>Some services may involve charges depending on the product condition and required work.</p>
          </InfoCard>
          <InfoCard icon="users" title="Helpful Customer Assistance">
            <p>
              Buying jewellery—especially for the first time—can involve many questions. Our team can help customers
              understand:
            </p>
            <List
              items={[
                'Which gold purity to choose',
                'The difference between gold colours',
                'How to select the correct ring size',
                'How to choose an everyday design',
                'Which product suits a particular budget',
                'Which jewellery is appropriate for gifting',
                'How customisation works',
                'Expected production and delivery timelines',
                'Return, exchange, and buyback conditions',
              ]}
            />
            <p>We want customers to make informed choices without feeling pressured.</p>
          </InfoCard>
          <InfoCard icon="drop" title="Jewellery Care Guidance">
            <p>Diamond jewellery should be handled carefully to maintain its appearance.</p>
            <p>We recommend:</p>
            <List
              items={[
                'Storing each item separately',
                'Avoiding contact with perfumes and chemicals',
                'Removing jewellery before exercise or swimming',
                'Keeping it away from hard surfaces',
                'Cleaning it gently with suitable materials',
                'Checking clasps and settings periodically',
                'Using the original box for storage',
                'Seeking professional assistance for repairs',
              ]}
            />
            <p>
              Proper care helps protect the polish, diamond settings, and beauty of the jewellery. See our{' '}
              <Link to="/care-guide">Jewellery Care Guide</Link>.
            </p>
          </InfoCard>
        </div>
      </section>

      {/* ---------- Responsible communication + digital first ---------- */}
      <section className={styles.band}>
        <div className={`${story.container} ${styles.cards2}`}>
          <InfoCard icon="scale" title="Responsible Communication">
            <p>
              We aim to communicate product details, offers, policies, and limitations clearly. Jewellery prices can
              change due to fluctuations in gold and diamond costs, so the applicable price is the price confirmed at
              the time of purchase.
            </p>
            <p>
              Promotional offers, starting prices, exchange benefits, and other advantages may apply only to selected
              products or for a limited period. Relevant terms should always be reviewed before placing an order.
            </p>
          </InfoCard>
          <InfoCard icon="laptop" title="A Digital-First Jewellery Brand">
            <p>
              Box Diamonds is designed for customers who value convenience, transparency, variety, and contemporary
              style. Our digital-first approach allows us to:
            </p>
            <List
              items={[
                'Introduce new designs more frequently',
                'Serve customers across India',
                'Offer an extensive online collection',
                'Provide detailed product information',
                'Reduce unnecessary retail overheads',
                'Respond quickly to changing trends',
                'Make diamond jewellery accessible to more people',
              ]}
            />
            <p>
              This is not simply jewellery sold online. It is a new, customer-focused way of discovering and purchasing
              diamonds.
            </p>
          </InfoCard>
        </div>
      </section>

      {/* ---------- Mission & vision ---------- */}
      <section className={`${story.container} ${story.missionVision} ${styles.mvSpacing}`}>
        <div className={story.mvCard}>
          <span className={story.mvIcon}>{POLICY_ICONS.target}</span>
          <div>
            <Eyebrow>Our Mission</Eyebrow>
            <p className={story.mvLead}>
              To make genuine diamond jewellery accessible, understandable, and wearable for everyone.
            </p>
            <div className={story.prose}>
              <p>
                We want to remove the belief that diamonds must always be heavy, excessively expensive, or purchased
                only for major occasions.
              </p>
              <p>
                Through intelligent design, ultra-lightweight manufacturing, transparent information, and online
                convenience, we aim to bring real diamonds into everyday life.
              </p>
            </div>
          </div>
        </div>
        <div className={story.mvCard}>
          <span className={story.mvIcon}>{POLICY_ICONS.eye}</span>
          <div>
            <Eyebrow>Our Vision</Eyebrow>
            <p className={story.mvLead}>
              To build Box Diamonds into one of India’s most trusted digital jewellery destinations.
            </p>
            <div className={story.prose}>
              <p>
                Known for accessible luxury, innovative lightweight designs, transparent value, and dependable customer
                service.
              </p>
              <p>
                We want every customer, regardless of budget or location, to feel that owning genuine diamond jewellery
                is possible.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Brand promise ---------- */}
      <section className={`${story.container} ${styles.sectionTight}`}>
        <Eyebrow>Our Brand Promise</Eyebrow>
        <h2 className={story.sectionTitle}>When You Choose Box Diamonds</h2>
        <p className={story.sectionLead}>When customers choose Box Diamonds, our promise is to focus on:</p>
        <Tiles
          columns={3}
          items={[
            { icon: 'diamond', label: 'Authentic materials' },
            { icon: 'list', label: 'Honest product information' },
            { icon: 'penTool', label: 'Contemporary designs' },
            { icon: 'feather', label: 'Comfortable craftsmanship' },
            { icon: 'rupee', label: 'Accessible pricing' },
            { icon: 'search', label: 'Careful quality control' },
            { icon: 'lock', label: 'Secure shopping' },
            { icon: 'handshake', label: 'Responsible customer service' },
            { icon: 'clock', label: 'Long-term jewellery value' },
          ]}
        />
      </section>

      {/* ---------- Comparison table ---------- */}
      <section className={`${story.container} ${styles.section}`}>
        <Eyebrow>The Difference</Eyebrow>
        <h2 className={story.sectionTitle}>What Makes Box Diamonds Different?</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Box Diamonds Advantage</th>
                <th scope="col">Customer Benefit</th>
              </tr>
            </thead>
            <tbody>
              {ADVANTAGES.map(([advantage, benefit]) => (
                <tr key={advantage}>
                  <th scope="row">{advantage}</th>
                  <td>{benefit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------- Experience steps ---------- */}
      <section className={styles.band}>
        <div className={story.container}>
          <Eyebrow>The Box Diamonds Experience</Eyebrow>
          <h2 className={story.sectionTitle}>Built Around Five Principles</h2>
          <p className={story.sectionLead}>
            From the moment you discover a design to the moment you open the jewellery box, every stage should feel
            special.
          </p>
          <ol className={styles.steps}>
            {EXPERIENCE_STEPS.map((s, i) => (
              <li key={s.title} className={styles.step}>
                <span className={styles.stepIcon}>{POLICY_ICONS[s.icon]}</span>
                <span className={styles.stepNumber}>{String(i + 1).padStart(2, '0')}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- Diamonds for everyone ---------- */}
      <section className={`${story.container} ${styles.section} ${styles.everyone}`}>
        <Eyebrow>Diamonds for Everyone</Eyebrow>
        <p className={styles.everyoneLead}>
          A diamond can celebrate love, confidence, ambition, family, achievement, or simply the joy of owning
          something beautiful. At Box Diamonds, we are working to make these experiences available to more people
          through modern design and responsible pricing.
        </p>
        <ul className={styles.everyoneList}>
          <li>You do not need to wait for a wedding to wear diamonds.</li>
          <li>You do not need to choose heavy jewellery to experience luxury.</li>
          <li>You do not need to visit multiple showrooms to find a modern design.</li>
          <li>You do not need to compromise between beauty, authenticity, and affordability.</li>
        </ul>
        <p className={styles.everyoneClose}>
          Box Diamonds brings these qualities together in one trusted online destination.
        </p>
      </section>

      {/* ---------- Final brand statement ---------- */}
      {/* The ring and pendant sit on the right of this photo, so the text
          takes the left here (mirror of Our Story's closing banner). */}
      <section className={`${story.closing} ${styles.closingReverse}`}>
        <StoryImage src={IMG.closing} alt="Diamond ring and pendant on deep-teal silk" className={story.closingImage} />
        <div className={story.closingText}>
          <h2 className={story.closingTitle}>A Modern Generation of Fine Jewellery</h2>
          <p>
            Box Diamonds represents a modern generation of fine jewellery—authentic yet accessible, luxurious yet
            wearable, and timeless yet contemporary.
          </p>
          <p>
            With certified natural diamonds, BIS-hallmarked gold, our own manufacturing expertise, ultra-lightweight
            designs, transparent pricing, and customer-focused service, we are making diamond jewellery simpler to own
            and easier to enjoy.
          </p>
          <p>
            Because real diamonds should not remain a distant dream. They should become part of your everyday story.
          </p>
          <p className={story.closingTagline}>Box Diamonds — Timeless by Nature</p>
          <p className={story.closingSub}>Real diamonds. Modern designs. Irresistible prices.</p>
          <Link to="/" className={styles.cta}>
            Discover your next diamond
          </Link>
        </div>
      </section>
    </div>
  );
}
