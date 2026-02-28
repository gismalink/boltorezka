import { useCallback, useEffect, useState } from "react";
import type { RoomsTreeResponse } from "../domain";

const COLLAPSED_CATEGORIES_STORAGE_KEY = "boltorezka_collapsed_category_ids";

export function useCollapsedCategories(roomsTree: RoomsTreeResponse | null) {
  const [collapsedCategoryIds, setCollapsedCategoryIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_CATEGORIES_STORAGE_KEY);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(COLLAPSED_CATEGORIES_STORAGE_KEY, JSON.stringify(collapsedCategoryIds));
  }, [collapsedCategoryIds]);

  useEffect(() => {
    if (!roomsTree) {
      return;
    }

    const validIds = new Set(roomsTree.categories.map((category) => category.id));
    setCollapsedCategoryIds((prev) => prev.filter((categoryId) => validIds.has(categoryId)));
  }, [roomsTree]);

  const toggleCategoryCollapsed = useCallback((categoryId: string) => {
    setCollapsedCategoryIds((prev) =>
      prev.includes(categoryId) ? prev.filter((item) => item !== categoryId) : [...prev, categoryId]
    );
  }, []);

  return {
    collapsedCategoryIds,
    toggleCategoryCollapsed
  };
}
