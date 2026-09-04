"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { motion } from "framer-motion";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import type { AppDatabase, DatabaseRow, PropertyDef } from "@/types/models";
import { useWorkspace } from "@/lib/data/provider";
import { PropertyCell, SelectChip } from "./property-cell";
import { WorkspaceIcon } from "@/lib/icons/workspace-icon";
import { Button } from "@/components/ui/button";
import { EmptyState, Tabs, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * ETAPA 6 — Flexible database surface: Table and Kanban over the same rows,
 * with inline editing everywhere and drag-and-drop between Kanban columns.
 */
export function DatabaseView({ database }: { database: AppDatabase }) {
  const { adapter } = useWorkspace();
  const [view, setView] = useState<"table" | "kanban">(database.views[0]?.type === "kanban" ? "kanban" : "table");

  const titleProperty = database.properties.find((p) => p.type === "title") ?? database.properties[0];
  const groupProperty =
    database.properties.find(
      (p) => p.id === database.views.find((v) => v.type === "kanban")?.groupByPropertyId
    ) ?? database.properties.find((p) => p.type === "select");

  const addRow = (presetValues: Record<string, unknown> = {}) =>
    adapter.upsertRow(database.id, {
      values: { [titleProperty.id]: "Novo registro", ...presetValues } as DatabaseRow["values"],
      order: database.rows.length,
    });

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-[var(--border)] bg-[var(--canvas)]/85 px-5 py-3 backdrop-blur-xl md:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <WorkspaceIcon icon={database.icon} fallback="🗂️" size={20} />
          <div className="min-w-0">
            <h1 className="truncate text-[16px] font-semibold tracking-[-0.015em] text-ink">
              {database.name}
            </h1>
            <p className="text-[11.5px] text-muted">
              {database.rows.length} registros · {database.properties.length} propriedades
              {database.notionDatabaseId ? " · importada do Notion" : ""}
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Tabs value={view} onValueChange={(value) => setView(value as "table" | "kanban")}>
            <TabsList>
              <TabsTrigger value="table">Tabela</TabsTrigger>
              <TabsTrigger value="kanban">Kanban</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="primary" size="sm" onClick={() => addRow()}>
            Novo
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-5 md:px-8">
        {!database.rows.length ? (
          <EmptyState
            title="Nenhum registro ainda"
            description="Crie o primeiro item ou importe uma base de dados do Notion - propriedades, seleções e datas são convertidas automaticamente."
            action={
              <Button variant="secondary" onClick={() => addRow()}>
                Criar registro
              </Button>
            }
          />
        ) : view === "table" ? (
          <TableView database={database} titleProperty={titleProperty} onAddRow={() => addRow()} />
        ) : groupProperty ? (
          <KanbanView database={database} groupProperty={groupProperty} titleProperty={titleProperty} onAddRow={addRow} />
        ) : (
          <EmptyState
            title="Sem propriedade de agrupamento"
            description="Adicione uma propriedade do tipo seleção para usar a visualização Kanban."
          />
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Table view */

function TableView({
  database,
  titleProperty,
  onAddRow,
}: {
  database: AppDatabase;
  titleProperty: PropertyDef;
  onAddRow: () => void;
}) {
  const { adapter } = useWorkspace();
  const properties = useMemo(
    () => [...database.properties].filter((p) => !p.hidden).sort((a, b) => a.order - b.order),
    [database.properties]
  );

  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-[var(--border)]">
            {properties.map((property) => (
              <th
                key={property.id}
                style={{ width: property.width }}
                className="whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint"
              >
                {property.name}
              </th>
            ))}
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {database.rows.map((row) => (
            <tr key={row.id} className="group border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-hover)]">
              {properties.map((property) => (
                <td key={property.id} className="align-middle">
                  <PropertyCell
                    property={property}
                    value={row.values[property.id] ?? null}
                    onChange={(next) =>
                      adapter.upsertRow(database.id, {
                        id: row.id,
                        values: { ...row.values, [property.id]: next },
                      })
                    }
                  />
                </td>
              ))}
              <td className="pr-2 text-right">
                <button
                  onClick={() => adapter.deleteRow(database.id, row.id)}
                  className="rounded p-1 text-faint opacity-0 transition group-hover:opacity-100 hover:text-[var(--danger)]"
                  aria-label={`Excluir ${row.values[titleProperty.id] ?? "registro"}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </td>
            </tr>
          ))}
          <tr>
            <td colSpan={properties.length + 1}>
              <button
                onClick={onAddRow}
                className="flex w-full items-center gap-2 px-3 py-2 text-[12.5px] text-faint transition hover:bg-[var(--surface-hover)] hover:text-ink"
              >
                <Plus className="size-3.5" /> Novo registro
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------------- Kanban view */

function KanbanView({
  database,
  groupProperty,
  titleProperty,
  onAddRow,
}: {
  database: AppDatabase;
  groupProperty: PropertyDef;
  titleProperty: PropertyDef;
  onAddRow: (preset: Record<string, unknown>) => void;
}) {
  const { adapter } = useWorkspace();
  const [dragging, setDragging] = useState<DatabaseRow | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const columns = useMemo(() => {
    const options = groupProperty.options ?? [];
    const buckets = options.map((option) => ({
      id: option.name,
      name: option.name,
      color: option.color,
      rows: database.rows.filter((row) => row.values[groupProperty.id] === option.name),
    }));
    const ungrouped = database.rows.filter(
      (row) => !options.some((option) => option.name === row.values[groupProperty.id])
    );
    if (ungrouped.length) {
      buckets.push({ id: "__none__", name: "Sem status", color: undefined, rows: ungrouped });
    }
    return buckets;
  }, [database.rows, groupProperty]);

  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const rowId = String(event.active.id);
    const target = event.over?.id ? String(event.over.id) : null;
    if (!target) return;
    const row = database.rows.find((r) => r.id === rowId);
    if (!row) return;
    const nextValue = target === "__none__" ? null : target;
    if (row.values[groupProperty.id] === nextValue) return;
    void adapter.upsertRow(database.id, {
      id: rowId,
      values: { ...row.values, [groupProperty.id]: nextValue },
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(event: DragStartEvent) =>
        setDragging(database.rows.find((r) => r.id === String(event.active.id)) ?? null)
      }
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map((column) => (
          <KanbanColumn
            key={column.id}
            id={column.id}
            name={column.name}
            color={column.color}
            count={column.rows.length}
            onAdd={() =>
              onAddRow({ [groupProperty.id]: column.id === "__none__" ? null : column.name })
            }
          >
            {column.rows.map((row) => (
              <KanbanCard
                key={row.id}
                row={row}
                database={database}
                titleProperty={titleProperty}
                groupPropertyId={groupProperty.id}
              />
            ))}
          </KanbanColumn>
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.16,1,0.3,1)" }}>
        {dragging ? (
          <div className="w-[260px] rotate-2 rounded-[var(--radius-md)] border border-[var(--accent)] bg-[var(--surface)] p-3 shadow-[var(--shadow-float)]">
            <p className="text-[12.5px] font-medium text-ink">
              {String(dragging.values[titleProperty.id] ?? "Registro")}
            </p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  id,
  name,
  color,
  count,
  onAdd,
  children,
}: {
  id: string;
  name: string;
  color?: string;
  count: number;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[280px] shrink-0 flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] transition-colors",
        isOver && "border-[var(--accent)] bg-[var(--accent-soft)]/30"
      )}
    >
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
        <SelectChip value={name} color={color} />
        <span className="text-[11px] text-faint">{count}</span>
        <button
          onClick={onAdd}
          className="ml-auto rounded p-1 text-faint transition hover:bg-[var(--surface-hover)] hover:text-ink"
          aria-label={`Adicionar em ${name}`}
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <div className="flex min-h-[120px] flex-col gap-2 p-2">{children}</div>
    </div>
  );
}

function KanbanCard({
  row,
  database,
  titleProperty,
  groupPropertyId,
}: {
  row: DatabaseRow;
  database: AppDatabase;
  titleProperty: PropertyDef;
  groupPropertyId: string;
}) {
  const { adapter } = useWorkspace();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: row.id });

  const visibleProps = database.properties
    .filter((p) => p.id !== titleProperty.id && p.id !== groupPropertyId && !p.hidden)
    .slice(0, 3);

  return (
    <motion.div
      ref={setNodeRef}
      layout
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(
        "group rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] p-2.5 transition-shadow",
        isDragging ? "opacity-40" : "hover:shadow-[var(--shadow-panel)]"
      )}
    >
      <div className="flex items-start gap-1.5">
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab rounded p-0.5 text-faint opacity-0 transition group-hover:opacity-100 active:cursor-grabbing"
          aria-label="Arrastar cartão"
        >
          <GripVertical className="size-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <PropertyCell
            compact
            property={titleProperty}
            value={row.values[titleProperty.id] ?? null}
            onChange={(next) =>
              adapter.upsertRow(database.id, {
                id: row.id,
                values: { ...row.values, [titleProperty.id]: next },
              })
            }
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {visibleProps.map((property) => {
              const value = row.values[property.id];
              if (value === null || value === undefined || value === "") return null;
              if (property.type === "multi_select" && Array.isArray(value)) {
                return value.map((item) => (
                  <SelectChip
                    key={`${property.id}-${item}`}
                    value={String(item)}
                    color={property.options?.find((o) => o.name === item)?.color}
                  />
                ));
              }
              if (property.type === "select") {
                return (
                  <SelectChip
                    key={property.id}
                    value={String(value)}
                    color={property.options?.find((o) => o.name === value)?.color}
                  />
                );
              }
              return (
                <span key={property.id} className="text-[11px] text-muted">
                  {property.name}: <span className="text-ink">{String(value)}</span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
