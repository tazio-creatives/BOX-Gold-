import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  fetchHomepageSections,
  createSection,
  updateSection,
  deleteSection,
  reorderSections,
  createItem,
  updateItem,
  deleteItem,
  reorderItems,
} from '../api/homepage';
import type { HomepageItem, HomepageItemInput, HomepageSection, HomepageSectionType } from '../api/types';
import { HomepageItemForm } from '../features/homepage/HomepageItemForm';
import { ConfirmDialog } from '../components/ConfirmDialog';
import sharedStyles from '../styles/shared.module.css';
import styles from './HomepagePage.module.css';

// Section types whose tiles are auto-derived server-side (from categories /
// products tables) rather than manually curated per homepage_item — see
// homepage.repository.js's getEnabledSectionsWithItems. Keep in sync with
// that file's special-cased section types.
const AUTO_SYNCED_TYPES: HomepageSectionType[] = ['BENTO_CATEGORIES', 'NEW_ARRIVALS', 'FEATURED_PRODUCT'];

const SECTION_TYPES: HomepageSectionType[] = [
  'HERO',
  'BENTO_CATEGORIES',
  'NEW_ARRIVALS',
  'COLLECTION_CARDS',
  'SHOP_BY_MATERIAL',
  'FEATURED_PRODUCT',
  'BEST_SELLERS',
  'SHOP_BY_PRICE',
  'OCCASION_CARDS',
  'INSTAGRAM',
  'NEWSLETTER',
  'TRUST_STRIP',
  'CAMPAIGN_BANNERS',
  'CATEGORY_PRODUCTS',
];

// Friendly names matching the actual storefront headings — the raw type
// name (e.g. "OCCASION CARDS") doesn't read as "Shop by Occasion", which
// made the option hard to find by eye in the Add Section dropdown.
const SECTION_TYPE_LABELS: Record<HomepageSectionType, string> = {
  HERO: 'Hero Banner',
  BENTO_CATEGORIES: 'Shop by Category',
  NEW_ARRIVALS: 'New Arrivals',
  COLLECTION_CARDS: 'Curated Collections',
  SHOP_BY_MATERIAL: 'Shop by Material',
  FEATURED_PRODUCT: 'Featured Products',
  BEST_SELLERS: 'Best Sellers',
  SHOP_BY_PRICE: 'Shop by Price',
  OCCASION_CARDS: 'Shop by Occasion',
  INSTAGRAM: 'Instagram Feed',
  NEWSLETTER: 'Newsletter',
  TRUST_STRIP: 'Trust Strip',
  CAMPAIGN_BANNERS: 'Campaign Banners',
  CATEGORY_PRODUCTS: 'Category Products',
};

function imageForItem(item: HomepageItem): string | null {
  return item.imageUrl;
}

function SectionHeadingInput({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      className={styles.headingInput}
      value={draft}
      placeholder="(no heading)"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
    />
  );
}

export function HomepagePage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin-homepage'], queryFn: fetchHomepageSections });

  const [addingItemTo, setAddingItemTo] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<HomepageItem | null>(null);
  const [newSectionType, setNewSectionType] = useState<HomepageSectionType>('HERO');
  const [pendingDeleteSection, setPendingDeleteSection] = useState<HomepageSection | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-homepage'] });

  const createSectionMutation = useMutation({
    mutationFn: () => createSection(newSectionType),
    onSuccess: invalidate,
  });
  const updateSectionMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: { heading?: string | null; isEnabled?: boolean } }) =>
      updateSection(id, input),
    onSuccess: invalidate,
  });
  const deleteSectionMutation = useMutation({
    mutationFn: (id: string) => deleteSection(id),
    onSuccess: () => {
      invalidate();
      setPendingDeleteSection(null);
    },
  });
  const reorderSectionsMutation = useMutation({
    mutationFn: (order: number[]) => reorderSections(order),
    onSuccess: invalidate,
  });

  const createItemMutation = useMutation({
    mutationFn: ({ sectionId, input }: { sectionId: string; input: HomepageItemInput }) =>
      createItem(sectionId, input),
    onSuccess: () => {
      invalidate();
      setAddingItemTo(null);
    },
  });
  const updateItemMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: HomepageItemInput }) => updateItem(id, input),
    onSuccess: () => {
      invalidate();
      setEditingItem(null);
    },
  });
  const deleteItemMutation = useMutation({
    mutationFn: (id: string) => deleteItem(id),
    onSuccess: invalidate,
  });
  const reorderItemsMutation = useMutation({
    mutationFn: ({ sectionId, order }: { sectionId: string; order: number[] }) => reorderItems(sectionId, order),
    onSuccess: invalidate,
  });

  if (isLoading) return <p>Loading…</p>;
  const sections = data?.sections ?? [];

  function moveSection(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    const order = sections.map((s) => s.sortOrder);
    [order[index], order[target]] = [order[target], order[index]];
    reorderSectionsMutation.mutate(order);
  }

  function moveItem(section: HomepageSection, index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= section.items.length) return;
    const order = section.items.map((it) => it.sortOrder);
    [order[index], order[target]] = [order[target], order[index]];
    reorderItemsMutation.mutate({ sectionId: section.id, order });
  }

  return (
    <div>
      <div className={sharedStyles.pageHeader}>
        <h1 className={sharedStyles.pageTitle}>Homepage</h1>
        <div className={styles.addSectionRow}>
          <select value={newSectionType} onChange={(e) => setNewSectionType(e.target.value as HomepageSectionType)}>
            {SECTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {SECTION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={sharedStyles.buttonPrimary}
            disabled={createSectionMutation.isPending}
            onClick={() => createSectionMutation.mutate()}
          >
            Add Section
          </button>
        </div>
      </div>

      <div className={styles.list}>
        {sections.map((section, i) => (
          <div key={section.id} className={sharedStyles.card}>
            <div className={styles.sectionRow}>
              <div className={styles.moveButtons}>
                <button type="button" onClick={() => moveSection(i, -1)} disabled={i === 0}>
                  ↑
                </button>
                <button type="button" onClick={() => moveSection(i, 1)} disabled={i === sections.length - 1}>
                  ↓
                </button>
              </div>

              <div className={styles.sectionInfo}>
                <p className={styles.sectionType}>{SECTION_TYPE_LABELS[section.type]}</p>
                <SectionHeadingInput
                  value={section.heading ?? ''}
                  onCommit={(heading) => updateSectionMutation.mutate({ id: section.id, input: { heading } })}
                />
              </div>

              <span className={section.isEnabled ? sharedStyles.badgeSuccess : sharedStyles.badgeNeutral}>
                {section.isEnabled ? 'Enabled' : 'Disabled'}
              </span>

              <div className={styles.sectionActions}>
                <button
                  type="button"
                  className={sharedStyles.buttonLink}
                  onClick={() =>
                    updateSectionMutation.mutate({ id: section.id, input: { isEnabled: !section.isEnabled } })
                  }
                >
                  {section.isEnabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  type="button"
                  className={sharedStyles.buttonLink}
                  onClick={() => setPendingDeleteSection(section)}
                >
                  Delete
                </button>
              </div>
            </div>

            {section.type === 'BENTO_CATEGORIES' && (
              <div className={styles.itemsPanel}>
                <p className={sharedStyles.empty}>
                  Tiles for this section are generated automatically from your active top-level categories (manage
                  them on the Categories page — name, image, and order there control what shows here). There's
                  nothing to add or edit in this panel.
                </p>
              </div>
            )}

            {section.type === 'NEW_ARRIVALS' && (
              <div className={styles.itemsPanel}>
                <p className={sharedStyles.empty}>
                  Tiles for this section are generated automatically from your 8 most recently published products
                  (manage products on the Products page — publishing a new one, or changing its photo, updates what
                  shows here). There's nothing to add or edit in this panel.
                </p>
              </div>
            )}

            {section.type === 'FEATURED_PRODUCT' && (
              <div className={styles.itemsPanel}>
                <p className={sharedStyles.empty}>
                  This section shows whichever products you've marked "Featured" on the Products page (use the star
                  button on each row). There's nothing to add or edit in this panel.
                </p>
              </div>
            )}

            {!AUTO_SYNCED_TYPES.includes(section.type) && (
              <div className={styles.itemsPanel}>
                {section.type === 'CATEGORY_PRODUCTS' && (
                  <p className={sharedStyles.empty}>
                    Add one item per category using "Link to Category" below — its heading/image/product/CTA fields
                    aren't used here. The 5 most recently published products in that category (and its
                    subcategories) show automatically and stay up to date on their own.
                  </p>
                )}
                {section.items.map((item, itemIndex) =>
                  editingItem?.id === item.id ? (
                    <HomepageItemForm
                      key={item.id}
                      initial={item}
                      onSubmit={(input) => updateItemMutation.mutateAsync({ id: item.id, input })}
                      onCancel={() => setEditingItem(null)}
                    />
                  ) : (
                    <div key={item.id} className={styles.itemRow}>
                      {imageForItem(item) ? (
                        <img src={imageForItem(item) as string} alt="" className={styles.itemThumb} />
                      ) : (
                        <span className={styles.itemThumbPlaceholder} />
                      )}
                      <div className={styles.moveButtons}>
                        <button type="button" onClick={() => moveItem(section, itemIndex, -1)} disabled={itemIndex === 0}>
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(section, itemIndex, 1)}
                          disabled={itemIndex === section.items.length - 1}
                        >
                          ↓
                        </button>
                      </div>
                      <span className={styles.itemHeading}>{item.heading ?? '(no heading)'}</span>
                      <span className={styles.itemMeta}>
                        {item.categoryId && 'Category'}
                        {item.collectionId && 'Collection'}
                        {item.productId && 'Product'}
                        {item.ctaUrl && `→ ${item.ctaUrl}`}
                      </span>
                      <div className={styles.itemActions}>
                        <button type="button" className={sharedStyles.buttonLink} onClick={() => setEditingItem(item)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className={sharedStyles.buttonLink}
                          onClick={() => deleteItemMutation.mutate(item.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ),
                )}

                {addingItemTo === section.id ? (
                  <HomepageItemForm
                    onSubmit={(input) => createItemMutation.mutateAsync({ sectionId: section.id, input })}
                    onCancel={() => setAddingItemTo(null)}
                  />
                ) : (
                  <button
                    type="button"
                    className={sharedStyles.button}
                    onClick={() => setAddingItemTo(section.id)}
                  >
                    + Add Item
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {pendingDeleteSection && (
        <ConfirmDialog
          title="Delete section"
          message={`Delete the "${SECTION_TYPE_LABELS[pendingDeleteSection.type]}" section? This cannot be undone.`}
          isPending={deleteSectionMutation.isPending}
          onConfirm={() => deleteSectionMutation.mutate(pendingDeleteSection.id)}
          onCancel={() => setPendingDeleteSection(null)}
        />
      )}
    </div>
  );
}
