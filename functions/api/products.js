export async function onRequestGet({ env, request }) {
  const url = new URL(request.url)
  const category = url.searchParams.get('category')
  const featured = url.searchParams.get('featured')

  let query = 'SELECT * FROM products WHERE 1=1'
  const params = []

  if (category) {
    query += ' AND category = ?'
    params.push(category)
  }
  if (featured) {
    query += ' AND featured = 1'
  }
  query += ' ORDER BY created_at DESC'

  const { results } = await env.DB.prepare(query).bind(...params).all()

  return Response.json({ products: results })
}
