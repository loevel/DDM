export async function onRequestPost({ env, request }) {
  const { email } = await request.json()

  if (!email || !email.includes('@')) {
    return Response.json({ error: 'Email invalide' }, { status: 400 })
  }

  try {
    await env.DB.prepare('INSERT INTO newsletter (email) VALUES (?)').bind(email).run()
    return Response.json({ success: true, message: 'Inscription confirmée' })
  } catch (e) {
    if (e.message?.includes('UNIQUE')) {
      return Response.json({ success: true, message: 'Déjà inscrit' })
    }
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
