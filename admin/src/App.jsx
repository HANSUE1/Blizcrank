import { useEffect, useState } from "react";
import ProductForm from "./ProductForm.jsx";

const money = (cents) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(cents / 100);

async function request(url, method = "GET", body) {
  const res = await fetch(url, {
    method,
    headers: body && { "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
  return data;
}

const flatten = (list, prefix = "") =>
  list.flatMap((c) => [{ slug: c.slug, label: prefix + c.name }, ...flatten(c.children, `${prefix}${c.name} / `)]);

export default function App() {
  const [products, setProducts] = useState(null);
  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null); // null = closed, {} = new product
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setProducts(await request("/api/products"));
  }

  useEffect(() => {
    Promise.all([load(), request("/api/catalog")])
      .then(([, catalog]) => {
        setBrands(catalog.brands);
        setCategories(flatten(catalog.categories));
      })
      .catch((err) => setError(err.message));
  }, []);

  async function save(form) {
    const id = editing._id;
    await request(id ? `/api/products/${id}` : "/api/products", id ? "PUT" : "POST", form);
    setEditing(null);
    setError("");
    setMessage(`${form.name} was ${id ? "updated" : "added"}.`);
    await load().catch((err) => setError(err.message));
  }

  async function remove(product) {
    if (!window.confirm(`Delete "${product.name}" from the database? This cannot be undone.`)) return;
    setMessage("");
    setError("");
    try {
      await request(`/api/products/${product._id}`, "DELETE");
      setMessage(`${product.name} was deleted.`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const term = search.trim().toLowerCase();
  const shown = (products ?? []).filter((p) => `${p.name} ${p.brandName} ${p.categorySlug}`.toLowerCase().includes(term));

  return (
    <main>
      <header>
        <div>
          <h1>Products</h1>
          <p className="muted">{products ? `${products.length} in the database` : "Loading from the database"}</p>
        </div>
        <a href="/">View store</a>
      </header>

      <div className="toolbar">
        <label>
          <span>Search</span>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <button type="button" className="primary" disabled={!products} onClick={() => { setMessage(""); setEditing({}); }}>Add product</button>
      </div>

      <p role="status" className="ok">{message}</p>
      <p role="alert" className="bad">{error}</p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Name</th><th>Brand</th><th>Category</th><th className="num">Price</th><th className="num">Stock</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p._id}>
                <td>{p.name}</td>
                <td>{p.brandName}</td>
                <td>{categories.find((c) => c.slug === p.categorySlug)?.label ?? p.categorySlug}</td>
                <td className="num">{money(p.priceCents)}</td>
                <td className="num">{p.stock}</td>
                <td className="actions">
                  <button type="button" aria-label={`Edit ${p.name}`} onClick={() => { setMessage(""); setEditing(p); }}>Edit</button>
                  <button type="button" className="danger" aria-label={`Delete ${p.name}`} onClick={() => remove(p)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {products && !shown.length && <p className="empty">No products found.</p>}
      </div>

      {editing && (
        <ProductForm product={editing} brands={brands} categories={categories} onSave={save} onClose={() => setEditing(null)} />
      )}
    </main>
  );
}
