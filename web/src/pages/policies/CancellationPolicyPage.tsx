import { PolicyLayout } from './PolicyLayout';
import { PolicyContact } from './PolicyContact';

export function CancellationPolicyPage() {
  return (
    <PolicyLayout title="Cancellation Policy" lastUpdated="15 September 2026">
      <p>
        This Cancellation Policy explains when an order placed with Box Diamonds can be cancelled. For our return
        and refund process after delivery, see our <a href="/refund-policy">Refund Policy</a>; for delivery
        timelines, see our <a href="/shipping-policy">Shipping Policy</a>.
      </p>

      <h2>1. Before Dispatch</h2>
      <p>
        Cancellation requests may be accepted before an order enters production, personalisation or dispatch.
        Contact Box Diamonds customer support with your order number as soon as possible if you wish to cancel — the
        earlier a request is received, the more likely it can be honoured before processing begins.
      </p>

      <h2>2. After Dispatch</h2>
      <p>
        Once an order has been dispatched, it can no longer be cancelled. The customer may instead request a return
        after delivery if the product qualifies under our 7-day money-back policy — see our{' '}
        <a href="/refund-policy">Refund Policy</a> for eligibility and the return process.
      </p>

      <h2>3. Orders That Cannot Be Cancelled Once Processing Has Started</h2>
      <p>The following orders may not be cancelled once processing has started:</p>
      <ul>
        <li>Custom-made orders.</li>
        <li>Engraved products.</li>
        <li>Products altered or resized at the customer&rsquo;s request.</li>
        <li>Solitaire orders.</li>
      </ul>

      <h2>4. Cancellations by Box Diamonds</h2>
      <p>
        In rare cases — including stock unavailability, a pricing or listing error, or a failed payment
        verification — Box Diamonds may need to cancel an order. Where this happens, we will notify the customer and
        process a full refund of any amount already paid, in line with our{' '}
        <a href="/refund-policy">Refund Policy</a>.
      </p>

      <h2>5. Statutory Consumer Rights</h2>
      <p>
        Nothing in this policy is intended to limit any mandatory rights or remedies available to customers under
        applicable Indian consumer-protection law.
      </p>

      <h2>6. Contact Box Diamonds</h2>
      <PolicyContact assistanceWith="order cancellations" />
    </PolicyLayout>
  );
}
