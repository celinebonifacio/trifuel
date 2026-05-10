exports.handler = async (event) => {
  // CORS preflight
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { icu_api_key, icu_athlete_id, action, params } = body;

  if (!icu_api_key || !icu_athlete_id) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing icu_api_key or icu_athlete_id' }) };
  }

  // Build Basic Auth header (Intervals.icu uses "API_KEY" as username, key as password)
  const auth = Buffer.from(`API_KEY:${icu_api_key}`).toString('base64');

  try {
    let url = '';
    
    if (action === 'get_events') {
      // Get planned events/workouts for a date range
      const { start, end } = params || {};
      const startDate = start || new Date().toISOString().split('T')[0];
      const endDate = end || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
      url = `https://intervals.icu/api/v1/athlete/${icu_athlete_id}/events?oldest=${startDate}&newest=${endDate}`;
    } else if (action === 'get_athlete') {
      url = `https://intervals.icu/api/v1/athlete/${icu_athlete_id}`;
    } else if (action === 'get_activities') {
      const { start, end } = params || {};
      const startDate = start || new Date().toISOString().split('T')[0];
      const endDate = end || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
      url = `https://intervals.icu/api/v1/athlete/${icu_athlete_id}/activities?oldest=${startDate}&newest=${endDate}`;
    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action: ' + action }) };
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { 
        statusCode: response.status, 
        headers, 
        body: JSON.stringify({ error: `ICU API error ${response.status}`, detail: errorText }) 
      };
    }

    const data = await response.json();
    return { statusCode: 200, headers, body: JSON.stringify({ result: data }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
