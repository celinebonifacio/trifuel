exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } 
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { profile, trainings, request_type } = body;

  // Build prompt based on request type
  let prompt = '';

  if (request_type === 'weekly_plan') {
    prompt = `Tu es expert en nutrition sportive triathlon. Génère un plan alimentaire pour cette semaine.

ATHLÈTE: ${profile.name}, ${profile.goal_race}, ${profile.level}, ${profile.weight_kg}kg, ${profile.regime}${profile.allergies ? ', allergies: '+profile.allergies : ''}

SÉANCES:
${trainings.map(t => `${t.day}: ${t.type} ${t.dur} (${t.intensity}) ${t.startTime!=='—'?'à '+t.startTime:''}`).join('\n')}

Réponds UNIQUEMENT avec ce tableau JSON (7 éléments, un par jour):
[{"day":"Lundi","kcal":2200,"meals":[{"name":"Petit-déjeuner","time":"7h00","emoji":"🥣","desc":"description courte","kcal":520,"macros":{"g":65,"p":25,"l":15}},{"name":"Déjeuner","time":"12h30","emoji":"🥗","desc":"description","kcal":620,"macros":{"g":75,"p":40,"l":18}},{"name":"Dîner","time":"19h30","emoji":"🐟","desc":"description","kcal":680,"macros":{"g":80,"p":42,"l":16}}]}]

Adapte les calories selon l'intensité. Inclus un repas pré-séance si séance le matin. JSON uniquement, sans texte.`;

  } else if (request_type === 'meal_alternatives') {
    const { meal, day_kcal } = body;
    prompt = `Tu es un expert en nutrition sportive.

ATHLÈTE : ${profile.name}, ${profile.goal_race}, ${profile.weight_kg}kg
REPAS À REMPLACER : ${meal.name} (${meal.kcal} kcal, G${meal.macros?.g}g P${meal.macros?.p}g L${meal.macros?.l}g)
BUDGET JOURNALIER : ${day_kcal} kcal
ALLERGIES : ${profile.allergies || 'aucune'}

Propose 3 alternatives équilibrées pour ce repas.
Réponds UNIQUEMENT avec ce JSON :
[
  {
    "name": "Nom du plat",
    "desc": "Ingrédients principaux",
    "emoji": "🥣",
    "kcal": 600,
    "g": 80, "p": 30, "l": 15,
    "dur": "10 min",
    "bg": "#FEF3C7"
  }
]`;

  } else if (request_type === 'fridge_adapt') {
    const { fridge_contents, meals } = body;
    prompt = `Tu es un expert en nutrition sportive.

ATHLÈTE : ${profile.name}, ${profile.goal_race}
CONTENU DU FRIGO : ${fridge_contents}
PLAN PRÉVU :
${meals.map(m => `- ${m.name}: ${m.desc}`).join('\n')}

Adapte le plan de la journée en utilisant prioritairement les ingrédients du frigo, tout en respectant les besoins nutritionnels.
Réponds UNIQUEMENT avec un tableau JSON des repas adaptés (même format que le plan prévu).`;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    
    console.log('Claude response status:', response.status);
    console.log('Claude response text (first 500):', text.substring(0, 500));
    console.log('Claude error if any:', data.error);

    // Strip markdown code blocks if present
    let clean = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim();

    // Extract JSON array or object
    const jsonMatch = clean.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (!jsonMatch) {
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: 'No JSON in response', raw: text.substring(0, 500) }) 
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[1]);
    } catch(parseErr) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'JSON parse error: ' + parseErr.message, raw: jsonMatch[1].substring(0, 300) })
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({ result: parsed })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
