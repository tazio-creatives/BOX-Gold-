import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAdminCategories } from '../api/categories';
import { buildCategoryTree, flattenTree } from '../utils/categoryTree';
import styles from './CategoryTreeSelect.module.css';

interface CategoryTreeSelectProps {
  values: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
}

// Full checkbox tree (not a searchable dropdown — a Category-scope pricing
// rule is normally picking a handful of nodes out of a catalogue small
// enough to browse, same reasoning CategoriesPage's own admin screen uses)
// reusing buildCategoryTree/flattenTree (utils/categoryTree.ts) and the
// depth*24px indentation convention from CategoriesPage.tsx.
export function CategoryTreeSelect({ values, onChange, disabled }: CategoryTreeSelectProps) {
  const [filter, setFilter] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['admin-categories'], queryFn: fetchAdminCategories });
  const tree = useMemo(() => buildCategoryTree(data?.categories ?? []), [data]);
  const flat = useMemo(() => flattenTree(tree), [tree]);

  const visible = filter.trim()
    ? flat.filter((n) => n.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : flat;

  function toggle(id: string) {
    onChange(values.includes(id) ? values.filter((v) => v !== id) : [...values, id]);
  }

  if (isLoading) return <p className={styles.message}>Loading categories…</p>;
  if (flat.length === 0) return <p className={styles.message}>No categories yet.</p>;

  return (
    <div className={styles.wrap}>
      <input
        className={styles.filterInput}
        placeholder="Filter categories…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        disabled={disabled}
      />
      <div className={styles.tree}>
        {visible.length === 0 && <p className={styles.message}>No categories match "{filter}".</p>}
        {visible.map((node) => (
          <label
            key={node.id}
            className={styles.row}
            style={{ paddingLeft: (filter.trim() ? 0 : node.depth * 20) + 12 }}
          >
            <input
              type="checkbox"
              checked={values.includes(node.id)}
              onChange={() => toggle(node.id)}
              disabled={disabled}
            />
            <span className={node.isActive ? undefined : styles.inactive}>{node.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
