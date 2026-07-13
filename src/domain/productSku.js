export function normalizeProductSku(value) {
  return String(value || '').trim().toLocaleUpperCase('vi');
}

export function findProductByCode(products, value) {
  const code = normalizeProductSku(value);
  if (!code) return undefined;

  return products.find(product => (
    normalizeProductSku(product.sku) === code
    || normalizeProductSku(product.id) === code
    || (product.aliases || []).some(alias => normalizeProductSku(alias) === code)
  ));
}

export function productMatchesSearch(product, value) {
  const query = String(value || '').trim().toLocaleLowerCase('vi');
  if (!query) return true;

  return [product.sku, product.name, ...(product.aliases || [])]
    .some(field => String(field || '').toLocaleLowerCase('vi').includes(query));
}
