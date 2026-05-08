function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function supaFetch(url, opts, h) {
  const r = await fetch(url, { ...opts, headers: { ...h, ...opts?.headers } });
  if (r.status === 204) return { r, d: null };
  const text = await r.text();
  let d;
  try { d = JSON.parse(text); } catch { throw new Error(`Supabase non-JSON (HTTP ${r.status}): ${text.slice(0, 300)}`); }
  return { r, d };
}

export default async (req) => {
  try {
    return await handler(req);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};

async function handler(req) {
  const SUPA_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const SUPA_KEY = process.env.SUPABASE_ANON_KEY;
  const OPENAI_KEY = process.env.OPENAI_API_KEY;

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const body = await req.json();
  const { action } = body;

  // ---- Save quiz result to Supabase ----
  if (action === 'save_result') {
    if (!SUPA_URL || !SUPA_KEY) return json({ error: 'Supabase not configured' }, 500);

    const h = {
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json'
    };

    const { r, d } = await supaFetch(`${SUPA_URL}/rest/v1/quiz_resultats`, {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(body.data)
    }, h);

    return json(Array.isArray(d) ? (d[0] ?? d) : d, r.status);
  }

  // ---- AI profile generation ----
  if (action === 'get_profile') {
    if (!OPENAI_KEY) return json({ error: 'OpenAI not configured' }, 500);

    const { reponses } = body;

    const questions = [
      "Q1 — Ton mental est plutôt…",
      "Q2 — En compétition ou sous pression, je…",
      "Q3 — Quand mon cheval se tend ou réagit, je…",
      "Q4 — Après un échec ou une mauvaise séance…",
      "Q5 — À cheval, je ressens surtout…",
      "Q6 — Mon niveau de confiance à cheval est…",
      "Q7 — Quand quelque chose se passe mal à cheval, mon premier réflexe est…",
      "Q8 — Avant de monter, je…",
      "Q9 — Après une chute, une grosse peur ou une mauvaise expérience…",
      "Q10 — Quand je regarde les autres cavaliers…",
      "Q11 — À cheval, j'ai le plus de mal à…",
      "Q12 — Si je pouvais changer UNE chose dans mon mental à cheval…"
    ];

    const choices = [
      ["Je réfléchis trop à tout", "Je me critique beaucoup", "Je suis concentré(e) sur ce que j'ai à faire", "J'ai parfois l'impression que mon cerveau \"bug\""],
      ["Perds mes moyens", "Monte différemment de d'habitude", "Devient très tendu(e) physiquement", "Reste globalement pareil"],
      ["Sens immédiatement mon stress monter", "Me crispe ou m'accroche", "Essaie de gérer mes émotions pour l'aider", "Arrive à garder mon calme"],
      ["Je suis très affecté(e) émotionnellement", "Je remets mes capacités en question", "J'analyse pour comprendre et progresser", "Je passe rapidement à autre chose"],
      ["Du stress", "De la peur", "Beaucoup d'anticipation négative", "De la sérénité"],
      ["Très bas", "Instable", "Correct mais fragile", "Solide la plupart du temps"],
      ["Imaginer que ça peut empirer", "M'en vouloir immédiatement", "Chercher une solution rapidement", "Garder mon calme et m'adapter"],
      ["Anticipe souvent le pire", "Ressens une boule au ventre", "Me mets beaucoup de pression", "Me sens plutôt détendu(e)"],
      ["Mon cerveau continue d'y penser longtemps", "Certaines images reviennent souvent", "J'ai perdu une partie de ma confiance", "J'arrive à tourner la page assez vite"],
      ["Je me compare énormément", "J'ai peur du jugement", "Ça peut me mettre de la pression", "Ça ne change pas grand chose pour moi"],
      ["Faire confiance", "Lâcher le contrôle", "Croire en moi", "Gérer mes émotions"],
      ["Arrêter d'avoir peur", "Arrêter de trop penser", "Avoir plus confiance en moi", "Être plus calme intérieurement"]
    ];

    const resumeReponses = reponses.map((r, i) =>
      `${questions[i]} → ${choices[i][r - 1]}`
    ).join('\n');

    const prompt = `Tu es une psychologue du sport spécialisée en équitation. Analyse les réponses de ce cavalier à un quiz sur son profil mental.

RÉPONSES DU CAVALIER :
${resumeReponses}

LES 5 PROFILS POSSIBLES :
1. Le Survivant — peur, trauma, hypervigilance
2. Le Contrôlant — surcontrôle, crispation
3. Le Perfectionniste — auto-critique, pression
4. L'Hypermental — surcharge mentale, trop penser
5. Le Mental Stable — profil rassurant, équilibré

CONSIGNES IMPORTANTES :
- Détermine le profil principal (et éventuellement un profil secondaire si pertinent)
- Le ton doit être bienveillant, compréhensif, jamais culpabilisant
- Le résultat doit apporter : compréhension, soulagement, espoir
- Écris un résumé personnalisé de 4-6 phrases qui commence par expliquer ce profil, puis donne 1-2 pistes concrètes
- Inclus une phrase du type "Ce profil représente environ X% des cavaliers"
- Termine par une phrase d'encouragement

Réponds en JSON avec cette structure exacte :
{
  "profil": "nom du profil",
  "emoji": "emoji représentatif",
  "sous_titre": "courte accroche de 5-8 mots",
  "pourcentage": "X%",
  "description": "résumé personnalisé bienveillant",
  "conseil_cle": "une piste concrète courte",
  "profil_secondaire": "nom ou null"
}`;

    const aiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600
      })
    });

    const aiData = await aiResp.json();
    if (!aiResp.ok) return json({ error: aiData.error?.message || 'OpenAI error' }, 500);

    const result = JSON.parse(aiData.choices[0].message.content);
    return json(result);
  }

  return json({ error: 'Unknown action' }, 400);
}

export const config = { path: '/api/quiz' };
