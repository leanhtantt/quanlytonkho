import { prisma } from '../prismaClient';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ResolvedProduct = {
  id: string;
  sku: string;
  name: string;
  skuAliases?: Array<{ sku: string }>;
};

export function normalizeSkuCode(value: unknown) {
  return String(value || '').trim().toUpperCase();
}

export function findProductByCode(dbProducts: ResolvedProduct[], value: unknown) {
  const code = normalizeSkuCode(value);
  return dbProducts.find(product => (
    normalizeSkuCode(product.sku) === code
    || normalizeSkuCode(product.id) === code
    || product.skuAliases?.some(alias => normalizeSkuCode(alias.sku) === code)
  ));
}

export async function resolveProductsByCodes(codes: unknown[]): Promise<ResolvedProduct[]> {
  const normalizedCodes = [...new Set(codes
    .map(normalizeSkuCode)
    .filter(Boolean))];

  if (normalizedCodes.length === 0) return [];

  const uuidCodes = normalizedCodes
    .filter(code => UUID_PATTERN.test(code))
    .map(code => code.toLowerCase());

  const [directProducts, aliases] = await Promise.all([
    prisma.product.findMany({
      where: {
        OR: [
          { sku: { in: normalizedCodes } },
          ...(uuidCodes.length > 0 ? [{ id: { in: uuidCodes } }] : []),
        ],
      },
      include: { skuAliases: true },
    }),
    prisma.productSkuAlias.findMany({
      where: { sku: { in: normalizedCodes } },
      include: { product: { include: { skuAliases: true } } },
    }),
  ]);

  const productsById = new Map<string, ResolvedProduct>();
  for (const product of directProducts) productsById.set(product.id, product);
  for (const alias of aliases) productsById.set(alias.product.id, alias.product);
  return [...productsById.values()];
}
