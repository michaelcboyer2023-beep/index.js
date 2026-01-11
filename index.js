// Cloudflare Worker - CORS Proxy for SubNP AI Image Generation API
// Updated with better error handling

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
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  }

  try {
    // Get the prompt from the request body
    const body = await request.json()
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
    const apiResponse = await fetch('https://subnp.com/api/free/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({ prompt, model }),
    })

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text().catch(() => 'Could not read error')
      return new Response(JSON.stringify({ 
        error: `SubNP API error: ${apiResponse.status}`,
        details: errorText.substring(0, 500)
      }), {
        status: 200,
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

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

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
    } catch (streamError) {
      return new Response(JSON.stringify({ 
        error: 'Error reading API response stream',
        details: streamError.message
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    if (errorMessage) {
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    if (!imageUrl) {
      return new Response(JSON.stringify({ 
        error: 'No image URL received from API',
        details: 'The API may have returned an unexpected response format'
      }), {
        status: 200,
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
    return new Response(JSON.stringify({ 
      error: error.message || 'Unknown error occurred',
      type: error.name || 'Error',
      details: error.stack ? error.stack.substring(0, 500) : 'No stack trace'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}
