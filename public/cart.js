// DDM Wigs — Cart & API client (Cloudflare KV-backed)
const API = '/api'

const Cart = {
  id: null,

  init() {
    this.id = localStorage.getItem('ddm_cart_id')
    if (!this.id) {
      this.id = crypto.randomUUID()
      localStorage.setItem('ddm_cart_id', this.id)
    }
    this.render()
  },

  async get() {
    const res = await fetch(`${API}/cart?cartId=${this.id}`)
    return res.json()
  },

  async add(productId, quantity = 1) {
    const res = await fetch(`${API}/cart?cartId=${this.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, quantity }),
    })
    const cart = await res.json()
    this.render(cart)
    this.showToast('Ajouté au panier ✓')
    return cart
  },

  async remove(productId) {
    return this.add(productId, 0)
  },

  async render(cart) {
    if (!cart) cart = await this.get()
    const badge = document.getElementById('cart-badge')
    if (badge) {
      const count = (cart.items || []).reduce((s, i) => s + i.quantity, 0)
      badge.textContent = count
      badge.style.display = count > 0 ? 'flex' : 'none'
    }
    const total = document.getElementById('cart-total')
    if (total) total.textContent = `$${(cart.total || 0).toFixed(2)} CAD`
  },

  showToast(msg) {
    let toast = document.getElementById('ddm-toast')
    if (!toast) {
      toast = document.createElement('div')
      toast.id = 'ddm-toast'
      toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#1b1c1c;color:#fff;padding:12px 20px;border-radius:4px;font-family:Manrope,sans-serif;font-size:14px;z-index:9999;transition:opacity .3s'
      document.body.appendChild(toast)
    }
    toast.textContent = msg
    toast.style.opacity = '1'
    clearTimeout(toast._t)
    toast._t = setTimeout(() => { toast.style.opacity = '0' }, 2500)
  },
}

// Newsletter subscription
async function subscribeNewsletter(email) {
  const res = await fetch(`${API}/newsletter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  return res.json()
}

// Wire up Add to Cart buttons
document.addEventListener('DOMContentLoaded', () => {
  Cart.init()

  document.querySelectorAll('[data-add-to-cart]').forEach(btn => {
    btn.addEventListener('click', () => {
      const productId = parseInt(btn.dataset.addToCart)
      Cart.add(productId)
    })
  })

  // Newsletter forms
  document.querySelectorAll('form[data-newsletter]').forEach(form => {
    form.addEventListener('submit', async e => {
      e.preventDefault()
      const email = form.querySelector('input[type=email]')?.value
      if (!email) return
      const result = await subscribeNewsletter(email)
      Cart.showToast(result.message || 'Merci !')
      form.reset()
    })
  })
})
