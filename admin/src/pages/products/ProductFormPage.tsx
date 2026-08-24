import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  fetchAdminProduct,
  createProduct,
  updateProduct,
  setPriceLock,
} from '../../api/products';
import { fetchProductImages } from '../../api/productImages';
import { fetchAdminCategories } from '../../api/categories';
import { fetchAdminCollections } from '../../api/collections';
import { previewPricing } from '../../api/pricing';
import { fetchDiamondConfigs } from '../../api/diamondConfigs';
import type { GoldColor, MetalType, ProductInput, ProductStatus, Purity } from '../../api/types';
import { ApiError } from '../../api/client';
import { formatPrice } from '../../utils/formatPrice';
import { ProductGallery } from '../../features/products/ProductGallery';
import sharedStyles from '../../styles/shared.module.css';
import styles from './ProductFormPage.module.css';

const METAL_TYPES: MetalType[] = ['GOLD', 'PLATINUM'];
const PURITIES: Purity[] = ['9K', '14K', '18K', '22K', '24K'];
const GOLD_COLORS: { value: GoldColor; label: string }[] = [
  { value: 'YELLOW', label: 'Yellow Gold' },
  { value: 'ROSE', label: 'Rose Gold' },
  { value: 'WHITE', label: 'White Gold' },
];
const STATUSES: ProductStatus[] = ['DRAFT', 'AI_PROCESSING', 'AI_READY', 'PUBLISHED', 'FAILED'];

const EMPTY_FORM: ProductInput = {
  name: '',
  sku: '',
  categoryId: null,
  collectionId: null,
  shortDescription: '',
  fullDescription: '',
  metalType: 'GOLD',
  purity: '18K',
  goldColor: null,
  goldWeightGrams: null,
  diamondWeightGrams: null,
  diamondWeightCarats: null,
  diamondConfigId: null,
  diamondCount: null,
  diamondType: '',
  diamondColour: '',
  diamondClarity: '',
  gemstone: '',
  certification: '',
  productSize: '',
  careInstructions: '',
  sizes: [],
  goldColors: [],
  purities: [],
  diamondConfigIds: [],
  makingCharge: 0,
  gstPercent: 3,
  mrp: 0,
  sellingPrice: 0,
  stockQuantity: 0,
  status: 'DRAFT',
  showDeliveryChecker: false,
  metaTitle: '',
  metaDescription: '',
  metaKeywords: '',
};

export function ProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const navigate = useNavigate();

  const { data: productData, isLoading: isProductLoading } = useQuery({
    queryKey: ['admin-product', id],
    queryFn: () => fetchAdminProduct(id as string),
    enabled: isEditing,
  });
  // Same query key ProductGallery uses below, so this shares its cache
  // instead of firing a second request — only here to gate Save on "at
  // least one image", the one thing besides name that's still required.
  const { data: imagesData } = useQuery({
    queryKey: ['admin-product-images', id],
    queryFn: () => fetchProductImages(id as string),
    enabled: isEditing,
  });
  const { data: categoriesData } = useQuery({ queryKey: ['admin-categories'], queryFn: fetchAdminCategories });
  const { data: collectionsData } = useQuery({ queryKey: ['admin-collections'], queryFn: fetchAdminCollections });
  const { data: diamondConfigsData } = useQuery({
    queryKey: ['admin-diamond-configs-active'],
    queryFn: () => fetchDiamondConfigs({ activeOnly: true }),
  });

  const [form, setForm] = useState<ProductInput>(EMPTY_FORM);
  const [preview, setPreview] = useState<{ goldValue: number; diamondValue: number; sellingPrice: number } | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kept separate from the page-level `error` (shown far below, near Save)
  // so a failed auto-preview — e.g. diamond carat entered before diamond
  // quality is picked — is visible right where the admin is looking,
  // instead of silently leaving the price at ₹0 with no explanation.
  const [pricingError, setPricingError] = useState<string | null>(null);
  // Same reasoning as pricingError — "Start AI Generation" clicked with no
  // name entered used to fail silently from the admin's point of view (the
  // error rendered only in the page-level banner at the very bottom, far
  // from the Product Images section and the button that was just clicked).
  const [imageSourceError, setImageSourceError] = useState<string | null>(null);
  // Making Charge is entered as a % of gold value, not a flat rupee amount —
  // form.makingCharge (the flat figure the API actually stores/uses) is kept
  // in sync below whenever this percent or the live gold value changes.
  const [makingChargePercent, setMakingChargePercent] = useState<number | ''>(0);

  useEffect(() => {
    if (productData) {
      const p = productData.product;
      setForm({
        name: p.name,
        sku: p.sku,
        categoryId: p.categoryId,
        collectionId: p.collectionId,
        shortDescription: p.shortDescription ?? '',
        fullDescription: p.fullDescription ?? '',
        metalType: p.metalType,
        purity: p.purity,
        goldColor: p.goldColor,
        goldWeightGrams: p.goldWeightGrams,
        diamondWeightGrams: p.diamondWeightGrams,
        diamondWeightCarats: p.diamondWeightCarats,
        diamondConfigId: p.diamondConfigId,
        diamondCount: p.diamondCount,
        diamondType: p.diamondType ?? '',
        diamondColour: p.diamondColour ?? '',
        diamondClarity: p.diamondClarity ?? '',
        gemstone: p.gemstone ?? '',
        certification: p.certification ?? '',
        productSize: p.productSize ?? '',
        careInstructions: p.careInstructions ?? '',
        sizes: p.sizes.map((s) => ({
          label: s.label,
          stockQuantity: s.stockQuantity,
          weightGrams: s.weightGrams,
          diamondWeightCarats: s.diamondWeightCarats,
        })),
        goldColors: p.goldColorOptions,
        purities: p.purityOptions,
        diamondConfigIds: p.diamondOptions.map((d) => d.id),
        goldValue: p.priceBreakup.goldValue,
        diamondValue: p.priceBreakup.diamondValue,
        makingCharge: p.priceBreakup.makingCharge,
        gstPercent: undefined,
        mrp: p.mrp,
        sellingPrice: p.sellingPrice,
        stockQuantity: p.stockQuantity,
        status: p.status,
        showDeliveryChecker: p.showDeliveryChecker,
        metaTitle: p.metaTitle ?? '',
        metaDescription: p.metaDescription ?? '',
        metaKeywords: p.metaKeywords ?? '',
      });
      // Reverse-derive a percent for display — the stored figure may
      // predate this field being percent-based, so this is a best-effort
      // equivalent, not a persisted value in its own right.
      setMakingChargePercent(
        p.priceBreakup.goldValue > 0
          ? Math.round((p.priceBreakup.makingCharge / p.priceBreakup.goldValue) * 100 * 100) / 100
          : 0,
      );
    }
  }, [productData]);

  // A bare "Validation failed" (the generic message for any Zod rejection)
  // gives no clue which field caused it — append the specific field errors
  // the API already sends back but this page used to discard.
  function describeError(err: unknown, fallback: string): string {
    if (!(err instanceof ApiError)) return fallback;
    if (err.fields?.length) {
      return `${err.message}: ${err.fields.map((f) => `${f.path} — ${f.message}`).join('; ')}`;
    }
    return err.message;
  }

  function set<K extends keyof ProductInput>(key: K, value: ProductInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Shared by every path that sends `form` to the API (Save, and the two
  // early-create shortcuts below) — without this, a blank size row (e.g.
  // "+ Add Size" clicked and left empty) passes fine on Save but throws a
  // raw Zod "Validation failed" from the quicker "Start AI Generation" /
  // "Start Manual Upload" buttons, which used to send `form` unsanitized.
  function buildPayload(overrides: Partial<ProductInput> = {}): ProductInput {
    return {
      ...form,
      name: form.name.trim(),
      sku: form.sku.trim() || `DRAFT-${Date.now()}`,
      shortDescription: form.shortDescription || null,
      fullDescription: form.fullDescription || null,
      diamondType: form.diamondType || null,
      diamondColour: form.diamondColour || null,
      diamondClarity: form.diamondClarity || null,
      gemstone: form.gemstone || null,
      certification: form.certification || null,
      productSize: form.productSize || null,
      careInstructions: form.careInstructions || null,
      sizes: (form.sizes ?? []).filter((s) => s.label.trim().length > 0),
      metaTitle: form.metaTitle || null,
      metaDescription: form.metaDescription || null,
      metaKeywords: form.metaKeywords || null,
      ...overrides,
    };
  }

  function addSizeRow() {
    setForm((f) => ({
      ...f,
      sizes: [...(f.sizes ?? []), { label: '', stockQuantity: 0, weightGrams: null, diamondWeightCarats: null }],
    }));
  }

  function updateSizeRow(
    index: number,
    patch: Partial<{ label: string; stockQuantity: number; weightGrams: number | null; diamondWeightCarats: number | null }>,
  ) {
    setForm((f) => ({
      ...f,
      sizes: (f.sizes ?? []).map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  }

  function removeSizeRow(index: number) {
    setForm((f) => ({ ...f, sizes: (f.sizes ?? []).filter((_, i) => i !== index) }));
  }

  function toggleGoldColor(color: GoldColor) {
    setForm((f) => ({
      ...f,
      goldColors: (f.goldColors ?? []).includes(color)
        ? (f.goldColors ?? []).filter((c) => c !== color)
        : [...(f.goldColors ?? []), color],
    }));
  }

  function togglePurityOption(purity: Purity) {
    setForm((f) => ({
      ...f,
      purities: (f.purities ?? []).includes(purity)
        ? (f.purities ?? []).filter((p) => p !== purity)
        : [...(f.purities ?? []), purity],
    }));
  }

  function toggleDiamondOption(id: string) {
    setForm((f) => ({
      ...f,
      diamondConfigIds: (f.diamondConfigIds ?? []).includes(id)
        ? (f.diamondConfigIds ?? []).filter((c) => c !== id)
        : [...(f.diamondConfigIds ?? []), id],
    }));
  }

  // Keeps the flat form.makingCharge the API actually stores/uses in sync
  // with the % the admin enters, recomputed off the live gold value exactly
  // like the auto-preview effect below keeps goldValue itself current.
  useEffect(() => {
    const computed = Math.round(((form.goldValue ?? 0) * (makingChargePercent || 0)) / 100 * 100) / 100;
    setForm((f) => (f.makingCharge === computed ? f : { ...f, makingCharge: computed }));
  }, [makingChargePercent, form.goldValue]);

  // Early-create path for "Generate with AI" clicked on an unsaved product
  // (plan §3 correction) — ai_studio_jobs.product_id is NOT NULL, so a real
  // product must exist before the Studio route can create a job. Reuses the
  // same createProduct call the normal Save uses. SKU is auto-filled (it's
  // just an internal reference, DB-required but not something the admin
  // needs to think about yet) — name is NOT auto-filled: skipping that check
  // let a bare click create a throwaway "Untitled Product" row with every
  // press, cluttering the Products list even when nobody follows through
  // with an actual upload.
  const createForStudioMutation = useMutation({
    mutationFn: (overrides: { name: string; sku: string }) => createProduct(buildPayload(overrides)),
    // replace: true — the blank Add Product page this came from is stale the
    // instant the product is created (it now exists for real elsewhere), so
    // the browser Back button shouldn't be able to land the admin back on
    // it looking like their just-entered details vanished.
    onSuccess: (result) => navigate(`/products/${result.product.id}/ai-image-studio`, { replace: true }),
    onError: (err) => setImageSourceError(describeError(err, 'Could not create product.')),
  });

  function handleGenerateWithAI() {
    if (isEditing) {
      navigate(`/products/${id}/ai-image-studio`);
      return;
    }
    if (!form.name.trim()) {
      setImageSourceError('Enter a product name before generating images with AI.');
      return;
    }
    setImageSourceError(null);
    const name = form.name.trim();
    const sku = form.sku.trim() || `DRAFT-${Date.now()}`;
    setForm((f) => ({ ...f, name, sku }));
    createForStudioMutation.mutate({ name, sku });
  }

  // Manual Upload had no wired-up action at all in Add mode — the actual
  // upload widget (ProductGallery, below) is edit-only for the same reason
  // AI generation needed an early-create: there's no product row yet to
  // attach images to. Mirrors handleGenerateWithAI's create flow, just
  // landing back on the edit page instead of AI Image Studio.
  const createForManualUploadMutation = useMutation({
    mutationFn: (overrides: { name: string; sku: string }) => createProduct(buildPayload(overrides)),
    // Same reasoning as the AI-studio create path above.
    onSuccess: (result) => navigate(`/products/${result.product.id}/edit`, { replace: true }),
    onError: (err) => setImageSourceError(describeError(err, 'Could not create product.')),
  });

  function handleManualUpload() {
    if (isEditing) return;
    if (!form.name.trim()) {
      setImageSourceError('Enter a product name before uploading images.');
      return;
    }
    setImageSourceError(null);
    const name = form.name.trim();
    const sku = form.sku.trim() || `DRAFT-${Date.now()}`;
    setForm((f) => ({ ...f, name, sku }));
    createForManualUploadMutation.mutate({ name, sku });
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      return isEditing ? updateProduct(id as string, payload) : createProduct(payload);
    },
    onSuccess: () => navigate('/products'),
    onError: (err) => setError(describeError(err, 'Could not save product.')),
  });

  const priceLockMutation = useMutation({
    mutationFn: (locked: boolean) => setPriceLock(id as string, locked),
  });

  async function runPreview() {
    setIsPreviewing(true);
    try {
      const result = await previewPricing({
        metalType: form.metalType,
        purity: form.purity,
        goldWeightGrams: form.goldWeightGrams,
        diamondWeightCarats: form.diamondWeightCarats,
        diamondConfigId: form.diamondConfigId,
        makingCharge: form.makingCharge,
        gstPercent: form.gstPercent ?? 3,
      });
      setPreview(result);
      setPricingError(null);
      // Auto-apply the computed breakdown so a saved product's Price
      // Breakup is correct immediately — sellingPrice stays admin-set
      // ("Use this price" below applies it explicitly).
      setForm((f) => ({ ...f, goldValue: result.goldValue, diamondValue: result.diamondValue }));
      return true;
    } catch (err) {
      setPreview(null);
      setPricingError(err instanceof ApiError ? err.message : 'Could not preview pricing.');
      return false;
    } finally {
      setIsPreviewing(false);
    }
  }

  // Debounced auto-preview whenever the inputs that feed pricing change —
  // only once there's something meaningful to compute (a purity for GOLD,
  // or a diamond weight), so an empty new-product form doesn't error. Skips
  // price-locked products entirely — opening the edit form shouldn't
  // silently recompute a value the admin deliberately froze.
  useEffect(() => {
    if (productData?.product.isPriceLocked) return;
    const hasGoldInputs = form.metalType === 'GOLD' && !!form.purity && !!form.goldWeightGrams;
    const hasDiamondInputs = !!form.diamondWeightCarats && !!form.diamondConfigId;
    if (!hasGoldInputs && !hasDiamondInputs) return;

    const timer = setTimeout(() => {
      runPreview();
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.metalType,
    form.purity,
    form.goldWeightGrams,
    form.diamondWeightCarats,
    form.diamondConfigId,
    form.makingCharge,
    form.gstPercent,
  ]);

  function applyPreview() {
    if (!preview) return;
    setForm((f) => ({
      ...f,
      goldValue: preview.goldValue,
      diamondValue: preview.diamondValue,
      sellingPrice: preview.sellingPrice,
    }));
  }

  if (isEditing && isProductLoading) return <p>Loading…</p>;

  const categories = categoriesData?.categories ?? [];
  const collections = collectionsData?.collections ?? [];
  const isPriceLocked = productData?.product.isPriceLocked ?? false;

  return (
    <div>
      <div className={sharedStyles.pageHeader}>
        <h1 className={sharedStyles.pageTitle}>{isEditing ? 'Edit Product' : 'Add Product'}</h1>
      </div>

      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          // Only name and at least one image are required to save — every
          // other field (SKU, pricing, sizes, variations, SEO...) is
          // optional and can be filled in later.
          if (!form.name.trim()) {
            setError('Enter a product name.');
            return;
          }
          if (isEditing && (imagesData?.images.length ?? 0) === 0) {
            setError('Add at least one product image before saving — use Manual Upload or Generate with AI above.');
            return;
          }
          saveMutation.mutate();
        }}
      >
        <section className={sharedStyles.cardPadded}>
          <h2 className={styles.sectionHeading}>Basic Info</h2>
          <div className={sharedStyles.formGrid}>
            <label className={sharedStyles.field}>
              Name
              <input value={form.name} onChange={(e) => set('name', e.target.value)} required />
            </label>
            <label className={sharedStyles.field}>
              SKU (optional — auto-generated if left blank)
              <input value={form.sku} onChange={(e) => set('sku', e.target.value)} />
            </label>
            <label className={sharedStyles.field}>
              Status
              <select value={form.status} onChange={(e) => set('status', e.target.value as ProductStatus)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label className={sharedStyles.field}>
              Category
              <select
                value={form.categoryId ?? ''}
                onChange={(e) => set('categoryId', e.target.value || null)}
              >
                <option value="">— None —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={sharedStyles.field}>
              Collection
              <select
                value={form.collectionId ?? ''}
                onChange={(e) => set('collectionId', e.target.value || null)}
              >
                <option value="">— None —</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={`${sharedStyles.field} ${sharedStyles.formSection}`}>
            Short Description
            <textarea
              value={form.shortDescription ?? ''}
              onChange={(e) => set('shortDescription', e.target.value)}
              rows={2}
            />
          </label>
          <label className={`${sharedStyles.field} ${sharedStyles.formSection}`}>
            Full Description
            <textarea
              value={form.fullDescription ?? ''}
              onChange={(e) => set('fullDescription', e.target.value)}
              rows={4}
            />
          </label>
          <label className={`${sharedStyles.field} ${sharedStyles.checkboxField} ${sharedStyles.formSection}`}>
            <input
              type="checkbox"
              checked={form.showDeliveryChecker ?? false}
              onChange={(e) => set('showDeliveryChecker', e.target.checked)}
            />
            Show "Check Delivery &amp; Availability" pincode widget on the product page
          </label>
        </section>

        <section className={sharedStyles.cardPadded}>
          <h2 className={styles.sectionHeading}>Product Images</h2>
          {imageSourceError && <p className={sharedStyles.error}>{imageSourceError}</p>}
          <div className={styles.imageSourceGrid}>
            <div className={styles.imageSourceCard}>
              <p className={styles.imageSourceTitle}>Manual Upload</p>
              {isEditing ? (
                <ProductGallery productId={id as string} />
              ) : (
                <>
                  <p className={styles.imageSourceBody}>Upload your own featured and gallery images.</p>
                  <button
                    type="button"
                    className={sharedStyles.button}
                    disabled={createForManualUploadMutation.isPending}
                    onClick={handleManualUpload}
                  >
                    {createForManualUploadMutation.isPending ? 'Creating…' : 'Start Manual Upload'}
                  </button>
                </>
              )}
            </div>
            <div className={styles.imageSourceCardRecommended}>
              <span className={sharedStyles.badgeSuccess}>Recommended</span>
              <p className={styles.imageSourceTitle}>Generate with AI</p>
              <p className={styles.imageSourceBody}>
                Upload jewellery references and generate a front, 45° hero, presenter, and lifestyle image.
              </p>
              <button
                type="button"
                className={sharedStyles.buttonPrimary}
                disabled={createForStudioMutation.isPending}
                onClick={handleGenerateWithAI}
              >
                {createForStudioMutation.isPending ? 'Creating…' : 'Start AI Generation'}
              </button>
            </div>
          </div>
        </section>

        <section className={sharedStyles.cardPadded}>
          <h2 className={styles.sectionHeading}>Metal, Diamond &amp; Pricing</h2>
          <div className={sharedStyles.formGrid}>
            <label className={sharedStyles.field}>
              Metal Type
              <select value={form.metalType} onChange={(e) => set('metalType', e.target.value as MetalType)}>
                {METAL_TYPES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className={sharedStyles.field}>
              Purity {form.metalType === 'PLATINUM' && '(N/A for platinum)'}
              <select
                value={form.purity ?? ''}
                onChange={(e) => set('purity', (e.target.value || null) as Purity | null)}
                disabled={form.metalType === 'PLATINUM'}
              >
                <option value="">—</option>
                {PURITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className={sharedStyles.field}>
              Gold Color {form.metalType === 'PLATINUM' && '(N/A for platinum)'}
              <select
                value={form.goldColor ?? ''}
                onChange={(e) => set('goldColor', (e.target.value || null) as GoldColor | null)}
                disabled={form.metalType === 'PLATINUM'}
              >
                <option value="">—</option>
                {GOLD_COLORS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={sharedStyles.field}>
              Gold Weight (g)
              <input
                type="number"
                step="0.001"
                value={form.goldWeightGrams ?? ''}
                onChange={(e) => set('goldWeightGrams', e.target.value ? Number(e.target.value) : null)}
              />
            </label>
            <label className={sharedStyles.field}>
              Diamond Weight (g)
              <input
                type="number"
                step="0.001"
                min="0"
                placeholder="Added into Gross Weight"
                value={form.diamondWeightGrams ?? ''}
                onChange={(e) => set('diamondWeightGrams', e.target.value ? Number(e.target.value) : null)}
              />
              <span className={styles.sectionHint}>
                Gross Weight ≈ {(Number(form.goldWeightGrams ?? 0) + Number(form.diamondWeightGrams ?? 0)).toFixed(3)} g
                {' '}(Net Weight = Gold Weight only)
              </span>
            </label>
            <label className={sharedStyles.field}>
              Diamond Quality
              <select
                value={form.diamondConfigId ?? ''}
                onChange={(e) => set('diamondConfigId', e.target.value || null)}
              >
                <option value="">—</option>
                {(diamondConfigsData?.diamondConfigs ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (₹{c.ratePerCent.toLocaleString('en-IN')}/cent)
                  </option>
                ))}
              </select>
            </label>
            <label className={sharedStyles.field}>
              Diamond Carat (in cents) {form.diamondWeightCarats ? `— ${form.diamondWeightCarats} ct` : ''}
              <input
                type="number"
                step="0.1"
                // Entered/displayed in cents (1 carat = 100 cents) — stored as
                // carats under the hood so the pricing engine (rate-per-carat)
                // and everything downstream is untouched.
                value={form.diamondWeightCarats ? Math.round(form.diamondWeightCarats * 1000) / 10 : ''}
                onChange={(e) =>
                  set('diamondWeightCarats', e.target.value ? Number(e.target.value) / 100 : null)
                }
              />
            </label>
            <label className={sharedStyles.field}>
              Diamond Count
              <input
                type="number"
                value={form.diamondCount ?? ''}
                onChange={(e) => set('diamondCount', e.target.value ? Number(e.target.value) : null)}
              />
            </label>
            <label className={sharedStyles.field}>
              Certification
              <input value={form.certification ?? ''} onChange={(e) => set('certification', e.target.value)} />
            </label>
          </div>

          <div className={`${sharedStyles.formGrid} ${sharedStyles.formSection}`}>
            <label className={sharedStyles.field}>
              Making Charge (% of gold value)
              <input
                type="number"
                step="0.01"
                value={makingChargePercent}
                onChange={(e) => setMakingChargePercent(e.target.value === '' ? '' : Number(e.target.value))}
              />
              <span className={styles.sectionHint}>≈ {formatPrice(form.makingCharge ?? 0)}</span>
            </label>
            <label className={sharedStyles.field}>
              GST %
              <input
                type="number"
                step="0.01"
                value={form.gstPercent ?? ''}
                onChange={(e) => set('gstPercent', e.target.value ? Number(e.target.value) : undefined)}
              />
            </label>
            <label className={sharedStyles.field}>
              MRP (₹)
              <input
                type="number"
                value={form.mrp ?? ''}
                onChange={(e) => set('mrp', e.target.value ? Number(e.target.value) : undefined)}
              />
            </label>
          </div>

          <div className={styles.previewBox}>
            <button type="button" className={sharedStyles.button} onClick={runPreview} disabled={isPreviewing}>
              {isPreviewing ? 'Calculating…' : 'Preview Live Price'}
            </button>
            {pricingError && <p className={sharedStyles.error}>{pricingError}</p>}
            {preview && (
              <div className={styles.previewResult}>
                <span>Gold/Metal: {formatPrice(preview.goldValue)}</span>
                <span>Diamond: {formatPrice(preview.diamondValue)}</span>
                <span className={styles.previewTotal}>Suggested Selling Price: {formatPrice(preview.sellingPrice)}</span>
                <button type="button" className={sharedStyles.buttonLink} onClick={applyPreview}>
                  Use this price
                </button>
              </div>
            )}
          </div>

          <label className={`${sharedStyles.field} ${sharedStyles.formSection}`}>
            Selling Price (₹) — final, admin-overridable
            <input
              type="number"
              value={form.sellingPrice ?? 0}
              onChange={(e) => set('sellingPrice', Number(e.target.value))}
            />
          </label>

          {isEditing && (
            <label className={`${sharedStyles.field} ${sharedStyles.checkboxField} ${sharedStyles.formSection}`}>
              <input
                type="checkbox"
                checked={isPriceLocked}
                onChange={(e) => priceLockMutation.mutate(e.target.checked)}
              />
              Lock price (exclude from automatic gold-rate recalculation)
            </label>
          )}
        </section>

        <section className={sharedStyles.cardPadded}>
          <h2 className={styles.sectionHeading}>Available Sizes</h2>
          <p className={styles.sectionHint}>
            Optional — leave empty for products that don't need a size choice. When set, shoppers must
            pick one of these before adding to cart, each size tracks its own stock, and can optionally
            override the product's gold weight for that size's price (e.g. a bigger size uses more gold).
          </p>
          <div className={styles.sizeRows}>
            {(form.sizes ?? []).map((size, i) => (
              <div key={i} className={styles.sizeCard}>
                <div className={styles.sizeCardHeader}>
                  <span className={styles.sizeCardTitle}>Size {i + 1}</span>
                  <button type="button" className={sharedStyles.buttonLink} onClick={() => removeSizeRow(i)}>
                    Remove
                  </button>
                </div>
                <div className={styles.sizeCardFields}>
                  <label className={sharedStyles.field}>
                    Label
                    <input
                      value={size.label}
                      placeholder="e.g. 6"
                      onChange={(e) => updateSizeRow(i, { label: e.target.value })}
                    />
                  </label>
                  <label className={sharedStyles.field}>
                    Stock
                    <input
                      type="number"
                      min="0"
                      value={size.stockQuantity === 0 ? '' : size.stockQuantity}
                      onChange={(e) =>
                        updateSizeRow(i, { stockQuantity: e.target.value === '' ? 0 : Number(e.target.value) })
                      }
                    />
                  </label>
                  <label className={sharedStyles.field}>
                    Weight (g) — optional
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="Uses product weight"
                      value={size.weightGrams ?? ''}
                      onChange={(e) =>
                        updateSizeRow(i, { weightGrams: e.target.value ? Number(e.target.value) : null })
                      }
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className={sharedStyles.button} onClick={addSizeRow}>
            + Add Size
          </button>
        </section>

        <section className={sharedStyles.cardPadded}>
          <h2 className={styles.sectionHeading}>Customer-Selectable Variations</h2>
          <p className={styles.sectionHint}>
            Optional — pick which Gold Colors, Purities, and Diamond Qualities shoppers can choose
            between on this product. Purity and Diamond Quality change the live computed price;
            Gold Color is display-only. Leave everything unchecked for a single fixed configuration
            (today's behaviour).
          </p>

          <div className={styles.variantGroup}>
            <span className={styles.variantGroupLabel}>Gold Colors</span>
            <div className={styles.checkboxRow}>
              {GOLD_COLORS.map((c) => (
                <label key={c.value} className={styles.checkboxChip}>
                  <input
                    type="checkbox"
                    checked={(form.goldColors ?? []).includes(c.value)}
                    onChange={() => toggleGoldColor(c.value)}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </div>

          <div className={styles.variantGroup}>
            <span className={styles.variantGroupLabel}>Purity Options</span>
            <div className={styles.checkboxRow}>
              {PURITIES.map((p) => (
                <label key={p} className={styles.checkboxChip}>
                  <input
                    type="checkbox"
                    checked={(form.purities ?? []).includes(p)}
                    onChange={() => togglePurityOption(p)}
                  />
                  {p}
                </label>
              ))}
            </div>
          </div>

          <div className={styles.variantGroup}>
            <span className={styles.variantGroupLabel}>Diamond Quality Options</span>
            {(diamondConfigsData?.diamondConfigs ?? []).length === 0 ? (
              <p className={styles.sectionHint}>No diamond quality tiers exist yet — add one on the Pricing page.</p>
            ) : (
              <div className={styles.checkboxRow}>
                {(diamondConfigsData?.diamondConfigs ?? []).map((c) => (
                  <label key={c.id} className={styles.checkboxChip}>
                    <input
                      type="checkbox"
                      checked={(form.diamondConfigIds ?? []).includes(c.id)}
                      onChange={() => toggleDiamondOption(c.id)}
                    />
                    {c.name} (₹{c.ratePerCent.toLocaleString('en-IN')}/cent)
                  </label>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className={sharedStyles.cardPadded}>
          <h2 className={styles.sectionHeading}>SEO</h2>
          <label className={sharedStyles.field}>
            Meta Title
            <input value={form.metaTitle ?? ''} onChange={(e) => set('metaTitle', e.target.value)} />
          </label>
          <label className={`${sharedStyles.field} ${sharedStyles.formSection}`}>
            Meta Description
            <textarea value={form.metaDescription ?? ''} onChange={(e) => set('metaDescription', e.target.value)} rows={2} />
          </label>
          <label className={`${sharedStyles.field} ${sharedStyles.formSection}`}>
            Meta Keywords
            <input value={form.metaKeywords ?? ''} onChange={(e) => set('metaKeywords', e.target.value)} />
          </label>
        </section>

        {error && <p className={sharedStyles.error}>{error}</p>}

        <div className={sharedStyles.formActions}>
          <button type="submit" className={sharedStyles.buttonPrimary} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : 'Save Product'}
          </button>
          <button type="button" className={sharedStyles.button} onClick={() => navigate('/products')}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
