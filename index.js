// Cloudflare Worker - CORS Proxy for SubNP AI Image Generation API
// Deploy this to Cloudflare Workers (free tier: 100,000 requests/day)
// One-time setup: https://workers.cloudflare.com (free account)

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  // Only allow POST requests
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    // Get the prompt from the request body
    const body = await request.json()
    const { prompt, model = 'turbo' } = body

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    // Forward request to SubNP API
    // Using alternative endpoint: subnp.com instead of t2i.mcpcore.xyz
    const apiResponse = await fetch('https://subnp.com/api/free/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({ prompt, model }),
    })

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text()
      // Provide more helpful error message
      let errorMsg = `SubNP API error: ${apiResponse.status}`
      if (apiResponse.status === 404) {
        errorMsg = 'SubNP API endpoint not found. The API may have changed or is temporarily unavailable.'
      }
      return new Response(JSON.stringify({ error: errorMsg, details: errorText, status: apiResponse.status }), {
        status: 200, // Return 200 so frontend can read the error
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    // Handle SSE stream
    const reader = apiResponse.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let imageUrl = null
    let errorMessage = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.status === 'complete' && data.imageUrl) {
              imageUrl = data.imageUrl
            } else if (data.status === 'error') {
              errorMessage = data.message || 'Unknown error'
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }

    if (errorMessage) {
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    if (!imageUrl) {
      return new Response(JSON.stringify({ error: 'No image URL received' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    // Return the image URL
    return new Response(JSON.stringify({ imageUrl }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}
