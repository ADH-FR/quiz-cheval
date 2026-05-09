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

async function callClaude(key, prompt, maxTokens = 700) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error?.message || 'Anthropic error');
  return data.content[0].text;
}

function parseJson(raw) {
  const m = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) throw new Error('Réponse IA invalide — JSON introuvable');
  return JSON.parse(m[0]);
}

export default async (req) => {
  try { return await handler(req); }
  catch (e) { return json({ error: e.message }, 500); }
};

async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const SUPA_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const SUPA_KEY = process.env.SUPABASE_ANON_KEY;
  const ANTHROPIC_KEY = process.env.AI_SECRET;
  const RESEND_KEY = process.env.RESEND_SECRET;
  const SENDER_EMAIL = process.env.SENDER_EMAIL || 'coach.in.mental@maloriebernard.com';

  const body = await req.json();
  const { action } = body;

  const h = {
    'apikey': SUPA_KEY,
    'Authorization': `Bearer ${SUPA_KEY}`,
    'Content-Type': 'application/json'
  };

  // ================================================================
  // QUIZ PUBLIC
  // ================================================================

  if (action === 'get_active_quiz') {
    if (!SUPA_URL || !SUPA_KEY) return json({ error: 'Supabase non configuré' }, 500);
    const { r: rm, d: modeles } = await supaFetch(`${SUPA_URL}/rest/v1/quiz_modeles?actif=eq.true&select=*&limit=1`, {}, h);
    if (!rm.ok || !modeles?.length) return json({ modele: null, questions: [] });
    const modele = modeles[0];
    const { d: questions } = await supaFetch(
      `${SUPA_URL}/rest/v1/quiz_questions?modele_id=eq.${modele.id}&select=*&order=ordre`,
      {}, h
    );
    return json({ modele, questions: questions || [] });
  }

  // ================================================================
  // ADMIN — MODÈLES
  // ================================================================

  if (action === 'list_modeles') {
    if (!SUPA_URL || !SUPA_KEY) return json({ error: 'Supabase non configuré' }, 500);
    const { r, d } = await supaFetch(`${SUPA_URL}/rest/v1/quiz_modeles?select=*&order=created_at.desc`, {}, h);
    return json(d, r.status);
  }

  if (action === 'save_modele') {
    if (!SUPA_URL || !SUPA_KEY) return json({ error: 'Supabase non configuré' }, 500);
    const { id, data } = body;
    if (id) {
      const { r, d } = await supaFetch(`${SUPA_URL}/rest/v1/quiz_modeles?id=eq.${id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(data)
      }, h);
      return json(Array.isArray(d) ? (d[0] ?? d) : d, r.status);
    } else {
      const { r, d } = await supaFetch(`${SUPA_URL}/rest/v1/quiz_modeles`, {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(data)
      }, h);
      return json(Array.isArray(d) ? (d[0] ?? d) : d, r.status);
    }
  }

  if (action === 'delete_modele') {
    if (!SUPA_URL || !SUPA_KEY) return json({ error: 'Supabase non configuré' }, 500);
    await supaFetch(`${SUPA_URL}/rest/v1/quiz_modeles?id=eq.${body.id}`, { method: 'DELETE' }, h);
    return json({ ok: true });
  }

  if (action === 'activate_modele') {
    if (!SUPA_URL || !SUPA_KEY) return json({ error: 'Supabase non configuré' }, 500);
    await supaFetch(`${SUPA_URL}/rest/v1/quiz_modeles?actif=eq.true`, {
      method: 'PATCH',
      body: JSON.stringify({ actif: false })
    }, h);
    const { r, d } = await supaFetch(`${SUPA_URL}/rest/v1/quiz_modeles?id=eq.${body.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({ actif: true })
    }, h);
    return json(Array.isArray(d) ? (d[0] ?? d) : d, r.status);
  }

  // ================================================================
  // ADMIN — QUESTIONS
  // ================================================================

  if (action === 'get_questions') {
    if (!SUPA_URL || !SUPA_KEY) return json({ error: 'Supabase non configuré' }, 500);
    const { r, d } = await supaFetch(
      `${SUPA_URL}/rest/v1/quiz_questions?modele_id=eq.${body.modele_id}&select=*&order=ordre`,
      {}, h
    );
    return json(d, r.status);
  }

  if (action === 'save_questions') {
    if (!SUPA_URL || !SUPA_KEY) return json({ error: 'Supabase non configuré' }, 500);
    const { modele_id, questions } = body;
    await supaFetch(`${SUPA_URL}/rest/v1/quiz_questions?modele_id=eq.${modele_id}`, { method: 'DELETE' }, h);
    if (!questions?.length) return json({ ok: true });
    const rows = questions.map((q, i) => ({ modele_id, ordre: i + 1, texte: q.texte, choix: q.choix }));
    const { r, d } = await supaFetch(`${SUPA_URL}/rest/v1/quiz_questions`, {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(rows)
    }, h);
    return json(d, r.status);
  }

  // ================================================================
  // IA — GÉNÉRATION DE QUESTIONS
  // ================================================================

  if (action === 'generate_questions') {
    if (!ANTHROPIC_KEY) return json({ error: 'AI_SECRET non configuré' }, 500);
    const { sujet, nb = 12 } = body;

    const prompt = `Tu es une experte en psychologie du sport équestre. Génère ${nb} questions pour un quiz mental sur le thème : "${sujet}".

Chaque question explore un aspect psychologique (peur, anxiété, perfectionnisme, surcontrôle, manque de confiance, hypervigilance, stress compétition).
Chaque question a exactement 4 choix :
- Choix 1 à 3 : différentes formes du problème / pattern difficile
- Choix 4 : la réponse équilibrée / sereine

Réponds en JSON avec cette structure exacte :
{
  "questions": [
    {
      "texte": "Texte de la question…",
      "choix": ["Choix A", "Choix B", "Choix C", "Choix D"]
    }
  ]
}`;

    const raw = await callClaude(ANTHROPIC_KEY, prompt, 2000);
    const data = parseJson(raw);
    return json(data);
  }

  // ================================================================
  // QUIZ — PROFIL IA
  // ================================================================

  if (action === 'get_profile') {
    if (!ANTHROPIC_KEY) return json({ error: 'AI_SECRET non configuré' }, 500);

    const { reponses, questions: customQuestions } = body;

    let questionLabels, choiceLabels;

    if (customQuestions?.length) {
      questionLabels = customQuestions.map((q, i) => `Q${i + 1} — ${q.texte}`);
      choiceLabels = customQuestions.map(q => q.choix);
    } else {
      questionLabels = [
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
      choiceLabels = [
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
    }

    const resumeReponses = reponses.map((r, i) =>
      `${questionLabels[i]} → ${choiceLabels[i][r - 1]}`
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
- Écris un résumé personnalisé de 4-6 phrases
- Inclus une phrase du type "Ce profil représente environ X% des cavaliers"
- Termine par une phrase d'encouragement

Réponds en JSON :
{
  "profil": "nom du profil",
  "emoji": "emoji représentatif",
  "sous_titre": "courte accroche de 5-8 mots",
  "pourcentage": "X%",
  "description": "résumé personnalisé bienveillant",
  "conseil_cle": "une piste concrète courte",
  "profil_secondaire": "nom ou null"
}`;

    const raw = await callClaude(ANTHROPIC_KEY, prompt);
    return json(parseJson(raw));
  }

  // ================================================================
  // QUIZ — SAUVEGARDE RÉSULTAT
  // ================================================================

  if (action === 'save_result') {
    if (!SUPA_URL || !SUPA_KEY) return json({ error: 'Supabase non configuré' }, 500);
    const { r, d } = await supaFetch(`${SUPA_URL}/rest/v1/quiz_resultats`, {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(body.data)
    }, h);
    return json(Array.isArray(d) ? (d[0] ?? d) : d, r.status);
  }

  // ================================================================
  // EMAIL — ENVOI VIA RESEND
  // ================================================================

  if (action === 'send_email') {
    if (!ANTHROPIC_KEY) return json({ error: 'AI_SECRET non configuré' }, 500);
    if (!RESEND_KEY) return json({ error: 'RESEND_SECRET non configuré' }, 500);

    const { email, prenom, profil, sous_titre, description, conseil_cle, profil_secondaire } = body;
    const prenomDisplay = prenom ? prenom.charAt(0).toUpperCase() + prenom.slice(1) : '';

    const emailPrompt = `Tu es une psychologue du sport spécialisée en équitation. Rédige un email de résultat personnalisé${prenomDisplay ? ` pour ${prenomDisplay}` : ''}.

PROFIL IDENTIFIÉ : ${profil}
${profil_secondaire ? `PROFIL SECONDAIRE : ${profil_secondaire}` : ''}
RÉSUMÉ : ${description}

Rédige 4 sections courtes (2-3 phrases chacune), ton bienveillant et encourageant. ${prenomDisplay ? `Utilise le prénom ${prenomDisplay} naturellement dans le texte.` : ''}

Réponds en JSON :
{
  "diagnostic": "Ce qui se passe chez toi — explication claire et bienveillante",
  "consequences": "Pourquoi tu bloques malgré tes efforts — sans culpabiliser",
  "projection": "Ce qui devient possible pour toi — optimiste et concret",
  "micro_solution": "La première chose à faire dès aujourd'hui — un conseil actionnable"
}`;

    const emailRaw = await callClaude(ANTHROPIC_KEY, emailPrompt, 600);
    const sections = parseJson(emailRaw);
    const html = buildEmailHTML({ prenom: prenomDisplay, profil, sous_titre, conseil_cle, profil_secondaire, ...sections });

    const subjectName = prenomDisplay ? `${prenomDisplay}, ton profil mental à cheval : ${profil}` : `Ton profil mental à cheval : ${profil}`;
    const sendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({ from: SENDER_EMAIL, to: email, subject: subjectName, html })
    });

    if (!sendResp.ok) {
      const err = await sendResp.json();
      return json({ error: err.message || 'Erreur Resend' }, 500);
    }
    return json({ ok: true });
  }

  return json({ error: 'Unknown action' }, 400);
}

function buildEmailHTML({ prenom, profil, sous_titre, conseil_cle, profil_secondaire, diagnostic, consequences, projection, micro_solution }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#faf9f6;font-family:Georgia,serif;">
<div style="max-width:580px;margin:0 auto;padding:2rem 1rem;">
  <div style="text-align:center;padding:2rem 0 1.5rem;">
    <p style="font-size:0.75rem;font-family:monospace;color:#9e9d97;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:0.5rem;">${prenom ? `Bonjour ${prenom} —` : ''} Ton profil mental à cheval</p>
    <h1 style="font-size:1.8rem;color:#5c3d2e;font-weight:normal;margin:0 0 0.5rem;">${profil}</h1>
    <p style="color:#6b6860;font-style:italic;font-size:0.95rem;margin:0;">${sous_titre}</p>
    ${profil_secondaire ? `<p style="font-size:0.8rem;color:#9e9d97;margin-top:0.5rem;font-family:monospace;">Profil secondaire : ${profil_secondaire}</p>` : ''}
  </div>
  <div style="background:#ffffff;border:1px solid #e8e4dc;border-radius:16px;overflow:hidden;margin-bottom:1.5rem;">
    <div style="padding:1.5rem 1.75rem;border-bottom:1px solid #f0ede6;">
      <p style="font-size:0.65rem;font-family:monospace;text-transform:uppercase;letter-spacing:0.12em;color:#9e9d97;margin:0 0 0.5rem;">Diagnostic</p>
      <p style="font-size:0.95rem;line-height:1.7;color:#1c1c1a;margin:0;">${diagnostic}</p>
    </div>
    <div style="padding:1.5rem 1.75rem;border-bottom:1px solid #f0ede6;">
      <p style="font-size:0.65rem;font-family:monospace;text-transform:uppercase;letter-spacing:0.12em;color:#9e9d97;margin:0 0 0.5rem;">Pourquoi tu bloques</p>
      <p style="font-size:0.95rem;line-height:1.7;color:#1c1c1a;margin:0;">${consequences}</p>
    </div>
    <div style="padding:1.5rem 1.75rem;border-bottom:1px solid #f0ede6;">
      <p style="font-size:0.65rem;font-family:monospace;text-transform:uppercase;letter-spacing:0.12em;color:#9e9d97;margin:0 0 0.5rem;">Ce qui devient possible</p>
      <p style="font-size:0.95rem;line-height:1.7;color:#1c1c1a;margin:0;">${projection}</p>
    </div>
    <div style="padding:1.5rem 1.75rem;background:#f5ede8;">
      <p style="font-size:0.65rem;font-family:monospace;text-transform:uppercase;letter-spacing:0.12em;color:#8b5e4a;margin:0 0 0.5rem;">Commence par ça</p>
      <p style="font-size:0.95rem;line-height:1.7;color:#5c3d2e;margin:0;font-weight:600;">${micro_solution}</p>
    </div>
  </div>
  <p style="font-size:0.75rem;color:#9e9d97;text-align:center;font-family:monospace;">Tu as reçu cet email après avoir complété le quiz profil mental cavalier.</p>
</div>
</body>
</html>`;
}

export const config = { path: '/api/quiz' };
