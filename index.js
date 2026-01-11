// Cloudflare Worker - CORS Proxy for SubNP AI Image Generation API
// Simplified version with maximum error handling

addEventListener('fetch', event => {
  event.respondWith(handleRequest(request).catch(error => {
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

    if (!apiResponse.ok) {
      let errorText = ''
      try {
        errorText = await apiResponse.text()
      } catch (e) {
        errorText = 'Could not read error response'
      }
      return new Response(JSON.stringify({ 
        error: `SubNP API error: ${apiResponse.status}`,
        details: errorText.substring(0, 200)
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    // Handle SSE stream
    let imageUrl = null
    let errorMessage = null

    try {
      const reader = apiResponse.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.slice(6).trim()
              if (!jsonStr) continue
              const data = JSON.parse(jsonStr)
              
              if (data.status === 'complete' && data.imageUrl) {
                imageUrl = data.imageUrl
                break
              } else if (data.status === 'error') {
                errorMessage = data.message || 'Unknown error from API'
              }
            } catch (parseError) {
              continue
            }
          }
        }

        if (imageUrl) break
      }
    } catch (streamError) {
      return new Response(JSON.stringify({ 
        error: 'Error processing API response',
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
        error: 'No image URL received from API'
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
      type: error.name || 'Error'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}
