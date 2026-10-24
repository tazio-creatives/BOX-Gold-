# Plan: Show the Right Gold-Colour Photo Everywhere

Prepared 24 Oct 2026 · Status: **for decision, nothing implemented** · Box Diamonds (boxdiamonds.com)

---

## 1. The problem

A customer chose **Isolanza Diamond Ring in 9K Yellow Gold**, but the cart shows a **Rose Gold** photo.

- Each product has one "featured" photo. The cart, checkout, order pages and emails always show that one photo, whatever colour the customer chose.
- For Isolanza the featured photo is the Rose Gold front, so every Yellow Gold buyer sees rose.
- The product page gallery doesn't change photos when the customer picks Rose or Yellow either.
- Root cause: photos aren't labelled with a gold colour, so the website can't pick the matching one.

**Scale today**

| Measure | Count |
|---|---|
| Published products sold in Yellow whose featured photo is Rose | **604** |
| Products whose featured photo is a hand/model shot | 82 |
| Published products offering Yellow + Rose | 1,206 |
| Published products offering Yellow + Rose + White | 59 |
| Published products offering Yellow only | 11 |
| Products with any White Gold photo | **0** |

Product data, prices and orders are correct. Only the **photo shown** is wrong.

---

## 2. Key finding: existing photos can be labelled automatically

Each AI-generated photo can be traced back to the AI Studio record it came from. The import saved the photo and marked the record in the same database transaction, so their timestamps are identical. That record says exactly which shot it was (e.g. "Rose Gold front").

| Check | Result |
|---|---|
| AI gallery photos matched exactly to their AI Studio record | **7,731 of 7,743 (99.8%)** |
| Products where every photo matched | **1,288 of 1,292** |
| Unmatched (older pipeline, Aug–Sep) | 12 photos on 4 products |
| Ambiguous matches | 0 |

Cart lines and order lines already record the customer's chosen gold colour, so the remaining step is to match that colour to a labelled photo.

---

## 3. The solution

### 3.1 Label every photo

Each product photo gets three new, optional fields:

| Field | Values |
|---|---|
| Gold colour | Yellow · Rose · White · *empty = suits any colour* |
| Shot type | Front · Side / 45° · Model or hand · Size guide · Other |
| Source | Link to the AI Studio record it came from (when known) |

These fields are **additions only**. Nothing existing is changed; rollback means clearing them.

### 3.2 One rule decides which photo to show

For a chosen colour, the website picks:

1. The featured photo, **if** it is that colour
2. Otherwise, that colour's **front** catalogue photo
3. Otherwise, any catalogue photo of that colour
4. Otherwise, the featured photo (exactly today's behaviour), so nothing is ever blank

### 3.3 Where it applies

| Page | Change |
|---|---|
| **Cart** | Photo follows the colour on each cart line |
| **Checkout / Buy Now** | Uses the colour selected on the product page |
| **My Orders, order details, admin orders, order emails** | Use the colour recorded on the order line. New orders also store the photo link, so order history never changes later |
| **Product page gallery** | Choosing a colour brings that colour's photos to the front and switches the main image. Nothing is hidden |
| **Listing cards, wishlist** | No colour chosen there, so the featured photo stays |

---

## 4. Existing products (one-time clean-up)

| Step | What happens | Changes production? |
|---|---|---|
| 1. Dry run | Script labels the 7,731 matched photos and produces a report | No |
| 2. Review the report | Unmatched items and gaps listed for decision (below) | No |
| 3. Backup | Full backup of the photo table | No |
| 4. Apply | Labels saved. Photos, links, order, prices, stock untouched | Yes (new fields only) |
| 5. Optional featured-photo reset | Set the Yellow front as featured on the 604 products where it's Rose (affects listing cards) | Yes, only if you choose it |

**The report will list:**
- **Unmatched photos:** 12 older AI photos (4 products) and 54 manual uploads, to label by hand in admin. Size-guide images are labelled "any colour" automatically.
- **Colour gaps:** products that sell a colour with no photo for it:
  - all 59 White Gold products;
  - products whose Rose photos were generated but never imported (the import issue found in the AI image audit).

---

## 5. New products (automatic from now on)

| Source | How photos get labelled |
|---|---|
| **AI Studio import** | Automatically, from the shot type (e.g. Rose Gold front). No admin work |
| **Manual upload** | Gold-colour selector on each photo in the admin gallery (default: any colour) |
| **"Attach existing" photo** | Copies the labels from the original product |
| **Size-guide image** | Automatically "any colour" |

**Admin gallery improvements:**
- a colour badge on every photo;
- a warning when the product sells a colour that has **no front photo**;
- a warning when a hand/model photo is set as the featured photo.

---

## 6. Rollout

| Phase | Work | Risk | Customer-visible? |
|---|---|---|---|
| **A** | Add the new fields; build the backfill script; produce the dry-run report | None (report only) | No |
| **B** | Apply labels in production after you approve the report | Low (additions only, backed up) | No |
| **C** | Cart, checkout, orders and emails follow the chosen colour; new orders store their photo | Low (falls back to today's photo) | Yes |
| **D** | Product page gallery reacts to the colour choice | Medium (visible UI change) | Yes |
| **E** | Admin labelling tools; AI Studio auto-labels new imports | Low | Admin only |

**Safety rules for every phase**
- Tested on a copy of the production data before anything is deployed.
- Shopping-flow check after each phase: product page, colour switch, add to cart, cart, checkout, order pages, on desktop and phone.
- Each phase is deployed separately, and only with your approval.
- Prices, stock, variants, checkout and payments are not modified.
- Each phase can be undone on its own.

---

## 7. Decisions needed before starting

| # | Question | Options | Recommendation |
|---|---|---|---|
| 1 | **White Gold (59 products):** no White photos exist. What should White buyers see? | Yellow photo · Featured photo · Generate White photos later | Show the Yellow photo for now; plan White photos separately |
| 2 | **Listing cards:** should every product's featured photo be the Yellow front? | Yes, reset the 604 Rose ones · No, keep as is · Review a sample first | Review a sample of the 604 first, then decide |
| 3 | **Product page:** when Rose is chosen… | Rose photos move to the front · Yellow photos are hidden | Move to the front (nothing hidden) |
| 4 | **Past orders:** fix photos in order history using the recorded colour? | Yes · Only new orders | Yes (display only, no order data changes) |
| 5 | **Gaps:** products missing a colour's photo (e.g. Rose never imported) | Import the existing unused AI photos · Regenerate · Leave | Import the existing unused AI photos where available |

---

## 8. What happens next

1. You review this plan and answer the five decisions.
2. Phase A runs; it changes nothing in production. You receive the dry-run report.
3. Each later phase starts only after your approval.
