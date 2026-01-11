// Cloudflare Worker - Proxy Pollinations.ai Images (Bypasses 403)
// Fetches image server-side and returns it as base64 data URL
// ES Modules format (required for Cloudflare Workers)

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

    const { prompt } = body

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    // Pollinations.ai endpoint - fetch image server-side to bypass 403
    const encodedPrompt = encodeURIComponent(prompt.trim())
    const timestamp = Date.now()
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true&seed=${timestamp}`
    
    try {
      // Fetch the image through the worker (server-side, bypasses browser 403)
      const imageResponse = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'image/jpeg,image/*,*/*'
        }
      })
      
      if (!imageResponse.ok) {
        return new Response(JSON.stringify({ 
          error: `Pollinations.ai returned ${imageResponse.status}`,
          details: 'The image generation service may be unavailable'
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        })
      }
      
      const contentType = imageResponse.headers.get('content-type') || 'image/jpeg'
      
      if (!contentType.startsWith('image/')) {
        return new Response(JSON.stringify({ 
          error: 'Pollinations.ai returned non-image content',
          details: `Content-Type: ${contentType}`
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        })
      }
      
      // Convert image to base64 data URL
      const imageBuffer = await imageResponse.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)))
      const dataUrl = `data:${contentType};base64,${base64}`
      
      return new Response(JSON.stringify({ 
        imageUrl: dataUrl,
        provider: 'pollinations'
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
      
    } catch (fetchError) {
      return new Response(JSON.stringify({ 
        error: 'Failed to fetch image from Pollinations.ai',
        details: fetchError.message
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

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
