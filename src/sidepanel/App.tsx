import {
  ArrowRightLeft,
  Archive,
  ArchiveRestore,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Database,
  Download,
  Folder,
  FolderPlus,
  FileText,
  GripVertical,
  Inbox,
  Layers3,
  Menu,
  MoreHorizontal,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Shield,
  ShieldOff,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-preact";
import MiniSearch from "minisearch";
import { type ComponentChildren, type ComponentProps } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { exportVaultData } from "../shared/db";
import { sortCollections } from "../shared/collections";
import { t, uiLocale } from "../shared/i18n";
import { matchesResourceSubstring } from "../shared/search";
import type {
  Collection,
  CollectionColor,
  Resource,
  ResourceRuntimeState,
  Rule,
  Snapshot,
  TabInstance,
  VaultCommand,
  VaultSettings,
  VaultState,
} from "../shared/types";
import { splitRuleValues } from "../shared/url";
import { downloadBackup, readBackup, sendCommand } from "./api";

type ViewKey =
  | "groups"
  | "all"
  | "open"
  | "discarded"
  | "virtual"
  | "duplicates"
  | "ungrouped"
  | `collection:${string}`;

type SortMode = "recent" | "title" | "visits";
type SleepScope = Extract<
  VaultCommand,
  { type: "DISCARD_ELIGIBLE_TABS" }
>["scope"];

type DialogKey =
  | "collection"
  | "sleep-tabs"
  | "rules"
  | "settings"
  | "snapshots"
  | "add-to-group"
  | "rename-resource"
  | "move-resource"
  | "backup"
  | null;

interface ResourceView {
  resource: Resource;
  instances: TabInstance[];
  state: ResourceRuntimeState;
  collectionIds: string[];
}

const COLLECTION_COLORS: CollectionColor[] = [
  "blue",
  "navy",
  "sky",
  "cyan",
  "teal",
  "mint",
  "green",
  "lime",
  "olive",
  "amber",
  "gold",
  "orange",
  "coral",
  "red",
  "rose",
  "pink",
  "violet",
  "plum",
  "indigo",
  "gray",
];

const PRIVACY_POLICY_URL =
  "https://github.com/theZmemo/tab-vault-extension/blob/main/PRIVACY.md";

const COLLECTION_COLOR_LABELS: Record<CollectionColor, string> = {
  blue: t("colorBlue"),
  navy: t("colorNavy"),
  sky: t("colorSky"),
  cyan: t("colorCyan"),
  teal: t("colorTeal"),
  mint: t("colorMint"),
  green: t("colorGreen"),
  lime: t("colorLime"),
  olive: t("colorOlive"),
  amber: t("colorAmber"),
  gold: t("colorGold"),
  orange: t("colorOrange"),
  coral: t("colorCoral"),
  red: t("colorRed"),
  rose: t("colorRose"),
  pink: t("colorPink"),
  violet: t("colorViolet"),
  plum: t("colorPlum"),
  indigo: t("colorIndigo"),
  gray: t("colorGray"),
};

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function getRuntimeState(instances: TabInstance[]): ResourceRuntimeState {
  if (instances.length === 0) {
    return "virtual";
  }
  if (instances.every((instance) => instance.discarded)) {
    return "discarded";
  }
  return "open";
}

function getDomainTone(domain: string): number {
  let hash = 0;
  for (const character of domain) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }
  return Math.abs(hash) % 8;
}

function formatRelativeTime(timestamp: number): string {
  const elapsed = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (elapsed < minute) {
    return t("justNow");
  }
  if (elapsed < hour) {
    return t("minutesAgo", { count: Math.floor(elapsed / minute) });
  }
  if (elapsed < day) {
    return t("hoursAgo", { count: Math.floor(elapsed / hour) });
  }
  if (elapsed < 30 * day) {
    return t("daysAgo", { count: Math.floor(elapsed / day) });
  }
  return new Intl.DateTimeFormat(uiLocale, {
    month: "short",
    day: "numeric",
  }).format(timestamp);
}

function formatSnapshotTime(timestamp: number): string {
  return new Intl.DateTimeFormat(uiLocale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp);
}

function IconButton({
  label,
  className,
  children,
  ...props
}: {
  label: string;
  className?: string;
  children: ComponentChildren;
} & Omit<ComponentProps<"button">, "title">) {
  return (
    <button
      type="button"
      className={cx("icon-button", className)}
      title={label}
      aria-label={label}
      {...props}
    >
      {children}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={cx("toggle", checked && "is-on")}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function Modal({
  title,
  children,
  onClose,
  width = "normal",
}: {
  title: string;
  children: ComponentChildren;
  onClose: () => void;
  width?: "normal" | "wide";
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={cx("modal", width === "wide" && "modal-wide")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <IconButton label={t("close")} onClick={onClose}>
            <X size={17} />
          </IconButton>
        </header>
        {children}
      </section>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  detail,
}: {
  icon: ComponentChildren;
  title: string;
  detail: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function SleepTabsDialog({
  busy,
  onClose,
  onSleep,
}: {
  busy: boolean;
  onClose: () => void;
  onSleep: (scope: SleepScope) => void;
}) {
  return (
    <Modal title={t("batchSleepTabs")} onClose={onClose}>
      <div className="sleep-dialog-intro">
        <strong>{t("sleepProgressiveTitle")}</strong>
        <span>{t("sleepProgressiveHint")}</span>
      </div>
      <div className="sleep-scope-list">
        <button type="button" disabled={busy} onClick={() => onSleep("window")}>
          <span className="sleep-scope-icon">
            <Moon size={17} />
          </span>
          <span className="sleep-scope-copy">
            <small className="sleep-scope-level">
              {t("sleepLevelCurrent")}
            </small>
            <strong>{t("sleepOtherTabs")}</strong>
            <small>{t("sleepOtherTabsScope")}</small>
          </span>
          <ChevronRight size={16} />
        </button>
        <button type="button" disabled={busy} onClick={() => onSleep("all")}>
          <span className="sleep-scope-icon">
            <Layers3 size={17} />
          </span>
          <span className="sleep-scope-copy">
            <small className="sleep-scope-level">{t("sleepLevelAll")}</small>
            <strong>{t("sleepAllTabs")}</strong>
            <small>{t("sleepAllTabsScope")}</small>
          </span>
          <ChevronRight size={16} />
        </button>
        <button
          type="button"
          className="is-force"
          disabled={busy}
          onClick={() => onSleep("force-all")}
        >
          <span className="sleep-scope-icon">
            <Zap size={17} />
          </span>
          <span className="sleep-scope-copy">
            <small className="sleep-scope-level">{t("sleepLevelForce")}</small>
            <strong>{t("forceSleepAllTabs")}</strong>
            <small>{t("forceSleepAllTabsScope")}</small>
          </span>
          <ChevronRight size={16} />
        </button>
      </div>
      <p className="modal-note">{t("sleepTabsSafety")}</p>
      <div className="form-actions">
        <button type="button" className="button-ghost" onClick={onClose}>
          {t("cancel")}
        </button>
      </div>
    </Modal>
  );
}

export function App() {
  const [state, setState] = useState<VaultState | null>(null);
  const [view, setView] = useState<ViewKey>("groups");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogKey>(null);
  const [busy, setBusy] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [editingCollection, setEditingCollection] =
    useState<Collection | null>(null);
  const [renamingResource, setRenamingResource] = useState<Resource | null>(
    null,
  );
  const [movingResource, setMovingResource] = useState<{
    resource: Resource;
    sourceCollectionId: string;
  } | null>(null);
  const [draggedCollectionId, setDraggedCollectionId] = useState<string | null>(
    null,
  );
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(
    new Set(),
  );
  const [browserPanelSide, setBrowserPanelSide] = useState<"left" | "right">(
    "right",
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const accordionInitializedRef = useRef(false);

  const loadState = async (showSpinner = false) => {
    if (showSpinner) {
      setBusy(true);
    }
    try {
      const nextState = await sendCommand<VaultState>({ type: "GET_STATE" });
      setState(nextState);
    } catch (error) {
      setToast(error instanceof Error ? error.message : t("readFailed"));
    } finally {
      if (showSpinner) {
        setBusy(false);
      }
    }
  };

  useEffect(() => {
    void loadState(true);
    if (chrome.sidePanel.getLayout) {
      void chrome.sidePanel
        .getLayout()
        .then((layout) => setBrowserPanelSide(layout.side))
        .catch(() => undefined);
    }
    const listener = (message: { type?: string }) => {
      if (message.type === "VAULT_DATA_CHANGED") {
        void loadState();
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  useEffect(() => {
    if (
      !accordionInitializedRef.current &&
      state?.collections.length &&
      state.collections.length > 0
    ) {
      setExpandedCollections(new Set([state.collections[0].id]));
      accordionInitializedRef.current = true;
    }
  }, [state?.collections]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const run = async (
    command: VaultCommand,
    successMessage?: string,
  ): Promise<void> => {
    setBusy(true);
    try {
      await sendCommand(command);
      await loadState();
      if (successMessage) {
        setToast(successMessage);
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : t("actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  const sleepResources = async (resourceIds: string[]): Promise<void> => {
    setBusy(true);
    try {
      const count = await sendCommand<number>({
        type: "DISCARD_RESOURCES",
        resourceIds,
      });
      await loadState();
      if (count > 0) {
        setSelected(new Set());
      }
      setToast(
        count > 0
          ? t("selectedTabsSleeping", { count })
          : t("selectedTabsNotSleeping"),
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : t("actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  const deleteSavedResource = async (resourceId: string): Promise<void> => {
    setBusy(true);
    try {
      const count = await sendCommand<number>({
        type: "DELETE_RESOURCES",
        resourceIds: [resourceId],
      });
      await loadState();
      if (count === 0) {
        setToast(t("resourceDeleteFailed"));
        return;
      }
      setSelected((current) => {
        const next = new Set(current);
        next.delete(resourceId);
        return next;
      });
      setToast(t("resourceDeleted"));
    } catch (error) {
      setToast(error instanceof Error ? error.message : t("actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  const sleepEligibleTabs = async (
    scope: SleepScope,
  ): Promise<void> => {
    setBusy(true);
    try {
      const currentWindow =
        scope === "window" ? await chrome.windows.getCurrent() : null;
      const count = await sendCommand<number>({
        type: "DISCARD_ELIGIBLE_TABS",
        scope,
        windowId: currentWindow?.id,
      });
      await loadState();
      if (count > 0) {
        setView("discarded");
        setSelected(new Set());
        setNavOpen(false);
      }
      setToast(
        count > 0
          ? t("tabsPutToSleep", { count })
          : scope === "window"
            ? t("noTabsToSleepCurrent")
            : scope === "all"
              ? t("noTabsToSleepSafe")
              : t("noTabsToSleep"),
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : t("actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  const resourceViews = useMemo<ResourceView[]>(() => {
    if (!state) {
      return [];
    }

    const instanceMap = new Map<string, TabInstance[]>();
    for (const instance of state.instances) {
      const list = instanceMap.get(instance.resourceId) ?? [];
      list.push(instance);
      instanceMap.set(instance.resourceId, list);
    }

    const membershipMap = new Map<string, string[]>();
    for (const membership of state.memberships) {
      const list = membershipMap.get(membership.resourceId) ?? [];
      list.push(membership.collectionId);
      membershipMap.set(membership.resourceId, list);
    }

    return state.resources
      .filter((resource) => resource.trashedAt === undefined)
      .map((resource) => {
        const instances = instanceMap.get(resource.id) ?? [];
        return {
          resource,
          instances,
          state: getRuntimeState(instances),
          collectionIds: membershipMap.get(resource.id) ?? [],
        };
      });
  }, [state]);

  const sortedCollections = useMemo(
    () =>
      sortCollections(
        state?.collections ?? [],
        state?.memberships ?? [],
        state?.resources ?? [],
        state?.settings.collectionSort ?? "manual",
        uiLocale,
      ),
    [
      state?.collections,
      state?.memberships,
      state?.resources,
      state?.settings.collectionSort,
    ],
  );

  const searchIndex = useMemo(() => {
    const index = new MiniSearch<Resource>({
      fields: ["customTitle", "title", "originalUrl", "domain", "notes"],
      storeFields: ["id"],
      searchOptions: {
        prefix: true,
        fuzzy: 0.18,
        boost: { customTitle: 5, title: 3, domain: 2 },
      },
    });
    index.addAll(resourceViews.map((item) => item.resource));
    return index;
  }, [resourceViews]);

  const searchResultIds = useMemo(() => {
    if (!query.trim() || resourceViews.length === 0) {
      return null;
    }
    const resultIds = new Set(
      searchIndex.search(query).map((result) => String(result.id)),
    );
    for (const item of resourceViews) {
      if (matchesResourceSubstring(item.resource, query)) {
        resultIds.add(item.resource.id);
      }
    }
    return resultIds;
  }, [query, resourceViews, searchIndex]);

  const visibleResources = useMemo(() => {
    const filtered = resourceViews.filter((item) => {
      if (searchResultIds && !searchResultIds.has(item.resource.id)) {
        return false;
      }

      if (view.startsWith("collection:")) {
        return item.collectionIds.includes(view.slice("collection:".length));
      }

      switch (view) {
        case "open":
          return item.state === "open";
        case "discarded":
          return item.state === "discarded";
        case "virtual":
          return item.state === "virtual";
        case "duplicates":
          return item.instances.length > 1;
        case "ungrouped":
          return item.collectionIds.length === 0;
        default:
          return true;
      }
    });

    return filtered.sort((left, right) => {
      if (searchResultIds) {
        const permanentGroupOrder =
          Number(right.collectionIds.length > 0) -
          Number(left.collectionIds.length > 0);
        if (permanentGroupOrder !== 0) {
          return permanentGroupOrder;
        }
      }
      if (sortMode === "title") {
        const leftTitle = left.resource.customTitle || left.resource.title;
        const rightTitle = right.resource.customTitle || right.resource.title;
        return leftTitle.localeCompare(rightTitle, uiLocale);
      }
      if (sortMode === "visits") {
        return (
          right.resource.visitCount - left.resource.visitCount ||
          right.resource.lastVisitedAt - left.resource.lastVisitedAt
        );
      }
      return right.resource.lastVisitedAt - left.resource.lastVisitedAt;
    });
  }, [resourceViews, searchResultIds, sortMode, view]);

  const counts = useMemo(
    () => ({
      all: resourceViews.length,
      open: resourceViews.filter((item) => item.state === "open").length,
      discarded: resourceViews.filter((item) => item.state === "discarded")
        .length,
      virtual: resourceViews.filter((item) => item.state === "virtual").length,
      duplicates: resourceViews.filter((item) => item.instances.length > 1)
        .length,
      ungrouped: resourceViews.filter(
        (item) => item.collectionIds.length === 0,
      ).length,
    }),
    [resourceViews],
  );

  const currentViewTitle = useMemo(() => {
    if (!state) {
      return "";
    }
    if (view.startsWith("collection:")) {
      return (
        state.collections.find(
          (collection) => collection.id === view.slice("collection:".length),
        )?.name ?? t("permanentGroup")
      );
    }
    const titles: Record<Exclude<ViewKey, `collection:${string}`>, string> = {
      groups: t("permanentGroups"),
      all: t("allResources"),
      open: t("currentOpen"),
      discarded: t("sleeping"),
      virtual: t("archived"),
      duplicates: t("duplicatePages"),
      ungrouped: t("uncategorized"),
    };
    return titles[view as Exclude<ViewKey, `collection:${string}`>];
  }, [state, view]);

  const selectedIds = [...selected];
  const selectedMembershipCounts = useMemo(() => {
    const countsByCollection = new Map<string, number>();
    for (const membership of state?.memberships ?? []) {
      if (selected.has(membership.resourceId)) {
        countsByCollection.set(
          membership.collectionId,
          (countsByCollection.get(membership.collectionId) ?? 0) + 1,
        );
      }
    }
    return countsByCollection;
  }, [selected, state?.memberships]);
  const allVisibleSelected =
    visibleResources.length > 0 &&
    visibleResources.every((item) => selected.has(item.resource.id));

  const toggleSelected = (resourceId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(resourceId)) {
        next.delete(resourceId);
      } else {
        next.add(resourceId);
      }
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        visibleResources.forEach((item) => next.delete(item.resource.id));
      } else {
        visibleResources.forEach((item) => next.add(item.resource.id));
      }
      return next;
    });
  };

  const chooseView = (nextView: ViewKey) => {
    setView(nextView);
    setSelected(new Set());
    if (window.innerWidth < 620) {
      setNavOpen(false);
    }
  };

  const openCollectionEditor = (collection: Collection | null = null) => {
    setEditingCollection(collection);
    setDialog("collection");
  };

  const toggleCollectionExpanded = (collectionId: string) => {
    setExpandedCollections((current) => {
      const next = new Set(current);
      if (next.has(collectionId)) {
        next.delete(collectionId);
      } else {
        next.add(collectionId);
      }
      return next;
    });
  };

  const dropCollectionBefore = (targetCollectionId: string) => {
    if (
      !draggedCollectionId ||
      draggedCollectionId === targetCollectionId ||
      state?.settings.collectionSort !== "manual"
    ) {
      setDraggedCollectionId(null);
      return;
    }
    const collectionIds = sortedCollections.map((item) => item.id);
    const sourceIndex = collectionIds.indexOf(draggedCollectionId);
    const targetIndex = collectionIds.indexOf(targetCollectionId);
    if (sourceIndex < 0 || targetIndex < 0) {
      setDraggedCollectionId(null);
      return;
    }
    collectionIds.splice(sourceIndex, 1);
    collectionIds.splice(targetIndex, 0, draggedCollectionId);
    setDraggedCollectionId(null);
    void run({ type: "REORDER_COLLECTIONS", collectionIds });
  };

  const handleExport = async () => {
    try {
      downloadBackup(await exportVaultData());
      setToast(t("backupExported"));
    } catch (error) {
      setToast(error instanceof Error ? error.message : t("exportFailed"));
    }
  };

  const handleImport = async (file: File) => {
    try {
      const data = await readBackup(file);
      await run({ type: "IMPORT_DATA", data }, t("backupImported"));
      setDialog(null);
    } catch (error) {
      setToast(error instanceof Error ? error.message : t("importFailed"));
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  if (!state) {
    return (
      <main className="loading-screen">
        <Database size={22} />
        <span>{busy ? t("organizingTabs") : t("connecting")}</span>
      </main>
    );
  }

  const activeCollectionId = view.startsWith("collection:")
    ? view.slice("collection:".length)
    : null;
  const showGroupOverview = view === "groups" && !query.trim();
  const resourceListTitle = query.trim()
    ? t("searchResults")
    : currentViewTitle;

  return (
    <div className={cx("app-shell", selected.size > 0 && "has-selection")}>
      <header className="topbar">
        <div className="brand">
          <IconButton
            label={navOpen ? t("collapseNavigation") : t("expandNavigation")}
            onClick={() => setNavOpen((current) => !current)}
          >
            <Menu size={18} />
          </IconButton>
          <div className="brand-mark">
            <Layers3 size={17} />
          </div>
          <div>
            <h1>{t("appName")}</h1>
            <span>{t("resourceCount", { count: counts.all })}</span>
          </div>
        </div>
        <div className="top-actions">
          <IconButton
            label={t("newPermanentGroup")}
            onClick={() => openCollectionEditor()}
          >
            <FolderPlus size={17} />
          </IconButton>
          <IconButton
            label={t("batchSleepTabs")}
            disabled={busy}
            onClick={() => setDialog("sleep-tabs")}
          >
            <Moon size={17} />
          </IconButton>
          <IconButton
            label={t("saveCurrentSnapshot")}
            disabled={busy}
            onClick={() =>
              void run({ type: "CREATE_SNAPSHOT" }, t("currentSessionSaved"))
            }
          >
            <Database size={17} />
          </IconButton>
          <IconButton
            label={t("refreshTabs")}
            className={busy ? "is-spinning" : ""}
            disabled={busy}
            onClick={() => void run({ type: "REFRESH_TABS" })}
          >
            <RefreshCw size={17} />
          </IconButton>
          <IconButton label={t("settings")} onClick={() => setDialog("settings")}>
            <Settings size={17} />
          </IconButton>
        </div>
      </header>

      <div
        className={cx(
          "workspace",
          browserPanelSide === "right" && "nav-right",
        )}
      >
        <NavigationRail
          view={view}
          counts={counts}
          collections={sortedCollections}
          onView={chooseView}
          onCollection={(collectionId) =>
            chooseView(`collection:${collectionId}`)
          }
          onMoreCollections={() => setNavOpen(true)}
          onNewCollection={() => openCollectionEditor()}
        />
        <nav className={cx("navigation", navOpen && "is-open")}>
          <div className="nav-section">
            <span className="section-label">{t("status")}</span>
            <NavItem
              active={view === "all"}
              icon={<Layers3 size={16} />}
              label={t("allResources")}
              count={counts.all}
              onClick={() => chooseView("all")}
            />
            <NavItem
              active={view === "open"}
              icon={<ChevronRight size={16} />}
              label={t("currentOpen")}
              count={counts.open}
              onClick={() => chooseView("open")}
            />
            <NavItem
              active={view === "discarded"}
              icon={<Moon size={16} />}
              label={t("sleeping")}
              count={counts.discarded}
              onClick={() => chooseView("discarded")}
            />
            <NavItem
              active={view === "virtual"}
              icon={<Archive size={16} />}
              label={t("archived")}
              count={counts.virtual}
              onClick={() => chooseView("virtual")}
            />
          </div>

          <div className="nav-section">
            <div className="section-heading">
              <span className="section-label">{t("permanentGroups")}</span>
              <div className="group-heading-actions">
                <select
                  value={state.settings.collectionSort}
                  aria-label={t("sortGroups")}
                  onChange={(event) =>
                    void run({
                      type: "UPDATE_SETTINGS",
                      settings: {
                        collectionSort: (
                          event.currentTarget as HTMLSelectElement
                        ).value as VaultSettings["collectionSort"],
                      },
                    })
                  }
                >
                  <option value="manual">{t("sortManual")}</option>
                  <option value="name">{t("sortName")}</option>
                  <option value="count">{t("sortCount")}</option>
                  <option value="recent">{t("sortRecent")}</option>
                </select>
                <IconButton
                  label={t("newPermanentGroup")}
                  onClick={() => openCollectionEditor()}
                >
                  <FolderPlus size={15} />
                </IconButton>
              </div>
            </div>
            {sortedCollections.map((collection) => {
              const collectionResources = resourceViews.filter((item) =>
                item.collectionIds.includes(collection.id),
              );
              return (
                <CollectionAccordion
                  key={collection.id}
                  collection={collection}
                  resources={collectionResources}
                  active={view === `collection:${collection.id}`}
                  expanded={expandedCollections.has(collection.id)}
                  draggable={state.settings.collectionSort === "manual"}
                  onToggle={() => toggleCollectionExpanded(collection.id)}
                  onEdit={() => openCollectionEditor(collection)}
                  onDragStart={() => setDraggedCollectionId(collection.id)}
                  onDrop={() => dropCollectionBefore(collection.id)}
                  onViewAll={() =>
                    chooseView(`collection:${collection.id}`)
                  }
                  onOpenResource={(resourceId) =>
                    void run({ type: "FOCUS_RESOURCE", resourceId })
                  }
                  onManageResource={(resource) => {
                    setMovingResource({
                      resource,
                      sourceCollectionId: collection.id,
                    });
                    setDialog("move-resource");
                  }}
                />
              );
            })}
            {state.collections.length === 0 && (
              <button
                type="button"
                className="nav-empty-action"
                onClick={() => openCollectionEditor()}
              >
                <Plus size={14} />
                {t("newGroup")}
              </button>
            )}
          </div>

          <div className="nav-section">
            <span className="section-label">{t("smartViews")}</span>
            <NavItem
              active={view === "duplicates"}
              icon={<Copy size={16} />}
              label={t("duplicatePages")}
              count={counts.duplicates}
              onClick={() => chooseView("duplicates")}
            />
            <NavItem
              active={view === "ungrouped"}
              icon={<Inbox size={16} />}
              label={t("uncategorized")}
              count={counts.ungrouped}
              onClick={() => chooseView("ungrouped")}
            />
          </div>

          <div className="nav-footer">
            <button type="button" onClick={() => setDialog("rules")}>
              <SlidersHorizontal size={15} />
              {t("ruleCenter")}
              <span>{state.rules.length}</span>
            </button>
            <button type="button" onClick={() => setDialog("snapshots")}>
              <Clock3 size={15} />
              {t("recoveryCenter")}
              <span>{state.snapshots.length}</span>
            </button>
            <button type="button" onClick={() => setDialog("backup")}>
              <Database size={15} />
              {t("importExport")}
            </button>
          </div>
        </nav>

        {navOpen && (
          <button
            type="button"
            className="nav-scrim"
            aria-label={t("closeNavigation")}
            onClick={() => setNavOpen(false)}
          />
        )}

        <main className="content">
          <div className="search-row">
            <div className="search-field">
              <Search size={16} />
              <input
                value={query}
                onInput={(event) =>
                  setQuery((event.currentTarget as HTMLInputElement).value)
                }
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchResources")}
              />
              {query && (
                <IconButton label={t("clearSearch")} onClick={() => setQuery("")}>
                  <X size={14} />
                </IconButton>
              )}
            </div>
          </div>

          {showGroupOverview ? (
            <GroupOverview
              collections={sortedCollections}
              resources={resourceViews}
              sortMode={state.settings.collectionSort}
              expandedCollections={expandedCollections}
              onSortChange={(collectionSort) =>
                void run({
                  type: "UPDATE_SETTINGS",
                  settings: { collectionSort },
                })
              }
              onNewCollection={() => openCollectionEditor()}
              onToggle={toggleCollectionExpanded}
              onEdit={openCollectionEditor}
              onDragStart={setDraggedCollectionId}
              onDrop={dropCollectionBefore}
              onViewAll={(collectionId) =>
                chooseView(`collection:${collectionId}`)
              }
              onOpenResource={(resourceId) =>
                void run({ type: "FOCUS_RESOURCE", resourceId })
              }
              onManageResource={(resource, collectionId) => {
                setMovingResource({
                  resource,
                  sourceCollectionId: collectionId,
                });
                setDialog("move-resource");
              }}
            />
          ) : (
            <>
              <div className="list-header">
                <label className="select-all">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={selectAllVisible}
                  />
                  <span>{resourceListTitle}</span>
                </label>
                <div className="list-tools">
                  <span>
                    {t("itemCount", { count: visibleResources.length })}
                  </span>
                  <select
                    value={sortMode}
                    aria-label={t("sortResources")}
                    onChange={(event) =>
                      setSortMode(
                        (event.currentTarget as HTMLSelectElement)
                          .value as SortMode,
                      )
                    }
                  >
                    <option value="recent">{t("recentlyVisited")}</option>
                    <option value="title">{t("sortByTitle")}</option>
                    <option value="visits">{t("visits")}</option>
                  </select>
                </div>
              </div>

              <div className="resource-list">
                {visibleResources.map((item) => (
                  <ResourceRow
                    key={item.resource.id}
                    item={item}
                    collections={state.collections}
                    checked={selected.has(item.resource.id)}
                    onToggle={() => toggleSelected(item.resource.id)}
                    onFocus={() =>
                      void run({
                        type: "FOCUS_RESOURCE",
                        resourceId: item.resource.id,
                      })
                    }
                    onDiscard={() => void sleepResources([item.resource.id])}
                    onArchive={() =>
                      void run(
                        {
                          type: "ARCHIVE_RESOURCES",
                          resourceIds: [item.resource.id],
                        },
                        t("statusArchived"),
                      )
                    }
                    onDelete={() => {
                      if (
                        window.confirm(
                          t("confirmDeleteResource", {
                            name:
                              item.resource.customTitle ||
                              item.resource.title,
                          }),
                        )
                      ) {
                        void deleteSavedResource(item.resource.id);
                      }
                    }}
                    onRestore={() =>
                      void run(
                        {
                          type: "RESTORE_RESOURCES",
                          resourceIds: [item.resource.id],
                        },
                        t("opened"),
                      )
                    }
                    onProtect={() =>
                      void run({
                        type: "TOGGLE_PROTECTED",
                        resourceId: item.resource.id,
                      })
                    }
                    onRename={() => {
                      setRenamingResource(item.resource);
                      setDialog("rename-resource");
                    }}
                    onManageGroup={
                      activeCollectionId
                        ? () => {
                            setMovingResource({
                              resource: item.resource,
                              sourceCollectionId: activeCollectionId,
                            });
                            setDialog("move-resource");
                          }
                        : undefined
                    }
                  />
                ))}

                {visibleResources.length === 0 && (
                  <EmptyState
                    icon={query ? <Search size={20} /> : <Archive size={20} />}
                    title={query ? t("noMatches") : t("noResources")}
                    detail={query ? t("noMatchingResources") : t("emptyView")}
                  />
                )}
              </div>
            </>
          )}
        </main>
      </div>

      <div className={cx("action-dock", selected.size > 0 && "is-visible")}>
        <span>{t("selectedCount", { count: selected.size })}</span>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(
              { type: "RESTORE_RESOURCES", resourceIds: selectedIds },
              t("addedToRestoreQueue"),
            )
          }
        >
          <ArchiveRestore size={15} />
          {t("open")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void sleepResources(selectedIds)}
        >
          <Moon size={15} />
          {t("sleep")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(
              { type: "ARCHIVE_RESOURCES", resourceIds: selectedIds },
              t("selectedArchived"),
            )
          }
        >
          <Archive size={15} />
          {t("archive")}
        </button>
        <IconButton
          label={t("addToPermanentGroup")}
          onClick={() => setDialog("add-to-group")}
        >
          <FolderPlus size={16} />
        </IconButton>
        <IconButton label={t("clearSelection")} onClick={() => setSelected(new Set())}>
          <X size={16} />
        </IconButton>
      </div>

      {dialog === "collection" && (
        <CollectionDialog
          collection={editingCollection}
          onClose={() => {
            setDialog(null);
            setEditingCollection(null);
          }}
          onSave={(name, color) => {
            if (editingCollection) {
              void run(
                {
                  type: "UPDATE_COLLECTION",
                  collectionId: editingCollection.id,
                  name,
                  color,
                },
                t("groupUpdated"),
              );
            } else {
              void run(
                { type: "CREATE_COLLECTION", name, color },
                t("groupCreated"),
              );
            }
            setDialog(null);
            setEditingCollection(null);
          }}
          onDelete={
            editingCollection
              ? () => {
                  if (
                    window.confirm(
                      t("confirmDeleteGroup", {
                        name: editingCollection.name,
                      }),
                    )
                  ) {
                    void run(
                      {
                        type: "DELETE_COLLECTION",
                        collectionId: editingCollection.id,
                      },
                      t("groupDeleted"),
                    );
                    if (view === `collection:${editingCollection.id}`) {
                      chooseView("all");
                    }
                    setDialog(null);
                    setEditingCollection(null);
                  }
                }
              : undefined
          }
        />
      )}

      {dialog === "sleep-tabs" && (
        <SleepTabsDialog
          busy={busy}
          onClose={() => setDialog(null)}
          onSleep={(scope) => {
            setDialog(null);
            void sleepEligibleTabs(scope);
          }}
        />
      )}

      {dialog === "rules" && (
        <RuleDialog
          collections={sortedCollections}
          rules={state.rules}
          onClose={() => setDialog(null)}
          onCreate={(rule) => {
            void run({ type: "CREATE_RULE", rule }, t("ruleCreated"));
          }}
          onDelete={(ruleId) =>
            void run({ type: "DELETE_RULE", ruleId }, t("ruleDeleted"))
          }
          onRescan={() =>
            void run({ type: "RESCAN_RULES" }, t("rulesRescanned"))
          }
        />
      )}

      {dialog === "settings" && (
        <SettingsDialog
          settings={state.settings}
          browserPanelSide={browserPanelSide}
          onClose={() => setDialog(null)}
          onSave={(settings) => {
            void run({ type: "UPDATE_SETTINGS", settings }, t("settingsSaved"));
            setDialog(null);
          }}
        />
      )}

      {dialog === "snapshots" && (
        <SnapshotsDialog
          snapshots={state.snapshots}
          onClose={() => setDialog(null)}
          onCreate={() =>
            void run({ type: "CREATE_SNAPSHOT" }, t("currentSessionSaved"))
          }
          onRestore={(snapshotId) => {
            void run(
              { type: "RESTORE_SNAPSHOT", snapshotId },
              t("snapshotQueued"),
            );
            setDialog(null);
          }}
        />
      )}

      {dialog === "add-to-group" && (
        <AddToGroupDialog
          collections={sortedCollections}
          selectedCount={selected.size}
          membershipCounts={selectedMembershipCounts}
          onClose={() => setDialog(null)}
          onCreateGroup={() => openCollectionEditor()}
          onToggle={(collectionId, remove) => {
            void run(
              remove
                ? {
                    type: "REMOVE_FROM_COLLECTION",
                    collectionId,
                    resourceIds: selectedIds,
                  }
                : {
                    type: "ADD_TO_COLLECTION",
                    collectionId,
                    resourceIds: selectedIds,
                  },
              remove ? t("removedFromGroup") : t("addedToGroup"),
            );
            setDialog(null);
          }}
        />
      )}

      {dialog === "move-resource" && movingResource && (
        <MoveResourceDialog
          resource={movingResource.resource}
          sourceCollection={
            state.collections.find(
              (item) => item.id === movingResource.sourceCollectionId,
            ) ?? null
          }
          collections={sortedCollections}
          onClose={() => {
            setDialog(null);
            setMovingResource(null);
          }}
          onMove={(targetCollectionId) => {
            const targetCollection = sortedCollections.find(
              (item) => item.id === targetCollectionId,
            );
            void run(
              {
                type: "MOVE_RESOURCE_COLLECTION",
                resourceId: movingResource.resource.id,
                sourceCollectionId: movingResource.sourceCollectionId,
                targetCollectionId,
              },
              targetCollection
                ? t("movedToGroup", { name: targetCollection.name })
                : t("removedFromGroup"),
            );
            setDialog(null);
            setMovingResource(null);
          }}
        />
      )}

      {dialog === "rename-resource" && renamingResource && (
        <RenameResourceDialog
          resource={renamingResource}
          onClose={() => {
            setDialog(null);
            setRenamingResource(null);
          }}
          onSave={(customTitle) => {
            void run(
              {
                type: "UPDATE_RESOURCE_TITLE",
                resourceId: renamingResource.id,
                customTitle,
              },
              customTitle.trim()
                ? t("pageNameUpdated")
                : t("originalTitleRestored"),
            );
            setDialog(null);
            setRenamingResource(null);
          }}
        />
      )}

      {dialog === "backup" && (
        <Modal title={t("importExport")} onClose={() => setDialog(null)}>
          <div className="backup-actions">
            <button type="button" className="button-primary" onClick={handleExport}>
              <Download size={16} />
              {t("exportFullBackup")}
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={16} />
              {t("importBackup")}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                const file = (event.currentTarget as HTMLInputElement).files?.[0];
                if (file) {
                  void handleImport(file);
                }
              }}
            />
          </div>
          <p className="modal-note">{t("backupWarning")}</p>
        </Modal>
      )}

      {toast && (
        <div className="toast" role="status">
          <Check size={15} />
          {toast}
        </div>
      )}
    </div>
  );
}

function NavItem({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: ComponentChildren;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cx("nav-item", active && "is-active")}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
      <strong>{count}</strong>
    </button>
  );
}

function NavigationRail({
  view,
  counts,
  collections,
  onView,
  onCollection,
  onMoreCollections,
  onNewCollection,
}: {
  view: ViewKey;
  counts: {
    all: number;
    open: number;
    discarded: number;
    virtual: number;
  };
  collections: Collection[];
  onView: (view: ViewKey) => void;
  onCollection: (collectionId: string) => void;
  onMoreCollections: () => void;
  onNewCollection: () => void;
}) {
  const railItems = [
    {
      view: "groups" as const,
      label: t("permanentGroups"),
      icon: <Folder size={18} />,
      count: collections.length,
    },
    {
      view: "all" as const,
      label: t("allResources"),
      icon: <Layers3 size={18} />,
      count: counts.all,
    },
    {
      view: "open" as const,
      label: t("currentOpen"),
      icon: <ChevronRight size={18} />,
      count: counts.open,
    },
    {
      view: "discarded" as const,
      label: t("sleeping"),
      icon: <Moon size={18} />,
      count: counts.discarded,
    },
    {
      view: "virtual" as const,
      label: t("archived"),
      icon: <Archive size={18} />,
      count: counts.virtual,
    },
  ];

  return (
    <aside className="navigation-rail" aria-label={t("resourceViews")}>
      <div className="rail-status-items">
        {railItems.map((item) => (
          <button
            type="button"
            key={item.view}
            className={cx(view === item.view && "is-active")}
            aria-label={item.label}
            aria-current={view === item.view ? "page" : undefined}
            onClick={() => onView(item.view)}
          >
            {item.icon}
            {item.count > 0 && (
              <span className="rail-count">{Math.min(item.count, 99)}</span>
            )}
            <span className="rail-tooltip" role="tooltip">
              {item.label}
            </span>
          </button>
        ))}
      </div>
      <span className="rail-divider" />
      <div className="rail-collection-items">
        {collections.slice(0, 7).map((collection) => (
          <button
            type="button"
            key={collection.id}
            className={cx(
              "rail-collection",
              `color-${collection.color}`,
              view === `collection:${collection.id}` && "is-active",
            )}
            aria-label={collection.name}
            aria-current={
              view === `collection:${collection.id}` ? "page" : undefined
            }
            onClick={() => onCollection(collection.id)}
          >
            <Folder size={17} />
            <span className="rail-tooltip" role="tooltip">
              {collection.name}
            </span>
          </button>
        ))}
        {collections.length > 7 && (
          <button
            type="button"
            className="rail-more-groups"
            aria-label={t("moreGroups", { count: collections.length - 7 })}
            onClick={onMoreCollections}
          >
            <MoreHorizontal size={18} />
            <span className="rail-tooltip" role="tooltip">
              {t("moreGroups", { count: collections.length - 7 })}
            </span>
          </button>
        )}
      </div>
      <button
        type="button"
        className="rail-new-group"
        aria-label={t("newPermanentGroup")}
        onClick={onNewCollection}
      >
        <Plus size={18} />
        <span className="rail-tooltip" role="tooltip">
          {t("newPermanentGroup")}
        </span>
      </button>
    </aside>
  );
}

function GroupOverview({
  collections,
  resources,
  sortMode,
  expandedCollections,
  onSortChange,
  onNewCollection,
  onToggle,
  onEdit,
  onDragStart,
  onDrop,
  onViewAll,
  onOpenResource,
  onManageResource,
}: {
  collections: Collection[];
  resources: ResourceView[];
  sortMode: VaultSettings["collectionSort"];
  expandedCollections: Set<string>;
  onSortChange: (sortMode: VaultSettings["collectionSort"]) => void;
  onNewCollection: () => void;
  onToggle: (collectionId: string) => void;
  onEdit: (collection: Collection) => void;
  onDragStart: (collectionId: string) => void;
  onDrop: (collectionId: string) => void;
  onViewAll: (collectionId: string) => void;
  onOpenResource: (resourceId: string) => void;
  onManageResource: (
    resource: Resource,
    sourceCollectionId: string,
  ) => void;
}) {
  return (
    <section className="group-overview" aria-label={t("permanentGroups")}>
      <div className="list-header group-overview-header">
        <div className="group-overview-title">
          <Folder size={15} />
          <span>{t("permanentGroups")}</span>
          <strong>{t("itemCount", { count: collections.length })}</strong>
        </div>
        <div className="group-heading-actions">
          <select
            value={sortMode}
            aria-label={t("sortGroups")}
            onChange={(event) =>
              onSortChange(
                (event.currentTarget as HTMLSelectElement)
                  .value as VaultSettings["collectionSort"],
              )
            }
          >
            <option value="manual">{t("sortManual")}</option>
            <option value="name">{t("sortName")}</option>
            <option value="count">{t("sortCount")}</option>
            <option value="recent">{t("sortRecent")}</option>
          </select>
          <IconButton
            label={t("newPermanentGroup")}
            onClick={onNewCollection}
          >
            <FolderPlus size={15} />
          </IconButton>
        </div>
      </div>

      <div className="group-overview-list">
        {collections.map((collection) => (
          <CollectionAccordion
            key={collection.id}
            collection={collection}
            resources={resources.filter((item) =>
              item.collectionIds.includes(collection.id),
            )}
            active={false}
            expanded={expandedCollections.has(collection.id)}
            draggable={sortMode === "manual"}
            onToggle={() => onToggle(collection.id)}
            onEdit={() => onEdit(collection)}
            onDragStart={() => onDragStart(collection.id)}
            onDrop={() => onDrop(collection.id)}
            onViewAll={() => onViewAll(collection.id)}
            onOpenResource={onOpenResource}
            onManageResource={(resource) =>
              onManageResource(resource, collection.id)
            }
          />
        ))}

        {collections.length === 0 && (
          <div className="group-overview-empty">
            <EmptyState
              icon={<FolderPlus size={20} />}
              title={t("noPermanentGroups")}
              detail={t("noGroupsCreated")}
            />
            <button
              type="button"
              className="button-primary"
              onClick={onNewCollection}
            >
              <Plus size={15} />
              {t("newGroup")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function CollectionAccordion({
  collection,
  resources,
  active,
  expanded,
  draggable,
  onToggle,
  onEdit,
  onDragStart,
  onDrop,
  onViewAll,
  onOpenResource,
  onManageResource,
}: {
  collection: Collection;
  resources: ResourceView[];
  active: boolean;
  expanded: boolean;
  draggable: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onViewAll: () => void;
  onOpenResource: (resourceId: string) => void;
  onManageResource: (resource: Resource) => void;
}) {
  const lightColors: CollectionColor[] = [
    "lime",
    "olive",
    "amber",
    "gold",
    "orange",
  ];
  const visibleResources = [...resources]
    .sort(
      (left, right) =>
        right.resource.lastVisitedAt - left.resource.lastVisitedAt,
    )
    .slice(0, 6);

  return (
    <div
      className={cx(
        "collection-accordion",
        `color-${collection.color}`,
        lightColors.includes(collection.color) && "is-light",
        active && "is-active",
        expanded && "is-expanded",
        draggable && "is-draggable",
      )}
      draggable={draggable}
      onDragStart={(event) => {
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
        }
        onDragStart();
      }}
      onDragOver={(event) => {
        if (draggable) {
          event.preventDefault();
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "move";
          }
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
    >
      <div className="collection-accordion-header">
        <button
          type="button"
          className="collection-accordion-toggle"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          {draggable && (
            <GripVertical
              size={13}
              className="collection-drag-handle"
              aria-label={t("dragGroup", { name: collection.name })}
            />
          )}
          <span>{collection.name}</span>
          <strong>{resources.length}</strong>
          <ChevronDown size={15} />
        </button>
        <IconButton
          label={t("editGroup", { name: collection.name })}
          className="collection-accordion-edit"
          onClick={onEdit}
        >
          <Pencil size={13} />
        </IconButton>
      </div>

      {expanded && (
        <div className="collection-accordion-content">
          {visibleResources.map((item) => {
            const displayTitle =
              item.resource.customTitle || item.resource.title;
            return (
              <div className="collection-resource-row" key={item.resource.id}>
                <button
                  type="button"
                  className="collection-resource"
                  title={displayTitle}
                  onClick={() => onOpenResource(item.resource.id)}
                >
                  <FileText size={14} />
                  <span>{displayTitle}</span>
                  <i
                    className={cx(
                      "resource-state-dot",
                      `state-${item.state}`,
                    )}
                  />
                </button>
                <IconButton
                  label={t("manageResourceGroups")}
                  className="collection-resource-manage"
                  onClick={() => onManageResource(item.resource)}
                >
                  <ArrowRightLeft size={12} />
                </IconButton>
              </div>
            );
          })}
          {resources.length === 0 && (
            <span className="collection-empty">{t("emptyView")}</span>
          )}
          <button
            type="button"
            className="collection-view-all"
            onClick={onViewAll}
          >
            {t("viewAll")}
            {resources.length > visibleResources.length && (
              <span>
                {t("moreItems", {
                  count: resources.length - visibleResources.length,
                })}
              </span>
            )}
            <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

function ResourceRow({
  item,
  collections,
  checked,
  onToggle,
  onFocus,
  onDiscard,
  onArchive,
  onDelete,
  onRestore,
  onProtect,
  onRename,
  onManageGroup,
}: {
  item: ResourceView;
  collections: Collection[];
  checked: boolean;
  onToggle: () => void;
  onFocus: () => void;
  onDiscard: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onProtect: () => void;
  onRename: () => void;
  onManageGroup?: () => void;
}) {
  const { resource, instances, state, collectionIds } = item;
  const collectionMap = new Map(
    collections.map((collection) => [collection.id, collection]),
  );
  const initial = (resource.domain || resource.title).slice(0, 1).toUpperCase();
  const displayTitle = resource.customTitle || resource.title;
  const domainTone = getDomainTone(resource.domain);

  return (
    <article
      className={cx(
        "resource-row",
        `resource-${state}`,
        checked && "is-selected",
      )}
      onDblClick={onFocus}
    >
      <label className="row-checkbox">
        <input type="checkbox" checked={checked} onChange={onToggle} />
      </label>
      <span
        className={cx("site-mark", `site-tone-${domainTone}`)}
        aria-hidden="true"
      >
        {initial}
      </span>
      <div className="resource-main">
        <div className="resource-title-line">
          <button type="button" title={displayTitle} onClick={onFocus}>
            {displayTitle}
          </button>
          <IconButton
            label={t("renamePage")}
            className="rename-resource-button"
            onClick={onRename}
          >
            <Pencil size={12} />
          </IconButton>
          {onManageGroup && (
            <IconButton
              label={t("manageResourceGroups")}
              className="rename-resource-button"
              onClick={onManageGroup}
            >
              <ArrowRightLeft size={12} />
            </IconButton>
          )}
          {resource.protected && (
            <Shield
              size={13}
              className="protected-icon"
              aria-label={t("protected")}
            />
          )}
        </div>
        <div className="resource-meta">
          <span>{resource.domain}</span>
          <span>{formatRelativeTime(resource.lastVisitedAt)}</span>
          <span>{t("visitLabel", { count: resource.visitCount })}</span>
        </div>
        <div className="resource-tags">
          <span
            className={cx("status-badge", `status-${state}`)}
            title={
              state === "open"
                ? t("openStatusHint")
                : state === "discarded"
                  ? t("sleepingStatusHint")
                  : t("archivedStatusHint")
            }
          >
            {state === "open"
              ? t("opened")
              : state === "discarded"
                ? t("statusSleeping")
                : t("statusArchived")}
          </span>
          {instances.length > 1 && (
            <span className="tag neutral">
              {t("duplicateCount", { count: instances.length })}
            </span>
          )}
          {collectionIds.slice(0, 2).map((collectionId) => {
            const collection = collectionMap.get(collectionId);
            return collection ? (
              <span
                key={collection.id}
                className={cx("tag", `color-${collection.color}`)}
              >
                {collection.name}
              </span>
            ) : null;
          })}
          {collectionIds.length > 2 && (
            <span className="tag neutral">+{collectionIds.length - 2}</span>
          )}
        </div>
      </div>
      <div className="row-actions">
        {state === "virtual" ? (
          <>
            <IconButton label={t("openPage")} onClick={onRestore}>
              <ArchiveRestore size={15} />
            </IconButton>
            <IconButton label={t("deletePermanently")} onClick={onDelete}>
              <Trash2 size={15} />
            </IconButton>
          </>
        ) : state === "discarded" ? (
          <>
            <IconButton label={t("wakeTab")} onClick={onFocus}>
              <RotateCcw size={15} />
            </IconButton>
            <IconButton label={t("archiveAndClose")} onClick={onArchive}>
              <Archive size={15} />
            </IconButton>
          </>
        ) : (
          <>
            <IconButton label={t("sleepTab")} onClick={onDiscard}>
              <Moon size={15} />
            </IconButton>
            <IconButton label={t("archiveAndClose")} onClick={onArchive}>
              <Archive size={15} />
            </IconButton>
          </>
        )}
        <IconButton
          label={resource.protected ? t("unprotectPage") : t("protectPage")}
          onClick={onProtect}
        >
          {resource.protected ? <ShieldOff size={15} /> : <Shield size={15} />}
        </IconButton>
      </div>
    </article>
  );
}

function RenameResourceDialog({
  resource,
  onClose,
  onSave,
}: {
  resource: Resource;
  onClose: () => void;
  onSave: (customTitle: string) => void;
}) {
  const [customTitle, setCustomTitle] = useState(
    resource.customTitle || resource.title,
  );

  return (
    <Modal title={t("renamePage")} onClose={onClose}>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          if (customTitle.trim()) {
            onSave(customTitle);
          }
        }}
      >
        <label>
          <span>{t("pageName")}</span>
          <input
            autoFocus
            value={customTitle}
            maxLength={120}
            onInput={(event) =>
              setCustomTitle((event.currentTarget as HTMLInputElement).value)
            }
          />
        </label>
        <div className="resource-origin">
          <span>{t("originalTitle")}</span>
          <strong>{resource.title}</strong>
          <code>{resource.originalUrl}</code>
        </div>
        <div className="form-actions">
          {resource.customTitle && (
            <button
              type="button"
              className="button-secondary"
              onClick={() => onSave("")}
            >
              <RotateCcw size={14} />
              {t("restoreOriginalTitle")}
            </button>
          )}
          <span className="form-spacer" />
          <button type="button" className="button-ghost" onClick={onClose}>
            {t("cancel")}
          </button>
          <button
            type="submit"
            className="button-primary"
            disabled={!customTitle.trim()}
          >
            {t("save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CollectionDialog({
  collection,
  onClose,
  onSave,
  onDelete,
}: {
  collection: Collection | null;
  onClose: () => void;
  onSave: (name: string, color: CollectionColor) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(collection?.name ?? "");
  const [color, setColor] = useState<CollectionColor>(
    collection?.color ?? "blue",
  );

  return (
    <Modal
      title={
        collection ? t("editPermanentGroup") : t("newPermanentGroup")
      }
      onClose={onClose}
    >
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) {
            onSave(name.trim(), color);
          }
        }}
      >
        <label>
          <span>{t("groupName")}</span>
          <input
            autoFocus
            value={name}
            maxLength={40}
            onInput={(event) =>
              setName((event.currentTarget as HTMLInputElement).value)
            }
          />
        </label>
        <fieldset>
          <legend>{t("identifierColor")}</legend>
          <div className="color-picker">
            {COLLECTION_COLORS.map((item) => (
              <button
                type="button"
                key={item}
                className={cx(
                  "color-swatch",
                  `color-${item}`,
                  color === item && "is-selected",
                )}
                aria-label={t("selectColor", {
                  color: COLLECTION_COLOR_LABELS[item],
                })}
                onClick={() => setColor(item)}
              >
                {color === item && <Check size={13} />}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="form-actions">
          {onDelete && (
            <button type="button" className="button-danger" onClick={onDelete}>
              <Trash2 size={15} />
              {t("delete")}
            </button>
          )}
          <span className="form-spacer" />
          <button type="button" className="button-ghost" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="submit" className="button-primary" disabled={!name.trim()}>
            {collection ? t("save") : t("createGroup")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RuleDialog({
  collections,
  rules,
  onClose,
  onCreate,
  onDelete,
  onRescan,
}: {
  collections: Collection[];
  rules: Rule[];
  onClose: () => void;
  onCreate: (
    rule: Extract<VaultCommand, { type: "CREATE_RULE" }>["rule"],
  ) => void;
  onDelete: (ruleId: string) => void;
  onRescan: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? "");
  const [matchMode, setMatchMode] = useState<"all" | "any">("any");
  const [domains, setDomains] = useState("");
  const [titleKeywords, setTitleKeywords] = useState("");
  const [urlKeywords, setUrlKeywords] = useState("");

  const reset = () => {
    setName("");
    setDomains("");
    setTitleKeywords("");
    setUrlKeywords("");
    setShowForm(false);
  };

  return (
    <Modal title={t("rules")} onClose={onClose} width="wide">
      <div className="modal-toolbar">
        <button
          type="button"
          className="button-primary"
          disabled={collections.length === 0}
          onClick={() => setShowForm(true)}
        >
          <Plus size={15} />
          {t("newRule")}
        </button>
        <button type="button" className="button-secondary" onClick={onRescan}>
          <RefreshCw size={15} />
          {t("rescan")}
        </button>
      </div>

      {collections.length === 0 && (
        <p className="inline-notice">{t("createGroupFirst")}</p>
      )}

      {showForm && (
        <form
          className="form rule-form"
          onSubmit={(event) => {
            event.preventDefault();
            const hasCondition =
              splitRuleValues(domains).length > 0 ||
              splitRuleValues(titleKeywords).length > 0 ||
              splitRuleValues(urlKeywords).length > 0;
            if (!name.trim() || !collectionId || !hasCondition) {
              return;
            }
            onCreate({
              name: name.trim(),
              collectionId,
              matchMode,
              domains: splitRuleValues(domains),
              titleKeywords: splitRuleValues(titleKeywords),
              urlKeywords: splitRuleValues(urlKeywords),
            });
            reset();
          }}
        >
          <div className="form-grid">
            <label>
              <span>{t("ruleName")}</span>
              <input
                value={name}
                onInput={(event) =>
                  setName((event.currentTarget as HTMLInputElement).value)
                }
              />
            </label>
            <label>
              <span>{t("targetGroup")}</span>
              <select
                value={collectionId}
                onChange={(event) =>
                  setCollectionId(
                    (event.currentTarget as HTMLSelectElement).value,
                  )
                }
              >
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            <span>{t("matchMode")}</span>
            <select
              value={matchMode}
              onChange={(event) =>
                setMatchMode(
                  (event.currentTarget as HTMLSelectElement).value as
                    | "all"
                    | "any",
                )
              }
            >
              <option value="any">{t("matchAny")}</option>
              <option value="all">{t("matchAll")}</option>
            </select>
          </label>
          <label>
            <span>{t("domain")}</span>
            <input
              value={domains}
              placeholder="example.com, *.internal.net"
              onInput={(event) =>
                setDomains((event.currentTarget as HTMLInputElement).value)
              }
            />
          </label>
          <label>
            <span>{t("titleKeywords")}</span>
            <input
              value={titleKeywords}
              placeholder="SQL, governance"
              onInput={(event) =>
                setTitleKeywords(
                  (event.currentTarget as HTMLInputElement).value,
                )
              }
            />
          </label>
          <label>
            <span>{t("urlKeywords")}</span>
            <input
              value={urlKeywords}
              placeholder="/docs/, report"
              onInput={(event) =>
                setUrlKeywords((event.currentTarget as HTMLInputElement).value)
              }
            />
          </label>
          <div className="form-actions">
            <button type="button" className="button-ghost" onClick={reset}>
              {t("cancel")}
            </button>
            <button type="submit" className="button-primary">
              {t("saveRule")}
            </button>
          </div>
        </form>
      )}

      <div className="rule-list">
        {rules.map((rule) => {
          const collection = collections.find(
            (item) => item.id === rule.collectionId,
          );
          const conditions = [
            ...rule.domains.map((value) => t("domainCondition", { value })),
            ...rule.titleKeywords.map((value) =>
              t("titleCondition", { value }),
            ),
            ...rule.urlKeywords.map((value) => t("urlCondition", { value })),
          ];
          return (
            <div className="rule-row" key={rule.id}>
              <div>
                <strong>{rule.name}</strong>
                <span>
                  {conditions.join(
                    ` ${rule.matchMode === "all" ? t("and") : t("or")} `,
                  )}
                </span>
              </div>
              <span className="rule-target">
                <Folder size={13} />
                {collection?.name ?? t("deletedGroup")}
              </span>
              <IconButton label={t("deleteRule")} onClick={() => onDelete(rule.id)}>
                <Trash2 size={15} />
              </IconButton>
            </div>
          );
        })}
        {rules.length === 0 && !showForm && (
          <EmptyState
            icon={<SlidersHorizontal size={20} />}
            title={t("noRules")}
            detail={t("noRuleConditions")}
          />
        )}
      </div>
    </Modal>
  );
}

function SettingsDialog({
  settings,
  browserPanelSide,
  onClose,
  onSave,
}: {
  settings: VaultSettings;
  browserPanelSide: "left" | "right";
  onClose: () => void;
  onSave: (settings: Partial<VaultSettings>) => void;
}) {
  const [autoDiscardEnabled, setAutoDiscardEnabled] = useState(
    settings.autoDiscardEnabled,
  );
  const [autoDiscardMinutes, setAutoDiscardMinutes] = useState(
    settings.autoDiscardMinutes,
  );
  const [snapshotIntervalMinutes, setSnapshotIntervalMinutes] = useState(
    settings.snapshotIntervalMinutes,
  );
  const [restoreConcurrency, setRestoreConcurrency] = useState(
    settings.restoreConcurrency,
  );

  return (
    <Modal title={t("settings")} onClose={onClose}>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            autoDiscardEnabled,
            autoDiscardMinutes,
            snapshotIntervalMinutes,
            restoreConcurrency,
          });
        }}
      >
        <div className="setting-row">
          <strong>{t("autoDiscard")}</strong>
          <Toggle
            label={t("autoDiscard")}
            checked={autoDiscardEnabled}
            onChange={setAutoDiscardEnabled}
          />
        </div>
        <label>
          <span>{t("idleMinutes")}</span>
          <input
            type="number"
            min="5"
            max="1440"
            value={autoDiscardMinutes}
            disabled={!autoDiscardEnabled}
            onInput={(event) =>
              setAutoDiscardMinutes(
                Number((event.currentTarget as HTMLInputElement).value),
              )
            }
          />
        </label>
        <label>
          <span>{t("snapshotInterval")}</span>
          <input
            type="number"
            min="1"
            max="60"
            value={snapshotIntervalMinutes}
            onInput={(event) =>
              setSnapshotIntervalMinutes(
                Number((event.currentTarget as HTMLInputElement).value),
              )
            }
          />
        </label>
        <label>
          <span>{t("restoreConcurrency")}</span>
          <input
            type="number"
            min="1"
            max="10"
            value={restoreConcurrency}
            onInput={(event) =>
              setRestoreConcurrency(
                Number((event.currentTarget as HTMLInputElement).value),
              )
            }
          />
        </label>
        <div className="browser-side-setting">
          <div>
            <strong>{t("browserPanelSide")}</strong>
            <span>
              {browserPanelSide === "left"
                ? t("navigationLeft")
                : t("navigationRight")}{" "}
              · {t("browserControlled")}
            </span>
          </div>
          <button
            type="button"
            className="button-secondary"
            onClick={() =>
              void chrome.tabs.create({
                url: "chrome://settings/appearance",
              })
            }
          >
            {t("openAppearanceSettings")}
          </button>
        </div>
        <div className="browser-side-setting">
          <div>
            <strong>{t("privacyAndData")}</strong>
            <span>{t("localDataDisclosure")}</span>
          </div>
          <button
            type="button"
            className="button-secondary"
            onClick={() =>
              void chrome.tabs.create({
                url: PRIVACY_POLICY_URL,
              })
            }
          >
            <Shield size={14} />
            {t("viewPrivacyPolicy")}
          </button>
        </div>
        <div className="form-actions">
          <button type="button" className="button-ghost" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="submit" className="button-primary">
            {t("saveSettings")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SnapshotsDialog({
  snapshots,
  onClose,
  onCreate,
  onRestore,
}: {
  snapshots: Snapshot[];
  onClose: () => void;
  onCreate: () => void;
  onRestore: (snapshotId: string) => void;
}) {
  return (
    <Modal title={t("recoveryCenter")} onClose={onClose} width="wide">
      <div className="modal-toolbar">
        <button type="button" className="button-primary" onClick={onCreate}>
          <Database size={15} />
          {t("saveCurrentSession")}
        </button>
      </div>
      <div className="snapshot-list">
        {snapshots.map((snapshot) => {
          const windowCount = new Set(
            snapshot.tabs.map((tab) => tab.windowKey),
          ).size;
          return (
            <div className="snapshot-row" key={snapshot.id}>
              <span className="snapshot-icon">
                {snapshot.type === "manual" ? (
                  <Database size={16} />
                ) : (
                  <Clock3 size={16} />
                )}
              </span>
              <div>
                <strong>{formatSnapshotTime(snapshot.createdAt)}</strong>
                <span>
                  {t("snapshotSummary", {
                    pages: snapshot.tabs.length,
                    windows: windowCount,
                    snapshotType:
                      snapshot.type === "manual"
                        ? t("manual")
                        : t("automatic"),
                  })}
                </span>
              </div>
              <button
                type="button"
                className="button-secondary compact"
                onClick={() => {
                  if (
                    snapshot.tabs.length > 20 &&
                    !window.confirm(
                      t("confirmRestoreSnapshot", {
                        count: snapshot.tabs.length,
                      }),
                    )
                  ) {
                    return;
                  }
                  onRestore(snapshot.id);
                }}
              >
                <RotateCcw size={14} />
                {t("restore")}
              </button>
            </div>
          );
        })}
        {snapshots.length === 0 && (
          <EmptyState
            icon={<Clock3 size={20} />}
            title={t("noSnapshots")}
            detail={t("noRecoverableRecords")}
          />
        )}
      </div>
    </Modal>
  );
}

function MoveResourceDialog({
  resource,
  sourceCollection,
  collections,
  onClose,
  onMove,
}: {
  resource: Resource;
  sourceCollection: Collection | null;
  collections: Collection[];
  onClose: () => void;
  onMove: (targetCollectionId?: string) => void;
}) {
  const targetCollections = collections.filter(
    (collection) => collection.id !== sourceCollection?.id,
  );
  const displayTitle = resource.customTitle || resource.title;

  return (
    <Modal title={t("manageResourceGroups")} onClose={onClose}>
      <div className="move-resource-summary">
        <strong>{displayTitle}</strong>
        <span>
          {t("currentGroup")}: {sourceCollection?.name ?? t("deletedGroup")}
        </span>
      </div>
      <div className="group-picker move-group-picker">
        {targetCollections.map((collection) => (
          <button
            type="button"
            key={collection.id}
            onClick={() => onMove(collection.id)}
          >
            <span
              className={cx(
                "collection-dot",
                `color-${collection.color}`,
              )}
            />
            <span>{t("moveToGroup", { name: collection.name })}</span>
            <ChevronRight size={15} />
          </button>
        ))}
        {targetCollections.length === 0 && (
          <span className="move-empty">{t("noOtherGroups")}</span>
        )}
      </div>
      <div className="form-actions">
        {sourceCollection && (
          <button
            type="button"
            className="button-danger"
            onClick={() => onMove(undefined)}
          >
            <Trash2 size={15} />
            {t("removeFromCurrentGroup", { name: sourceCollection.name })}
          </button>
        )}
        <span className="form-spacer" />
        <button type="button" className="button-ghost" onClick={onClose}>
          {t("cancel")}
        </button>
      </div>
    </Modal>
  );
}

function AddToGroupDialog({
  collections,
  selectedCount,
  membershipCounts,
  onClose,
  onCreateGroup,
  onToggle,
}: {
  collections: Collection[];
  selectedCount: number;
  membershipCounts: Map<string, number>;
  onClose: () => void;
  onCreateGroup: () => void;
  onToggle: (collectionId: string, remove: boolean) => void;
}) {
  return (
    <Modal
      title={t("manageGroups", { count: selectedCount })}
      onClose={onClose}
    >
      <div className="group-picker">
        {collections.map((collection) => (
          <button
            type="button"
            key={collection.id}
            onClick={() =>
              onToggle(
                collection.id,
                membershipCounts.get(collection.id) === selectedCount,
              )
            }
          >
            <span
              className={cx(
                "collection-dot",
                `color-${collection.color}`,
              )}
            />
            <span>{collection.name}</span>
            {membershipCounts.get(collection.id) === selectedCount ? (
              <Check size={15} />
            ) : (
              <ChevronRight size={15} />
            )}
          </button>
        ))}
        {collections.length === 0 && (
          <EmptyState
            icon={<FolderPlus size={20} />}
            title={t("noPermanentGroups")}
            detail={t("noGroupsCreated")}
          />
        )}
      </div>
      <div className="form-actions">
        <button type="button" className="button-secondary" onClick={onCreateGroup}>
          <Plus size={15} />
          {t("newGroup")}
        </button>
      </div>
    </Modal>
  );
}
