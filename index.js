// Cloudflare Worker - SubNP AI Image Generation
// Free, high-quality AI image generation via SubNP API
// Uses SSE (Server-Sent Events) streaming
// ES Modules format (required for Cloudflare Workers)
// Version: 2025-01-11 - Initial SubNP integration for high-quality images
// Version: 2025-01-11 v2 - Try multiple API endpoints for compatibility
// Version: 2025-01-11 v3 - Prioritize subnp.com endpoints
// Version: 2025-01-11 v4 - Use official base URL from SubNP docs (t2i.mcpcore.xyz)
// Version: 2025-01-11 v5 - Add browser-like headers for API compatibility

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request).catch(error => {
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
    })
  }
}

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

  // POST request: Generate image via SubNP
  if (request.method === 'POST') {
    return await generateImage(request)
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
    status: 405,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    }
  })
}

async function generateImage(request) {
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

    // SubNP API - Free tier
    // Base URL: https://t2i.mcpcore.xyz (per official docs)
    // Endpoint: /api/free/generate
    // Also try subnp.com as it may proxy to t2i.mcpcore.xyz
    const apiUrls = [
      'https://t2i.mcpcore.xyz/api/free/generate', // Official base URL from docs
      'https://subnp.com/api/free/generate', // May work as proxy/alias
    ]
    
    let apiResponse = null
    let lastError = null
    
    // Try each endpoint until one works
    for (const apiUrl of apiUrls) {
      try {
        apiResponse = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; CloudflareWorker/1.0)',
            'Accept': 'text/event-stream',
            'Origin': 'https://subnp.com',
            'Referer': 'https://subnp.com/'
          },
          body: JSON.stringify({ prompt: prompt.trim(), model })
        })
        
        if (apiResponse.ok) {
          break // Success, use this endpoint
        } else if (apiResponse.status !== 404) {
          // If it's not 404, this might be the right endpoint but with an error
          break
        }
        // If 404, try next endpoint
        lastError = `404 from ${apiUrl}`
      } catch (fetchError) {
        lastError = fetchError.message
        continue // Try next endpoint
      }
    }
    
    if (!apiResponse || !apiResponse.ok) {
      const errorText = apiResponse ? await apiResponse.text() : (lastError || 'All endpoints failed')
      // Try to get more info about which endpoint failed
      const errorDetails = {
        status: apiResponse?.status || 'Connection failed',
        errorText: errorText,
        triedEndpoints: apiUrls,
        suggestion: 'SubNP may require an API key. Visit https://www.subnp.com/free-api to get one.'
      }
      return new Response(JSON.stringify({ 
        error: `SubNP API error: ${errorDetails.status}`,
        details: errorText,
        debug: errorDetails
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    // Handle SSE stream from SubNP
    const reader = apiResponse.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let imageUrl = null
    let errorMessage = null
    let status = 'processing'

    // Read the SSE stream
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6)) // Remove 'data: ' prefix
            
            if (data.status === 'complete' && data.imageUrl) {
              imageUrl = data.imageUrl
              status = 'completed'
            } else if (data.status === 'error') {
              errorMessage = data.message || 'Unknown error from SubNP'
              status = 'error'
            } else if (data.status === 'processing') {
              status = 'processing'
              // Could forward progress updates if needed
            }
          } catch (e) {
            // Skip invalid JSON lines
            console.error('Failed to parse SSE data:', e, line)
          }
        }
      }
    }

    // Check for errors
    if (errorMessage) {
      return new Response(JSON.stringify({ 
        error: errorMessage,
        status: 'error'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    // Check if we got an image URL
    if (!imageUrl) {
      return new Response(JSON.stringify({ 
        error: 'No image URL received from SubNP',
        status: 'error'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    // Success - return image URL
    return new Response(JSON.stringify({ 
      imageUrl: imageUrl,
      provider: 'subnp',
      status: 'completed',
      version: '2025-01-11-subnp' // Version identifier to verify deployment
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message || 'Unknown error occurred',
      type: error.name || 'Error',
      status: 'error'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}
