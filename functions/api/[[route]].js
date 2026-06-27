const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: CORS })
}

function err(msg, status = 400) {
  return json({ error: msg }, status)
}

// ─── Products ────────────────────────────────────────────────────────────────

async function getProducts(env, url) {
  const category = url.searchParams.get('category')
  const featured = url.searchParams.get('featured')
  const search = url.searchParams.get('q')

  const cacheKey = `products:${category}:${featured}:${search}`
  const cached = await env.CACHE.get(cacheKey)
  if (cached) return json(JSON.parse(cached))

  let q = 'SELECT * FROM products WHERE 1=1'
  const params = []
  if (category) { q += ' AND category = ?'; params.push(category) }
  if (featured === '1') { q += ' AND featured = 1' }
  if (search) { q += ' AND (name LIKE ? OR description LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
  q += ' ORDER BY featured DESC, created_at DESC'

  const { results } = await env.DB.prepare(q).bind(...params).all()
  await env.CACHE.put(cacheKey, JSON.stringify({ products: results }), { expirationTtl: 300 })
  return json({ products: results })
}

async function getProduct(env, slug) {
  const row = await env.DB.prepare('SELECT * FROM products WHERE slug = ?').bind(slug).first()
  if (!row) return err('Produit introuvable', 404)
  return json({ product: row })
}

// ─── Rentals ─────────────────────────────────────────────────────────────────

async function getRentals(env) {
  const cached = await env.CACHE.get('rentals:all')
  if (cached) return json(JSON.parse(cached))
  const { results } = await env.DB.prepare('SELECT * FROM rental_products ORDER BY price_per_day_cad ASC').all()
  await env.CACHE.put('rentals:all', JSON.stringify({ rentals: results }), { expirationTtl: 600 })
  return json({ rentals: results })
}

// ─── Cart (KV-based, anonymous) ──────────────────────────────────────────────

async function getCart(env, cartId) {
  if (!cartId) return json({ items: [], total: 0 })
  const data = await env.CACHE.get(`cart:${cartId}`)
  return json(data ? JSON.parse(data) : { items: [], total: 0 })
}

async function updateCart(env, cartId, body) {
  if (!cartId) return err('cartId requis')
  const { productId, quantity } = body
  if (!productId || quantity === undefined) return err('productId et quantity requis')

  const cartData = await env.CACHE.get(`cart:${cartId}`)
  const cart = cartData ? JSON.parse(cartData) : { items: [], total: 0 }

  const product = await env.DB.prepare('SELECT id, name, price_cad, slug FROM products WHERE id = ?').bind(productId).first()
  if (!product) return err('Produit introuvable', 404)

  const idx = cart.items.findIndex(i => i.productId === productId)
  if (quantity <= 0) {
    if (idx !== -1) cart.items.splice(idx, 1)
  } else if (idx !== -1) {
    cart.items[idx].quantity = quantity
  } else {
    cart.items.push({ productId, name: product.name, price_cad: product.price_cad, slug: product.slug, quantity })
  }

  cart.total = cart.items.reduce((sum, i) => sum + i.price_cad * i.quantity, 0)
  await env.CACHE.put(`cart:${cartId}`, JSON.stringify(cart), { expirationTtl: 86400 * 7 })
  return json(cart)
}

// ─── Orders ──────────────────────────────────────────────────────────────────

async function createOrder(env, body) {
  const { name, email, phone, type, items, notes } = body
  if (!name || !email || !type || !items?.length) return err('Données incomplètes')

  const ref = 'DDM-' + Date.now().toString(36).toUpperCase()
  const total = items.reduce((s, i) => s + (i.unit_price_cad * (i.quantity || 1)), 0)

  const order = await env.DB.prepare(
    'INSERT INTO orders (reference, customer_name, customer_email, customer_phone, type, total_cad, notes) VALUES (?,?,?,?,?,?,?) RETURNING *'
  ).bind(ref, name, email, phone || null, type, total, notes || null).first()

  for (const item of items) {
    await env.DB.prepare(
      'INSERT INTO order_items (order_id, product_id, rental_id, quantity, unit_price_cad, rental_days) VALUES (?,?,?,?,?,?)'
    ).bind(order.id, item.product_id || null, item.rental_id || null, item.quantity || 1, item.unit_price_cad, item.rental_days || null).run()
  }

  return json({ order }, 201)
}

async function getOrder(env, ref) {
  const order = await env.DB.prepare('SELECT * FROM orders WHERE reference = ?').bind(ref).first()
  if (!order) return err('Commande introuvable', 404)
  const { results: items } = await env.DB.prepare('SELECT * FROM order_items WHERE order_id = ?').bind(order.id).all()
  return json({ order: { ...order, items } })
}

// ─── Newsletter ───────────────────────────────────────────────────────────────

async function subscribeNewsletter(env, body) {
  const { email } = body
  if (!email?.includes('@')) return err('Email invalide')
  try {
    await env.DB.prepare('INSERT INTO newsletter (email) VALUES (?)').bind(email).run()
    return json({ success: true, message: 'Merci pour votre inscription !' })
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return json({ success: true, message: 'Vous êtes déjà inscrit.' })
    return err('Erreur serveur', 500)
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const url = new URL(request.url)
  const parts = (params.route || [])
  const [resource, id] = parts

  try {
    if (resource === 'products') {
      if (request.method === 'GET' && !id) return getProducts(env, url)
      if (request.method === 'GET' && id) return getProduct(env, id)
    }

    if (resource === 'rentals') {
      if (request.method === 'GET') return getRentals(env)
    }

    if (resource === 'cart') {
      const cartId = url.searchParams.get('cartId')
      if (request.method === 'GET') return getCart(env, cartId)
      if (request.method === 'POST') return updateCart(env, cartId, await request.json())
    }

    if (resource === 'orders') {
      if (request.method === 'POST') return createOrder(env, await request.json())
      if (request.method === 'GET' && id) return getOrder(env, id)
    }

    if (resource === 'newsletter') {
      if (request.method === 'POST') return subscribeNewsletter(env, await request.json())
    }

    return err('Route introuvable', 404)
  } catch (e) {
    return err('Erreur interne: ' + e.message, 500)
  }
}
