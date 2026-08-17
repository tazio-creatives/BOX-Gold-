import type { Category } from '../api/types';

export interface CategoryTreeNode extends Category {
  children: CategoryTreeNode[];
  depth: number;
}

export function buildCategoryTree(categories: Category[]): CategoryTreeNode[] {
  const nodeById = new Map<string, CategoryTreeNode>(
    categories.map((c) => [c.id, { ...c, children: [], depth: 0 }]),
  );
  const roots: CategoryTreeNode[] = [];

  for (const category of categories) {
    const node = nodeById.get(category.id)!;
    if (category.parentId) {
      const parent = nodeById.get(category.parentId);
      if (parent) {
        node.depth = parent.depth + 1;
        parent.children.push(node);
        continue;
      }
    }
    roots.push(node);
  }

  const sortNodes = (nodes: CategoryTreeNode[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder);
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);

  return roots;
}

export function flattenTree(nodes: CategoryTreeNode[]): CategoryTreeNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)]);
}
