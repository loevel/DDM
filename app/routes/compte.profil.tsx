import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/react";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { getCustomer } from "~/lib/auth.server";
import { getCustomerId } from "~/lib/session.server";

export const meta: MetaFunction = () => [{ title: "Mon profil — DDM Wigs & More" }];

interface Address {
  id: string;
  label: string;
  street: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  is_default: number;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const customerId = (await getCustomerId(request, context))!;
  const customer = await getCustomer(customerId, context);

  const addresses = await context.cloudflare.env.DB
    .prepare("SELECT * FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC")
    .bind(customerId)
    .all<Address>();

  const prefs = await context.cloudflare.env.DB
    .prepare("SELECT cap_size, texture_preferee, longueur_preferee, couleur_naturelle, style_pose, budget_habituel, date_naissance, newsletter_optin, alertes_stock FROM customers WHERE id = ?")
    .bind(customerId)
    .first<any>();

  return json({ customer, addresses: addresses.results, prefs: prefs ?? {} });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const customerId = (await getCustomerId(request, context))!;
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "update-profile") {
    const name = String(form.get("name") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const date_naissance = String(form.get("date_naissance") ?? "").trim();

    await context.cloudflare.env.DB
      .prepare("UPDATE customers SET name = ?, phone = ?, date_naissance = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(name || null, phone || null, date_naissance || null, customerId)
      .run();

    return json({ success: "Profil mis à jour." });
  }

  if (intent === "update-preferences") {
    const g = (k: string) => String(form.get(k) ?? "").trim() || null;
    await context.cloudflare.env.DB
      .prepare(`UPDATE customers SET
        cap_size = ?, texture_preferee = ?, longueur_preferee = ?,
        couleur_naturelle = ?, style_pose = ?, budget_habituel = ?,
        newsletter_optin = ?, alertes_stock = ?,
        updated_at = datetime('now') WHERE id = ?`)
      .bind(
        g("cap_size"), g("texture_preferee"), g("longueur_preferee"),
        g("couleur_naturelle"), g("style_pose"), g("budget_habituel"),
        form.get("newsletter_optin") === "1" ? 1 : 0,
        form.get("alertes_stock") === "1" ? 1 : 0,
        customerId
      ).run();
    return json({ success: "Préférences enregistrées." });
  }

  if (intent === "add-address") {
    const street = String(form.get("street") ?? "").trim();
    const city = String(form.get("city") ?? "").trim();
    const province = String(form.get("province") ?? "QC").trim();
    const postal_code = String(form.get("postal_code") ?? "").trim();
    const label = String(form.get("label") ?? "Domicile").trim();

    if (!street || !city || !postal_code) {
      return json({ error: "Veuillez remplir tous les champs de l'adresse." });
    }

    await context.cloudflare.env.DB
      .prepare(
        "INSERT INTO customer_addresses (customer_id, label, street, city, province, postal_code) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .bind(customerId, label, street, city, province, postal_code)
      .run();

    return json({ success: "Adresse ajoutée." });
  }

  if (intent === "delete-address") {
    const addressId = String(form.get("address_id") ?? "");
    await context.cloudflare.env.DB
      .prepare("DELETE FROM customer_addresses WHERE id = ? AND customer_id = ?")
      .bind(addressId, customerId)
      .run();
    return json({ success: "Adresse supprimée." });
  }

  return json({});
}

export default function Profil() {
  const { customer, addresses, prefs } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const saving = nav.state === "submitting";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface mb-1">Mon profil</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">{customer?.email}</p>
      </div>

      {(actionData as any)?.success && (
        <div className="flex items-center gap-3 p-4 bg-secondary-container text-on-secondary-container rounded-sm">
          <span className="material-symbols-outlined text-xl">check_circle</span>
          <p className="font-label-md text-label-md">{(actionData as any).success}</p>
        </div>
      )}
      {(actionData as any)?.error && (
        <div className="flex items-center gap-3 p-4 bg-error-container text-on-error-container rounded-sm">
          <span className="material-symbols-outlined text-xl">error</span>
          <p className="font-label-md text-label-md">{(actionData as any).error}</p>
        </div>
      )}

      {/* Informations personnelles */}
      <div className="bg-surface border border-outline-variant/30 rounded-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/20 bg-surface-container-low">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Informations personnelles</h2>
        </div>
        <Form method="post" className="px-6 py-6 space-y-6">
          <input type="hidden" name="intent" value="update-profile" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="relative">
              <input
                type="text"
                name="name"
                id="name"
                defaultValue={customer?.name ?? ""}
                placeholder=" "
                className="peer w-full pt-5 pb-2 border-b border-outline-variant bg-transparent focus:outline-none focus:border-primary font-body-md text-body-md transition-colors pl-0"
              />
              <label htmlFor="name" className="absolute left-0 top-5 text-on-surface-variant font-label-md text-label-md transition-all duration-300 peer-focus:-top-1 peer-focus:text-xs peer-focus:text-primary peer-[&:not(:placeholder-shown)]:-top-1 peer-[&:not(:placeholder-shown)]:text-xs">
                Nom complet
              </label>
            </div>
            <div className="relative">
              <input
                type="tel"
                name="phone"
                id="phone"
                defaultValue={customer?.phone ?? ""}
                placeholder=" "
                className="peer w-full pt-5 pb-2 border-b border-outline-variant bg-transparent focus:outline-none focus:border-primary font-body-md text-body-md transition-colors pl-0"
              />
              <label htmlFor="phone" className="absolute left-0 top-5 text-on-surface-variant font-label-md text-label-md transition-all duration-300 peer-focus:-top-1 peer-focus:text-xs peer-focus:text-primary peer-[&:not(:placeholder-shown)]:-top-1 peer-[&:not(:placeholder-shown)]:text-xs">
                Téléphone
              </label>
            </div>
          </div>
          <div className="relative">
            <input
              type="email"
              value={customer?.email ?? ""}
              readOnly
              className="w-full pt-5 pb-2 border-b border-outline-variant/40 bg-transparent font-body-md text-body-md text-on-surface-variant/60 pl-0 cursor-not-allowed"
            />
            <label className="absolute left-0 -top-1 text-xs text-on-surface-variant font-label-md">Email (non modifiable)</label>
          </div>
          <div className="relative">
            <input type="date" name="date_naissance" id="dob"
              defaultValue={(prefs as any)?.date_naissance ?? ""}
              className="peer w-full pt-5 pb-2 border-b border-outline-variant bg-transparent focus:outline-none focus:border-primary font-body-md text-body-md transition-colors pl-0" />
            <label htmlFor="dob" className="absolute left-0 -top-1 text-xs text-on-surface-variant font-label-md">
              Date de naissance <span className="text-on-surface-variant/50 font-normal">(pour vos offres anniversaire)</span>
            </label>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="bg-primary text-on-primary font-label-md text-label-md uppercase tracking-wider px-8 py-3 hover:bg-on-primary-container transition-colors duration-200 disabled:opacity-60"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </Form>
      </div>

      {/* Préférences capillaires */}
      <div className="bg-surface border border-outline-variant/30 rounded-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/20 bg-on-surface flex items-center gap-3">
          <span className="material-symbols-outlined text-primary-fixed text-xl">styler</span>
          <h2 className="font-headline-sm text-headline-sm text-white">Mes préférences capillaires</h2>
        </div>
        <Form method="post" className="px-6 py-6 space-y-6">
          <input type="hidden" name="intent" value="update-preferences" />
          <p className="text-xs text-on-surface-variant">Ces informations nous permettent de vous recommander les perruques les plus adaptées à votre profil.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Texture préférée</label>
              <select name="texture_preferee" defaultValue={(prefs as any)?.texture_preferee ?? ""}
                className="w-full border-b border-outline-variant bg-transparent focus:outline-none focus:border-primary font-body-md text-body-md py-2">
                <option value="">— Choisir —</option>
                <option value="lisse">Lisse & soyeux (Straight)</option>
                <option value="ondule">Ondulé naturel (Body wave, Water wave)</option>
                <option value="boucle">Bouclé & volume (Kinky curly, Deep wave)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Longueur préférée</label>
              <select name="longueur_preferee" defaultValue={(prefs as any)?.longueur_preferee ?? ""}
                className="w-full border-b border-outline-variant bg-transparent focus:outline-none focus:border-primary font-body-md text-body-md py-2">
                <option value="">— Choisir —</option>
                <option value="courte">Courte (10–14 po)</option>
                <option value="mi-longue">Mi-longue (16–20 po)</option>
                <option value="longue">Longue (22–26 po)</option>
                <option value="tres-longue">Très longue (28 po et plus)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Tour de tête (Cap size)</label>
              <select name="cap_size" defaultValue={(prefs as any)?.cap_size ?? ""}
                className="w-full border-b border-outline-variant bg-transparent focus:outline-none focus:border-primary font-body-md text-body-md py-2">
                <option value="">— Choisir —</option>
                <option value="Petite">Petite (53–55 cm)</option>
                <option value="Moyenne">Moyenne (55–57 cm)</option>
                <option value="Grande">Grande (57–59 cm)</option>
                <option value="Universelle">Universelle (ajustable)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Couleur naturelle de vos cheveux</label>
              <select name="couleur_naturelle" defaultValue={(prefs as any)?.couleur_naturelle ?? ""}
                className="w-full border-b border-outline-variant bg-transparent focus:outline-none focus:border-primary font-body-md text-body-md py-2">
                <option value="">— Choisir —</option>
                <option value="noir">Noir naturel</option>
                <option value="brun-fonce">Brun foncé</option>
                <option value="brun-clair">Brun clair</option>
                <option value="chatain">Châtain</option>
                <option value="blond">Blond</option>
                <option value="roux">Roux</option>
                <option value="gris">Gris / Blanc</option>
                <option value="teint">Teint / Coloré</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Style de pose préféré</label>
              <select name="style_pose" defaultValue={(prefs as any)?.style_pose ?? ""}
                className="w-full border-b border-outline-variant bg-transparent focus:outline-none focus:border-primary font-body-md text-body-md py-2">
                <option value="">— Choisir —</option>
                <option value="glueless">Glueless (sans colle)</option>
                <option value="glue">Avec colle (lace glue)</option>
                <option value="tape">Tape-in</option>
                <option value="peu_importe">Peu importe</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Budget habituel</label>
              <select name="budget_habituel" defaultValue={(prefs as any)?.budget_habituel ?? ""}
                className="w-full border-b border-outline-variant bg-transparent focus:outline-none focus:border-primary font-body-md text-body-md py-2">
                <option value="">— Choisir —</option>
                <option value="budget1">Moins de 400 $</option>
                <option value="budget2">400 $ – 600 $</option>
                <option value="budget3">600 $ et plus</option>
              </select>
            </div>
          </div>
          <div className="border-t border-outline-variant/20 pt-5 space-y-3">
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Préférences de communication</p>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="hidden" name="newsletter_optin" value="0" />
              <input type="checkbox" name="newsletter_optin" value="1"
                defaultChecked={(prefs as any)?.newsletter_optin === 1}
                className="w-4 h-4 accent-primary" />
              <span className="font-body-md text-body-md">Recevoir la newsletter (nouveautés, promotions exclusives)</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="hidden" name="alertes_stock" value="0" />
              <input type="checkbox" name="alertes_stock" value="1"
                defaultChecked={(prefs as any)?.alertes_stock !== 0}
                className="w-4 h-4 accent-primary" />
              <span className="font-body-md text-body-md">Alertes de retour en stock pour mes favoris</span>
            </label>
          </div>
          <button type="submit" disabled={saving}
            className="bg-primary text-on-primary font-label-md text-label-md uppercase tracking-wider px-8 py-3 hover:bg-on-primary-container transition-colors duration-200 disabled:opacity-60">
            {saving ? "Enregistrement…" : "Enregistrer mes préférences"}
          </button>
        </Form>
      </div>

      {/* Adresses */}
      <div className="bg-surface border border-outline-variant/30 rounded-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/20 bg-surface-container-low">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Adresses de livraison</h2>
        </div>

        {addresses.length > 0 && (
          <ul className="divide-y divide-outline-variant/20">
            {addresses.map((addr) => (
              <li key={addr.id} className="flex items-start justify-between px-6 py-4">
                <div>
                  <p className="font-label-md text-label-md text-primary uppercase tracking-wider mb-1">{addr.label}</p>
                  <p className="font-body-md text-body-md">{addr.street}</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {addr.city}, {addr.province} {addr.postal_code}, {addr.country}
                  </p>
                </div>
                <Form method="post">
                  <input type="hidden" name="intent" value="delete-address" />
                  <input type="hidden" name="address_id" value={addr.id} />
                  <button type="submit" className="text-on-surface-variant hover:text-error transition-colors ml-4 mt-1">
                    <span className="material-symbols-outlined text-xl">delete</span>
                  </button>
                </Form>
              </li>
            ))}
          </ul>
        )}

        {/* Add address */}
        <details className="group">
          <summary className="px-6 py-4 cursor-pointer flex items-center gap-2 text-primary font-label-md text-label-md hover:bg-surface-container-low transition-colors list-none border-t border-outline-variant/20">
            <span className="material-symbols-outlined text-xl">add</span>
            Ajouter une adresse
          </summary>
          <Form method="post" className="px-6 pb-6 pt-2 space-y-5">
            <input type="hidden" name="intent" value="add-address" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="relative sm:col-span-2">
                <input type="text" name="label" id="addr-label" placeholder=" " defaultValue="Domicile"
                  className="peer w-full pt-5 pb-2 border-b border-outline-variant bg-transparent focus:outline-none focus:border-primary font-body-md text-body-md transition-colors pl-0" />
                <label htmlFor="addr-label" className="absolute left-0 top-5 text-on-surface-variant font-label-md text-label-md transition-all duration-300 peer-focus:-top-1 peer-focus:text-xs peer-focus:text-primary peer-[&:not(:placeholder-shown)]:-top-1 peer-[&:not(:placeholder-shown)]:text-xs">
                  Libellé (ex: Domicile, Bureau)
                </label>
              </div>
              <div className="relative sm:col-span-2">
                <input type="text" name="street" id="addr-street" required placeholder=" "
                  className="peer w-full pt-5 pb-2 border-b border-outline-variant bg-transparent focus:outline-none focus:border-primary font-body-md text-body-md transition-colors pl-0" />
                <label htmlFor="addr-street" className="absolute left-0 top-5 text-on-surface-variant font-label-md text-label-md transition-all duration-300 peer-focus:-top-1 peer-focus:text-xs peer-focus:text-primary peer-[&:not(:placeholder-shown)]:-top-1 peer-[&:not(:placeholder-shown)]:text-xs">
                  Rue et numéro
                </label>
              </div>
              <div className="relative">
                <input type="text" name="city" id="addr-city" required placeholder=" "
                  className="peer w-full pt-5 pb-2 border-b border-outline-variant bg-transparent focus:outline-none focus:border-primary font-body-md text-body-md transition-colors pl-0" />
                <label htmlFor="addr-city" className="absolute left-0 top-5 text-on-surface-variant font-label-md text-label-md transition-all duration-300 peer-focus:-top-1 peer-focus:text-xs peer-focus:text-primary peer-[&:not(:placeholder-shown)]:-top-1 peer-[&:not(:placeholder-shown)]:text-xs">
                  Ville
                </label>
              </div>
              <div className="relative">
                <input type="text" name="postal_code" id="addr-postal" required placeholder=" "
                  className="peer w-full pt-5 pb-2 border-b border-outline-variant bg-transparent focus:outline-none focus:border-primary font-body-md text-body-md transition-colors pl-0" />
                <label htmlFor="addr-postal" className="absolute left-0 top-5 text-on-surface-variant font-label-md text-label-md transition-all duration-300 peer-focus:-top-1 peer-focus:text-xs peer-focus:text-primary peer-[&:not(:placeholder-shown)]:-top-1 peer-[&:not(:placeholder-shown)]:text-xs">
                  Code postal
                </label>
              </div>
              <div className="relative">
                <select name="province" defaultValue="QC"
                  className="w-full pt-5 pb-2 border-b border-outline-variant bg-transparent focus:outline-none focus:border-primary font-body-md text-body-md transition-colors pl-0 appearance-none">
                  {["QC","ON","BC","AB","MB","SK","NS","NB","NL","PE"].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <label className="absolute left-0 -top-1 text-xs text-on-surface-variant font-label-md">Province</label>
              </div>
            </div>
            <button type="submit" className="bg-on-surface text-surface font-label-md text-label-md uppercase tracking-wider px-8 py-3 hover:bg-primary transition-colors duration-200">
              Ajouter l'adresse
            </button>
          </Form>
        </details>
      </div>
    </div>
  );
}
