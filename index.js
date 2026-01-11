// Cloudflare Worker - SubNP AI Image Generation
// Free, high-quality AI image generation via SubNP API
// Uses SSE (Server-Sent Events) streaming
// ES Modules format (required for Cloudflare Workers)
// Version: 2025-01-11 - Initial SubNP integration for high-quality images

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
    const apiUrl = 'https://t2i.mcpcore.xyz/api/free/generate'
    
    // Forward request to SubNP API
    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: prompt.trim(), model })
    })

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text()
      return new Response(JSON.stringify({ 
        error: `SubNP API error: ${apiResponse.status}`,
        details: errorText
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
      status: 'completed'
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

