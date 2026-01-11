// Cloudflare Worker - CORS Proxy for SubNP AI Image Generation API
// Simplified version with maximum error handling

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request).catch(error => {
    // Catch any unhandled errors at the top level
    return new Response(JSON.stringify({ 
      error: 'Worker error: ' + (error.message || 'Unknown error'),
      type: error.name || 'Error'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }))
})

async function handleRequest(request) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  // Only allow POST requests
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  }

  try {
    // Parse request body
    let body
    try {
      body = await request.json()
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON in request body' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    const { prompt, model = 'turbo' } = body

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    // Forward request to SubNP API
    let apiResponse
    try {
      apiResponse = await fetch('https://subnp.com/api/free/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({ prompt, model }),
      })
    } catch (fetchError) {
      return new Response(JSON.stringify({ 
        error: 'Failed to connect to SubNP API',
        details: fetchError.message
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    if (!apiRes
