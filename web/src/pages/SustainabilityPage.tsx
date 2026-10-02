import { PolicyDocLayout, type PolicySection } from './policies/PolicyDocLayout';

const SECTIONS: PolicySection[] = [
  {
    id: 'approach',
    title: 'Our Sustainability Approach',
    icon: 'compass',
    content: (
      <>
        <p>Our approach is built around five priorities:</p>
        <ol>
          <li>Responsible material sourcing</li>
          <li>Efficient ultra-lightweight design</li>
          <li>Reduced manufacturing waste</li>
          <li>Durable, long-lasting craftsmanship</li>
          <li>Exchange, buyback and after-sales support</li>
        </ol>
      </>
    ),
  },
  {
    id: 'sourced-materials',
    title: 'Responsibly Sourced Materials',
    icon: 'leaf',
    content: (
      <>
        <p>
          We aim to work with established suppliers and source gold and natural diamonds through legitimate,
          documented channels.
        </p>
        <p>
          Our supplier-selection process considers material authenticity, required documentation, quality standards,
          and applicable industry regulations.
        </p>
        <p>
          Because responsible sourcing is a continuous process, we regularly review our practices and work toward
          greater traceability across our supply chain.
        </p>
      </>
    ),
  },
  {
    id: 'natural-diamonds',
    title: 'Certified Natural Diamonds',
    icon: 'diamond',
    content: (
      <>
        <p>
          Box Diamonds uses natural diamonds selected according to the requirements of each design. Relevant
          certification and product specifications are provided according to the jewellery and diamond category.
        </p>
        <p>
          We are committed to giving customers clear information about the materials used in their jewellery,
          including available details about:
        </p>
        <ul>
          <li>Diamond type</li>
          <li>Diamond weight</li>
          <li>Diamond count</li>
          <li>Diamond colour and clarity</li>
          <li>Gold purity</li>
          <li>Gold weight</li>
          <li>Product certification</li>
        </ul>
        <p>
          We do not believe sustainability claims should be vague or misleading. Product-specific information is
          communicated only when it can be supported by relevant documentation.
        </p>
      </>
    ),
  },
  {
    id: 'bis-hallmarked-gold',
    title: 'BIS-Hallmarked Gold',
    icon: 'hallmark',
    content: (
      <>
        <p>Our jewellery is manufactured using BIS-hallmarked gold to verify the purity of the metal.</p>
        <p>
          Selected products may be available in 9K and 18K gold. Offering different gold-purity options allows
          customers to choose jewellery based on their budget, design preferences, durability requirements, and
          intended use.
        </p>
      </>
    ),
  },
  {
    id: 'ultra-lightweight',
    title: 'Ultra-Lightweight Jewellery',
    icon: 'feather',
    content: (
      <>
        <p>Ultra-lightweight manufacturing is one of the most important parts of our responsible design approach.</p>
        <p>Our designers carefully engineer each product to minimise unnecessary gold usage while maintaining:</p>
        <ul>
          <li>Structural strength</li>
          <li>Wearing comfort</li>
          <li>Visual elegance</li>
          <li>Secure diamond settings</li>
          <li>Appropriate durability</li>
          <li>Premium finishing</li>
        </ul>
        <p>
          Using materials efficiently helps us create beautiful jewellery with less weight and more accessible pricing.
        </p>
      </>
    ),
  },
  {
    id: 'minimise-waste',
    title: 'Designed to Minimise Waste',
    icon: 'recycle',
    content: (
      <>
        <p>Our direct manufacturing model gives us greater control over material planning and production.</p>
        <p>We work to improve efficiency through:</p>
        <ul>
          <li>Accurate digital design</li>
          <li>Careful production planning</li>
          <li>Controlled gold allocation</li>
          <li>Precise manufacturing methods</li>
          <li>Collection of recoverable gold particles</li>
          <li>Reuse and refining of eligible production remnants</li>
          <li>Quality checks that reduce avoidable remanufacturing</li>
        </ul>
        <p>Our objective is to use valuable materials responsibly at every stage of production.</p>
      </>
    ),
  },
  {
    id: 'technology-craftsmanship',
    title: 'Technology and Skilled Craftsmanship',
    icon: 'tools',
    content: (
      <>
        <p>
          Modern technology helps improve measurement accuracy, design precision, production consistency, and material
          efficiency.
        </p>
        <p>
          At the same time, experienced craftspeople remain essential for diamond setting, assembly, finishing,
          polishing, and inspection.
        </p>
        <p>
          Combining technology with skilled craftsmanship allows us to produce refined jewellery while reducing
          avoidable errors and waste.
        </p>
      </>
    ),
  },
  {
    id: 'made-to-last',
    title: 'Made to Be Worn for Years',
    icon: 'clock',
    content: (
      <>
        <p>
          The most sustainable jewellery is jewellery that continues to be worn, loved, maintained, and passed
          forward.
        </p>
        <p>
          We focus on timeless forms, comfortable proportions, secure settings, and quality finishing. Instead of
          treating jewellery as a disposable fashion product, we design it to retain emotional and material value.
        </p>
      </>
    ),
  },
  {
    id: 'quality',
    title: 'Quality Over Disposability',
    icon: 'search',
    content: (
      <>
        <p>
          Each Box Diamonds product goes through careful inspection before dispatch. Depending on the product, our
          quality-control process may include:
        </p>
        <ul>
          <li>Diamond-setting inspection</li>
          <li>Gold-purity verification</li>
          <li>Product-weight confirmation</li>
          <li>Measurement checks</li>
          <li>Clasp and lock testing</li>
          <li>Surface and polish inspection</li>
          <li>Final appearance review</li>
        </ul>
        <p>
          Creating reliable jewellery helps extend its useful life and reduces the need for premature replacement.
        </p>
      </>
    ),
  },
  {
    id: 'care-maintenance',
    title: 'Jewellery Care and Maintenance',
    icon: 'sparkle',
    content: (
      <>
        <p>
          Responsible ownership continues after purchase. Proper care can protect jewellery, preserve its appearance,
          and extend its life.
        </p>
        <p>We recommend that customers:</p>
        <ul>
          <li>Store every piece separately</li>
          <li>Avoid direct contact with perfume and chemicals</li>
          <li>Remove jewellery before swimming or exercising</li>
          <li>Protect it from hard surfaces</li>
          <li>Clean it using appropriate methods</li>
          <li>Inspect clasps and diamond settings regularly</li>
          <li>Seek professional assistance for repairs</li>
        </ul>
        <p>
          Where applicable, our team can assist with care guidance, cleaning, polishing, repair, and other after-sales
          requirements. See our <a href="/care-guide">Jewellery Care Guide</a> for detailed advice.
        </p>
      </>
    ),
  },
  {
    id: 'exchange-buyback',
    title: 'Exchange and Buyback',
    icon: 'refresh',
    content: (
      <>
        <p>
          Gold and diamonds have lasting material value. Our eligible exchange and buyback options support a more
          circular approach to jewellery ownership.
        </p>
        <p>
          Instead of leaving unwanted jewellery unused, eligible Box Diamonds products may be exchanged or offered for
          buyback according to the applicable policy.
        </p>
        <p>Final value may depend on:</p>
        <ul>
          <li>Gold purity and net weight</li>
          <li>Prevailing gold rate</li>
          <li>Diamond specifications</li>
          <li>Product condition</li>
          <li>Original documentation</li>
          <li>Certificates</li>
          <li>Applicable deductions</li>
          <li>Current policy terms</li>
        </ul>
        <p>Exchange and buyback eligibility should always be confirmed before purchase.</p>
      </>
    ),
  },
  {
    id: 'customisation',
    title: 'Customisation With Purpose',
    icon: 'penTool',
    content: (
      <>
        <p>
          Selected jewellery can be customised according to gold purity, colour, size, chain length, and other
          available options.
        </p>
        <p>
          Made-to-order and customised production can help create jewellery that better matches the customer’s
          requirements, increasing the likelihood that it will be worn and valued for a long time.
        </p>
      </>
    ),
  },
  {
    id: 'packaging',
    title: 'Thoughtful Packaging',
    icon: 'gift',
    content: (
      <>
        <p>Our jewellery requires secure packaging to prevent damage during storage and transportation.</p>
        <p>We aim to balance protection, presentation, and responsible material use by:</p>
        <ul>
          <li>Choosing appropriately sized packaging</li>
          <li>Avoiding unnecessary packaging layers</li>
          <li>Using durable boxes that can be reused for storage</li>
          <li>Reducing avoidable plastic wherever practical</li>
          <li>Continuously reviewing packaging materials and suppliers</li>
        </ul>
        <p>Packaging specifications may vary according to the product and shipping requirements.</p>
      </>
    ),
  },
  {
    id: 'digital-first',
    title: 'Digital-First Shopping',
    icon: 'laptop',
    content: (
      <>
        <p>As a digital-first jewellery platform, Box Diamonds allows customers to explore and purchase products online.</p>
        <p>
          Our online model helps reduce dependence on a large physical showroom network and supports a more efficient
          direct-to-customer system. It also allows us to provide detailed product information before purchase,
          helping customers make more informed choices.
        </p>
      </>
    ),
  },
  {
    id: 'responsible-production',
    title: 'Responsible Production',
    icon: 'users',
    content: (
      <>
        <p>Responsible business is also about people.</p>
        <p>
          We value safe, professional, respectful, and legally compliant working practices throughout our organisation
          and manufacturing operations. We expect our business partners and suppliers to follow applicable labour,
          safety, and environmental requirements.
        </p>
        <p>
          We believe craftsmanship should be respected and the people behind every piece should be treated fairly.
        </p>
      </>
    ),
  },
  {
    id: 'honest-communication',
    title: 'Honest Sustainability Communication',
    icon: 'scale',
    content: (
      <>
        <p>Sustainability is a continuing responsibility, not a single achievement.</p>
        <p>
          We avoid making unsupported environmental or ethical claims. When we describe a material, certification,
          sourcing practice, or environmental benefit, our goal is to communicate clearly and accurately.
        </p>
        <p>As our systems develop, we aim to improve:</p>
        <ul>
          <li>Supply-chain transparency</li>
          <li>Material traceability</li>
          <li>Waste measurement</li>
          <li>Packaging efficiency</li>
          <li>Energy awareness</li>
          <li>Supplier assessment</li>
          <li>Customer education</li>
          <li>Public sustainability reporting</li>
        </ul>
      </>
    ),
  },
  {
    id: 'commitments',
    title: 'Our Commitments',
    icon: 'checklist',
    content: (
      <>
        <p>Box Diamonds is committed to:</p>
        <ul>
          <li>Using precious materials efficiently</li>
          <li>Offering BIS-hallmarked gold</li>
          <li>Providing clear product specifications</li>
          <li>Improving material traceability</li>
          <li>Reducing avoidable manufacturing waste</li>
          <li>Designing durable, wearable jewellery</li>
          <li>Supporting repair and responsible product care</li>
          <li>Offering exchange and buyback on eligible products</li>
          <li>Reviewing packaging and operational practices</li>
          <li>Communicating progress honestly</li>
        </ul>
      </>
    ),
  },
  {
    id: 'looking-ahead',
    title: 'Looking Ahead',
    icon: 'eye',
    content: (
      <>
        <p>
          Our sustainability journey will continue to evolve as better technologies, materials, standards, and
          measurement systems become available.
        </p>
        <p>
          We are working toward a future where every Box Diamonds product combines beauty, authenticity, responsible
          craftsmanship, and lasting value.
        </p>
      </>
    ),
  },
  {
    id: 'beyond-a-moment',
    title: 'A Diamond Should Last Beyond a Moment',
    icon: 'heart',
    content: (
      <>
        <p>
          A piece of jewellery can represent love, family, achievement, identity, and memory. When it is thoughtfully
          created and responsibly cared for, it can remain meaningful for generations.
        </p>
        <p>
          For questions regarding our materials, manufacturing practices, packaging, or sustainability approach,
          please contact Box Diamonds at <a href="mailto:info@boxdiamonds.com">info@boxdiamonds.com</a>.
        </p>
        <p>
          <strong>Box Diamonds — Timeless by Nature.</strong>
          <br />
          Thoughtfully designed. Responsibly crafted. Made to last.
        </p>
      </>
    ),
  },
];

export function SustainabilityPage() {
  return (
    <PolicyDocLayout
      title="Sustainability at Box Diamonds"
      breadcrumbSection="About Us"
      lastUpdated="2 October 2026"
      subtitle={
        <>
          Beautiful Jewellery. Thoughtful Choices. Lasting Value.
        </>
      }
      glance={{
        heading: 'Designed With Purpose, Made to Last',
        content: (
          <>
            <p>
              At Box Diamonds, sustainability means creating jewellery that is designed with purpose, manufactured
              responsibly, worn for years, and valued across generations.
            </p>
            <p>
              Fine jewellery naturally carries emotional and material value. Our responsibility is to protect that
              value through thoughtful design, efficient manufacturing, quality craftsmanship, transparent
              communication, and long-term customer support.
            </p>
          </>
        ),
      }}
      sections={SECTIONS}
    />
  );
}
