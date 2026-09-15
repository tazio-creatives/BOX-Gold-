import { PolicyLayout } from './PolicyLayout';
import { PolicyContact } from './PolicyContact';

export function TermsPage() {
  return (
    <PolicyLayout title="Terms & Conditions" lastUpdated="16 September 2026">
      <p>
        These Terms &amp; Conditions (&ldquo;Terms&rdquo;) govern your use of www.boxdiamonds.com (the
        &ldquo;Website&rdquo;), owned and operated by Goldbox Diamonds Private Limited (&ldquo;Box
        Diamonds&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By accessing the Website or placing an order, you
        agree to these Terms. If you do not agree, please do not use the Website.
      </p>

      <h2>1. Eligibility</h2>
      <p>
        You must be at least 18 years old, or place orders under the supervision of a parent or legal guardian, to
        use this Website and purchase products from us.
      </p>

      <h2>2. Account Registration</h2>
      <p>
        Some features require an account, created via mobile number/OTP verification. You are responsible for all
        activity under your account and for keeping your login details secure. Please notify us immediately of any
        unauthorised use.
      </p>

      <h2>3. Products, Pricing &amp; Availability</h2>
      <ul>
        <li>We aim to display accurate product images, descriptions, weights and prices, but slight variations (e.g. natural gemstone/diamond characteristics, minor metal-weight tolerances) may occur.</li>
        <li>Prices are subject to change, including due to gold/diamond rate fluctuations, without prior notice — the price shown at the time your order is placed and confirmed will apply to that order.</li>
        <li>Products are subject to availability. We reserve the right to limit quantities or discontinue any product.</li>
        <li>In the event of a pricing or listing error, we may cancel the affected order and refund any amount paid, per our <a href="/cancellation-policy">Cancellation Policy</a>.</li>
      </ul>

      <h2>4. Orders &amp; Payment</h2>
      <ul>
        <li>Placing an order is an offer to purchase; an order is confirmed only once payment is successfully verified.</li>
        <li>We accept payment through the methods displayed at checkout, processed via our payment gateway partner(s).</li>
        <li>We reserve the right to refuse or cancel any order, including for suspected fraud, pricing errors, or unavailability, in which case any amount paid will be refunded.</li>
      </ul>

      <h2>5. Shipping, Returns &amp; Cancellations</h2>
      <p>
        Delivery timelines and shipping terms are set out in our <a href="/shipping-policy">Shipping Policy</a>.
        Return and refund eligibility is set out in our <a href="/refund-policy">Refund Policy</a>. Order
        cancellation terms are set out in our <a href="/cancellation-policy">Cancellation Policy</a>. These policies
        form part of these Terms.
      </p>

      <h2>6. Intellectual Property</h2>
      <p>
        All content on the Website — including text, graphics, logos, product images, and design — is owned by or
        licensed to Box Diamonds and protected by applicable intellectual property laws. You may not copy,
        reproduce, distribute or create derivative works from this content without our prior written consent.
      </p>

      <h2>7. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Website for any unlawful purpose or in violation of these Terms.</li>
        <li>Attempt to gain unauthorised access to the Website, our systems or other users&rsquo; accounts.</li>
        <li>Upload or transmit viruses, malicious code, or content that is unlawful, defamatory or infringing.</li>
        <li>Scrape, copy or resell product listings, prices or content without authorisation.</li>
      </ul>

      <h2>8. Product Disclaimer</h2>
      <p>
        Jewellery images are for illustrative purposes; actual product colour may vary slightly due to photography,
        lighting and display settings. Diamond and gemstone certification, where provided, is issued by independent
        certification bodies and reflects their assessment at the time of certification.
      </p>

      <h2>9. Limitation of Liability</h2>
      <p>
        To the extent permitted by applicable law, Box Diamonds shall not be liable for any indirect, incidental or
        consequential damages arising from your use of the Website or purchase of products, beyond the value of the
        relevant order. Nothing in this section limits any liability that cannot be excluded under applicable Indian
        law, including in respect of defective goods.
      </p>

      <h2>10. Indemnification</h2>
      <p>
        You agree to indemnify and hold Box Diamonds harmless from any claims, losses or damages arising from your
        violation of these Terms or misuse of the Website.
      </p>

      <h2>11. Governing Law &amp; Jurisdiction</h2>
      <p>
        These Terms are governed by the laws of India. Subject to your statutory rights, any disputes arising out of
        or in connection with these Terms shall be subject to the exclusive jurisdiction of the courts in Mumbai,
        Maharashtra.
      </p>

      <h2>12. Changes to These Terms</h2>
      <p>
        We may update these Terms from time to time. The &ldquo;Last Updated&rdquo; date at the top of this page
        indicates when it was last revised. Continued use of the Website after changes take effect constitutes
        acceptance of the revised Terms.
      </p>

      <h2>13. Statutory Consumer Rights</h2>
      <p>
        Nothing in these Terms is intended to limit any mandatory rights or remedies available to customers under
        applicable Indian consumer-protection law, including the Consumer Protection Act, 2019.
      </p>

      <h2>14. Contact Box Diamonds</h2>
      <PolicyContact assistanceWith="questions about these Terms" />
    </PolicyLayout>
  );
}
