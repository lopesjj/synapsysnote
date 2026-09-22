"use client";

import { ArrowDownWideNarrow, ArrowUpWideNarrow, ArrowUpDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/primitives";
import { useUiStore, type ListSortKey, type ListSortScope } from "@/lib/store/ui-store";
import { useTranslation, type TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";
import type { SortDirectionPreference } from "@/types/models";

const SORT_OPTIONS: { key: ListSortKey; labelKey: TranslationKey }[] = [
  { key: "manual", labelKey: "sort_manual" },
  { key: "name", labelKey: "sort_name" },
  { key: "updated", labelKey: "sort_updated" },
  { key: "created", labelKey: "sort_created" },
];

export function ListSortControl({
  scope,
  sort,
  direction,
  className,
}: {
  scope: ListSortScope;
  sort: ListSortKey;
  direction: SortDirectionPreference;
  className?: string;
}) {
  const { t } = useTranslation();
  const current = SORT_OPTIONS.find((option) => option.key === sort) ?? SORT_OPTIONS[0];

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Menu>
        <MenuTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5 font-medium"
            aria-label={t("sort_order_label")}
          >
            <ArrowUpDown className="size-3.5" />
            {t(current.labelKey)}
          </Button>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuLabel>{t("sort_by")}</MenuLabel>
          {SORT_OPTIONS.map((option) => (
            <MenuItem
              key={option.key}
              onSelect={() => useUiStore.getState().setListSort(scope, option.key)}
            >
              <Check
                className={cn("size-3.5", option.key === sort ? "opacity-100" : "opacity-0")}
              />
              {t(option.labelKey)}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>

      {sort === "manual" ? null : (
        <Tooltip label={direction === "desc" ? t("descending") : t("ascending")}>
          <Button
            variant="secondary"
            size="icon-sm"
            onClick={() => useUiStore.getState().toggleListSortDirection(scope)}
            aria-label={t("invert_sort")}
          >
            {direction === "desc" ? <ArrowDownWideNarrow /> : <ArrowUpWideNarrow />}
          </Button>
        </Tooltip>
      )}
    </div>
  );
}
