// Cloudflare Worker - CORS Proxy for SubNP AI Image Generation API
// Debug version with detailed error messages

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request).catch(error => {
    return new Response(JSON.stringify({ 
      error: 'Top-level worker error: ' + (error.message || 'Unknown error'),
      type: error.name || 'Error',
      stack: error.stack ? error.stack.substring(0, 300) : 'No stack'
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
    let body
    try {
      body = await request.json()
    } catch (e) {
      return new Response(JSON.stringify({ 
        error: 'Invalid JSON in request body',
        details: e.message
      }), {
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
        details: fetchError.message,
        type: 'FetchError'
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
        error: `SubNP API returned ${apiResponse.status}`,
        details: errorText.substring(0, 500),
        statusCode: apiResponse.status
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    let imageUrl = null
    let errorMessage = null
    let lastData = null

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
              lastData = data
              
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
        error: 'Error processing API response stream',
        details: streamError.message,
        lastData: lastData,
        type: 'StreamError'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    if (errorMessage) {
      return new Response(JSON.stringify({ 
        error: errorMessage,
        lastData: lastData
      }), {
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
        details: 'The API stream completed but no image URL was found',
        lastData: lastData
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

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
