import { useState, useEffect, useRef } from "react";
import { useAuth } from "../components/AuthContext";

const SERVICE_CATEGORIES: Record<string, string[]> = {
  "A1. Professional Services": [
    "Basic Services of Funeral Director & Staff",
    "Embalming",
    "Other Preparation of Body",
    "Removal of Remains",
  ],
  "A2. Facilities, Equipment & Staff": [
    "Use of Facilities & Staff for Viewing & Visitation",
    "Use of Facilities & Staff for Funeral Ceremony",
    "Use of Facilities & Staff for Memorial Service",
    "Use of Facilities & Staff for Graveside Service",
  ],
  "A3. Transportation": [
    "Transfer of Remains to Funeral Home",
    "Hearse",
    "Limousine",
    "Sedan",
    "Service / Utility Vehicle",
  ],
  "A4. Other Services / Facilities / Equipment": [
    "Other Services / Facilities / Equipment",
  ],
  "B. Merchandise": [
    "Casket (or Other Receptacle)",
    "Outer Burial Container",
    "Opening / Closing Receptacle",
    "Acknowledgement Cards",
    "Memory Folders / Prayer Cards",
    "Clothing",
    "Cremation Urn",
  ],
  "C. Special Charges": [
    "Forwarding Remains To",
    "Receiving Remains From",
    "Intermediate Burial",
    "Cremation and Permits",
    "Casket Spray",
  ],
  "D. Cash Advances": [
    "Certified Copies of Death Certificates",
    "Death Certificate Preparation",
    "Clergy",
    "Musician",
    "Paid Newspaper Notice",
    "Cemetery",
    "Obituary",
    "Hearse Driver",
  ],
};

const SERVICE_ITEMS = Object.values(SERVICE_CATEGORIES).flat();

const STATUS_OPTIONS = ["Pending", "In Progress", "Completed", "Cancelled"];

interface ItemEntry {
  cost: string;
  charged: string;
}

interface FuneralOrder {
  id: number;
  deceasedName: string;
  dateOfService: string;
  serviceType: string;
  status: string;
  funeralDirector: string;
  familyContact: string;
  familyPhone: string;
  notes: string;
  items: Record<string, ItemEntry>;
  createdAt: string;
}

const emptyOrder = (): FuneralOrder => ({
  id: Date.now(),
  deceasedName: "",
  dateOfService: "",
  serviceType: "Burial",
  status: "Pending",
  funeralDirector: "",
  familyContact: "",
  familyPhone: "",
  notes: "",
  items: SERVICE_ITEMS.reduce<Record<string, ItemEntry>>((acc, item) => {
    acc[item] = { cost: "", charged: "" };
    return acc;
  }, {}),
  createdAt: new Date().toLocaleDateString(),
});

const fmt = (val: string | number): number => {
  const n = parseFloat(String(val));
  return isNaN(n) ? 0 : n;
};

const money = (n: number): string =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const FUNERAL_HOMES = [
  { name: "Faith Memorials", key: "funeral_orders_faith_memorials" },
  { name: "S&K Funeral",     key: "funeral_orders_sk_funeral" },
] as const;

type FuneralHomeKey = typeof FUNERAL_HOMES[number]["key"];

const ROLE_PERMISSIONS = {
  admin:   { canCreate: true,  canEdit: true,  canDelete: true,  canSwitch: true  },
  manager: { canCreate: true,  canEdit: true,  canDelete: false, canSwitch: false },
  member:  { canCreate: true,  canEdit: true,  canDelete: false, canSwitch: false },
};

const getPerms = (role?: string) =>
  ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS] ?? ROLE_PERMISSIONS.member;

const LS_ACTIVE_HOME = "funeral_active_home";

export default function FuneralManager() {
  const { user } = useAuth();
  const perms = getPerms(user?.role);

  const [activeHomeKey, setActiveHomeKey] = useState<FuneralHomeKey>(() => {
    if (perms.canSwitch) {
      const saved = localStorage.getItem(LS_ACTIVE_HOME) as FuneralHomeKey | null;
      if (saved && FUNERAL_HOMES.some((h) => h.key === saved)) return saved;
    }
    return FUNERAL_HOMES[0].key;
  });

  const activeHome = FUNERAL_HOMES.find((h) => h.key === activeHomeKey) ?? FUNERAL_HOMES[0];
  const storageKey = perms.canSwitch ? activeHomeKey : `funeral_orders_${user?.organizationId ?? "default"}`;

  const switchHome = (key: FuneralHomeKey) => {
    setActiveHomeKey(key);
    localStorage.setItem(LS_ACTIVE_HOME, key);
    setOrders([]);
    setView("dashboard");
    setCurrentOrder(null);
  };

  const [orders, setOrders] = useState<FuneralOrder[]>([]);
  const [view, setView] = useState<"dashboard" | "list" | "calendar" | "form" | "detail">("dashboard");
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [currentOrder, setCurrentOrder] = useState<FuneralOrder | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setOrders([]);
    (async () => {
      try {
        const res = await (window as any).storage?.get(storageKey);
        if (res?.value) setOrders(JSON.parse(res.value));
      } catch {}
    })();
  }, [storageKey]);

  const save = async (newOrders: FuneralOrder[]) => {
    setOrders(newOrders);
    try {
      await (window as any).storage?.set(storageKey, JSON.stringify(newOrders));
    } catch {}
  };

  const showToast = (msg: string, type = "success") => {
    setToast({ msg, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  const calcOrder = (order: FuneralOrder) => {
    let totalCost = 0, totalCharged = 0;
    Object.values(order.items).forEach(({ cost, charged }) => {
      totalCost += fmt(cost);
      totalCharged += fmt(charged);
    });
    return { totalCost, totalCharged, profit: totalCharged - totalCost };
  };

  const handleSave = (order: FuneralOrder) => {
    let updated: FuneralOrder[];
    if (editMode) {
      updated = orders.map((o) => (o.id === order.id ? order : o));
      showToast("Order updated!");
    } else {
      updated = [order, ...orders];
      showToast("New order created!");
    }
    save(updated);
    setCurrentOrder(order);
    setView("detail");
    setEditMode(false);
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this order?")) return;
    save(orders.filter((o) => o.id !== id));
    setView("list");
    showToast("Order deleted.", "error");
  };

  const dashStats = () => {
    let totalProfit = 0, totalRevenue = 0, totalCost = 0;
    orders.forEach((o) => {
      const c = calcOrder(o);
      totalProfit += c.profit;
      totalRevenue += c.totalCharged;
      totalCost += c.totalCost;
    });
    const byStatus = STATUS_OPTIONS.reduce<Record<string, number>>((acc, s) => {
      acc[s] = orders.filter((o) => o.status === s).length;
      return acc;
    }, {});
    return { totalProfit, totalRevenue, totalCost, byStatus, total: orders.length };
  };

  const filtered = orders.filter(
    (o) =>
      o.deceasedName.toLowerCase().includes(search.toLowerCase()) ||
      o.familyContact.toLowerCase().includes(search.toLowerCase()) ||
      o.status.toLowerCase().includes(search.toLowerCase())
  );

  const stats = dashStats();

  return (
    <div style={styles.root}>
      {/* Top Bar */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.logo}>⚱</span>
          <div>
            <div style={styles.logoText}>MEMORIAL MANAGER</div>
            <div style={styles.logoSub}>{activeHome.name}</div>
          </div>
          <span style={{ ...styles.badge, background: roleColor(user?.role), fontSize: 10, padding: "3px 10px", marginLeft: 8 }}>
            {(user?.role ?? "member").toUpperCase()}
          </span>
          {perms.canSwitch && (
            <div style={styles.homeSwitcher}>
              {FUNERAL_HOMES.map((h) => (
                <button
                  key={h.key}
                  onClick={() => switchHome(h.key)}
                  style={{
                    ...styles.homeBtn,
                    ...(activeHomeKey === h.key ? styles.homeBtnActive : {}),
                  }}
                >
                  {h.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <nav style={styles.nav}>
          {[
            { id: "dashboard", label: "Dashboard" },
            { id: "list", label: `Orders (${orders.length})` },
            { id: "calendar", label: "Calendar" },
          ].map((n) => (
            <button
              key={n.id}
              onClick={() => setView(n.id as "dashboard" | "list" | "calendar")}
              style={{ ...styles.navBtn, ...(view === n.id ? styles.navActive : {}) }}
            >
              {n.label}
            </button>
          ))}
          {perms.canCreate && (
            <button
              onClick={() => {
                setCurrentOrder(emptyOrder());
                setEditMode(false);
                setView("form");
              }}
              style={styles.newBtn}
            >
              + New Order
            </button>
          )}
        </nav>
      </header>

      <main style={styles.main}>
        {/* DASHBOARD */}
        {view === "dashboard" && (
          <div>
            <h2 style={styles.pageTitle}>Overview</h2>
            <div style={styles.statsGrid}>
              <StatCard label="Total Orders" value={String(stats.total)} icon="📋" color="#c9a96e" />
              <StatCard label="Total Revenue" value={money(stats.totalRevenue)} icon="💰" color="#6eb5c9" />
              <StatCard label="Total Costs" value={money(stats.totalCost)} icon="📤" color="#c96e6e" />
              <StatCard label="Net Profit" value={money(stats.totalProfit)} icon="📈" color={stats.totalProfit >= 0 ? "#6ec98a" : "#c96e6e"} />
            </div>
            <div style={styles.twoCol}>
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>Orders by Status</h3>
                {STATUS_OPTIONS.map((s) => (
                  <div key={s} style={styles.statusRow}>
                    <span style={{ ...styles.badge, background: statusColor(s) }}>{s}</span>
                    <div style={styles.barWrap}>
                      <div
                        style={{
                          ...styles.bar,
                          width: stats.total ? `${(stats.byStatus[s] / stats.total) * 100}%` : "0%",
                          background: statusColor(s),
                        }}
                      />
                    </div>
                    <span style={styles.barNum}>{stats.byStatus[s]}</span>
                  </div>
                ))}
              </div>
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>Recent Orders</h3>
                {orders.slice(0, 5).map((o) => {
                  const c = calcOrder(o);
                  return (
                    <div
                      key={o.id}
                      style={styles.recentRow}
                      onClick={() => { setCurrentOrder(o); setView("detail"); }}
                    >
                      <div>
                        <div style={styles.recentName}>{o.deceasedName || "Unnamed"}</div>
                        <div style={styles.recentSub}>{o.dateOfService} · {o.serviceType}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: c.profit >= 0 ? "#6ec98a" : "#c96e6e", fontWeight: 700 }}>
                          {money(c.profit)}
                        </div>
                        <span style={{ ...styles.badge, background: statusColor(o.status) }}>{o.status}</span>
                      </div>
                    </div>
                  );
                })}
                {orders.length === 0 && <p style={styles.empty}>No orders yet.</p>}
              </div>
            </div>
          </div>
        )}

        {/* ORDER LIST */}
        {view === "list" && (
          <div>
            <div style={styles.listHeader}>
              <h2 style={styles.pageTitle}>All Orders</h2>
              <input
                placeholder="Search by name, family, status..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={styles.search}
              />
            </div>
            {filtered.length === 0 && <p style={styles.empty}>No orders found.</p>}
            <div style={styles.tableWrap}>
              {filtered.length > 0 && (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {["Deceased", "Service Date", "Type", "Family Contact", "Cost", "Charged", "Profit", "Status", ""].map(
                        (h) => <th key={h} style={styles.th}>{h}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((o) => {
                      const c = calcOrder(o);
                      return (
                        <tr key={o.id} style={styles.tr} onClick={() => { setCurrentOrder(o); setView("detail"); }}>
                          <td style={styles.td}><strong>{o.deceasedName || "—"}</strong></td>
                          <td style={styles.td}>{o.dateOfService || "—"}</td>
                          <td style={styles.td}>{o.serviceType}</td>
                          <td style={styles.td}>{o.familyContact || "—"}</td>
                          <td style={styles.td}>{money(c.totalCost)}</td>
                          <td style={styles.td}>{money(c.totalCharged)}</td>
                          <td style={{ ...styles.td, color: c.profit >= 0 ? "#6ec98a" : "#c96e6e", fontWeight: 700 }}>
                            {money(c.profit)}
                          </td>
                          <td style={styles.td}>
                            <span style={{ ...styles.badge, background: statusColor(o.status) }}>{o.status}</span>
                          </td>
                          <td style={styles.td} onClick={(e) => e.stopPropagation()}>
                            {perms.canEdit && (
                              <button
                                style={styles.iconBtn}
                                onClick={() => {
                                  setCurrentOrder(o);
                                  setEditMode(true);
                                  setView("form");
                                }}
                              >✏️</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* CALENDAR */}
        {view === "calendar" && (
          <FuneralCalendar
            orders={orders}
            year={calMonth.year}
            month={calMonth.month}
            onPrev={() => setCalMonth((c) => {
              const d = new Date(c.year, c.month - 1);
              return { year: d.getFullYear(), month: d.getMonth() };
            })}
            onNext={() => setCalMonth((c) => {
              const d = new Date(c.year, c.month + 1);
              return { year: d.getFullYear(), month: d.getMonth() };
            })}
            onOrderClick={(o) => { setCurrentOrder(o); setView("detail"); }}
          />
        )}

        {/* ORDER FORM */}
        {view === "form" && currentOrder && perms.canCreate && (
          <OrderForm
            order={currentOrder}
            editMode={editMode}
            onSave={handleSave}
            onCancel={() => setView(editMode ? "detail" : "list")}
          />
        )}

        {/* ORDER DETAIL */}
        {view === "detail" && currentOrder && (
          <OrderDetail
            order={orders.find((o) => o.id === currentOrder.id) || currentOrder}
            canEdit={perms.canEdit}
            canDelete={perms.canDelete}
            onEdit={() => {
              setCurrentOrder(orders.find((o) => o.id === currentOrder.id) || currentOrder);
              setEditMode(true);
              setView("form");
            }}
            onDelete={() => handleDelete(currentOrder.id)}
            onStatusChange={(newStatus: string) => {
              const updated = orders.map((o) =>
                o.id === currentOrder.id ? { ...o, status: newStatus } : o
              );
              save(updated);
              showToast(`Status updated to ${newStatus}`);
            }}
            onBack={() => setView("list")}
          />
        )}
      </main>

      {/* Toast */}
      {toast && (
        <div style={{ ...styles.toast, background: toast.type === "error" ? "#c96e6e" : "#6ec98a" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  return (
    <div style={{ ...styles.statCard, borderTop: `3px solid ${color}` }}>
      <div style={styles.statIcon}>{icon}</div>
      <div style={{ ...styles.statValue, color }}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

function OrderForm({ order, editMode, onSave, onCancel }: {
  order: FuneralOrder;
  editMode: boolean;
  onSave: (o: FuneralOrder) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FuneralOrder>(JSON.parse(JSON.stringify(order)));

  const setField = (f: keyof FuneralOrder, v: string) => setForm((p) => ({ ...p, [f]: v }));
  const setItem = (item: string, field: keyof ItemEntry, val: string) =>
    setForm((p) => ({
      ...p,
      items: { ...p.items, [item]: { ...p.items[item], [field]: val } },
    }));

  const totals = () => {
    let cost = 0, charged = 0;
    Object.values(form.items).forEach((i) => {
      cost += fmt(i.cost);
      charged += fmt(i.charged);
    });
    return { cost, charged, profit: charged - cost };
  };

  const t = totals();

  return (
    <div>
      <div style={styles.formHeader}>
        <button onClick={onCancel} style={styles.backBtn}>← Back</button>
        <h2 style={styles.pageTitle}>{editMode ? "Edit Order" : "New Funeral Order"}</h2>
      </div>

      <div style={styles.twoCol}>
        {/* Info */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Service Information</h3>
          <Field label="Deceased Full Name">
            <input style={styles.input} value={form.deceasedName} onChange={(e) => setField("deceasedName", e.target.value)} />
          </Field>
          <Field label="Date of Service">
            <input type="date" style={styles.input} value={form.dateOfService} onChange={(e) => setField("dateOfService", e.target.value)} />
          </Field>
          <Field label="Service Type">
            <select style={styles.input} value={form.serviceType} onChange={(e) => setField("serviceType", e.target.value)}>
              {["Burial", "Cremation", "Graveside", "Memorial Only", "Direct Burial"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select style={styles.input} value={form.status} onChange={(e) => setField("status", e.target.value)}>
              {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Funeral Director">
            <input style={styles.input} value={form.funeralDirector} onChange={(e) => setField("funeralDirector", e.target.value)} placeholder="Name of director who met with family" />
          </Field>
          <Field label="Family Contact Name">
            <input style={styles.input} value={form.familyContact} onChange={(e) => setField("familyContact", e.target.value)} />
          </Field>
          <Field label="Family Phone">
            <input style={styles.input} value={form.familyPhone} onChange={(e) => setField("familyPhone", e.target.value)} />
          </Field>
          <Field label="Notes / Special Instructions">
            <textarea style={{ ...styles.input, height: 80, resize: "vertical" }} value={form.notes} onChange={(e) => setField("notes", e.target.value)} />
          </Field>
        </div>

        {/* Cost Worksheet */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Cost & Revenue Worksheet</h3>
          <div style={styles.worksheetHeader}>
            <span style={{ flex: 2 }}>Item</span>
            <span style={{ flex: 1, textAlign: "right" }}>Our Cost ($)</span>
            <span style={{ flex: 1, textAlign: "right" }}>Charged ($)</span>
            <span style={{ flex: 1, textAlign: "right" }}>Margin ($)</span>
          </div>
          {Object.entries(SERVICE_CATEGORIES).map(([cat, items]) => (
            <div key={cat}>
              <div style={styles.catHeader}>{cat}</div>
              {items.map((item) => {
                const row = form.items[item] || { cost: "", charged: "" };
                const margin = fmt(row.charged) - fmt(row.cost);
                return (
                  <div key={item} style={styles.worksheetRow}>
                    <span style={{ flex: 2, fontSize: 12 }}>{item}</span>
                    <input
                      style={{ ...styles.numInput, flex: 1 }}
                      type="number" min="0" placeholder="0.00"
                      value={row.cost}
                      onChange={(e) => setItem(item, "cost", e.target.value)}
                    />
                    <input
                      style={{ ...styles.numInput, flex: 1 }}
                      type="number" min="0" placeholder="0.00"
                      value={row.charged}
                      onChange={(e) => setItem(item, "charged", e.target.value)}
                    />
                    <span style={{ flex: 1, textAlign: "right", fontSize: 12, color: margin >= 0 ? "#6ec98a" : "#c96e6e" }}>
                      {money(margin)}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
          <div style={styles.totalRow}>
            <strong style={{ flex: 2 }}>TOTALS</strong>
            <strong style={{ flex: 1, textAlign: "right" }}>{money(t.cost)}</strong>
            <strong style={{ flex: 1, textAlign: "right" }}>{money(t.charged)}</strong>
            <strong style={{ flex: 1, textAlign: "right", color: t.profit >= 0 ? "#6ec98a" : "#c96e6e" }}>
              {money(t.profit)}
            </strong>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 24, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={styles.cancelBtn}>Cancel</button>
        <button onClick={() => onSave(form)} style={styles.saveBtn}>
          {editMode ? "Save Changes" : "Create Order"}
        </button>
      </div>
    </div>
  );
}

function OrderDetail({ order, canEdit, canDelete, onEdit, onDelete, onStatusChange, onBack }: {
  order: FuneralOrder;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (s: string) => void;
  onBack: () => void;
}) {
  const { totalCost, totalCharged, profit } = (() => {
    let totalCost = 0, totalCharged = 0;
    Object.values(order.items).forEach(({ cost, charged }) => {
      totalCost += fmt(cost);
      totalCharged += fmt(charged);
    });
    return { totalCost, totalCharged, profit: totalCharged - totalCost };
  })();

  return (
    <div>
      <div style={styles.formHeader}>
        <button onClick={onBack} style={styles.backBtn}>← All Orders</button>
        <div style={{ display: "flex", gap: 10 }}>
          {canEdit && <button onClick={onEdit} style={styles.editBtn}>✏️ Edit</button>}
          {canDelete && <button onClick={onDelete} style={styles.deleteBtn}>🗑️ Delete</button>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 24, flexWrap: "wrap" }}>
        <h2 style={{ ...styles.pageTitle, marginBottom: 0 }}>{order.deceasedName || "Unnamed"}</h2>
        <select
          value={order.status}
          onChange={(e) => canEdit && onStatusChange(e.target.value)}
          disabled={!canEdit}
          style={{ ...styles.input, width: "auto", padding: "6px 12px", opacity: canEdit ? 1 : 0.6 }}
        >
          {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <span style={{ color: "#888", fontSize: 13 }}>Created: {order.createdAt}</span>
      </div>

      <div style={styles.statsGrid}>
        <StatCard label="Total Cost to Firm" value={money(totalCost)} icon="📤" color="#c96e6e" />
        <StatCard label="Amount Charged" value={money(totalCharged)} icon="💰" color="#6eb5c9" />
        <StatCard label="Net Profit" value={money(profit)} icon="📈" color={profit >= 0 ? "#6ec98a" : "#c96e6e"} />
        <StatCard label="Margin %" value={totalCharged > 0 ? `${((profit / totalCharged) * 100).toFixed(1)}%` : "—"} icon="📊" color="#c9a96e" />
      </div>

      <div style={styles.twoCol}>
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Service Details</h3>
          <InfoRow label="Service Type" value={order.serviceType} />
          <InfoRow label="Date of Service" value={order.dateOfService || "—"} />
          <InfoRow label="Funeral Director" value={order.funeralDirector || "—"} />
          <InfoRow label="Family Contact" value={order.familyContact || "—"} />
          <InfoRow label="Phone" value={order.familyPhone || "—"} />
          {order.notes && <InfoRow label="Notes" value={order.notes} />}
        </div>

        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Cost Breakdown</h3>
          <div style={styles.worksheetHeader}>
            <span style={{ flex: 2 }}>Item</span>
            <span style={{ flex: 1, textAlign: "right" }}>Our Cost</span>
            <span style={{ flex: 1, textAlign: "right" }}>Charged</span>
            <span style={{ flex: 1, textAlign: "right" }}>Margin</span>
          </div>
          {Object.entries(SERVICE_CATEGORIES).map(([cat, items]) => {
            const catRows = items.filter((item) => {
              const row = order.items[item] || { cost: "", charged: "" };
              return fmt(row.cost) !== 0 || fmt(row.charged) !== 0;
            });
            if (catRows.length === 0) return null;
            return (
              <div key={cat}>
                <div style={styles.catHeader}>{cat}</div>
                {catRows.map((item) => {
                  const row = order.items[item] || { cost: "", charged: "" };
                  const c = fmt(row.cost), ch = fmt(row.charged);
                  const margin = ch - c;
                  return (
                    <div key={item} style={styles.worksheetRow}>
                      <span style={{ flex: 2, fontSize: 12 }}>{item}</span>
                      <span style={{ flex: 1, textAlign: "right", fontSize: 12 }}>{money(c)}</span>
                      <span style={{ flex: 1, textAlign: "right", fontSize: 12 }}>{money(ch)}</span>
                      <span style={{ flex: 1, textAlign: "right", fontSize: 12, color: margin >= 0 ? "#6ec98a" : "#c96e6e" }}>
                        {money(margin)}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
          <div style={styles.totalRow}>
            <strong style={{ flex: 2 }}>TOTALS</strong>
            <strong style={{ flex: 1, textAlign: "right" }}>{money(totalCost)}</strong>
            <strong style={{ flex: 1, textAlign: "right" }}>{money(totalCharged)}</strong>
            <strong style={{ flex: 1, textAlign: "right", color: profit >= 0 ? "#6ec98a" : "#c96e6e" }}>{money(profit)}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={styles.label}>{label}</label>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.infoRow}>
      <span style={styles.infoLabel}>{label}</span>
      <span style={styles.infoValue}>{value}</span>
    </div>
  );
}

function FuneralCalendar({ orders, year, month, onPrev, onNext, onOrderClick }: {
  orders: FuneralOrder[];
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
  onOrderClick: (o: FuneralOrder) => void;
}) {
  const monthName = new Date(year, month).toLocaleString("en-US", { month: "long", year: "numeric" });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);

  const byDate: Record<string, FuneralOrder[]> = {};
  orders.forEach((o) => {
    if (o.dateOfService) {
      if (!byDate[o.dateOfService]) byDate[o.dateOfService] = [];
      byDate[o.dateOfService].push(o);
    }
  });

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={styles.pageTitle}>{monthName}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onPrev} style={styles.backBtn}>← Prev</button>
          <button onClick={onNext} style={styles.backBtn}>Next →</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} style={styles.calDayLabel}>{d}</div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} style={styles.calEmpty} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayOrders = byDate[dateStr] || [];
          const isToday = dateStr === today;
          return (
            <div key={i} style={{ ...styles.calCell, ...(isToday ? styles.calToday : {}) }}>
              <div style={styles.calDayNum}>{day}</div>
              {dayOrders.map((o) => (
                <div
                  key={o.id}
                  onClick={() => onOrderClick(o)}
                  style={{ ...styles.calEvent, borderLeft: `3px solid ${statusColor(o.status)}` }}
                  title={`${o.deceasedName} — ${o.funeralDirector || "No director assigned"}`}
                >
                  <div style={styles.calEventName}>{o.deceasedName || "Unnamed"}</div>
                  {o.funeralDirector && (
                    <div style={styles.calEventDir}>👤 {o.funeralDirector}</div>
                  )}
                  <div style={styles.calEventType}>{o.serviceType}</div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
        {Object.entries({ Pending: "#c9a96e", "In Progress": "#6eb5c9", Completed: "#6ec98a", Cancelled: "#c96e6e" }).map(([s, c]) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#aaa" }}>
            <div style={{ width: 10, height: 10, background: c, borderRadius: 2 }} />
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

const roleColor = (r?: string): string =>
  ({ admin: "#c96e6e", manager: "#6eb5c9", member: "#888" } as Record<string, string>)[r ?? "member"] ?? "#888";

const statusColor = (s: string): string =>
  ({ Pending: "#c9a96e", "In Progress": "#6eb5c9", Completed: "#6ec98a", Cancelled: "#c96e6e" } as Record<string, string>)[s] || "#888";

const styles: Record<string, React.CSSProperties> = {
  root: {
    fontFamily: "'Georgia', serif",
    background: "#0f0f12",
    color: "#e8e0d0",
    minHeight: "100vh",
    margin: -24,
  },
  header: {
    background: "#16151a",
    borderBottom: "1px solid #2a2830",
    padding: "14px 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 12 },
  logo: { fontSize: 28, lineHeight: "1" },
  logoText: { fontFamily: "'Georgia', serif", fontWeight: 700, fontSize: 16, letterSpacing: 3, color: "#c9a96e" },
  logoSub: { fontSize: 10, color: "#666", letterSpacing: 2 },
  nav: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  navBtn: {
    background: "none", border: "1px solid #2a2830", color: "#aaa",
    padding: "7px 16px", borderRadius: 4, cursor: "pointer", fontSize: 13,
  },
  navActive: { borderColor: "#c9a96e", color: "#c9a96e", background: "rgba(201,169,110,0.08)" },
  newBtn: {
    background: "#c9a96e", color: "#0f0f12", border: "none",
    padding: "8px 18px", borderRadius: 4, cursor: "pointer",
    fontWeight: 700, fontSize: 13, letterSpacing: 0.5,
  },
  main: { padding: "32px 24px", maxWidth: 1200, margin: "0 auto" },
  pageTitle: { fontFamily: "'Georgia', serif", fontSize: 24, fontWeight: 700, color: "#e8e0d0", marginBottom: 20 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 },
  statCard: {
    background: "#16151a", border: "1px solid #2a2830",
    borderRadius: 8, padding: "20px 18px",
  },
  statIcon: { fontSize: 22, marginBottom: 8 },
  statValue: { fontSize: 22, fontWeight: 700, fontFamily: "'Georgia', serif", marginBottom: 4 },
  statLabel: { fontSize: 12, color: "#777", letterSpacing: 1, textTransform: "uppercase" },
  twoCol: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 },
  card: { background: "#16151a", border: "1px solid #2a2830", borderRadius: 8, padding: 20 },
  cardTitle: { fontFamily: "'Georgia', serif", fontSize: 15, color: "#c9a96e", marginBottom: 16, letterSpacing: 1 },
  statusRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 },
  badge: { fontSize: 11, padding: "2px 8px", borderRadius: 20, color: "#0f0f12", fontWeight: 700, whiteSpace: "nowrap" },
  barWrap: { flex: 1, height: 6, background: "#222", borderRadius: 3, overflow: "hidden" },
  bar: { height: "100%", borderRadius: 3, transition: "width 0.4s" },
  barNum: { fontSize: 13, color: "#aaa", minWidth: 20, textAlign: "right" },
  recentRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 0", borderBottom: "1px solid #1e1d24", cursor: "pointer",
  },
  recentName: { fontWeight: 700, fontSize: 14, marginBottom: 3 },
  recentSub: { fontSize: 12, color: "#777" },
  listHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 },
  search: {
    background: "#16151a", border: "1px solid #2a2830", borderRadius: 6,
    color: "#e8e0d0", padding: "9px 14px", fontSize: 13, width: 280,
  },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { background: "#16151a", color: "#c9a96e", padding: "10px 14px", textAlign: "left", fontSize: 12, letterSpacing: 1, borderBottom: "2px solid #2a2830", whiteSpace: "nowrap" },
  tr: { cursor: "pointer", transition: "background 0.15s" },
  td: { padding: "12px 14px", borderBottom: "1px solid #1e1d24", fontSize: 13 },
  formHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  backBtn: { background: "none", border: "1px solid #2a2830", color: "#aaa", padding: "7px 14px", borderRadius: 4, cursor: "pointer", fontSize: 13 },
  editBtn: { background: "rgba(110,181,201,0.15)", border: "1px solid #6eb5c9", color: "#6eb5c9", padding: "7px 14px", borderRadius: 4, cursor: "pointer", fontSize: 13 },
  deleteBtn: { background: "rgba(201,110,110,0.15)", border: "1px solid #c96e6e", color: "#c96e6e", padding: "7px 14px", borderRadius: 4, cursor: "pointer", fontSize: 13 },
  input: {
    width: "100%", background: "#0f0f12", border: "1px solid #2a2830",
    borderRadius: 5, color: "#e8e0d0", padding: "9px 12px", fontSize: 13,
    boxSizing: "border-box",
  },
  label: { display: "block", fontSize: 11, color: "#888", letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 },
  worksheetHeader: {
    display: "flex", gap: 8, padding: "6px 0", marginBottom: 6,
    borderBottom: "1px solid #2a2830", fontSize: 11, color: "#888", letterSpacing: 1, textTransform: "uppercase",
  },
  worksheetRow: { display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #1a1a20" },
  numInput: {
    background: "#0f0f12", border: "1px solid #2a2830", borderRadius: 4,
    color: "#e8e0d0", padding: "5px 8px", fontSize: 13, textAlign: "right",
    minWidth: 0,
  },
  totalRow: {
    display: "flex", gap: 8, padding: "10px 0", borderTop: "2px solid #c9a96e",
    marginTop: 6, fontSize: 14,
  },
  infoRow: { display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #1e1d24", fontSize: 14 },
  infoLabel: { color: "#888", fontSize: 12 },
  infoValue: { fontWeight: 600 },
  saveBtn: { background: "#c9a96e", color: "#0f0f12", border: "none", padding: "10px 28px", borderRadius: 5, fontWeight: 700, fontSize: 14, cursor: "pointer" },
  cancelBtn: { background: "none", border: "1px solid #2a2830", color: "#aaa", padding: "10px 20px", borderRadius: 5, cursor: "pointer", fontSize: 14 },
  empty: { color: "#555", fontStyle: "italic", textAlign: "center", padding: "40px" },
  iconBtn: { background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: "4px" },
  catHeader: {
    fontSize: 11, fontWeight: 700, color: "#c9a96e", letterSpacing: 1.5,
    textTransform: "uppercase", padding: "10px 0 4px", borderBottom: "1px solid #2a2830",
    marginTop: 8,
  },
  toast: {
    position: "fixed", bottom: 24, right: 24, padding: "12px 22px",
    borderRadius: 8, color: "#0f0f12", fontWeight: 700, fontSize: 14,
    boxShadow: "0 4px 20px rgba(0,0,0,0.4)", zIndex: 9999,
  },
  homeSwitcher: { display: "flex", gap: 4, marginLeft: 16, background: "#0f0f12", borderRadius: 6, padding: 3 },
  homeBtn: {
    background: "none", border: "none", color: "#888", padding: "5px 14px",
    borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
  },
  homeBtnActive: { background: "#2a2830", color: "#c9a96e" },
  calDayLabel: {
    textAlign: "center", fontSize: 11, fontWeight: 700, color: "#666",
    letterSpacing: 1, textTransform: "uppercase", padding: "4px 0",
  },
  calEmpty: { background: "transparent", minHeight: 100 },
  calCell: {
    background: "#16151a", border: "1px solid #2a2830", borderRadius: 6,
    minHeight: 100, padding: "6px 8px", verticalAlign: "top",
  },
  calToday: { border: "1px solid #c9a96e", background: "rgba(201,169,110,0.06)" },
  calDayNum: { fontSize: 13, fontWeight: 700, color: "#888", marginBottom: 4 },
  calEvent: {
    background: "#0f0f12", borderRadius: 4, padding: "4px 6px",
    marginBottom: 4, cursor: "pointer",
  },
  calEventName: { fontSize: 11, fontWeight: 700, color: "#e8e0d0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  calEventDir: { fontSize: 10, color: "#6eb5c9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  calEventType: { fontSize: 10, color: "#666" },
};
