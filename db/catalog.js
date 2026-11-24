// Shapes MongoDB documents into the structure js/store.js expects.
// shortcut: galleries, look text and numeric variant ids come from js/catalog.json; add them to the Product schema and seed before removing that file.

export function buildCatalog({ products, categories, brands, banners, rates }, fallback, now = new Date()) {
  const oldProduct = new Map(fallback.products.map((p) => [p.slug, p]));
  const oldVariant = new Map(fallback.products.flatMap((p) => p.variants.map((v) => [v.sku.toUpperCase(), v])));
  const slugOrder = fallback.categories.flatMap((c) => [c.slug, ...c.children.map((x) => x.slug)]);
  const position = (slug) => (slugOrder.includes(slug) ? slugOrder.indexOf(slug) : slugOrder.length);

  // The storefront reads variants[0], so a product without variants cannot be shown.
  const shown = products.filter((p) => p.variants?.length);

  const product = (doc, i) => {
    const old = oldProduct.get(doc.slug);
    const variants = doc.variants.map(({ _id, ...v }) => {
      const known = oldVariant.get(String(v.sku).toUpperCase());
      return { ...known, ...v, options: v.options ?? {}, id: known?.id ?? String(_id) };
    });
    const defaultIndex = doc.variants.findIndex((v) => String(v._id) === String(doc.defaultVariantId));
    return {
      id: i + 1,
      slug: doc.slug,
      name: doc.name,
      description: doc.description ?? "",
      brand: doc.brandName ?? "",
      category: doc.categorySlug,
      topCategory: doc.topCategorySlug,
      badge: doc.badge ?? null,
      badgeLabel: doc.badgeLabel ?? null,
      isPreorder: doc.isPreorder ?? false,
      releaseDate: doc.releaseDate?.toISOString() ?? null,
      priceCents: doc.priceCents,
      compareAtCents: doc.compareAtCents ?? null,
      fromPriceCents: doc.fromPriceCents,
      variantCount: variants.length,
      createdAt: doc.createdAt?.toISOString() ?? "",
      rating: doc.rating ?? 0,
      reviewCount: doc.reviewCount ?? 0,
      stock: doc.stock ?? 0,
      inStock: doc.inStock ?? true,
      defaultVariantId: variants[Math.max(0, defaultIndex)].id,
      imageUrl: doc.imageUrl ?? old?.imageUrl ?? null,
      card: doc.card ?? {},
      variants,
      specs: doc.specs ?? [],
      look: old?.look,
      images: old?.images ?? [],
      reviews: [],
    };
  };

  const children = (parentId) => categories
    .filter((c) => String(c.parentId ?? null) === String(parentId))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || position(a.slug) - position(b.slug))
    .map((c) => ({
      slug: c.slug, name: c.name, description: c.description ?? null,
      productCount: shown.filter((p) => p.categorySlug === c.slug || p.topCategorySlug === c.slug).length,
      children: children(c._id),
    }));

  return {
    products: shown.map(product),
    categories: children(null),
    brands: brands.map((b) => ({ slug: b.slug, name: b.name, productCount: shown.filter((p) => p.brandName === b.name).length })),
    banners: banners
      .filter((b) => (!b.startDate || b.startDate <= now) && (!b.endDate || b.endDate > now))
      .map((b, i) => ({
        id: i + 1, eyebrow: b.eyebrow, title: b.title, subtitle: b.subtitle, ctaLabel: b.ctaLabel,
        ctaLink: b.ctaLink, imageUrl: b.imageUrl ?? null, card: b.card ?? {},
      })),
    rates: rates.map((r) => ({
      region: r.region, feeCents: r.feeCents, freeOverCents: r.freeOverCents ?? null, etaDays: r.etaDays,
    })),
  };
}
