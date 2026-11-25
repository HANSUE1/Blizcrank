import { useEffect, useRef, useState } from "react";

const toPesos = (cents) => (cents == null ? "" : String(cents / 100));
const toCents = (pesos) => Math.round(Number(pesos) * 100);

const blankVariant = () => ({ key: crypto.randomUUID(), sku: "", name: "Standard", price: "", oldPrice: "", stock: "0" });
const fromVariant = (v) => ({
  key: v._id, _id: v._id, sku: v.sku, name: v.name,
  price: toPesos(v.priceCents), oldPrice: toPesos(v.compareAtCents), stock: String(v.stock),
});

export default function ProductForm({ product, brands, categories, onSave, onClose }) {
  const dialog = useRef(null);
  const [name, setName] = useState(product.name ?? "");
  const [description, setDescription] = useState(product.description ?? "");
  const [brand, setBrand] = useState(brands.find((b) => b.name === product.brandName)?.slug ?? "");
  const [category, setCategory] = useState(product.categorySlug ?? "");
  const [variants, setVariants] = useState(() => product.variants?.map(fromVariant) ?? [blankVariant()]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => dialog.current.showModal(), []);

  const change = (key, field) => (e) =>
    setVariants((list) => list.map((v) => (v.key === key ? { ...v, [field]: e.target.value } : v)));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave({
        name, description, brand, category,
        variants: variants.map((v) => ({
          _id: v._id, sku: v.sku, name: v.name, priceCents: toCents(v.price),
          compareAtCents: v.oldPrice === "" ? null : toCents(v.oldPrice), stock: Number(v.stock),
        })),
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialog} onClose={onClose} onCancel={(e) => saving && e.preventDefault()} aria-labelledby="form-title">
      <form onSubmit={submit}>
        <h2 id="form-title">{product._id ? "Edit product" : "Add product"}</h2>

        <label><span>Name</span><input required maxLength={255} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label><span>Description</span><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <div className="row">
          <label><span>Brand</span>
            <select required value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="">Choose a brand</option>
              {brands.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
            </select>
          </label>
          <label><span>Category</span>
            <select required value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Choose a category</option>
              {categories.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
            </select>
          </label>
        </div>

        {variants.map((v, i) => (
          <fieldset key={v.key}>
            <legend>Variant {i + 1}</legend>
            <div className="row">
              <label><span>SKU</span><input required maxLength={100} readOnly={Boolean(v._id)} value={v.sku} onChange={change(v.key, "sku")} /></label>
              <label><span>Variant name</span><input required maxLength={120} value={v.name} onChange={change(v.key, "name")} /></label>
            </div>
            <div className="row">
              <label><span>Price (₱)</span><input required type="number" min="0" step="0.01" value={v.price} onChange={change(v.key, "price")} /></label>
              <label><span>Old price (₱, optional)</span><input type="number" min="0" step="0.01" value={v.oldPrice} onChange={change(v.key, "oldPrice")} /></label>
              <label><span>Stock</span><input required type="number" min="0" step="1" value={v.stock} onChange={change(v.key, "stock")} /></label>
            </div>
            {variants.length > 1 && (
              <button type="button" onClick={() => setVariants((list) => list.filter((x) => x.key !== v.key))}>Remove variant {i + 1}</button>
            )}
          </fieldset>
        ))}
        <button type="button" onClick={() => setVariants((list) => [...list, blankVariant()])}>Add variant</button>

        <p role="alert" className="bad">{error}</p>
        <div className="actions end">
          <button type="button" disabled={saving} onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={saving}>{saving ? "Saving" : "Save product"}</button>
        </div>
      </form>
    </dialog>
  );
}
