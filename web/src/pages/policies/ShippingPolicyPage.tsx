import { PolicyLayout } from './PolicyLayout';
import { PolicyContact } from './PolicyContact';

export function ShippingPolicyPage() {
  return (
    <PolicyLayout title="Shipping Policy" lastUpdated="15 September 2026">
      <p>
        At Box Diamonds, we want every purchase to reach you safely. This Shipping Policy explains our delivery
        process across India, order processing timelines, and what to do when your package arrives.
      </p>

      <h2>1. Shipping Across India</h2>
      <ul>
        <li>We deliver to serviceable PIN codes across India.</li>
        <li>Orders are shipped through trusted and insured logistics partners.</li>
        <li>Shipping is free unless a delivery charge is displayed during checkout.</li>
        <li>Customers will receive tracking information once the order is dispatched.</li>
        <li>
          Delivery timelines shown during checkout are estimates and may vary because of location, product
          availability, customisation, public holidays or circumstances beyond our control.
        </li>
        <li>Customers must provide a complete and accurate delivery address and mobile number.</li>
        <li>High-value orders may require identity verification, OTP confirmation or a signature at delivery.</li>
      </ul>

      <h2>2. Order Processing</h2>
      <ul>
        <li>Orders are processed after successful payment and verification.</li>
        <li>
          Ready-to-ship products are generally dispatched within the timeline displayed on the product page.
          Made-to-order, customised, engraved, resized or specially manufactured products may require additional
          processing time.
        </li>
        <li>Box Diamonds will communicate significant delays wherever reasonably possible.</li>
      </ul>

      <h2>3. Inspecting Your Package</h2>
      <p>Please inspect the outer package before accepting delivery. If the package appears damaged, opened or tampered with:</p>
      <ul>
        <li>Do not accept the package where possible.</li>
        <li>Take clear photographs or a video of the package.</li>
        <li>Contact Box Diamonds customer support immediately.</li>
      </ul>
      <p>
        We strongly recommend recording a continuous unboxing video, particularly for high-value jewellery orders.
        The video should begin before the package is opened and clearly show the shipping label, sealed package and
        product.
      </p>

      <h2>4. Failed Delivery or Refused Packages</h2>
      <p>
        If delivery fails because of an incorrect address, repeated customer unavailability or refusal without a
        valid reason, any reshipping or return-to-origin charges may be deducted where legally permitted. Box
        Diamonds may contact the customer to verify the address or arrange another delivery attempt.
      </p>

      <h2>5. Missing Items</h2>
      <p>
        Report missing products, certificates, accessories or gifts immediately after delivery. Include photographs
        of the package and a continuous unboxing video where available. Claims will be reviewed using packaging
        records, product weight, dispatch records and logistics information.
      </p>

      <h2>6. Damaged, Defective or Incorrect Products</h2>
      <p>
        If you receive a damaged, defective or incorrect product, contact us as soon as possible and within seven
        days of delivery. Please provide clear photographs and an unboxing video where available. After
        verification, Box Diamonds may offer an appropriate remedy, including replacement, repair or refund,
        subject to product availability and applicable law. See our{' '}
        <a href="/refund-policy">Refund Policy</a> for full details.
      </p>

      <h2>7. Statutory Consumer Rights</h2>
      <p>
        Nothing in this policy is intended to limit any mandatory rights or remedies available to customers under
        applicable Indian consumer-protection law.
      </p>

      <h2>8. Contact Box Diamonds</h2>
      <PolicyContact assistanceWith="shipping assistance" />
    </PolicyLayout>
  );
}
